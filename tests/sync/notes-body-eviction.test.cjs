// 正文淘汰与按需下载：保留规则、只更新元数据、按需下载、保存兜底、新设备首次同步与回收站。
// 真实 SQLite（全部迁移）+ 内存假服务端；按需下载经真实 notes.api，HTTP 由 axios 适配器模拟。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const crypto = require("node:crypto");
const ts = require("typescript");
const axios = require("axios");
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
const client = axios.create();
const clientPath = require.resolve("../../src/shared/http/client.ts");
require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: { __esModule: true, default: client },
};

const { databaseMigrations } = require("../../src/core/database/migrations/index.ts");
const { runNoteSync, holdNoteBody, heldNoteBodies } = require("../../src/features/notes/services/note-sync.service.ts");
const body = require("../../src/features/notes/data/note-body.repository.ts");
const { fillLocalContentHashes } = require("../../src/features/notes/data/note-content-hash.ts");
const notes = require("../../src/features/notes/data/note-local.repository.ts");
const trash = require("../../src/features/notes/data/note-trash.repository.ts");
const service = require("../../src/features/notes/services/note-body.service.ts");
const cloudPolicy = require("../../src/core/cloud-storage/cloud-storage-policy.ts");

const signal = () => new AbortController().signal;
const sha = (text) => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

async function database(t) {
    const sql = new DatabaseSync(":memory:");
    t.after(() => sql.close());
    const params = (bindings) =>
        bindings === undefined ? [] : Array.isArray(bindings) ? bindings : [bindings];
    const port = {
        async run(source, bindings) {
            const result = sql.prepare(source).run(...params(bindings));
            return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
        },
        async getFirst(source, bindings) {
            return sql.prepare(source).get(...params(bindings)) ?? null;
        },
        async getAll(source, bindings) {
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
        runAsync: async (source, bindings) => sql.prepare(source).run(...params(bindings)),
        getAllAsync: async (source, bindings) => sql.prepare(source).all(...params(bindings)),
        getFirstAsync: async (source, bindings) => sql.prepare(source).get(...params(bindings)) ?? null,
    };
    for (const migration of databaseMigrations) await migration.up(migrationPort);
    return { port, sql };
}

const iso = (day) => `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`;
const note = (id, content = `正文 ${id}`, extra = {}) => ({
    id,
    user_id: 1,
    client_id: "00000000-0000-4000-8000-" + String(id).padStart(12, "0"),
    version: 1,
    title: `笔记 ${id}`,
    content,
    category_id: null,
    created_at: iso(1),
    updated_at: iso(1),
    sync_updated_at: iso(1),
    deleted_at: null,
    is_pinned: false,
    is_starred: false,
    ...extra,
});
function meta(full) {
    const { content, ...rest } = full;
    if (content === null) return { ...rest, content_hash: null, content_length: 0, content_preview: null };
    const points = Array.from(content);
    return { ...rest, content_hash: sha(content), content_length: points.length, content_preview: points.slice(0, 120).join("").replace(/\r\n|\r|\n/g, " ") };
}
function server(initial = []) {
    const state = { notes: new Map(initial.map((n) => [n.id, n])), events: [], batches: [] };
    state.upsert = (n) => {
        state.notes.set(n.id, n);
        state.events.push(n);
    };
    state.transport = {
        supportsMeta: async () => true,
        async snapshot(_owner, query) {
            return {
                data: [...state.notes.values()].sort((a, b) => a.id - b.id).map((n) => (query.fields === "meta" ? meta(n) : n)),
                page: { next_cursor: null, has_more: false, snapshot_token: "token" },
                sync: { changes_cursor: String(state.events.length) },
            };
        },
        async changes(_owner, cursor, _limit, _signal, fields) {
            const data = state.events.slice(Number(cursor)).map((n, index) => ({
                change_seq: String(Number(cursor) + index + 1),
                operation: "upsert",
                data: fields === "meta" ? meta(n) : n,
            }));
            return { data, page: { next_cursor: String(state.events.length), has_more: false } };
        },
        async batch(_owner, ids) {
            state.batches.push([...ids]);
            return { data: ids.filter((id) => state.notes.has(id)).map((id) => state.notes.get(id)), missing: ids.filter((id) => !state.notes.has(id)) };
        },
    };
    return state;
}
const sync = (port, cloud) => runNoteSync(port, 1, cloud.transport, signal());
const row = (sql, id) => sql.prepare("SELECT * FROM local_notes WHERE owner_user_id=1 AND server_id=?").get(id);
const revisionCount = (sql, clientId) => sql.prepare("SELECT count(*) AS c FROM note_revisions WHERE client_id=?").get(clientId).c;
const opened = (sql, id, day) => sql.prepare("UPDATE local_notes SET last_opened_at=? WHERE server_id=?").run(iso(day), id);

test("eviction keeps pinned, starred, drafted, queued and held notes plus the most recently opened ones", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([1, 2, 3, 4, 5, 6, 7, 8].map((id) => note(id, `正文 ${id}\n第二行`, { is_pinned: id === 1, is_starred: id === 2 })));
    await sync(port, cloud);
    for (const [id, day] of [[3, 20], [4, 10], [5, 15], [6, 5], [7, 1], [8, 2]]) opened(sql, id, day);
    sql.prepare("INSERT INTO note_drafts(owner_user_id,note_id,draft_key,session_id,base_snapshot,sequence,title,content,category_id,updated_at) VALUES(1,?,'k','s','{}',1,'t','c',NULL,'x')").run(row(sql, 6).client_id);
    sql.prepare("INSERT INTO upload_queue_tasks(task_id,owner_user_id,task_kind,dedupe_key,title,operation_label,payload_json,status,attempt_count,estimated_bytes,transferred_bytes,created_at,updated_at) VALUES('q',1,'note-save',?, 't','o','{}','queued',0,0,0,'x','x')").run(`note:${row(sql, 7).client_id}`);
    const release = holdNoteBody(row(sql, 8).client_id);
    t.after(release);
    const revisionsBefore = revisionCount(sql, row(sql, 4).client_id);
    const evicted = await body.evictNoteBodies(port, 1, 2, heldNoteBodies(), () => {});
    // Candidates 3,4,5 by recency 3(20) > 5(15) > 4(10): keep two, evict 4.
    assert.equal(evicted, 1);
    const four = row(sql, 4);
    assert.equal(four.body_state, "evicted");
    assert.equal(four.content, null);
    assert.equal(four.content_preview, "正文 4 第二行");
    assert.equal(four.content_length, 8);
    assert.equal(four.content_hash, sha("正文 4\n第二行"));
    assert.equal(revisionCount(sql, four.client_id), revisionsBefore);
    for (const id of [1, 2, 3, 5, 6, 7, 8]) assert.equal(row(sql, id).body_state, "present", `note ${id}`);
    const listed = (await notes.getLocalNotes(port, 1)).find((n) => n.server_id === 4);
    assert.equal(listed.body_state, "evicted");
    assert.equal(listed.content_preview, "正文 4 第二行");
    assert.deepEqual(await body.readNoteBodyStats(port, 1, heldNoteBodies()), { present: 7, evicted: 1, releasable: 2 });
});

test("an old full-mode mirror has no hashes, so nothing is ever evicted", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2)]);
    cloud.transport.supportsMeta = async () => false;
    await sync(port, cloud);
    await fillLocalContentHashes(port, 1, () => {});
    assert.equal(await body.evictNoteBodies(port, 1, 0, new Set(), () => {}), 0);
    assert.equal(row(sql, 1).body_state, "present");
});

test("evicted notes receive metadata-only updates; pinning or starring brings the body back", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2)]);
    await sync(port, cloud);
    await body.evictNoteBodies(port, 1, 0, new Set(), () => {});
    assert.equal(row(sql, 1).body_state, "evicted");
    const clientId = row(sql, 1).client_id;
    const revisions = revisionCount(sql, clientId);
    const batches = cloud.batches.length;
    cloud.upsert(note(1, "云端新正文", { version: 2, title: "改名", updated_at: iso(5) }));
    await sync(port, cloud);
    assert.equal(cloud.batches.length, batches, "evicted bodies are not downloaded for metadata");
    const updated = row(sql, 1);
    assert.equal(updated.title, "改名");
    assert.equal(updated.body_state, "evicted");
    assert.equal(updated.content, null);
    assert.equal(updated.content_preview, "云端新正文");
    assert.equal(updated.content_hash, sha("云端新正文"));
    assert.equal(updated.server_updated_at, iso(5));
    assert.equal(revisionCount(sql, clientId), revisions);
    cloud.upsert(note(2, "正文 2", { version: 2, is_starred: true }));
    await sync(port, cloud);
    assert.deepEqual(cloud.batches.at(-1), [2]);
    assert.equal(row(sql, 2).body_state, "present");
    assert.equal(row(sql, 2).content, "正文 2");
    assert.equal(row(sql, 2).is_starred, 1);
});

test("opening an evicted note downloads its body; offline and deleted notes report why", async (t) => {
    const { port, sql } = await database(t);
    cloudPolicy.setCloudStorageSession(1, true, true);
    t.after(() => cloudPolicy.setCloudStorageSession(null, false, false));
    const cloud = server([note(1), note(2)]);
    await sync(port, cloud);
    await body.evictNoteBodies(port, 1, 0, new Set(), () => {});
    cloud.notes.set(1, note(1, "打开时的最新正文", { version: 2 }));
    let reply = (config) => ({ status: 200, data: cloud.notes.get(Number(config.url.split("/").at(-1))) });
    client.defaults.adapter = async (config) => {
        const result = reply(config);
        if (result instanceof Error) {
            result.config = config;
            throw result;
        }
        const response = { status: result.status, statusText: "", headers: {}, config, data: result.data };
        if (result.status >= 400) throw new axios.AxiosError("failed", "ERR_BAD_REQUEST", config, null, response);
        return response;
    };
    t.after(() => delete client.defaults.adapter);
    const evicted = await notes.getLocalNoteByClientId(port, 1, row(sql, 1).client_id);
    assert.equal(evicted.body_state, "evicted");
    const restored = await service.ensureNoteBody(port, 1, evicted);
    assert.equal(restored.body_state, undefined);
    assert.equal(restored.content, "打开时的最新正文");
    assert.equal(row(sql, 1).body_state, "present");
    assert.equal(row(sql, 1).content_preview, null);
    assert.ok(row(sql, 1).last_opened_at);

    const second = await notes.getLocalNoteByClientId(port, 1, row(sql, 2).client_id);
    reply = () => new axios.AxiosError("Network Error", "ERR_NETWORK");
    await assert.rejects(service.ensureNoteBody(port, 1, second), (error) => error.reason === "offline");
    reply = () => ({ status: 410, data: { error: { code: "NOTE_DELETED", message: "笔记已删除" } } });
    await assert.rejects(service.ensureNoteBody(port, 1, second), (error) => error.reason === "not-found");
    assert.equal(row(sql, 2).body_state, "evicted");
});

test("saves without the full body are refused for evicted notes; a full save restores the body", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    await body.evictNoteBodies(port, 1, 0, new Set(), () => {});
    const evicted = await notes.getLocalNoteByClientId(port, 1, row(sql, 1).client_id);
    await assert.rejects(notes.updatePendingLocalNote(port, 1, evicted, { title: "只改标题" }), /正文尚未下载/);
    await assert.rejects(notes.updatePendingLocalNote(port, 1, evicted, { category_id: 3 }), /正文尚未下载/);
    assert.equal(row(sql, 1).title, "笔记 1");
    await notes.updatePendingLocalNote(port, 1, evicted, { title: "新标题", content: "完整的新正文" });
    assert.equal(row(sql, 1).body_state, "present");
    assert.equal(row(sql, 1).content, "完整的新正文");
    assert.equal(row(sql, 1).sync_status, "pending");
});

test("a new device downloads bodies only within the keep window, newest first; pinned notes always", async (t) => {
    const { port, sql } = await database(t);
    const total = body.NOTE_BODY_KEEP_RECENT + 3;
    const all = Array.from({ length: total }, (_, index) => {
        const id = index + 1;
        const minutes = String(id % 60).padStart(2, "0");
        const hours = String(Math.floor(id / 60)).padStart(2, "0");
        return note(id, `正文 ${id}`, { updated_at: `2026-09-10T${hours}:${minutes}:00.000Z`, is_pinned: id === 1 });
    });
    const cloud = server(all);
    await sync(port, cloud);
    const downloaded = cloud.batches.flat();
    assert.equal(downloaded.length, body.NOTE_BODY_KEEP_RECENT + 1);
    assert.ok(downloaded.includes(1), "pinned note is always downloaded");
    // 302 unpinned notes, 300 kept: the two oldest only get their preview.
    for (const id of [2, 3]) {
        assert.equal(row(sql, id).body_state, "evicted", `oldest note ${id}`);
        assert.equal(row(sql, id).content_preview, `正文 ${id}`);
        assert.equal(revisionCount(sql, row(sql, id).client_id), 0);
    }
    assert.equal(row(sql, 4).body_state, "present");
    assert.equal(row(sql, total).body_state, "present");
    assert.equal((await notes.getLocalNotes(port, 1)).length, total);
    // A second sync downloads nothing new and keeps the window.
    await sync(port, cloud);
    assert.equal(cloud.batches.flat().length, downloaded.length);
});

test("the trash restores an evicted note as a preview without inventing an empty body", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1, "回收站里的正文")]);
    await sync(port, cloud);
    await body.evictNoteBodies(port, 1, 0, new Set(), () => {});
    const clientId = row(sql, 1).client_id;
    await port.transaction((tx) => trash.archiveLocalNote(tx, 1, clientId));
    const trashed = sql.prepare("SELECT * FROM note_trash WHERE client_id=?").get(clientId);
    assert.equal(trash.trashPreview(trashed).content, "回收站里的正文");
    await port.transaction((tx) => trash.restoreArchivedNote(tx, 1, trashed));
    const restored=await notes.getLocalNoteByClientId(port,1,trashed.client_id);
    assert.equal(restored.body_state,"evicted");
    assert.equal(restored.content,null);
    assert.equal(restored.content_preview,"回收站里的正文");
    assert.equal(restored.sync_status,"synced");
});

test("the content hash trigger keeps the cloud hash on eviction and resets it once the body returns", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    await body.evictNoteBodies(port, 1, 0, new Set(), () => {});
    assert.equal(row(sql, 1).content_hash, sha("正文 1"));
    sql.prepare("UPDATE local_notes SET content='回来了' WHERE server_id=1").run();
    const back = row(sql, 1);
    assert.deepEqual([back.body_state, back.content_hash, back.content_preview, back.content_length], ["present", null, null, null]);
});
