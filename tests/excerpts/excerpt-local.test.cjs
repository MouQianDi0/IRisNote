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
    ExcerptLocalRepository,
} = require("@/features/excerpts/data/excerpt-local.repository.ts");
const {
    createLocalExcerpts,
} = require("@/core/database/migrations/0014-create-local-excerpts.ts");
const {
    databaseMigrations,
    CURRENT_DATABASE_VERSION,
} = require("@/core/database/migrations/index.ts");
const {
    EXCERPT_CONTENT_LIMIT,
    filterExcerpts,
    measureExcerpt,
    normalizeExcerptContent,
    prepareExcerptContent,
} = require("@/features/excerpts/domain/excerpt-validation.ts");
const {
    excerptTimeLabel,
} = require("@/features/excerpts/domain/excerpt-display.ts");
const {
    copyExcerptText,
    newExcerptId,
    pasteClipboardAsExcerpt,
} = require("@/features/excerpts/services/excerpt-service.ts");

const owner = "user:one";
const t0 = new Date("2026-09-25T01:00:00.000Z");
const t1 = new Date("2026-09-25T02:00:00.000Z");
const t2 = new Date("2026-09-25T03:00:00.000Z");
const id = (number) =>
    `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const expectCode = (promise, code) =>
    assert.rejects(promise, (error) => error.code === code);

// 在隔离的 Node SQLite 中执行生产 SQL；不代表 Expo/Android 真机验收。
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
const migrationPort = (sqlite) => ({
    execAsync: async (sql) => sqlite.exec(sql),
});

async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createLocalExcerpts.up(migrationPort(sqlite));
    const repo = new ExcerptLocalRepository(databasePort(sqlite));
    await repo.activate(owner);
    return { sqlite, repo };
}

test("迁移 0014 位于注册表第 14 位，可重复执行，并按账号约束内容哈希唯一", async (t) => {
    // 后续迁移只会追加在后面；0014 之后的迁移不得改动摘录数据，见 excerpt-migration-regression。
    assert.ok(CURRENT_DATABASE_VERSION >= 14);
    assert.equal(databaseMigrations[13], createLocalExcerpts);
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createLocalExcerpts.up(migrationPort(sqlite));
    await createLocalExcerpts.up(migrationPort(sqlite));
    const indexes = sqlite
        .prepare("PRAGMA index_list(local_excerpts)")
        .all()
        .map((row) => [row.name, row.unique]);
    assert.deepEqual(
        indexes.filter(([name]) => name.startsWith("idx_")).sort(),
        [
            ["idx_local_excerpts_owner_hash", 1],
            ["idx_local_excerpts_owner_updated", 0],
        ],
    );
});

test("正文规范化：统一换行、去掉开头空行和末尾空白，保留首行缩进", () => {
    assert.equal(
        normalizeExcerptContent("\r\n  \n    code();\r\n  next\n\n  "),
        "    code();\n  next",
    );
    assert.throws(() => prepareExcerptContent(" \n\t "), { code: "empty" });
    const emoji = "😀".repeat(EXCERPT_CONTENT_LIMIT);
    assert.equal(prepareExcerptContent(emoji), emoji);
    assert.throws(() => prepareExcerptContent(`${emoji}a`), {
        code: "tooLong",
    });
});

test("新建摘录；相同内容再次保存时不新建，原摘录移到最前", async (t) => {
    const { repo, sqlite } = await setup(t);
    const first = await repo.save(owner, id(1), "第一条\n", "paste", t0);
    await repo.save(owner, id(2), "第二条", "manual", t1);
    assert.equal(first.duplicated, false);
    assert.equal(first.entity.content, "第一条");
    assert.deepEqual(
        repo.list(owner).map((item) => item.clientId),
        [id(2), id(1)],
    );
    const again = await repo.save(owner, id(3), "  \n第一条  ", "auto", t2);
    assert.equal(again.duplicated, true);
    assert.equal(again.entity.clientId, id(1));
    assert.equal(again.entity.source, "paste");
    assert.equal(again.entity.localVersion, 2);
    assert.deepEqual(
        repo.list(owner).map((item) => item.clientId),
        [id(1), id(2)],
    );
    assert.equal(
        sqlite.prepare("SELECT COUNT(*) AS count FROM local_excerpts").get()
            .count,
        2,
    );
});

test("置顶排在最前且不改更新时间；修改正文会刷新更新时间", async (t) => {
    const { repo } = await setup(t);
    const { entity: older } = await repo.save(owner, id(1), "旧", "manual", t0);
    await repo.save(owner, id(2), "新", "manual", t1);
    const pinned = await repo.update(owner, older, { isPinned: true }, t2);
    assert.equal(pinned.updatedAt, older.updatedAt);
    assert.deepEqual(
        repo.list(owner).map((item) => item.clientId),
        [id(1), id(2)],
    );
    const edited = await repo.update(owner, pinned, { content: "旧·改" }, t2);
    assert.equal(edited.updatedAt, t2.toISOString());
    assert.notEqual(edited.contentHash, pinned.contentHash);
    assert.equal(await repo.update(owner, edited, {}, t2), edited);
});

test("改成已有内容、使用过期版本、修改已删除摘录时分别报错", async (t) => {
    const { repo } = await setup(t);
    const { entity: a } = await repo.save(owner, id(1), "甲", "manual", t0);
    const { entity: b } = await repo.save(owner, id(2), "乙", "manual", t0);
    await expectCode(repo.update(owner, b, { content: "甲" }, t1), "duplicate");
    await repo.update(owner, a, { isPinned: true }, t1);
    await expectCode(repo.update(owner, a, { content: "丙" }, t1), "conflict");
    await repo.delete(owner, b);
    await expectCode(repo.update(owner, b, { content: "丁" }, t1), "missing");
    await expectCode(repo.delete(owner, b), "missing");
    assert.deepEqual(
        repo.list(owner).map((item) => item.clientId),
        [id(1)],
    );
});

test("按账号隔离；切换账号后旧会话的写入被拒绝", async (t) => {
    const { repo } = await setup(t);
    await repo.save(owner, id(1), "账号一", "manual", t0);
    const generation = repo.generation;
    await repo.activate("guest:local");
    assert.deepEqual(repo.list("guest:local"), []);
    assert.throws(() => repo.assertSession(owner, generation), {
        code: "owner",
    });
    await expectCode(
        repo.save(owner, id(2), "迟到的写入", "manual", t1),
        "owner",
    );
    await repo.activate(owner);
    assert.deepEqual(
        repo.list(owner).map((item) => item.content),
        ["账号一"],
    );
});

test("输入计数按规范化正文：开头空行不占上限，满额正文完整保存", async (t) => {
    const { repo } = await setup(t);
    const body = "字".repeat(EXCERPT_CONTENT_LIMIT - 1) + "尾";
    const raw = "\n".repeat(100) + body + "\n  ";
    assert.equal(measureExcerpt(raw), EXCERPT_CONTENT_LIMIT);
    const receipt = await repo.save(owner, id(1), raw, "manual", t0);
    assert.equal(receipt.entity.content, body);
    assert.equal(measureExcerpt(`\n\n${body}多`), EXCERPT_CONTENT_LIMIT + 1);
    await expectCode(repo.save(owner, id(2), `${body}多`, "manual", t0), "tooLong");
});

test("切换账号前已受理的写入照常提交，不发布到新账号的列表", async (t) => {
    const { repo } = await setup(t);
    await repo.save(owner, id(1), "账号一", "manual", t0);
    const base = repo.get(owner, id(1));
    // 不等待：写入仍在队列中时立即切换到游客（模拟退出登录）。
    const saving = repo.save(owner, id(2), "退出前最后一条", "manual", t1);
    const editing = repo.update(owner, base, { content: "退出前改过" }, t1);
    const switching = repo.activate("guest:local");
    assert.equal((await saving).entity.content, "退出前最后一条");
    assert.equal((await editing).content, "退出前改过");
    await switching;
    assert.deepEqual(repo.list("guest:local"), []);
    await repo.activate(owner);
    assert.deepEqual(
        repo
            .list(owner)
            .map((item) => item.content)
            .sort(),
        ["退出前最后一条", "退出前改过"].sort(),
    );
});

test("粘贴一次：剪贴板为空时提示没有文字，否则以 paste 来源保存", async (t) => {
    const { repo } = await setup(t);
    await expectCode(
        pasteClipboardAsExcerpt(
            repo,
            async () => " \n",
            owner,
            repo.generation,
        ),
        "empty",
    );
    const receipt = await pasteClipboardAsExcerpt(
        repo,
        async () => "https://example.com\n",
        owner,
        repo.generation,
        () => t0,
    );
    assert.equal(receipt.entity.source, "paste");
    assert.equal(receipt.entity.content, "https://example.com");
    assert.match(newExcerptId(), /^[0-9a-f-]{36}$/);
});

test("复制：剪贴板写入返回 false 时按失败处理", async () => {
    const written = [];
    await copyExcerptText(async (text) => {
        written.push(text);
        return true;
    }, "正文");
    assert.deepEqual(written, ["正文"]);
    await assert.rejects(
        copyExcerptText(async () => false, "正文"),
        /未能写入剪贴板/,
    );
});

test("搜索忽略大小写；时间标签区分今天、昨天、今年和往年", async (t) => {
    const { repo } = await setup(t);
    await repo.save(owner, id(1), "Hello World", "manual", t0);
    await repo.save(owner, id(2), "你好", "manual", t0);
    assert.deepEqual(
        filterExcerpts(repo.list(owner), " hello ").map(
            (item) => item.clientId,
        ),
        [id(1)],
    );
    assert.equal(filterExcerpts(repo.list(owner), "  ").length, 2);
    const now = new Date(2026, 8, 25, 12, 0);
    assert.equal(
        excerptTimeLabel(new Date(2026, 8, 25, 9, 5).toISOString(), now),
        "今天 09:05",
    );
    assert.equal(
        excerptTimeLabel(new Date(2026, 8, 24, 23, 59).toISOString(), now),
        "昨天 23:59",
    );
    assert.equal(
        excerptTimeLabel(new Date(2026, 0, 3, 8, 0).toISOString(), now),
        "1月3日 08:00",
    );
    assert.equal(
        excerptTimeLabel(new Date(2025, 11, 31, 8, 0).toISOString(), now),
        "2025年12月31日",
    );
});

test("夏令时切换后的“昨天”按日历日判断", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
        // 2026-03-08 只有 23 小时：前天 23:30 不是昨天。
        const spring = new Date(2026, 2, 9, 12, 0);
        assert.equal(
            excerptTimeLabel(new Date(2026, 2, 7, 23, 30).toISOString(), spring),
            "3月7日 23:30",
        );
        assert.equal(
            excerptTimeLabel(new Date(2026, 2, 8, 0, 30).toISOString(), spring),
            "昨天 00:30",
        );
        // 2026-11-01 有 25 小时：昨天 00:30 仍是昨天。
        const autumn = new Date(2026, 10, 2, 12, 0);
        assert.equal(
            excerptTimeLabel(new Date(2026, 10, 1, 0, 30).toISOString(), autumn),
            "昨天 00:30",
        );
        assert.equal(
            excerptTimeLabel(new Date(2026, 10, 2, 23, 59).toISOString(), autumn),
            "今天 23:59",
        );
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
});
