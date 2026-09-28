// 摘录只存在本机、没有云端副本：0014 之后的每个迁移都不得改动 local_excerpts 的结构和数据。
// 以后新增迁移会自动纳入本测试，无需修改。
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
    hashExcerptContent,
} = require("@/features/excerpts/domain/excerpt-validation.ts");

function migrationPort(sqlite) {
    const params = (bindings) =>
        bindings === undefined
            ? []
            : Array.isArray(bindings)
              ? bindings
              : [bindings];
    return {
        execAsync: async (sql) => sqlite.exec(sql),
        getAllAsync: async (sql, bindings) =>
            sqlite.prepare(sql).all(...params(bindings)),
        getFirstAsync: async (sql, bindings) =>
            sqlite.prepare(sql).get(...params(bindings)) ?? null,
        runAsync: async (sql, bindings) =>
            sqlite.prepare(sql).run(...params(bindings)),
    };
}

const snapshot = (sqlite) => ({
    schema: sqlite
        .prepare(
            "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'local_excerpts' ORDER BY type, name",
        )
        .all()
        .map((row) => ({ ...row })),
    rows: sqlite
        .prepare("SELECT * FROM local_excerpts ORDER BY owner_key, client_id")
        .all()
        .map((row) => ({ ...row })),
});

test("0014 之后的迁移不改动摘录表的结构与数据", async (t) => {
    const later = databaseMigrations.filter((item) => item.version > 14);
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    const port = migrationPort(sqlite);
    for (const migration of databaseMigrations.filter((item) => item.version <= 14))
        await migration.up(port);

    const insert = sqlite.prepare(
        `INSERT INTO local_excerpts (owner_key, client_id, content, content_hash, source, is_pinned, local_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const samples = [
        ["user:1", "普通摘录", "manual", 0, 1],
        ["user:1", "置顶的摘录 📌\n第二行\t缩进", "paste", 1, 3],
        ["user:2", "另一个账号的同内容", "auto", 0, 2],
        ["user:2", "长".repeat(20000), "manual", 0, 1],
    ];
    samples.forEach(([owner, content, source, pinned, version], index) =>
        insert.run(
            owner,
            `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            content,
            hashExcerptContent(content),
            source,
            pinned,
            version,
            `2026-09-25T0${index}:00:00.000Z`,
            `2026-09-25T0${index}:30:00.000Z`,
        ),
    );
    const before = snapshot(sqlite);
    assert.equal(before.rows.length, samples.length);

    for (const migration of later) await migration.up(port);
    assert.deepEqual(snapshot(sqlite), before);
});
