// 历史版本上限：每篇最多保留 50 个版本，仍被引用的版本永远保留。在 Node SQLite 中执行生产 SQL。
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
    insertNoteRevision,
} = require("@/features/notes/data/note-revision.repository.ts");
const {
    NOTE_REVISION_LIMIT,
    pruneAllNoteRevisions,
} = require("@/features/notes/data/note-revision-retention.ts");

const owner = 1;
const stamp = "2026-09-25T00:00:00.000Z";

async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    const params = (bindings) =>
        bindings === undefined
            ? []
            : Array.isArray(bindings)
              ? bindings
              : [bindings];
    const migrationPort = {
        execAsync: async (sql) => sqlite.exec(sql),
        getAllAsync: async (sql, bindings) =>
            sqlite.prepare(sql).all(...params(bindings)),
        getFirstAsync: async (sql, bindings) =>
            sqlite.prepare(sql).get(...params(bindings)) ?? null,
        runAsync: async (sql, bindings) =>
            sqlite.prepare(sql).run(...params(bindings)),
    };
    for (const migration of databaseMigrations)
        await migration.up(migrationPort);
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
    const port = {
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
    return { sqlite, port };
}

function addNote(sqlite, clientId) {
    sqlite
        .prepare(
            `INSERT INTO local_notes (owner_user_id, client_id, title, content, created_at, sync_status, local_updated_at)
             VALUES (?, ?, 't', 'c', ?, 'synced', ?)`,
        )
        .run(owner, clientId, stamp, stamp);
}

/** 模拟编辑保存：插入新版本并移动当前版本指针。时钟逐次前进，保证先后顺序明确。 */
async function save(t, port, clientId, times, { movePointer = true } = {}) {
    const ids = [];
    for (let index = 0; index < times; index += 1) {
        t.mock.timers.tick(1000);
        const id = await port.transaction(async (tx) => {
            const current = await tx.getFirst(
                "SELECT current_revision_id FROM local_notes WHERE owner_user_id=? AND client_id=?",
                [owner, clientId],
            );
            const revisionId = await insertNoteRevision(tx, owner, clientId, {
                parentId: current?.current_revision_id ?? ids.at(-1) ?? null,
                title: `v${index}`,
                content: `content ${index}`,
                categoryId: null,
                origin: "local-save",
            });
            if (movePointer)
                await tx.run(
                    "UPDATE local_notes SET current_revision_id=? WHERE owner_user_id=? AND client_id=?",
                    [revisionId, owner, clientId],
                );
            return revisionId;
        });
        ids.push(id);
    }
    return ids;
}

const remaining = (sqlite, clientId) =>
    new Set(
        sqlite
            .prepare(
                "SELECT revision_id FROM note_revisions WHERE owner_user_id=? AND client_id=?",
            )
            .all(owner, clientId)
            .map((row) => row.revision_id),
    );

test("每次写入后最多保留 50 个版本，保留的是最新的 50 个", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
    const { sqlite, port } = await setup(t);
    addNote(sqlite, 7);
    const ids = await save(t, port, 7, 60);
    const kept = remaining(sqlite, 7);
    assert.equal(NOTE_REVISION_LIMIT, 50);
    assert.equal(kept.size, 50);
    for (const id of ids.slice(-50)) assert.ok(kept.has(id));
});

test("被草稿、上传队列、清理记录引用的旧版本连同上一版都保留", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
    const { sqlite, port } = await setup(t);
    addNote(sqlite, 7);
    const ids = await save(t, port, 7, 50);
    sqlite
        .prepare(
            `INSERT INTO note_drafts (owner_user_id, draft_key, session_id, note_id, base_snapshot, base_revision_id, title, content, updated_at)
             VALUES (?, 'edit:7', 's', 7, '{}', ?, 't', 'c', ?)`,
        )
        .run(owner, ids[2], stamp);
    sqlite
        .prepare(
            `INSERT INTO upload_queue_tasks (task_id, owner_user_id, task_kind, dedupe_key, title, operation_label, payload_json, created_at, updated_at)
             VALUES ('task', ?, 'note', 'note:7', 't', 'op', ?, ?, ?)`,
        )
        .run(owner, JSON.stringify({ clientId: 7, revisionId: ids[5] }), stamp, stamp);
    sqlite
        .prepare(
            "INSERT INTO system_preferences (key, value, updated_at) VALUES (?, ?, ?)",
        )
        .run(
            `note-cache-identity:${owner}:700`,
            JSON.stringify({
                client_id: 7,
                local_order: null,
                pinned_order: null,
                current_revision_id: ids[8],
            }),
            stamp,
        );
    await save(t, port, 7, 10);
    const kept = remaining(sqlite, 7);
    // 被引用的版本连同上一版一起保留：草稿 2(1)、上传 5(4)、清理记录 8(7)。
    for (const index of [1, 2, 4, 5, 7, 8]) assert.ok(kept.has(ids[index]), `v${index}`);
    for (const index of [0, 3, 6, 9]) assert.ok(!kept.has(ids[index]), `v${index}`);
    assert.equal(kept.size, 56);
});

test("回收站里的笔记在恢复写入新版本时，其当前版本与草稿基准保留", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
    const { sqlite, port } = await setup(t);
    addNote(sqlite, 8);
    const ids = await save(t, port, 8, 50);
    // 移入回收站：笔记行删除，引用改由回收站记录保存。
    sqlite
        .prepare("DELETE FROM local_notes WHERE owner_user_id=? AND client_id=?")
        .run(owner, 8);
    sqlite
        .prepare(
            `INSERT INTO note_trash (owner_user_id, client_id, state, local_json, drafts_json)
             VALUES (?, 8, 'local', ?, ?)`,
        )
        .run(
            owner,
            JSON.stringify({ current_revision_id: ids[1] }),
            JSON.stringify([{ base_revision_id: ids[3] }]),
        );
    await save(t, port, 8, 5, { movePointer: false });
    const kept = remaining(sqlite, 8);
    // 回收站当前版本 1(0)、草稿基准 3(2)；最新 50 个从 v5 开始，v4 被裁掉。
    for (const index of [0, 1, 2, 3]) assert.ok(kept.has(ids[index]), `v${index}`);
    assert.ok(!kept.has(ids[4]));
    assert.equal(kept.size, 54);
});

test("引用记录无法解析时放弃裁剪，宁可多留也不误删", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: Date.parse(stamp) });
    const { sqlite, port } = await setup(t);
    addNote(sqlite, 7);
    await save(t, port, 7, 50);
    sqlite
        .prepare(
            `INSERT INTO upload_queue_tasks (task_id, owner_user_id, task_kind, dedupe_key, title, operation_label, payload_json, created_at, updated_at)
             VALUES ('task', ?, 'note', 'note:7', 't', 'op', '{broken', ?, ?)`,
        )
        .run(owner, stamp, stamp);
    await save(t, port, 7, 3);
    assert.equal(remaining(sqlite, 7).size, 53);
});

test("启动维护裁剪升级前积累的存量，未超限的笔记不受影响", async (t) => {
    const { sqlite, port } = await setup(t);
    addNote(sqlite, 7);
    const insert = sqlite.prepare(
        `INSERT INTO note_revisions (revision_id, owner_user_id, client_id, parent_revision_id, title, content, category_id, origin, created_at)
         VALUES (?, ?, ?, ?, 't', 'c', NULL, 'local-save', ?)`,
    );
    const at = (index) => new Date(Date.parse(stamp) + index * 1000).toISOString();
    for (let index = 0; index < 70; index += 1)
        insert.run(`r7-${String(index).padStart(3, "0")}`, owner, 7, index ? `r7-${String(index - 1).padStart(3, "0")}` : null, at(index));
    for (let index = 0; index < 10; index += 1)
        insert.run(`r9-${index}`, 2, 9, null, at(index));
    sqlite
        .prepare("UPDATE local_notes SET current_revision_id='r7-069' WHERE client_id=7")
        .run();
    assert.equal(await pruneAllNoteRevisions(port), 20);
    const kept = remaining(sqlite, 7);
    assert.equal(kept.size, 50);
    assert.ok(kept.has("r7-069") && kept.has("r7-020") && !kept.has("r7-019"));
    assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS n FROM note_revisions WHERE owner_user_id=2").get().n,
        10,
    );
    assert.equal(await pruneAllNoteRevisions(port), 0);
});
