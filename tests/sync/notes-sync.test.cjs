// Node 24+: node --test tests/editor/revisions.test.cjs
// 阶段 3A 保存版本边界的 Node SQLite 回归；云端接口使用显式假实现。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "../..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return resolve.call(
        this,
        name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name,
        ...args,
    );
};
require.extensions[".ts"] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
    });
    module._compile(result.outputText, filename);
};

const notes = require("../../src/features/notes/data/note-local.repository.ts");
const drafts = require("../../src/features/notes/data/note-draft.repository.ts");
const {
    createLocalNotes,
} = require("../../src/core/database/migrations/0002-create-local-notes.ts");
const {
    createNoteDrafts,
} = require("../../src/core/database/migrations/0003-create-note-drafts.ts");
const {
    createNoteRevisions,
} = require("../../src/core/database/migrations/0004-create-note-revisions.ts");
const {
    createUploadQueue,
} = require("../../src/core/database/migrations/0005-create-upload-queue.ts");
const {
    addServerUpdatedAt,
} = require("../../src/core/database/migrations/0006-add-server-updated-at.ts");
const {
    addNoteSyncState,
} = require("../../src/core/database/migrations/0010-add-note-sync-state.ts");
const repo = require("../../src/features/notes/data/note-sync.repository.ts");
const {
    runNoteSync,
} = require("../../src/features/notes/services/note-sync.service.ts");
const protocol = require("../../src/features/notes/api/notes-sync.types.ts");
const signal = () => new AbortController().signal;
const cloud = (id, version = 1, body = "body", owner = 1) => ({
    id,
    user_id: owner,
    client_id: "00000000-0000-4000-8000-" + String(id).padStart(12, "0"),
    version,
    title: "note " + id,
    content: body,
    category_id: null,
    is_pinned: false,
    is_starred: false,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    sync_updated_at: null,
    deleted_at: null,
});
const snapshot = (data, next = null) => ({
    data,
    page: {
        next_cursor: next,
        has_more: next !== null,
        snapshot_token: "snapshot",
    },
    sync: { changes_cursor: "baseline" },
});
const changePage = (data = [], cursor = "end", more = false) => ({
    data,
    page: { next_cursor: cursor, has_more: more },
});
const upsert = (note, seq = String(note.version)) => ({
    change_seq: seq,
    operation: "upsert",
    data: note,
});
const deletion = (id, version = 2) => ({
    change_seq: String(version),
    operation: "delete",
    id,
    client_id: cloud(id).client_id,
    version,
    deleted_at: "2026-09-20T01:00:00.000Z",
});
const noOp = () => {};
async function seed(db, rows) {
    return runNoteSync(
        db,
        1,
        {
            snapshot: async () => snapshot(rows),
            changes: async () => changePage(),
        },
        signal(),
    );
}

test("snapshot interruption preserves local records and resumes its fixed token", async (t) => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [
        protocol.cloudNoteToLocal(cloud(90)),
    ]);
    let first = true;
    const transport = {
        snapshot: async (_owner, query) => {
            if (!query.cursor) return snapshot([cloud(1)], "page2");
            assert.equal(query.snapshot_token, "snapshot");
            if (first) {
                first = false;
                throw new Error("offline");
            }
            return snapshot([cloud(2)]);
        },
        changes: async () => changePage(),
    };
    await assert.rejects(runNoteSync(port, 1, transport, signal()), /offline/);
    assert.deepEqual(
        (await notes.getLocalNotes(port, 1)).map((n) => n.id),
        [90],
    );
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, null);
    const result = await runNoteSync(port, 1, transport, signal());
    assert.deepEqual(result.notes.map((n) => n.id).sort(), [1, 2]);
    assert.equal(result.addedCount, 2);
});

test("incremental updates retain unrelated notes; tombstones remove only the named note", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1), cloud(2), cloud(3)]);
    let call = 0;
    const result = await runNoteSync(
        port,
        1,
        {
            snapshot: async () => {
                throw new Error("unexpected full snapshot");
            },
            changes: async () =>
                ++call === 1
                    ? changePage(
                          [upsert(cloud(1, 2, "changed")), deletion(2, 3)],
                          "c2",
                      )
                    : changePage([], "c3"),
        },
        signal(),
    );
    assert.deepEqual(result.notes.map((n) => n.id).sort(), [1, 3]);
    assert.equal(result.notes.find((n) => n.id === 1).content, "changed");
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "c3");
});

test("dirty local content and server candidate survive independently after cursor advancement", async (t) => {
    const { port } = await database(t);
    const {
        notes: [original],
    } = await seed(port, [cloud(1)]);
    const edited = await notes.updatePendingLocalNote(port, 1, original, {
        title: "local",
        content: "unsent",
    });
    let call = 0;
    const result = await runNoteSync(
        port,
        1,
        {
            snapshot: async () => {
                throw new Error("no");
            },
            changes: async () =>
                ++call === 1
                    ? changePage([upsert(cloud(1, 2, "remote"))])
                    : changePage(),
        },
        signal(),
    );
    assert.equal(result.notes[0].content, "unsent");
    assert.equal(
        result.notes[0].current_revision_id,
        edited.note.current_revision_id,
    );
    assert.equal((await repo.readCloudMirror(port, 1))[0].content, "remote");
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "end");
});

test("server deletion preserves drafts and blocks queued edits instead of recreating notes", async (t) => {
    const { port } = await database(t);
    const {
        notes: [original],
    } = await seed(port, [cloud(1)]);
    await notes.updatePendingLocalNote(port, 1, original, {
        title: "local",
        content: "unsent",
    });
    await drafts.openNoteDraft(port, 1, "note:1", "editing", 1, {
        title: "draft",
        content: "draft text",
        categoryId: null,
    });
    await require("../../src/features/sync/note-upload-queue.ts").enqueueNoteUpload(
        port,
        1,
        (await notes.getLocalNotes(port, 1))[0],
    );
    await repo.applyChanges(port, 1, "end", changePage([deletion(1)]), noOp);
    await repo.projectMirror(port, 1, noOp);
    assert.equal((await notes.getLocalNotes(port, 1))[0].content, "unsent");
    assert.equal(
        (await notes.getLocalNotes(port, 1))[0].sync_status,
        "rejected",
    );
    assert.equal(
        (await drafts.readNoteDraft(port, 1, "note:1")).content,
        "draft text",
    );
    assert.equal(
        (await port.getFirst("SELECT status FROM upload_queue_tasks")).status,
        "blocked",
    );
});

test("mirror page and cursor roll back together when SQLite rejects the cursor update", async (t) => {
    const { port, sql } = await database(t);
    await seed(port, [cloud(1)]);
    sql.exec(
        "CREATE TRIGGER reject_cursor BEFORE UPDATE OF changes_cursor ON note_sync_state BEGIN SELECT RAISE(ABORT, 'disk test'); END",
    );
    await assert.rejects(
        repo.applyChanges(
            port,
            1,
            "end",
            changePage([upsert(cloud(1, 2, "new"))], "next"),
            noOp,
        ),
        /disk test/,
    );
    assert.equal((await repo.readCloudMirror(port, 1))[0].content, "body");
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "end");
});

test("guard invalidation during a SQLite transaction rolls back the snapshot", async (t) => {
    const { port } = await database(t);
    let checks = 0;
    await assert.rejects(
        repo.stageSnapshot(
            port,
            1,
            snapshot([cloud(1)]),
            await repo.readSyncState(port, 1),
            () => {
                if (++checks === 2) throw new Error("account switched");
            },
        ),
        /account switched/,
    );
    assert.equal((await repo.readCloudMirror(port, 1)).length, 0);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, null);
});

test("expired cursor rebuilds once, retaining unsent local creates", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    const local = await notes.createPendingLocalNote(port, 1, {
        title: "offline",
        content: "only local",
    });
    let expired = false;
    const result = await runNoteSync(
        port,
        1,
        {
            snapshot: async () => snapshot([cloud(2)]),
            changes: async () => {
                if (!expired) {
                    expired = true;
                    throw {
                        response: {
                            status: 410,
                            data: { error: { code: "SYNC_CURSOR_EXPIRED" } },
                        },
                    };
                }
                return changePage();
            },
        },
        signal(),
    );
    assert.ok(
        result.notes.some(
            (n) => n.id === local.note.id && n.content === "only local",
        ),
    );
    assert.ok(result.notes.some((n) => n.id === 2));
    assert.ok(!result.notes.some((n) => n.id === 1));
});

test("resuming a historical watermark catches a fresh round before projecting receipts", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    let call = 0;
    const result = await runNoteSync(
        port,
        1,
        {
            snapshot: async () => {
                throw new Error("no");
            },
            changes: async () => {
                call++;
                return call === 1
                    ? changePage([upsert(cloud(1, 2, "historical"))], "old-end")
                    : changePage(
                          [upsert(cloud(1, 3, "latest receipt"))],
                          "fresh-end",
                      );
            },
        },
        signal(),
    );
    assert.equal(result.notes[0].content, "latest receipt");
});

test("duplicate events are harmless and tombstones cannot be resurrected", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    await repo.applyChanges(
        port,
        1,
        "end",
        changePage([upsert(cloud(1))]),
        noOp,
    );
    await repo.applyChanges(port, 1, "end", changePage([deletion(1)]), noOp);
    await assert.rejects(
        repo.applyChanges(
            port,
            1,
            "end",
            changePage([upsert(cloud(1, 3))]),
            noOp,
        ),
        /不能复活/,
    );
});

test("protocol validates account ownership, decimal bigint ordering, and cursor shape", () => {
    assert.throws(() =>
        protocol.parseSnapshot(snapshot([cloud(1, 1, "x", 2)]), 1),
    );
    const page = changePage([
        upsert(cloud(1), "9007199254740992"),
        upsert(cloud(2), "9007199254740993"),
    ]);
    assert.equal(
        protocol.parseChanges(page, 1).data[1].change_seq,
        "9007199254740993",
    );
    assert.throws(() =>
        protocol.parseChanges(changePage([...page.data].reverse()), 1),
    );
    assert.throws(() =>
        protocol.parseChanges(
            { ...page, page: { next_cursor: null, has_more: false } },
            1,
        ),
    );
});

test("same server IDs belonging to different accounts never share a mirror or cursor", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    await runNoteSync(
        port,
        2,
        {
            snapshot: async () => snapshot([cloud(1, 1, "account two", 2)]),
            changes: async () => changePage([], "two"),
        },
        signal(),
    );
    assert.equal((await notes.getLocalNotes(port, 1))[0].content, "body");
    assert.equal(
        (await notes.getLocalNotes(port, 2))[0].content,
        "account two",
    );
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "end");
});

test("503 and cancelled requests never reset the existing baseline or erase local data", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    await assert.rejects(
        runNoteSync(
            port,
            1,
            {
                snapshot: async () => {
                    throw new Error("no");
                },
                changes: async () => {
                    throw { response: { status: 503 } };
                },
            },
            signal(),
        ),
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(runNoteSync(port, 1, {}, controller.signal), /取消/);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "end");
    assert.equal((await notes.getLocalNotes(port, 1)).length, 1);
});

async function database(t, { withRevisions = true, withSync = true } = {}) {
    const sql = new DatabaseSync(":memory:");
    t.after(() => sql.close());
    const params = (bindings) =>
        Array.isArray(bindings) ? bindings : [bindings];
    const port = {
        async run(source, bindings = []) {
            const result = sql.prepare(source).run(...params(bindings));
            return {
                changes: result.changes,
                lastInsertRowId: result.lastInsertRowid,
            };
        },
        async getFirst(source, bindings = []) {
            return sql.prepare(source).get(...params(bindings)) ?? null;
        },
        async getAll(source, bindings = []) {
            return sql.prepare(source).all(...params(bindings));
        },
    };
    let tail = Promise.resolve();
    port.transaction = (task) => {
        const next = tail.then(async () => {
            sql.exec("BEGIN IMMEDIATE");
            try {
                const result = await task(port);
                sql.exec("COMMIT");
                return result;
            } catch (error) {
                sql.exec("ROLLBACK");
                throw error;
            }
        });
        tail = next.catch(() => {});
        return next;
    };
    const migrationPort = {
        execAsync: async (source) => sql.exec(source),
        runAsync: async (source, bindings = []) =>
            sql.prepare(source).run(...params(bindings)),
        getAllAsync: async (source, bindings = []) =>
            sql.prepare(source).all(...params(bindings)),
    };
    await createLocalNotes.up(migrationPort);
    await createNoteDrafts.up(migrationPort);
    if (withRevisions) await createNoteRevisions.up(migrationPort);
    await createUploadQueue.up(migrationPort);
    await addServerUpdatedAt.up(migrationPort);
    if (withSync) await addNoteSyncState.up(migrationPort);
    return { port, sql, migrationPort };
}

// Exercise coordinator with controlled transport; database and account session events remain real.
const transportPath =
    require.resolve("../../src/features/notes/api/notes-sync.api.ts");
const fakeTransport = {
    snapshot: async () => snapshot([]),
    changes: async () => changePage(),
};
require.cache[transportPath] = {
    id: transportPath,
    filename: transportPath,
    loaded: true,
    exports: { notesSyncTransport: fakeTransport },
};
const coordinator = require("../../src/features/notes/services/note-sync-coordinator.ts");
const connections = require("../../src/shared/http/connection-events.ts");
const events = require("../../src/features/notes/notes.events.ts");
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

test("concurrent consumers share one download; changed accounts reject even empty old responses", async (t) => {
    const { port } = await database(t);
    connections.resetConnectionSession();
    coordinator.setNoteSyncOwner(1);
    const started = deferred(),
        response = deferred();
    let calls = 0;
    fakeTransport.snapshot = async () => {
        calls++;
        started.resolve();
        return response.promise;
    };
    const first = coordinator.syncNotes(port, 1);
    const second = coordinator.syncNotes(port, 1);
    assert.equal(first, second);
    await started.promise;
    connections.resetConnectionSession();
    coordinator.setNoteSyncOwner(2);
    response.resolve(snapshot([]));
    await assert.rejects(first, /取消|账号/);
    assert.equal(calls, 1);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, null);
});

test("write beginning while a page is in flight cannot project stale data; subsequent sync succeeds", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    connections.resetConnectionSession();
    coordinator.setNoteSyncOwner(1);
    const started = deferred(),
        response = deferred();
    fakeTransport.changes = async () => {
        started.resolve();
        return response.promise;
    };
    const job = coordinator.syncNotes(port, 1);
    await started.promise;
    const finish = events.beginNoteCloudWrite();
    response.resolve(changePage([upsert(cloud(1, 2, "old"))]));
    await assert.rejects(job, /写入/);
    assert.equal((await notes.getLocalNotes(port, 1))[0].content, "body");
    finish();
    let calls = 0;
    fakeTransport.changes = async () =>
        ++calls === 1
            ? changePage([upsert(cloud(1, 3, "accepted"))])
            : changePage();
    const next = await coordinator.syncNotes(port, 1);
    assert.equal(next.notes[0].content, "accepted");
});

test("snapshot expiry removes staging only and never discards unsent content", async (t) => {
    const { port } = await database(t);
    const { note } = await notes.createPendingLocalNote(port, 1, {
        title: "draft",
        content: "keep",
    });
    await repo.stageSnapshot(
        port,
        1,
        snapshot([cloud(1)], "page2"),
        await repo.readSyncState(port, 1),
        noOp,
    );
    let restarted = false;
    const result = await runNoteSync(
        port,
        1,
        {
            snapshot: async (_owner, query) => {
                if (query.cursor)
                    throw {
                        response: {
                            status: 410,
                            data: { error: { code: "SNAPSHOT_EXPIRED" } },
                        },
                    };
                restarted = true;
                return snapshot([cloud(2)]);
            },
            changes: async () => changePage(),
        },
        signal(),
    );
    assert.equal(restarted, true);
    assert.ok(
        result.notes.some((n) => n.id === note.id && n.content === "keep"),
    );
    assert.ok(!result.notes.some((n) => n.id === 1));
});

test("a failed changes page resumes without exposing historical partial projection", async (t) => {
    const { port } = await database(t);
    await seed(port, [cloud(1)]);
    let interrupted = false;
    const transport = {
        snapshot: async () => {
            throw new Error("no");
        },
        changes: async (_owner, cursor) => {
            if (cursor === "end")
                return changePage(
                    [upsert(cloud(1, 2, "intermediate"))],
                    "page2",
                    true,
                );
            if (cursor === "page2" && !interrupted) {
                interrupted = true;
                throw new Error("offline");
            }
            if (cursor === "page2")
                return changePage([upsert(cloud(1, 3, "final"))], "caught-up");
            return changePage([], "caught-up");
        },
    };
    await assert.rejects(runNoteSync(port, 1, transport, signal()), /offline/);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, "page2");
    assert.equal((await notes.getLocalNotes(port, 1))[0].content, "body");
    assert.equal(
        (await runNoteSync(port, 1, transport, signal())).notes[0].content,
        "final",
    );
});

test("sync API uses the existing authenticated client and tracks full mutation lifetimes", async () => {
    const axios = require("axios");
    const client = axios.create();
    const clientPath = require.resolve("../../src/shared/http/client.ts");
    require.cache[clientPath] = {
        id: clientPath,
        filename: clientPath,
        loaded: true,
        exports: { __esModule: true, default: client },
    };
    delete require.cache[transportPath];
    const { notesSyncTransport } = require(transportPath);
    let called;
    client.defaults.adapter = async (config) => {
        called = config;
        return {
            status: 200,
            statusText: "OK",
            headers: {},
            config,
            data: snapshot([cloud(1)]),
        };
    };
    const controller = new AbortController();
    await notesSyncTransport.snapshot(1, { limit: 50 }, controller.signal);
    assert.equal(called.url, "/notes/snapshot");
    assert.equal(called.signal, controller.signal);
    assert.deepEqual(called.params, { limit: 50 });
    const started = deferred(),
        response = deferred();
    client.defaults.adapter = async (config) => {
        started.resolve();
        await response.promise;
        return { status: 200, headers: {}, config, data: {} };
    };
    const request = client.put("/notes/1", { title: "x" });
    await started.promise;
    assert.equal(events.noteCloudWriteStamp().busy, true);
    response.resolve();
    await request;
    assert.equal(events.noteCloudWriteStamp().busy, false);
    client.defaults.adapter = async (config) => {
        throw new axios.AxiosError("offline", "ERR_NETWORK", config);
    };
    await assert.rejects(client.delete("/categories/1"));
    assert.equal(events.noteCloudWriteStamp().busy, false);
    assert.equal(
        protocol.noteSyncErrorMessage({
            response: {
                data: {
                    error: { code: "UNAVAILABLE", message: "同步配置尚未就绪" },
                },
            },
        }),
        "同步配置尚未就绪",
    );
});

test("unchanged save of a server-deleted note preserves its draft and refuses upload", async (t) => {
    const { port } = await database(t);
    const {
        notes: [original],
    } = await seed(port, [cloud(1)]);
    await drafts.openNoteDraft(
        port,
        1,
        "note:1",
        "editing",
        1,
        { title: original.title, content: original.content, categoryId: null },
        original.current_revision_id,
    );
    await repo.applyChanges(port, 1, "end", changePage([deletion(1)]), noOp);
    await repo.projectMirror(port, 1, noOp);
    const apiPath =
        require.resolve("../../src/features/notes/api/notes.api.ts");
    let requests = 0;
    require.cache[apiPath] = {
        id: apiPath,
        filename: apiPath,
        loaded: true,
        exports: {
            createNote: async () => {
                requests++;
            },
            updateNote: async () => {
                requests++;
            },
        },
    };
    const saves = require("../../src/features/notes/services/note-save.service.ts");
    // The editor still holds a pre-deletion 'synced' view.
    const result = await saves.stageEditedNoteForSync(port, 1, original, {
        title: original.title,
        content: original.content,
    });
    assert.equal(result.shouldUpload, false);
    assert.equal(result.cloudState, "rejected");
    assert.ok(await drafts.readNoteDraft(port, 1, "note:1"));
    const upload = await saves.uploadNoteNow(port, 1, original.id);
    assert.equal(upload.retryable, false);
    assert.equal(requests, 0);
    await repo.projectMirror(port, 1, noOp);
    assert.equal(
        (await notes.getLocalNotes(port, 1))[0].content,
        original.content,
    );
});

test("v7 migration preserves existing local notes, revisions, and drafts exactly", async (t) => {
    const { port, sql, migrationPort } = await database(t, { withSync: false });
    const created = await notes.createPendingLocalNote(port, 1, {
        title: "historical",
        content: "keep bytes",
    });
    await drafts.openNoteDraft(
        port,
        1,
        "note:" + created.note.id,
        "old",
        created.note.id,
        { title: "draft", content: "unsent draft", categoryId: null },
    );
    const before = ["local_notes", "note_revisions", "note_drafts"].map(
        (table) => sql.prepare("SELECT * FROM " + table).all(),
    );
    await addNoteSyncState.up(migrationPort);
    const after = ["local_notes", "note_revisions", "note_drafts"].map(
        (table) => sql.prepare("SELECT * FROM " + table).all(),
    );
    assert.deepEqual(after, before);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, null);
});

test("response diagnostics identify snapshot fields without exposing values", () => {
    const cases = [
        ["is_pinned", 0, "boolean", "number"],
        ["is_starred", undefined, "boolean", "undefined"],
        ["created_at", "private-malformed-time", "带时区", "string"],
        ["updated_at", 123, "string", "number"],
        ["sync_updated_at", {}, "string", "object"],
        ["user_id", 999, "当前登录账号", "账号不匹配"],
        ["deleted_at", "private-deletion", "null", "string"],
        ["client_id", "private-uuid", "UUID", "格式不符"],
        ["id", "private-id", "安全整数", "string"],
        ["version", 0, "安全整数", "number"],
        ["title", ["private-title"], "string", "array"],
        ["content", { secret: "private-body" }, "string", "object"],
        ["category_id", false, "安全整数", "boolean"],
    ];
    for (const [field, value, expected, actual] of cases) {
        const input = snapshot([{ ...cloud(1), [field]: value }]);
        assert.throws(
            () => protocol.parseSnapshot(input, 1),
            (error) => {
                assert.ok(error instanceof protocol.NotesSyncResponseError);
                assert.equal(error.field, "data[0]." + field);
                assert.ok(error.expected.includes(expected));
                assert.ok(error.actual.includes(actual));
                assert.ok(!JSON.stringify(error).includes("private-"));
                assert.ok(!error.message.includes("private-"));
                assert.equal(error.response, undefined);
                return true;
            },
        );
    }
    const valid = protocol.parseSnapshot(snapshot([cloud(1)]), 1);
    assert.equal(valid.data[0].sync_updated_at, null);
});

test("diagnostics distinguish malformed envelopes, pagination, nested changes and sequence ordering", () => {
    const cases = [
        [() => protocol.parseSnapshot("private-html-body", 1), "$response"],
        [() => protocol.parseSnapshot({ data: [], sync: {} }, 1), "page"],
        [() => protocol.parseSnapshot({ data: [], page: {} }, 1), "sync"],
        [
            () => protocol.parseSnapshot({ ...snapshot([]), data: {} }, 1),
            "data",
        ],
        [
            () =>
                protocol.parseSnapshot(
                    { ...snapshot([]), page: { has_more: "false" } },
                    1,
                ),
            "page.has_more",
        ],
        [
            () =>
                protocol.parseSnapshot(
                    {
                        ...snapshot([]),
                        page: {
                            has_more: false,
                            next_cursor: "private-cursor",
                        },
                    },
                    1,
                ),
            "page.next_cursor",
        ],
        [
            () =>
                protocol.parseSnapshot(
                    {
                        ...snapshot([]),
                        page: {
                            has_more: false,
                            next_cursor: null,
                            snapshot_token: "",
                        },
                    },
                    1,
                ),
            "page.snapshot_token",
        ],
        [
            () =>
                protocol.parseSnapshot(
                    {
                        ...snapshot([]),
                        sync: { changes_cursor: "private-".repeat(400) },
                    },
                    1,
                ),
            "sync.changes_cursor",
        ],
        [
            () =>
                protocol.parseChanges(
                    changePage([upsert({ ...cloud(1), content: [] })]),
                    1,
                ),
            "data[0].data.content",
        ],
        [
            () =>
                protocol.parseChanges(
                    changePage([{ ...deletion(1), deleted_at: null }]),
                    1,
                ),
            "data[0].deleted_at",
        ],
        [
            () =>
                protocol.parseChanges(
                    changePage([
                        { ...deletion(1), operation: "private-operation" },
                    ]),
                    1,
                ),
            "data[0].operation",
        ],
        [
            () =>
                protocol.parseChanges(
                    changePage([{ ...deletion(1), change_seq: "private-seq" }]),
                    1,
                ),
            "data[0].change_seq",
        ],
        [
            () =>
                protocol.parseChanges(
                    changePage([upsert(cloud(1), "2"), upsert(cloud(2), "1")]),
                    1,
                ),
            "data[1].change_seq",
        ],
    ];
    for (const [parse, field] of cases)
        assert.throws(parse, (error) => {
            assert.equal(error.field, field);
            assert.ok(!error.message.includes("private-"));
            return true;
        });
});

test("transport validation attaches only fixed endpoint and HTTP status; HTTP failures retain their identity", async () => {
    const client = require("../../src/shared/http/client.ts").default;
    const { notesSyncTransport } = require(transportPath);
    const axios = require("axios");
    const privateData = "private-body-token-and-cursor";
    const badNote = { ...cloud(1), is_pinned: "not-a-boolean", content: privateData };
    client.defaults.adapter = async (config) => ({
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        data: config.url.endsWith("/snapshot")
            ? snapshot([badNote])
            : changePage([upsert(badNote)], privateData),
    });
    for (const kind of ["snapshot", "changes"]) {
        const call =
            kind === "snapshot"
                ? () => notesSyncTransport.snapshot(1, { limit: 50 }, signal())
                : () =>
                      notesSyncTransport.changes(1, privateData, 50, signal());
        await assert.rejects(call, (error) => {
            assert.equal(error.context.endpoint, "/api/notes/" + kind);
            assert.equal(error.response.status, 200);
            assert.ok(error.message.includes("HTTP 200"));
            assert.ok(
                error.message.includes(
                    kind === "snapshot"
                        ? "data[0].is_pinned"
                        : "data[0].data.is_pinned",
                ),
            );
            assert.ok(error.message.includes("实际 string"));
            assert.ok(!error.message.includes(privateData));
            assert.ok(!JSON.stringify(error).includes(privateData));
            assert.equal(error.response.data, undefined);
            assert.equal(error.cause, undefined);
            return true;
        });
    }
    const failure = new axios.AxiosError(
        "service unavailable",
        "ERR_BAD_RESPONSE",
        undefined,
        undefined,
        { status: 503, data: { error: { code: "TEMPORARILY_UNAVAILABLE" } } },
    );
    client.defaults.adapter = async () => {
        throw failure;
    };
    await assert.rejects(
        notesSyncTransport.snapshot(1, { limit: 50 }, signal()),
        (error) => error === failure,
    );
    const unexpected = new Error("unrelated parser failure");
    assert.throws(
        () =>
            protocol.withSyncResponseContext("/api/notes/snapshot", 200, () => {
                throw unexpected;
            }),
        (error) => error === unexpected,
    );
});


function isolatedCoordinator() {
    const filename = path.join(root, 'src/features/notes/services/note-sync-coordinator.ts');
    const localRequire = Module.createRequire(filename);
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name =>
        name === '../api/notes-sync.api' ? { notesSyncTransport: fakeTransport } : localRequire(name), mod, mod.exports);
    return mod.exports;
}

// Run the real Provider layout effect with refs retained across module reloads.
function providerHarness(port) {
    const refs = [];
    let refIndex = 0, layouts = [], activeCoordinator;
    const counts = { resets: 0, welcomes: 0 };
    const profile = { user: { id: 1 }, loading: false };
    const react = {
        useRef(value) { return refs[refIndex++] ??= { current: value }; },
        useLayoutEffect(effect) { layouts.push(effect); },
        useEffect() {},
        useCallback(fn) { return fn; },
    };
    const dependencies = {
        'react': react,
        'react/jsx-runtime': require('react/jsx-runtime'),
        'react-native': {},
        'expo-router': {},
        '@/core/database': { useApplicationDatabase: () => port },
        '@/core/sync': {},
        '@/features/auth/hooks/useAuth': { useAuth: () => profile },
        '@/features/sync': {},
        '@/shared/http/client': {},
        '@/shared/http/connection-events': { resetConnectionSession() { counts.resets++; connections.resetConnectionSession(); } },
        '@/shared/ui/Overlay/overlay-context': { OverlayProvider: () => null },
        './notification-host': { NotificationHost: () => null },
        './notification.service': { banner: { clearSession() {}, show() { counts.welcomes++; } } },
        './server-connection-coordinator': {},
    };
    return {
        counts, profile,
        render(coordinatorModule) {
            activeCoordinator = coordinatorModule;
            refIndex = 0; layouts = [];
            const filename = path.join(root, 'src/core/notifications/notification-provider.tsx');
            const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
                compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
            }).outputText;
            const mod = { exports: {} };
            new Function('require', 'module', 'exports', code)(name => {
                if (name === '@/features/notes/services/note-sync-coordinator') return activeCoordinator;
                if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
                return dependencies[name];
            }, mod, mod.exports);
            mod.exports.NotificationProvider({ children: null });
            layouts.forEach(effect => effect());
        },
    };
}

test('same-account Provider rebinds a reloaded coordinator without resetting banners or active requests', async t => {
    const { port } = await database(t);
    t.after(() => connections.resetConnectionSession());
    fakeTransport.snapshot = async () => snapshot([]);
    fakeTransport.changes = async () => changePage();
    const provider = providerHarness(port);
    const first = isolatedCoordinator();
    provider.render(first);
    await first.syncNotes(port, 1);
    const reloaded = isolatedCoordinator();
    provider.render(reloaded);
    await reloaded.syncNotes(port, 1);
    assert.deepEqual(provider.counts, { resets: 1, welcomes: 1 });
    const started = deferred(), response = deferred();
    fakeTransport.changes = async () => { started.resolve(); return response.promise; };
    const inFlight = reloaded.syncNotes(port, 1);
    await started.promise;
    provider.render(reloaded);
    assert.equal(reloaded.syncNotes(port, 1), inFlight);
    response.resolve(changePage());
    await inFlight;
});

test('direct owner switch and switch-back cancel old requests before any cursor is committed', async t => {
    const { port } = await database(t);
    t.after(() => connections.resetConnectionSession());
    const local = isolatedCoordinator();
    const started = deferred(), response = deferred();
    let requestSignal;
    fakeTransport.snapshot = async (_owner, _query, signal) => { requestSignal = signal; started.resolve(); return response.promise; };
    local.setNoteSyncOwner(1);
    const inFlight = local.syncNotes(port, 1);
    await started.promise;
    local.setNoteSyncOwner(2);
    local.setNoteSyncOwner(1);
    const aborted = requestSignal.aborted;
    response.resolve(snapshot([]));
    await assert.rejects(inFlight, /取消|账号/);
    assert.equal(aborted, true);
    assert.equal((await repo.readSyncState(port, 1)).changes_cursor, null);
});

test('logout rejects late results and a same-account login can establish a fresh baseline', async t => {
    const { port } = await database(t);
    t.after(() => connections.resetConnectionSession());
    const local = isolatedCoordinator();
    const provider = providerHarness(port);
    const started = deferred(), response = deferred();
    fakeTransport.snapshot = async () => { started.resolve(); return response.promise; };
    provider.render(local);
    const inFlight = local.syncNotes(port, 1);
    await started.promise;
    provider.profile.user = null;
    provider.render(local);
    response.resolve(snapshot([cloud(1)]));
    await assert.rejects(inFlight, /取消|账号/);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
    await assert.rejects(local.syncNotes(port, 1), /账号/);
    fakeTransport.snapshot = async () => snapshot([cloud(1)]);
    fakeTransport.changes = async () => changePage();
    provider.profile.user = { id: 1 };
    provider.render(local);
    assert.equal((await local.syncNotes(port, 1)).notes.length, 1);
});


test('nullable legacy flags survive snapshot and changes parsing, then normalize for local use', () => {
    for (const pin of [null, false, true]) for (const star of [null, false, true]) {
        const source = { ...cloud(1), is_pinned: pin, is_starred: star };
        const fromSnapshot = protocol.parseSnapshot(snapshot([source]), 1).data[0];
        const fromChanges = protocol.parseChanges(changePage([upsert(source)]), 1).data[0].data;
        for (const parsed of [fromSnapshot, fromChanges]) {
            assert.equal(parsed.is_pinned, pin);
            assert.equal(parsed.is_starred, star);
            const local = protocol.cloudNoteToLocal(parsed);
            assert.equal(local.is_pinned, pin ?? false);
            assert.equal(local.is_starred, star ?? false);
        }
    }
    for (const field of ['is_pinned', 'is_starred']) {
        for (const invalid of [undefined, 0, 1, 'false', 'true', {}, []]) {
            assert.throws(() => protocol.parseSnapshot(snapshot([{ ...cloud(1), [field]: invalid }]), 1),
                error => error.field === 'data[0].' + field);
        }
    }
    assert.throws(() => protocol.parseChanges({ ...changePage(), page: { next_cursor: 'cursor', has_more: null } }, 1),
        error => error.field === 'page.has_more');
});

test('real SQLite sync retains NULL flags in the mirror and applies false/true transitions without changing edit time', async t => {
    const { port } = await database(t);
    const legacy = { ...cloud(1), is_pinned: null, is_starred: null };
    const first = await seed(port, [legacy]);
    assert.equal(first.notes[0].is_pinned, false);
    assert.equal(first.notes[0].is_starred, false);
    assert.equal((await repo.readCloudMirror(port, 1))[0].is_pinned, null);
    await repo.applyChanges(port, 1, 'end', changePage([upsert(legacy)]), noOp);
    const pinned = { ...cloud(1, 2), is_pinned: true, is_starred: true };
    await repo.applyChanges(port, 1, 'end', changePage([upsert(pinned)]), noOp);
    await repo.projectMirror(port, 1, noOp);
    const current = (await notes.getLocalNotes(port, 1))[0];
    assert.equal(current.is_pinned, true);
    assert.equal(current.is_starred, true);
    assert.equal(current.updated_at, first.notes[0].updated_at);
    const cleared = { ...cloud(1, 3), is_pinned: null, is_starred: false };
    await repo.applyChanges(port, 1, 'end', changePage([upsert(cleared)]), noOp);
    await repo.projectMirror(port, 1, noOp);
    assert.equal((await notes.getLocalNotes(port, 1))[0].is_pinned, false);
    assert.equal((await notes.getLocalNotes(port, 1))[0].is_starred, false);
});
