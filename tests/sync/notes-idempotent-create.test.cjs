// 新建笔记幂等：固定请求、结果未知时按同一键重发、按云端身份认领，旧服务端保持阻塞。
// 真实 SQLite（全部迁移）+ 真实 notes.api；HTTP 由 axios 自定义适配器模拟服务端。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
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
const saves = require("../../src/features/notes/services/note-save.service.ts");
const notes = require("../../src/features/notes/data/note-local.repository.ts");
const { projectMirror } = require("../../src/features/notes/data/note-sync.repository.ts");
const capability = require("../../src/features/notes/api/notes-capability.ts");
const cloudPolicy = require("../../src/core/cloud-storage/cloud-storage-policy.ts");
const { listUploadTasks } = require("../../src/core/sync/upload-queue.repository.ts");
const trash = require("../../src/features/notes/data/note-trash.repository.ts");

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

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

function setup(t) {
    cloudPolicy.setCloudStorageSession(1, true, true);
    capability.resetNotesServerV2ForTests();
    const requests = [];
    let handler = () => new axios.AxiosError("Network Error", "ERR_NETWORK");
    client.defaults.adapter = async (config) => {
        const request = {
            method: config.method,
            url: config.url,
            params: config.params,
            key: config.headers?.get?.("Idempotency-Key") ?? config.headers?.["Idempotency-Key"],
            body: typeof config.data === "string" ? JSON.parse(config.data) : config.data,
        };
        requests.push(request);
        const result = await handler(request);
        if (result instanceof Error) {
            result.config = config;
            throw result;
        }
        const response = { status: result.status ?? 200, statusText: "", headers: {}, config, data: result.data };
        if (response.status >= 400)
            throw new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", config, null, response);
        return response;
    };
    t.after(() => {
        cloudPolicy.setCloudStorageSession(null, false, false);
        capability.resetNotesServerV2ForTests();
        delete client.defaults.adapter;
    });
    return {
        requests,
        serve(next) {
            handler = next;
        },
    };
}

const cloud = (id, body, extra = {}) => ({
    id,
    user_id: 1,
    client_id: body.client_id,
    version: 1,
    title: body.title,
    content: body.content,
    category_id: body.category_id ?? null,
    created_at: "2026-09-27T00:00:00.000Z",
    updated_at: body.updated_at ?? "2026-09-27T00:00:00.000Z",
    sync_updated_at: "2026-09-27T00:00:00.000Z",
    deleted_at: null,
    is_pinned: false,
    is_starred: false,
    ...extra,
});
const receipt = (request, id) => ({
    status: 201,
    data: { data: cloud(id, request.body), meta: { operation_id: request.key, replayed: false, changed: true } },
});
const networkError = () => new axios.AxiosError("Network Error", "ERR_NETWORK");
const operations = (sql) => sql.prepare("SELECT * FROM note_create_operations").all();
const creates = (requests) => requests.filter((r) => r.method === "post" && r.url === "/notes");

test("first create fixes an idempotent request, sends it with the key and clears it on success", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve((request) => receipt(request, 901));
    const result = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(result.cloudState, "accepted");
    const [sent] = creates(http.requests);
    assert.match(sent.key, UUID);
    assert.match(sent.body.client_id, UUID);
    assert.equal(sent.body.content, "正文");
    assert.equal(result.note.server_id, 901);
    assert.equal(result.note.sync_status, "synced");
    assert.deepEqual(operations(sql), []);
    assert.equal(capability.notesServerV2(), true);
});

test("an uncertain create replays the same key and body; edits made meanwhile follow as an update", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "第一版" });
    http.serve(networkError);
    const lost = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(lost.cloudState, "unknown");
    assert.equal(lost.note.sync_status, "unknown");
    assert.equal(operations(sql).length, 1);

    // The edit is kept locally and queued instead of being refused.
    const edited = await saves.saveEditedNoteLocalFirst(port, 1, lost.note, { title: "标题", content: "第二版" });
    assert.equal(edited.cloudState, "queued");

    http.serve((request) => {
        if (request.url === "/notes/batch") return { data: { data: [], missing: [1] } };
        if (request.method === "post") return receipt(request, 902);
        assert.equal(request.url, "/notes/902");
        return { data: cloud(902, { ...request.body, client_id: creates(http.requests)[0].body.client_id }, { version: 2 }) };
    });
    const replay = await saves.uploadNoteNow(port, 1, saved.note.id);
    const [first, second] = creates(http.requests);
    assert.equal(second.key, first.key);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.body.content, "第一版");
    assert.equal(replay.cloudState, "queued");
    assert.equal(replay.note.server_id, 902);
    assert.equal(replay.note.sync_operation, "update");
    assert.deepEqual(operations(sql), []);

    const update = await saves.uploadNoteNow(port, 1, saved.note.id);
    const put = http.requests.find((r) => r.method === "put");
    assert.equal(put.url, "/notes/902");
    assert.equal(put.body.content, "第二版");
    assert.equal(update.note.sync_status, "synced");
});

test("an old server keeps uncertain creates blocked; an unknown capability waits for a later retry", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve(networkError);
    await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(await saves.uncertainCreatePolicy(port, 1, saved.note.id), "later");
    await assert.rejects(saves.uploadNoteNow(port, 1, saved.note.id), /稍后重试/);
    http.serve((request) => (request.url === "/notes/batch" ? { status: 404, data: "Cannot GET" } : networkError()));
    await assert.rejects(saves.uploadNoteNow(port, 1, saved.note.id), /结果未知/);
    assert.equal(capability.notesServerV2(), false);
    assert.equal(creates(http.requests).length, 1);
    assert.equal(operations(sql).length, 1);
});

test("a legacy create response marks the server as old and still accepts the note", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve((request) => ({ data: { ...cloud(905, request.body), client_id: undefined, version: undefined } }));
    const result = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(result.cloudState, "accepted");
    assert.equal(result.note.server_id, 905);
    assert.equal(capability.notesServerV2(), false);
    assert.deepEqual(operations(sql), []);
});

test("a receipt for another key or identity is rejected as an invalid response", async (t) => {
    const http = setup(t);
    const { port } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve((request) => ({ ...receipt(request, 906), data: { ...receipt(request, 906).data, meta: { operation_id: "00000000-0000-4000-8000-000000000000" } } }));
    const result = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.notEqual(result.cloudState, "accepted");
    assert.equal(result.note.server_id, null);
});

test("a definite 4xx drops the fixed request so the next attempt fixes a new one", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve(() => ({ status: 400, data: { error: { code: "INVALID_REQUEST", message: "笔记标题不能为空" } } }));
    const rejected = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(rejected.cloudState, "rejected");
    assert.equal(rejected.message, "笔记标题不能为空");
    assert.equal(rejected.retryable, false);
    assert.deepEqual(operations(sql), []);
    http.serve((request) => receipt(request, 907));
    await saves.uploadNoteNow(port, 1, saved.note.id);
    const [first, second] = creates(http.requests);
    assert.notEqual(second.key, first.key);
    assert.notEqual(second.body.client_id, first.body.client_id);
});

test("OPERATION_IN_PROGRESS stays uncertain and retryable and confirms the new server", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve(() => ({ status: 409, data: { error: { code: "OPERATION_IN_PROGRESS", message: "相同操作正在处理中" } } }));
    const busy = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(busy.cloudState, "unknown");
    assert.equal(busy.retryable, true);
    assert.equal(capability.notesServerV2(), true);
    assert.equal(operations(sql).length, 1);
    assert.equal(await saves.uncertainCreatePolicy(port, 1, saved.note.id), "replay");
});

test("CLIENT_ID_EXISTS adopts the existing cloud note, or gives the create up when it was deleted", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve((request) =>
        request.method === "post"
            ? { status: 409, data: { error: { code: "CLIENT_ID_EXISTS", message: "该客户端身份已存在" }, existing: { id: 908, client_id: request.body.client_id, deleted: false } } }
            : { data: cloud(908, creates(http.requests)[0].body) },
    );
    const adopted = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(adopted.cloudState, "accepted");
    assert.equal(adopted.note.server_id, 908);
    assert.equal(http.requests.at(-1).url, "/notes/908");
    assert.deepEqual(operations(sql), []);

    const other = await saves.saveNewNoteLocalFirst(port, 1, { title: "另一篇", content: "正文" });
    http.serve((request) => ({ status: 409, data: { error: { code: "CLIENT_ID_EXISTS", message: "该客户端身份已存在" }, existing: { id: 909, client_id: request.body.client_id, deleted: true } } }));
    const deleted = await saves.uploadNoteNow(port, 1, other.note.id);
    assert.equal(deleted.cloudState, "rejected");
    assert.match(deleted.message, /云端已删除/);
    assert.equal(deleted.note.server_id, null);
    assert.equal(deleted.note.content, "正文");
    assert.deepEqual(operations(sql), []);
});

test("sync adopts a note created by an unconfirmed request instead of adding a second copy", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve(networkError);
    await saves.uploadNoteNow(port, 1, saved.note.id);
    sql.prepare("UPDATE upload_queue_tasks SET status='blocked', last_error='x'").run();
    const [{ cloud_id: cloudId, request_json: requestJson }] = operations(sql);
    const body = JSON.parse(requestJson);
    sql.prepare("INSERT INTO note_sync_mirror(owner_user_id,server_id,cloud_id,version,payload) VALUES(1,910,?,1,?)")
        .run(cloudId, JSON.stringify(cloud(910, body)));
    const stats = await projectMirror(port, 1, () => {});
    assert.equal(stats.linkedCount, 1);
    const all = await notes.getLocalNotes(port, 1);
    assert.equal(all.length, 1);
    assert.equal(all[0].id, saved.note.id);
    assert.equal(all[0].server_id, 910);
    assert.equal(all[0].sync_status, "synced");
    assert.deepEqual(operations(sql), []);
    assert.equal((await listUploadTasks(port, 1))[0].status, "queued");
});

test("an adopted note edited after the request was fixed stays pending as an update", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "第一版" });
    http.serve(networkError);
    const lost = await saves.uploadNoteNow(port, 1, saved.note.id);
    await saves.saveEditedNoteLocalFirst(port, 1, lost.note, { title: "标题", content: "第二版" });
    const [{ cloud_id: cloudId, request_json: requestJson }] = operations(sql);
    sql.prepare("INSERT INTO note_sync_mirror(owner_user_id,server_id,cloud_id,version,payload) VALUES(1,911,?,1,?)")
        .run(cloudId, JSON.stringify(cloud(911, JSON.parse(requestJson))));
    await projectMirror(port, 1, () => {});
    const note = await notes.getLocalNoteByClientId(port, 1, saved.note.id);
    assert.equal(note.server_id, 911);
    assert.equal(note.sync_status, "pending");
    assert.equal(note.sync_operation, "update");
    assert.equal(note.content, "第二版");
});

test("moving a note to the trash or removing it drops its unconfirmed request", async (t) => {
    const http = setup(t);
    const { port, sql } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, { title: "标题", content: "正文" });
    http.serve(() => ({ status: 409, data: { error: { code: "IDEMPOTENCY_KEY_REUSED", message: "操作 ID 已用于不同请求" } } }));
    const conflicted = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(conflicted.cloudState, "rejected");
    assert.equal(operations(sql).length, 1);
    await notes.removeLocalNote(port, 1, saved.note.id);
    assert.deepEqual(operations(sql), []);

    const trashed = await saves.saveNewNoteLocalFirst(port, 1, { title: "移入垃圾桶", content: "正文" });
    await saves.uploadNoteNow(port, 1, trashed.note.id);
    assert.equal(operations(sql).length, 1);
    assert.equal(await port.transaction((tx) => trash.archiveLocalNote(tx, 1, trashed.note.id)), true);
    assert.deepEqual(operations(sql), []);
});
