// 分类列表本地副本：请求成功时更新，失败（如离线）时兜底；云存储权限错误不兜底。
const { test, beforeEach } = require("node:test");
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

// 分类接口替身：每个测试设置返回值或错误，不发网络请求。
let respond;
const apiPath = require.resolve(
    path.join(root, "src/features/notes/categories/api/categories.api.ts"),
);
require.cache[apiPath] = {
    id: apiPath,
    filename: apiPath,
    loaded: true,
    exports: { getCategories: () => respond() },
};

const {
    createSystemPreferences,
} = require("@/core/database/migrations/0011-create-system-preferences.ts");
const {
    CloudStoragePermissionError,
} = require("@/core/cloud-storage/cloud-storage-policy.ts");
const {
    loadCategories,
    readCachedCategories,
} = require("@/features/notes/categories/data/category-cache.ts");

const work = { id: 1, name: "工作", icon: "briefcase", is_pinned: true, is_starred: false };
const life = { id: 2, name: "生活", icon: "home", is_pinned: false, is_starred: true };

async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createSystemPreferences.up({ execAsync: async (sql) => sqlite.exec(sql) });
    const database = {
        async run(sql, params = []) {
            return sqlite.prepare(sql).run(...params);
        },
        async getFirst(sql, params = []) {
            return sqlite.prepare(sql).get(...params) ?? null;
        },
        async getAll(sql, params = []) {
            return sqlite.prepare(sql).all(...params);
        },
    };
    return { sqlite, database };
}

beforeEach(() => {
    respond = async () => [];
});

test("请求成功时返回最新列表并更新本地副本", async (t) => {
    const { database } = await setup(t);
    respond = async () => [work, life];
    assert.deepEqual(await loadCategories(database, 1), {
        categories: [work, life],
        stale: false,
    });
    assert.deepEqual(await readCachedCategories(database, 1), [work, life]);
});

test("请求失败时退回本地副本，并标记为旧数据", async (t) => {
    const { database } = await setup(t);
    respond = async () => [work];
    await loadCategories(database, 1);
    respond = async () => {
        throw new Error("Network Error");
    };
    assert.deepEqual(await loadCategories(database, 1), {
        categories: [work],
        stale: true,
    });
});

test("没有本地副本、副本损坏或云存储权限错误时照常抛出", async (t) => {
    const { sqlite, database } = await setup(t);
    respond = async () => {
        throw new Error("Network Error");
    };
    await assert.rejects(loadCategories(database, 1), /Network Error/);
    sqlite
        .prepare("INSERT INTO system_preferences (key, value, updated_at) VALUES (?, ?, ?)")
        .run("category-cache:user:1", '[{"id":"x"}]', "x");
    assert.equal(await readCachedCategories(database, 1), null);
    await assert.rejects(loadCategories(database, 1), /Network Error/);

    respond = async () => [work];
    await loadCategories(database, 2);
    respond = async () => {
        throw new CloudStoragePermissionError();
    };
    await assert.rejects(loadCategories(database, 2), CloudStoragePermissionError);
});

test("本地副本按账号隔离", async (t) => {
    const { database } = await setup(t);
    respond = async () => [work];
    await loadCategories(database, 1);
    respond = async () => [life];
    await loadCategories(database, 2);
    assert.deepEqual(await readCachedCategories(database, 1), [work]);
    assert.deepEqual(await readCachedCategories(database, 2), [life]);
    assert.equal(await readCachedCategories(database, 3), null);
});
