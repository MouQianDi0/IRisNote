// 笔记元数据同步：镜像只存元数据，按正文哈希判断是否下载正文；旧服务端保持完整模式。
// 真实 SQLite（全部迁移）+ 内存假服务端（快照、增量、批量取正文）。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const crypto = require("node:crypto");
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

const { databaseMigrations } = require("../../src/core/database/migrations/index.ts");
const { runNoteSync } = require("../../src/features/notes/services/note-sync.service.ts");
const notes = require("../../src/features/notes/data/note-local.repository.ts");
const { noteContentHash } = require("../../src/features/notes/data/note-content-hash.ts");
const cacheRepo = require("../../src/features/notes/data/note-cache.repository.ts");
const { parseCloudNoteMeta } = require("../../src/features/notes/api/notes-sync.types.ts");

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

const note = (id, content = `正文 ${id}`, extra = {}) => ({
    id,
    user_id: 1,
    client_id: "00000000-0000-4000-8000-" + String(id).padStart(12, "0"),
    version: 1,
    title: `笔记 ${id}`,
    content,
    category_id: null,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z",
    sync_updated_at: "2026-09-20T00:00:00.000Z",
    deleted_at: null,
    is_pinned: false,
    is_starred: false,
    ...extra,
});
// 与服务端 noteMeta 相同的规则。
function meta(full) {
    const { content, ...rest } = full;
    if (content === null) return { ...rest, content_hash: null, content_length: 0, content_preview: null };
    const points = Array.from(content);
    return {
        ...rest,
        content_hash: sha(content),
        content_length: points.length,
        content_preview: points.slice(0, 120).join("").replace(/\r\n|\r|\n/g, " "),
    };
}

/** 内存假服务端：notes 为当前版本，events 为增量事件。 */
function server(initial = [], { supports = true } = {}) {
    const state = { notes: new Map(initial.map((n) => [n.id, n])), events: [], supports, calls: { snapshot: [], changes: [], batch: [] } };
    const view = (n, fields) => (fields === "meta" ? meta(n) : n);
    state.upsert = (n) => {
        state.notes.set(n.id, n);
        state.events.push({ operation: "upsert", note: n });
    };
    state.remove = (id, version, deletedAt = "2026-09-21T00:00:00.000Z") => {
        const current = state.notes.get(id);
        state.notes.delete(id);
        state.events.push({ operation: "delete", id, client_id: current.client_id, version, deleted_at: deletedAt });
    };
    state.transport = {
        supportsMeta: async () => {
            if (state.supports instanceof Error) throw state.supports;
            return state.supports;
        },
        async snapshot(_owner, query) {
            state.calls.snapshot.push(query);
            return {
                data: [...state.notes.values()].sort((a, b) => a.id - b.id).map((n) => view(n, query.fields)),
                page: { next_cursor: null, has_more: false, snapshot_token: `token-${query.fields ?? "full"}` },
                sync: { changes_cursor: String(state.events.length) },
            };
        },
        async changes(_owner, cursor, _limit, _signal, fields) {
            state.calls.changes.push(fields);
            const data = state.events.slice(Number(cursor)).map((event, index) => {
                const seq = String(Number(cursor) + index + 1);
                return event.operation === "upsert"
                    ? { change_seq: seq, operation: "upsert", data: view(event.note, fields) }
                    : { change_seq: seq, operation: "delete", id: event.id, client_id: event.client_id, version: event.version, deleted_at: event.deleted_at };
            });
            return { data, page: { next_cursor: String(state.events.length), has_more: false } };
        },
        async batch(_owner, ids) {
            state.calls.batch.push([...ids]);
            return {
                data: ids.filter((id) => state.notes.has(id)).map((id) => state.notes.get(id)),
                missing: ids.filter((id) => !state.notes.has(id)),
            };
        },
    };
    return state;
}

const sync = (port, cloud) => runNoteSync(port, 1, cloud.transport, signal());
const mirrorPayloads = (sql) =>
    sql.prepare("SELECT payload FROM note_sync_mirror WHERE owner_user_id=1 ORDER BY server_id").all().map((r) => JSON.parse(r.payload));
const local = (sql, id) => sql.prepare("SELECT * FROM local_notes WHERE owner_user_id=1 AND server_id=?").get(id);
const revisions = (sql, clientId) =>
    sql.prepare("SELECT count(*) AS count FROM note_revisions WHERE owner_user_id=1 AND client_id=?").get(clientId).count;

test("client content hashes match the server's raw UTF-8 SHA-256", () => {
    assert.equal(noteContentHash(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const raw = "第一行😀\r\n第二行\r第三行\n";
    assert.equal(noteContentHash(raw), sha(raw));
    assert.notEqual(noteContentHash(raw), sha(raw.replace(/\r\n/g, "\n")));
    assert.equal(noteContentHash(null), null);
    const parsed = parseCloudNoteMeta(meta(note(1, raw)), 1);
    assert.equal(parsed.content_hash, noteContentHash(raw));
    assert.equal("content" in parsed, false);
    assert.throws(() => parseCloudNoteMeta({ ...meta(note(1)), content: "x" }, 1));
    assert.throws(() => parseCloudNoteMeta({ ...meta(note(1)), content_hash: "ABC" }, 1));
    assert.throws(() => parseCloudNoteMeta({ ...meta(note(1)), content_hash: null }, 1));
});

test("switching to metadata mode refetches only metadata and downloads nothing for unchanged bodies", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2, "第二篇\r\n😀")], { supports: false });
    await sync(port, cloud);
    assert.equal(mirrorPayloads(sql)[0].content, "正文 1");
    const before = sql.prepare("SELECT client_id,title,content,current_revision_id FROM local_notes ORDER BY server_id").all();

    cloud.supports = true;
    await sync(port, cloud);
    assert.equal(cloud.calls.snapshot.at(-1).fields, "meta");
    assert.deepEqual(cloud.calls.batch, []);
    assert.ok(mirrorPayloads(sql).every((p) => !("content" in p) && typeof p.content_hash === "string"));
    assert.deepEqual(sql.prepare("SELECT client_id,title,content,current_revision_id FROM local_notes ORDER BY server_id").all(), before);
    assert.equal(sql.prepare("SELECT mirror_mode FROM note_sync_state WHERE owner_user_id=1").get().mirror_mode, "meta");
    assert.equal(local(sql, 2).content_hash, sha("第二篇\r\n😀"));
});

test("changed bodies are downloaded in batches and merged as before; flag-only changes download nothing", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2)]);
    await sync(port, cloud);
    assert.deepEqual(cloud.calls.batch, [[1, 2]]);
    const first = local(sql, 1);
    assert.equal(first.content, "正文 1");
    const revisionsBefore = revisions(sql, first.client_id);

    cloud.upsert(note(1, "云端改过的正文", { version: 2, updated_at: "2026-09-22T00:00:00.000Z" }));
    cloud.upsert(note(2, "正文 2", { version: 2, is_pinned: true }));
    cloud.upsert(note(3, "新笔记"));
    await sync(port, cloud);
    assert.deepEqual(cloud.calls.batch.at(-1), [1, 3]);
    assert.equal(cloud.calls.changes.at(-1), "meta");
    assert.equal(local(sql, 1).content, "云端改过的正文");
    assert.equal(revisions(sql, first.client_id), revisionsBefore + 1);
    assert.equal(local(sql, 2).is_pinned, 1);
    assert.equal(local(sql, 2).content, "正文 2");
    assert.equal(local(sql, 3).content, "新笔记");

    await sync(port, cloud);
    assert.deepEqual(cloud.calls.batch.at(-1), [1, 3], "no new download once hashes match");
    assert.equal(cloud.calls.batch.length, 2);
});

test("a body that cannot be downloaded is skipped this round and applied later", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    cloud.upsert(note(4, "稍后才能下载"));
    const batch = cloud.transport.batch;
    cloud.transport.batch = async (owner, ids) => ({ data: [], missing: [...ids] });
    await sync(port, cloud);
    assert.equal(local(sql, 4), undefined);
    cloud.transport.batch = batch;
    await sync(port, cloud);
    assert.equal(local(sql, 4).content, "稍后才能下载");
});

test("unsynced local edits are neither downloaded over nor overwritten", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    sql.prepare("UPDATE local_notes SET content='本地未上传', sync_status='pending', sync_operation='update' WHERE server_id=1").run();
    cloud.upsert(note(1, "云端新内容", { version: 2 }));
    await sync(port, cloud);
    assert.equal(cloud.calls.batch.length, 1);
    assert.equal(local(sql, 1).content, "本地未上传");
    assert.equal(local(sql, 1).sync_status, "pending");
});

test("any content rewrite clears the stored hash; setting both in one statement keeps it", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    // Downloaded bodies are hashed after projection so they can be compared and evicted.
    assert.equal(local(sql, 1).content_hash, sha("正文 1"));
    sql.prepare("UPDATE local_notes SET title='只改标题' WHERE server_id=1").run();
    assert.equal(local(sql, 1).content_hash, sha("正文 1"));
    sql.prepare("UPDATE local_notes SET content='改了正文' WHERE server_id=1").run();
    assert.equal(local(sql, 1).content_hash, null);
    sql.prepare("UPDATE local_notes SET content='再改', content_hash=? WHERE server_id=1").run(sha("再改"));
    assert.equal(local(sql, 1).content_hash, sha("再改"));
});

test("an old server keeps or restores full mode; an unknown capability keeps the current mode", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1)]);
    await sync(port, cloud);
    const snapshots = cloud.calls.snapshot.length;
    cloud.supports = new Error("offline");
    await sync(port, cloud);
    assert.equal(cloud.calls.snapshot.length, snapshots, "no snapshot restart");
    assert.equal(cloud.calls.changes.at(-1), "meta");
    cloud.supports = false;
    await sync(port, cloud);
    assert.equal(cloud.calls.snapshot.at(-1).fields, undefined);
    assert.equal(mirrorPayloads(sql)[0].content, "正文 1");
    assert.equal(sql.prepare("SELECT mirror_mode FROM note_sync_state WHERE owner_user_id=1").get().mirror_mode, "full");
    assert.equal(local(sql, 1).content, "正文 1");
});

test("a note restored from the trash on another device is downloaded and restored", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2)]);
    await sync(port, cloud);
    const clientId = local(sql, 1).client_id;
    cloud.remove(1, 2);
    await sync(port, cloud);
    assert.equal(local(sql, 1), undefined);
    assert.equal(sql.prepare("SELECT count(*) AS count FROM note_trash WHERE owner_user_id=1 AND server_id=1").get().count, 1);
    cloud.upsert(note(1, "正文 1", { version: 3 }));
    await sync(port, cloud);
    assert.deepEqual(cloud.calls.batch.at(-1), [1]);
    assert.equal(local(sql, 1).client_id, clientId);
    assert.equal(local(sql, 1).content, "正文 1");
});

test("note cache candidates compare metadata mirrors by hash", async (t) => {
    const { port, sql } = await database(t);
    const cloud = server([note(1), note(2)]);
    await sync(port, cloud);
    assert.deepEqual((await cacheRepo.readNoteCacheCandidates(port, 1)).map((row) => row.server_id), [1, 2]);
    sql.prepare("UPDATE local_notes SET content='不一致', sync_status='synced' WHERE server_id=2").run();
    assert.deepEqual((await cacheRepo.readNoteCacheCandidates(port, 1)).map((row) => row.server_id), [1]);
});

test("notes stay listed after a metadata sync", async (t) => {
    const { port } = await database(t);
    const cloud = server([note(1), note(2)]);
    const result = await sync(port, cloud);
    assert.deepEqual(result.notes.map((n) => n.content).sort(), ["正文 1", "正文 2"]);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 2);
});
