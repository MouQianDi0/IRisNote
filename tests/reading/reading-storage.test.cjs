// 阅读进度存入 SQLite：旧 AsyncStorage 数据一次性搬迁、按账号隔离、随笔记永久删除清理。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
    return originalResolve.call(this, name, ...args);
};
require.extensions[".ts"] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
    });
    module._compile(compiled.outputText, filename);
};

const {
    databaseMigrations,
} = require("@/core/database/migrations/index.ts");
const {
    deleteNoteReadingProgress,
    migrateLegacyReadingProgress,
    sqliteReadingStorage,
} = require("@/features/notes/data/note-reading-progress.repository.ts");
const {
    ReadingProgressStore,
} = require("@/features/notes/reading/reading-progress-store.ts");
const { ReadingText } = require("@/features/notes/reading/reading-position.ts");
const { removeLocalNote } = require("@/features/notes/data/note-local.repository.ts");

const content = "第一行\n第二行\n第三行";
const position = (percent) => new ReadingText(content).position(0, percent);

async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    const params = (bindings) =>
        bindings === undefined
            ? []
            : Array.isArray(bindings)
              ? bindings
              : [bindings];
    const port = {
        execAsync: async (sql) => sqlite.exec(sql),
        getAllAsync: async (sql, bindings) =>
            sqlite.prepare(sql).all(...params(bindings)),
        getFirstAsync: async (sql, bindings) =>
            sqlite.prepare(sql).get(...params(bindings)) ?? null,
        runAsync: async (sql, bindings) =>
            sqlite.prepare(sql).run(...params(bindings)),
    };
    for (const migration of databaseMigrations) await migration.up(port);
    const tx = {
        async run(sql, bindings) {
            const result = sqlite.prepare(sql).run(...params(bindings));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid),
            };
        },
        async getAll(sql, bindings) {
            return sqlite.prepare(sql).all(...params(bindings));
        },
        async getFirst(sql, bindings) {
            return sqlite.prepare(sql).get(...params(bindings)) ?? null;
        },
    };
    const database = {
        ...tx,
        async transaction(task) {
            sqlite.exec("BEGIN IMMEDIATE");
            try {
                const result = await task(tx);
                sqlite.exec("COMMIT");
                return result;
            } catch (error) {
                if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
                throw error;
            }
        },
    };
    return { sqlite, database };
}

function legacyStorage(entries) {
    const map = new Map(entries);
    return {
        map,
        getAllKeys: async () => [...map.keys()],
        multiGet: async (keys) => keys.map((key) => [key, map.get(key) ?? null]),
        multiRemove: async (keys) => keys.forEach((key) => map.delete(key)),
    };
}

test("SQLite 存储保持原有读写语义，支持本地新建笔记的负数 ID 并按账号隔离", async (t) => {
    const { database } = await setup(t);
    const store = new ReadingProgressStore(
        sqliteReadingStorage(database, Promise.resolve()),
    );
    const saved = await store.save(1, -7, null, position(40));
    assert.equal(saved.localVersion, 1);
    const again = await store.save(1, -7, 55, position(60));
    assert.equal(again.localVersion, 2);
    assert.equal((await store.read(1, -7)).percent, 60);
    await store.save(2, 3, 3, position(10));
    assert.equal(await store.read(2, -7), null);
    assert.deepEqual(
        (await store.list(1)).map((record) => record.noteId),
        [-7],
    );
    assert.equal((await store.list(2)).length, 1);
});

test("旧数据搬迁：已有的 SQLite 记录不被覆盖，只删除已搬迁的旧键", async (t) => {
    const { sqlite, database } = await setup(t);
    sqlite
        .prepare(
            "INSERT INTO note_reading_progress (owner_user_id, note_id, record_json, updated_at) VALUES (1, 2, '88', 'x')",
        )
        .run();
    const legacy = legacyStorage([
        ["irisnote:reading:1:2", "10"],
        ["irisnote:reading:1:-5", "25"],
        ["irisnote:reading:2:9", "70"],
        ["irisnote:reading:bad", "1"],
        ["token", "secret"],
    ]);
    assert.equal(await migrateLegacyReadingProgress(database, legacy), 3);
    assert.deepEqual([...legacy.map.keys()].sort(), ["irisnote:reading:bad", "token"]);
    const store = new ReadingProgressStore(
        sqliteReadingStorage(database, Promise.resolve()),
    );
    assert.deepEqual(await store.read(1, 2), { percent: 88 });
    assert.deepEqual(await store.read(1, -5), { percent: 25 });
    assert.deepEqual(await store.read(2, 9), { percent: 70 });
    assert.equal(await migrateLegacyReadingProgress(database, legacy), 0);
});

test("搬迁失败时旧键全部保留，存储仍可正常读写", async (t) => {
    const { database } = await setup(t);
    const legacy = legacyStorage([["irisnote:reading:1:2", "10"]]);
    const failing = {
        ...database,
        transaction: async () => {
            throw new Error("disk full");
        },
    };
    const ready = migrateLegacyReadingProgress(failing, legacy).catch(() => {});
    await ready;
    assert.equal(legacy.map.size, 1);
    const store = new ReadingProgressStore(sqliteReadingStorage(database, ready));
    await store.save(1, 4, 4, position(30));
    assert.equal((await store.read(1, 4)).percent, 30);
});

test("读写等待搬迁完成，搬迁来的旧记录可以立即读到", async (t) => {
    const { database } = await setup(t);
    const legacy = legacyStorage([["irisnote:reading:1:2", "33"]]);
    const ready = migrateLegacyReadingProgress(database, legacy);
    const store = new ReadingProgressStore(sqliteReadingStorage(database, ready));
    assert.deepEqual(await store.read(1, 2), { percent: 33 });
});

test("永久删除笔记时一并删除阅读进度，其他笔记和账号不受影响", async (t) => {
    const { sqlite, database } = await setup(t);
    const store = new ReadingProgressStore(
        sqliteReadingStorage(database, Promise.resolve()),
    );
    sqlite
        .prepare(
            `INSERT INTO local_notes (owner_user_id, client_id, title, created_at, local_updated_at)
             VALUES (1, 7, 't', 'x', 'x')`,
        )
        .run();
    await store.save(1, 7, 7, position(50));
    await store.save(1, 8, 8, position(50));
    await store.save(2, 7, 7, position(50));
    await removeLocalNote(database, 1, 7);
    assert.equal(await store.read(1, 7), null);
    assert.ok(await store.read(1, 8));
    assert.ok(await store.read(2, 7));
});

test("旧结构数据库没有阅读进度表时，删除直接跳过", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
        const tx = {
            run: async (sql, bindings = []) => sqlite.prepare(sql).run(...bindings),
            getFirst: async (sql, bindings = []) =>
                sqlite.prepare(sql).get(...bindings) ?? null,
        };
        await deleteNoteReadingProgress(tx, 1, 7);
    } finally {
        sqlite.close();
    }
});
