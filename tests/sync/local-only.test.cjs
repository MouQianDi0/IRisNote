// 本机模式：真实 SQLite 和持久化重开，云请求使用 Axios 假适配器。
// 真实 SQLite（全部迁移）+ 内存假服务端；按需下载经真实 notes.api，HTTP 由 axios 适配器模拟。
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

const {
    databaseMigrations,
} = require("../../src/core/database/migrations/index.ts");
const notes = require("../../src/features/notes/data/note-local.repository.ts");
const trash = require("../../src/features/notes/data/note-trash.repository.ts");
const cloudPolicy = require("../../src/core/cloud-storage/cloud-storage-policy.ts");

async function database(t, file = ":memory:") {
    const sql = new DatabaseSync(file);
    t.after(() => {
        if (sql.isOpen) sql.close();
        cloudPolicy.setCloudStorageSession(null, false, false);
    });
    const params = (bindings) =>
        bindings === undefined
            ? []
            : Array.isArray(bindings)
              ? bindings
              : [bindings];
    const port = {
        async run(source, bindings) {
            const result = sql.prepare(source).run(...params(bindings));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid),
            };
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
        runAsync: async (source, bindings) =>
            sql.prepare(source).run(...params(bindings)),
        getAllAsync: async (source, bindings) =>
            sql.prepare(source).all(...params(bindings)),
        getFirstAsync: async (source, bindings) =>
            sql.prepare(source).get(...params(bindings)) ?? null,
    };
    if (
        !sql
            .prepare(
                "SELECT 1 FROM sqlite_master WHERE name='local_categories'",
            )
            .get()
    )
        for (const migration of databaseMigrations)
            await migration.up(migrationPort);
    cloudPolicy.setCloudStorageSession(1, true, false);
    const unexpected = [];
    t.after(() => assert.deepEqual(unexpected, [], "本机操作不应发出请求"));
    client.defaults.adapter = async (config) => {
        unexpected.push(config.url);
        throw new Error("unexpected network request");
    };
    return { port, sql };
}

const flags = require("../../src/features/notes/services/note-flags.service.ts");
const categories = require("../../src/features/sync/category-upload-queue.ts");
const categoryRepo = require("../../src/features/notes/categories/data/category-local.repository.ts");
const categoryCache = require("../../src/features/notes/categories/data/category-cache.ts");
const queue = require("../../src/core/sync/upload-queue.repository.ts");
const adapters = require("../../src/features/sync/upload-task-adapters.ts");
const trashService = require("../../src/features/notes/services/note-trash.service.ts");
const {
    notesTrashApi,
} = require("../../src/features/notes/api/notes-trash.api.ts");
const {
    uploadNoteNow,
} = require("../../src/features/notes/services/note-save.service.ts");
const {
    projectMirror,
} = require("../../src/features/notes/data/note-sync.repository.ts");
const cloud = (id = 1, extra = {}) => ({
    id,
    user_id: 1,
    client_id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    version: 1,
    title: "本地笔记",
    content: "完整正文",
    category_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    sync_updated_at: "2026-09-01T00:00:00.000Z",
    deleted_at: null,
    is_pinned: false,
    is_starred: false,
    ...extra,
});
async function seed(db, extra = {}) {
    const row = cloud(1, extra);
    await notes.reconcileServerNotes(db, 1, [row]);
    return (await notes.getLocalNotes(db, 1))[0];
}
const reply = (config, data) => ({
    config,
    data,
    status: 200,
    statusText: "OK",
    headers: {},
});

test("关闭授权时本地标星置顶不发包、不建正文版本，连续切换以数据库最新值为准", async (t) => {
    const { port, sql } = await database(t);
    const note = await seed(port);
    const count = sql.prepare("SELECT count(*) n FROM note_revisions").get().n;
    await flags.toggleLocalNoteFlag(port, 1, note.id, "is_starred");
    await flags.toggleLocalNoteFlag(port, 1, note.id, "is_pinned");
    await Promise.all([
        flags.toggleLocalNoteFlag(port, 1, note.id, "is_starred"),
        flags.toggleLocalNoteFlag(port, 1, note.id, "is_starred"),
    ]);
    const current = await notes.getLocalNoteByClientId(port, 1, note.id);
    assert.equal(current.is_starred, true);
    assert.equal(current.is_pinned, true);
    assert.equal(current.content, "完整正文");
    assert.equal(current.updated_at, note.updated_at);
    assert.equal(
        sql.prepare("SELECT count(*) n FROM note_revisions").get().n,
        count,
    );
    await notes.reconcileServerNotes(port, 1, [cloud()]);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, note.id)).is_starred,
        true,
    );
});

test("纯本地笔记及摘要笔记均可标星，摘要不会作为空正文上传", async (t) => {
    const { port, sql } = await database(t);
    const { note: created } = await notes.createPendingLocalNote(port, 1, {
        title: "新建",
        content: "正文",
    });
    await flags.toggleLocalNoteFlag(port, 1, created.id, "is_starred");
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, created.id)).is_starred,
        true,
    );
    await seed(port);
    sql.prepare(
        "UPDATE local_notes SET body_state='evicted',content=NULL,content_preview='摘要' WHERE server_id=1",
    ).run();
    await flags.toggleLocalNoteFlag(port, 1, 1, "is_pinned");
    cloudPolicy.setCloudStorageSession(1, true, true);
    let calls = 0;
    client.defaults.adapter = async (config) => {
        calls++;
        assert.equal(config.method, "put");
        assert.deepEqual(JSON.parse(config.data), { is_pinned: true });
        return reply(config, cloud(1, { is_pinned: true }));
    };
    await flags.syncLocalNoteFlags(port, 1);
    assert.equal(calls, 1);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).body_state,
        "evicted",
    );
});

test("旧标星响应不能清除较新的本地操作，失败后仍可再次同步", async (t) => {
    const { port, sql } = await database(t);
    await seed(port);
    await flags.toggleLocalNoteFlag(port, 1, 1, "is_starred");
    cloudPolicy.setCloudStorageSession(1, true, true);
    client.defaults.adapter = async (config) => {
        await flags.toggleLocalNoteFlag(port, 1, 1, "is_starred");
        return reply(config, cloud(1, { is_starred: true }));
    };
    await flags.syncLocalNoteFlags(port, 1);
    assert.equal(
        sql.prepare("SELECT is_starred FROM note_local_flags").get().is_starred,
        0,
    );
    client.defaults.adapter = async (config) => {
        throw new axios.AxiosError("offline", "ERR_NETWORK", config);
    };
    await assert.rejects(flags.syncLocalNoteFlags(port, 1), /offline/);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).is_starred,
        false,
    );
    client.defaults.adapter = async (config) => reply(config, cloud());
    await flags.syncLocalNoteFlags(port, 1);
    assert.equal(
        sql.prepare("SELECT count(*) n FROM note_local_flags").get().n,
        0,
    );
});

test("本地会话允许开关云授权，但拒绝 A→B→A 的旧操作", async (t) => {
    const { port } = await database(t);
    await seed(port);
    const check = cloudPolicy.captureLocalStorageAccess(1);
    cloudPolicy.setCloudStorageSession(1, true, true);
    check();
    cloudPolicy.setCloudStorageSession(1, true, false);
    check();
    cloudPolicy.setCloudStorageSession(2, true, false);
    await assert.rejects(
        flags.toggleLocalNoteFlag(port, 1, 1, "is_starred"),
        /账号/,
    );
    cloudPolicy.setCloudStorageSession(1, true, false);
    assert.throws(check, /账号/);
});

test("分类关闭授权后从缓存迁入本机，可增改删除且不发请求", async (t) => {
    const { port } = await database(t);
    await categoryCache.writeCachedCategories(port, 1, [
        {
            id: 9,
            name: "工作",
            icon: "Briefcase",
            is_pinned: false,
            is_starred: false,
        },
    ]);
    assert.equal(
        (await categoryCache.loadCategories(port, 1)).categories[0].name,
        "工作",
    );
    await categories.enqueueCategoryCreate(port, 1, {
        name: "生活",
        icon: "House",
    });
    const local = (await categoryRepo.listLocalCategories(port, 1)).find(
        (c) => c.id < 0,
    );
    await categories.enqueueCategoryUpdate(port, 1, local, {
        name: "日常",
        is_pinned: true,
        is_starred: true,
        icon: "Star",
    });
    const updated = (
        await categoryCache.loadCategories(port, 1)
    ).categories.find((c) => c.id === local.id);
    assert.deepEqual(updated, {
        ...local,
        name: "日常",
        is_pinned: true,
        is_starred: true,
        icon: "Star",
    });
    await categories.enqueueCategoryDelete(port, 1, updated);
    assert.equal(
        (await categoryRepo.listLocalCategories(port, 1)).some(
            (c) => c.id === local.id,
        ),
        false,
    );
    assert.equal((await categoryRepo.listLocalCategories(port, 2)).length, 0);
});

test("本地分类同步获得云 ID，笔记发送云 ID、回读保持本地分类身份", async (t) => {
    const { port } = await database(t);
    await categories.enqueueCategoryCreate(port, 1, { name: "生活" });
    const [category] = await categoryRepo.listLocalCategories(port, 1);
    const { note } = await notes.createPendingLocalNote(port, 1, {
        title: "新建",
        content: "正文",
        category_id: category.id,
    });
    cloudPolicy.setCloudStorageSession(1, true, true);
    let creates = 0;
    client.defaults.adapter = async (config) => {
        if (config.url === "/categories") {
            creates++;
            return reply(config, { ...category, id: 20 });
        }
        if (config.url === "/categories/20")
            return reply(config, { ...category, id: 20 });
        assert.equal(config.url, "/notes");
        assert.equal(JSON.parse(config.data).category_id, 20);
        return reply(
            config,
            cloud(10, { title: "新建", content: "正文", category_id: 20 }),
        );
    };
    const task = (await queue.listUploadTasks(port, 1)).find(
        (x) => x.kind === "category-create",
    );
    assert.equal(
        (await adapters.executeUploadTask(port, task)).state,
        "accepted",
    );
    assert.equal(
        (await adapters.executeUploadTask(port, task)).state,
        "accepted",
    );
    assert.equal(creates, 1);
    await uploadNoteNow(port, 1, note.id);
    await notes.reconcileServerNotes(port, 1, [
        cloud(10, { title: "新建", content: "正文", category_id: 20 }),
    ]);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, note.id)).category_id,
        category.id,
    );
});

test("分类创建结果未知后编辑仍保留本机，不能再次自动创建", async (t) => {
    const { port } = await database(t);
    await categories.enqueueCategoryCreate(port, 1, { name: "生活" });
    cloudPolicy.setCloudStorageSession(1, true, true);
    let calls = 0;
    client.defaults.adapter = async (config) => {
        calls++;
        throw new axios.AxiosError("lost response", "ERR_NETWORK", config);
    };
    let task = (await queue.listUploadTasks(port, 1))[0];
    assert.equal(
        (await adapters.executeUploadTask(port, task)).state,
        "blocked",
    );
    const [category] = await categoryRepo.listLocalCategories(port, 1);
    await categories.enqueueCategoryUpdate(port, 1, category, { name: "日常" });
    task = (await queue.listUploadTasks(port, 1))[0];
    assert.equal(
        (await adapters.executeUploadTask(port, task)).state,
        "blocked",
    );
    assert.equal(calls, 1);
});

test("旧上传回执不能删除同一条目新加入的队列任务", async (t) => {
    const { port } = await database(t);
    await categories.enqueueCategoryCreate(port, 1, { name: "生活" });
    const [first] = await queue.listUploadTasks(port, 1);
    const [category] = await categoryRepo.listLocalCategories(port, 1);
    await categories.enqueueCategoryUpdate(port, 1, category, { name: "日常" });
    await queue.completeUploadTask(port, first.taskId);
    assert.equal((await queue.listUploadTasks(port, 1)).length, 1);
    assert.notEqual(
        (await queue.listUploadTasks(port, 1))[0].taskId,
        first.taskId,
    );
});

test("关闭授权删除云笔记进本机回收站，恢复取消未发送删除且不会变成新建", async (t) => {
    const { port } = await database(t);
    await seed(port);
    await trashService.trashNote(port, 1, 1);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
    assert.equal((await trash.listNoteTrash(port, 1)).length, 1);
    await notes.reconcileServerNotes(port, 1, [cloud()]);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
    await trashService.restoreTrashedNote(port, 1, 1);
    const restored = await notes.getLocalNoteByClientId(port, 1, 1);
    assert.equal(restored.content, "完整正文");
    assert.equal(restored.server_id, 1);
    assert.equal(restored.sync_operation, "update");
    assert.equal(await trash.readTrashIntent(port, 1, 1), null);
});

test("重新授权后只删除原版本，云端较新修改不会被离线删除覆盖", async (t) => {
    const { port } = await database(t);
    await seed(port);
    await trashService.trashNote(port, 1, 1);
    cloudPolicy.setCloudStorageSession(1, true, true);
    const original = { ...notesTrashApi };
    t.after(() => Object.assign(notesTrashApi, original));
    let removals = 0;
    notesTrashApi.list = async () => ({
        data: [],
        expired: [],
        server_now: new Date().toISOString(),
    });
    notesTrashApi.status = async () => ({
        state: "active",
        note: cloud(1, { updated_at: "2026-09-02T00:00:00.000Z", version: 2 }),
    });
    notesTrashApi.remove = async () => {
        removals++;
        throw Error("must not delete");
    };
    await trashService.synchronizeNoteTrash(port, 1);
    assert.equal(removals, 0);
    assert.ok(await trash.readTrashIntent(port, 1, 1));
    assert.match((await trash.readTrash(port, 1, 1)).last_error, /其他修改/);
    await notes.reconcileServerNotes(port, 1, [cloud(1, { version: 2 })]);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
});

test("本机恢复云端回收站内容后，未确认的恢复不会被云删除再次吞掉", async (t) => {
    const { port } = await database(t);
    await seed(port);
    const now = new Date().toISOString();
    const expired = new Date(Date.now() + 15 * 86400000).toISOString();
    const dead = cloud(1, { version: 2, deleted_at: now, expires_at: expired });
    await port.transaction(async (tx) => {
        await trash.recordRemoteDeletion(tx, 1, dead, dead);
        await trash.archiveLocalNote(tx, 1, 1);
    });
    await trashService.restoreTrashedNote(port, 1, 1);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).content,
        "完整正文",
    );
    await notes.reconcileServerNotes(port, 1, []);
    await projectMirror(port, 1, () => {});
    assert.ok(await notes.getLocalNoteByClientId(port, 1, 1));
    assert.equal((await trash.readTrashIntent(port, 1, 1)).intent, "restore");
    await trashService.trashNote(port, 1, 1);
    assert.equal(await notes.getLocalNoteByClientId(port, 1, 1), null);
    assert.equal(await trash.readTrashIntent(port, 1, 1), null);
});

test("本地分类与标记关闭数据库重开仍存在", async (t) => {
    const os = require("node:os");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "iris-local-"));
    // Cleanup after the SQLite handles registered below have closed.
    const file = path.join(directory, "test.db");
    const first = await database(t, file);
    await seed(first.port);
    await flags.toggleLocalNoteFlag(first.port, 1, 1, "is_starred");
    await categories.enqueueCategoryCreate(first.port, 1, { name: "生活" });
    first.sql.close();
    const second = await database(t, file);
    assert.equal(
        (await notes.getLocalNoteByClientId(second.port, 1, 1)).is_starred,
        true,
    );
    assert.equal(
        (await categoryRepo.listLocalCategories(second.port, 1))[0].name,
        "生活",
    );
    second.sql.close();
    for (const suffix of ["", "-wal", "-shm"]) {
        const target = path.resolve(file + suffix);
        if (path.dirname(target) !== path.resolve(directory))
            throw Error("invalid cleanup path");
        if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(directory);
});

test("删除请求已发出时撤销授权，随后本机恢复会确认恢复而非丢弃删除意图", async (t) => {
    const { port } = await database(t);
    await seed(port);
    await trashService.trashNote(port, 1, 1);
    const original = { ...notesTrashApi };
    t.after(() => Object.assign(notesTrashApi, original));
    let remote = cloud();
    let restores = 0;
    notesTrashApi.status = async () => ({
        state: remote.deleted_at ? "deleted" : "active",
        note: remote,
    });
    notesTrashApi.list = async () => ({
        data: remote.deleted_at ? [remote] : [],
        expired: [],
        server_now: new Date().toISOString(),
    });
    notesTrashApi.remove = async () => {
        remote = {
            ...remote,
            version: 2,
            deleted_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
        };
        cloudPolicy.setCloudStorageSession(1, true, false);
        return remote;
    };
    notesTrashApi.restore = async () => {
        restores++;
        remote = cloud(1, { version: 3 });
        return remote;
    };
    cloudPolicy.setCloudStorageSession(1, true, true);
    await assert.rejects(
        trashService.synchronizeNoteTrash(port, 1),
        cloudPolicy.isCloudStoragePermissionError,
    );
    assert.equal(
        JSON.parse((await trash.readTrashIntent(port, 1, 1)).receipt_json)
            .dispatched,
        true,
    );
    await trashService.restoreTrashedNote(port, 1, 1);
    assert.equal((await trash.readTrashIntent(port, 1, 1)).intent, "restore");
    cloudPolicy.setCloudStorageSession(1, true, true);
    await trashService.synchronizeNoteTrash(port, 1);
    assert.equal(restores, 1);
    assert.equal(await trash.readTrashIntent(port, 1, 1), null);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).content,
        "完整正文",
    );
});

test("本机标记事务失败不留下半份修改，重试可成功", async (t) => {
    const { port, sql } = await database(t);
    await seed(port);
    const transact = port.transaction;
    port.transaction = (task) =>
        transact((tx) =>
            task({
                ...tx,
                run: (source, params) => {
                    if (source.startsWith("UPDATE local_notes SET is_starred"))
                        throw Error("disk full");
                    return tx.run(source, params);
                },
            }),
        );
    await assert.rejects(
        flags.toggleLocalNoteFlag(port, 1, 1, "is_starred"),
        /disk full/,
    );
    assert.equal(
        sql.prepare("SELECT count(*) n FROM note_local_flags").get().n,
        0,
    );
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).is_starred,
        false,
    );
    port.transaction = transact;
    await flags.toggleLocalNoteFlag(port, 1, 1, "is_starred");
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, 1)).is_starred,
        true,
    );
});

test("分类创建途中编辑保留最新本机值，后续同步复用确认的云 ID", async (t) => {
    const { port } = await database(t);
    await categories.enqueueCategoryCreate(port, 1, { name: "生活" });
    const [category] = await categoryRepo.listLocalCategories(port, 1);
    let creates = 0;
    const names = [];
    cloudPolicy.setCloudStorageSession(1, true, true);
    client.defaults.adapter = async (config) => {
        if (config.method === "post") {
            creates++;
            await categories.enqueueCategoryUpdate(port, 1, category, {
                name: "日常",
            });
            return reply(config, { ...category, id: 20 });
        }
        names.push(JSON.parse(config.data).name);
        return reply(config, { ...category, id: 20 });
    };
    const [first] = await queue.listUploadTasks(port, 1);
    assert.equal(
        (await adapters.executeUploadTask(port, first)).state,
        "accepted",
    );
    await queue.completeUploadTask(port, first.taskId);
    const [second] = await queue.listUploadTasks(port, 1);
    assert.ok(second);
    assert.equal(
        (await categoryRepo.listLocalCategories(port, 1))[0].name,
        "日常",
    );
    assert.equal(
        (await adapters.executeUploadTask(port, second)).state,
        "accepted",
    );
    assert.equal(creates, 1);
    assert.deepEqual(names, ["生活", "日常"]);
});

test("分类旧列表响应不能覆盖已完成的新修改", async (t) => {
    const { port } = await database(t);
    const original = {
        id: 20,
        name: "生活",
        icon: "House",
        is_pinned: false,
        is_starred: false,
    };
    await categoryRepo.mergeRemoteCategories(port, 1, [original]);
    cloudPolicy.setCloudStorageSession(1, true, true);
    client.defaults.adapter = async (config) => {
        await categories.enqueueCategoryUpdate(port, 1, original, {
            name: "日常",
        });
        await port.run(
            "UPDATE local_categories SET dirty=0 WHERE owner_user_id=1 AND id=20",
        );
        return reply(config, [original]);
    };
    assert.equal(
        (await categoryCache.loadCategories(port, 1)).categories[0].name,
        "日常",
    );
});

test("关闭授权删除本地分类时关联笔记进入回收站，恢复后解除已删除分类归属", async (t) => {
    const { port } = await database(t);
    await categories.enqueueCategoryCreate(port, 1, { name: "生活" });
    const [category] = await categoryRepo.listLocalCategories(port, 1);
    const { note } = await notes.createPendingLocalNote(port, 1, {
        title: "本地",
        content: "不能丢失",
        category_id: category.id,
    });
    await categories.enqueueCategoryDelete(port, 1, category);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
    await trashService.restoreTrashedNote(port, 1, note.id);
    const restored = await notes.getLocalNoteByClientId(port, 1, note.id);
    assert.equal(restored.content, "不能丢失");
    assert.equal(restored.category_id, null);
});
