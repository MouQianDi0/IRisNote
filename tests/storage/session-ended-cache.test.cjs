// 退出登录后释放内存缓存：笔记对象、字数统计、摘录快照。磁盘数据不受影响。
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
const originalLoad = Module._load;
Module._load = function (name, ...args) {
    // 横幅依赖 React Native，这里只需要一个不报错的替身。
    if (name === "@/core/notifications")
        return { banner: { show() {}, clearSession() {} } };
    return originalLoad.call(this, name, ...args);
};

const {
    publishSessionEnded,
} = require("@/shared/http/session-events.ts");
const {
    getCachedNoteById,
    setCachedNote,
} = require("@/features/notes/notes.cache.ts");
const {
    getOrCreateCachedNoteStatistics,
} = require("@/features/notes/hooks/noteTextLength/cache/noteStatisticsCache.ts");
const {
    createLocalExcerpts,
} = require("@/core/database/migrations/0014-create-local-excerpts.ts");
const {
    activateExcerptOwner,
    excerptRepository,
    useExcerptStore,
} = require("@/features/excerpts/state/excerpt-store.ts");

const owner = "user:one";
const id = (number) =>
    `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function databasePort(sqlite) {
    const tx = {
        async run(sql, params = []) {
            const result = sqlite.prepare(sql).run(...params);
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid),
            };
        },
        async getAll(sql, params = []) {
            return sqlite.prepare(sql).all(...params);
        },
        async getFirst(sql, params = []) {
            return sqlite.prepare(sql).get(...params) ?? null;
        },
    };
    return {
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
}

async function excerptDatabase(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createLocalExcerpts.up({ execAsync: async (sql) => sqlite.exec(sql) });
    return { sqlite, database: databasePort(sqlite) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("退出登录后清空笔记对象缓存", () => {
    setCachedNote({ id: 7, user_id: 1, title: "t", content: "c" });
    assert.ok(getCachedNoteById(7, 1));
    publishSessionEnded();
    assert.equal(getCachedNoteById(7, 1), null);
});

test("退出登录后字数统计需要重新计算", () => {
    let calls = 0;
    const read = () =>
        getOrCreateCachedNoteStatistics({
            noteId: 3,
            contentSnapshot: "abc",
            optionsKey: "default",
            calculate: () => {
                calls += 1;
                return { characters: 3 };
            },
        });
    read();
    read();
    assert.equal(calls, 1);
    publishSessionEnded();
    read();
    assert.equal(calls, 2);
});

test("退出登录时排队中的摘录保存照常完成，之后才释放快照", async (t) => {
    const { sqlite, database } = await excerptDatabase(t);
    await activateExcerptOwner(owner, database);
    const saving = excerptRepository.save(
        owner,
        id(1),
        "退出前一刻保存的摘录",
        "manual",
        new Date("2026-09-25T01:00:00.000Z"),
    );
    publishSessionEnded();
    const receipt = await saving;
    assert.equal(receipt.duplicated, false);
    await settle();
    assert.equal(excerptRepository.ownerKey, null);
    assert.deepEqual(useExcerptStore.getState().entities, []);
    const rows = sqlite
        .prepare("SELECT content FROM local_excerpts WHERE owner_key = ?")
        .all(owner);
    assert.deepEqual(
        rows.map((row) => row.content),
        ["退出前一刻保存的摘录"],
    );
});

test("释放执行前重新登录同一账号时，不清空新会话的摘录", async (t) => {
    const { database } = await excerptDatabase(t);
    await activateExcerptOwner(owner, database);
    const saving = excerptRepository.save(
        owner,
        id(2),
        "重新登录后仍应显示",
        "manual",
        new Date("2026-09-25T02:00:00.000Z"),
    );
    publishSessionEnded();
    await activateExcerptOwner(owner, database);
    await saving;
    await settle();
    assert.equal(excerptRepository.ownerKey, owner);
    assert.equal(useExcerptStore.getState().entities.length, 1);
});
