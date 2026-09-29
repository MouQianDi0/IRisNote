const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "../..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
    return resolve.call(this, name, ...args);
};
require.extensions[".ts"] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    });
    module._compile(compiled.outputText, filename);
};
const { createExcerptStash } = require("@/core/database/migrations/0020-create-excerpt-stash.ts");
const { ExcerptStashRepository } = require("@/features/excerpts/data/excerpt-stash.repository.ts");
const { mergeStashContents } = require("@/features/excerpts/domain/excerpt-stash-merge.ts");

function port(sqlite) {
    const tx = {
        async run(sql, params = []) { const result = sqlite.prepare(sql).run(...params); return { changes: Number(result.changes) }; },
        async getAll(sql, params = []) { return sqlite.prepare(sql).all(...params); },
        async getFirst(sql, params = []) { return sqlite.prepare(sql).get(...params) ?? null; },
    };
    return { ...tx, async transaction(task) {
        sqlite.exec("BEGIN IMMEDIATE");
        try { const result = await task(tx); sqlite.exec("COMMIT"); return result; }
        catch (error) { if (sqlite.isTransaction) sqlite.exec("ROLLBACK"); throw error; }
    } };
}
async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createExcerptStash.up({ execAsync: async (sql) => sqlite.exec(sql) });
    await createExcerptStash.up({ execAsync: async (sql) => sqlite.exec(sql) });
    let owner = "user:1";
    let generation = 1;
    const scope = { get generation() { return generation; }, assertSession(key, gen) {
        if (key !== owner || gen !== generation) throw new Error("owner changed");
    } };
    const repository = new ExcerptStashRepository(port(sqlite), scope);
    return { sqlite, repository, setOwner(value) { owner = value; generation++; } };
}

test("合并按顺序拼接，空行开关和空列表", () => {
    const items = [{ content: "乙", localOrder: 2 }, { content: "甲", localOrder: 0 }];
    assert.equal(mergeStashContents(items, true), "甲\n\n乙");
    assert.equal(mergeStashContents(items, false), "甲\n乙");
    assert.equal(mergeStashContents([], true), "");
    assert.equal(items[0].content, "乙");
});

test("暂存增删改移、重复冲突与账号隔离", async (t) => {
    const h = await setup(t);
    const repo = h.repository;
    assert.equal(await repo.add("user:1", "甲"), "added");
    assert.equal(await repo.add("user:1", "乙"), "added");
    assert.equal(await repo.add("user:1", "甲"), "duplicate");
    let items = await repo.list("user:1");
    assert.deepEqual(items.map((item) => item.content), ["甲", "乙"]);
    assert.equal((await repo.hashes("user:1")).size, 2);
    await repo.move("user:1", items[1].clientId, "up");
    items = await repo.list("user:1");
    assert.deepEqual(items.map((item) => item.content), ["乙", "甲"]);
    assert.equal(await repo.update("user:1", items[0].clientId, "甲"), "duplicate");
    assert.equal(await repo.update("user:1", items[0].clientId, "丙"), "saved");
    await repo.remove("user:1", items[1].clientId);
    assert.deepEqual((await repo.list("user:1")).map((item) => item.content), ["丙"]);
    h.setOwner("user:2");
    assert.deepEqual(await repo.list("user:2"), []);
    await assert.rejects(repo.list("user:1"), /owner changed/);
    assert.equal(await repo.add("user:2", "丙"), "added");
    await repo.clear("user:2");
    assert.deepEqual(await repo.list("user:2"), []);
    assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM local_excerpt_stash WHERE owner_key = 'user:1'").get().n, 1);
});
