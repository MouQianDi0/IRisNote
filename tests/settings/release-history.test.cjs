const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
            fileName: filename,
        }).outputText,
        filename,
    );
};

const {
    parseReleaseNotes,
    parseReleaseHistory,
    compareVersions,
} = require("../../src/features/settings/data/release-history.ts");

test("parseReleaseNotes：标题行分组、跳过占位标题、散落条目归入默认分组", () => {
    const notes = [
        "IRisNote 0.4.0 更新说明",
        "",
        "新增功能",
        "- 笔记垃圾桶：删除的笔记会保留 15 天。",
        "- 我的页面新增内容管理。",
        "",
        "体验优化",
        "- 待办列表支持下拉手动同步。",
        "",
        "- 未分组的条目",
    ].join("\r\n");
    assert.deepEqual(parseReleaseNotes(notes), [
        {
            title: "新增功能",
            items: [
                "笔记垃圾桶：删除的笔记会保留 15 天。",
                "我的页面新增内容管理。",
            ],
        },
        {
            title: "体验优化",
            items: ["待办列表支持下拉手动同步。", "未分组的条目"],
        },
    ]);
    assert.deepEqual(parseReleaseNotes(""), []);
    assert.deepEqual(parseReleaseNotes("IRisNote 0.1.0 更新说明"), []);
    // 只有标题没有条目的分组不产出。
    assert.deepEqual(parseReleaseNotes("升级提醒\n- 仅有一条"), [
        { title: "升级提醒", items: ["仅有一条"] },
    ]);
});

test("parseReleaseHistory：校验字段、去重、提取发布日期；非法输入返回 null", () => {
    const valid = [
        {
            version: "0.4.0",
            buildCode: 16,
            notes: "IRisNote 0.4.0 更新说明\n\n新增功能\n- 垃圾桶",
            publishedAt: "2026-09-23T02:00:00.000Z",
        },
    ];
    const parsed = parseReleaseHistory(valid);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].publishedOn, "2026-09-23");
    assert.equal(parsed[0].buildCode, 16);
    assert.deepEqual(parsed[0].sections, [
        { title: "新增功能", items: ["垃圾桶"] },
    ]);
    // 无法识别的时间格式置空但不拒绝。
    assert.equal(
        parseReleaseHistory([{ ...valid[0], publishedAt: "unknown" }])[0]
            .publishedOn,
        "",
    );
    for (const bad of [
        null,
        [],
        "not-array",
        [{ version: "latest", buildCode: 16, notes: "x", publishedAt: "d" }],
        [{ version: "0.4.0", buildCode: 0, notes: "x", publishedAt: "d" }],
        [{ version: "0.4.0", buildCode: 1.5, notes: "x", publishedAt: "d" }],
        [{ version: "0.4.0", buildCode: 16, notes: 123, publishedAt: "d" }],
        [
            {
                version: "0.4.0",
                buildCode: 16,
                notes: "x".repeat(12001),
                publishedAt: "d",
            },
        ],
        [{ version: "0.4.0", buildCode: 16, notes: "x", publishedAt: 123 }],
        [
            { version: "0.4.0", buildCode: 16, notes: "x", publishedAt: "d" },
            { version: "0.4.0", buildCode: 17, notes: "y", publishedAt: "d" },
        ],
    ])
        assert.equal(parseReleaseHistory(bad), null);
    // 条数上限保护。
    const many = Array.from({ length: 101 }, (_, i) => ({
        version: `0.0.${i + 1}`,
        buildCode: i + 1,
        notes: "x",
        publishedAt: "2026-01-01",
    }));
    assert.equal(parseReleaseHistory(many), null);
    assert.equal(parseReleaseHistory(many.slice(0, 100)).length, 100);
});

test("compareVersions：数值比较而非字符串比较", () => {
    assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
    assert.equal(compareVersions("0.4.0", "0.4.0"), 0);
    assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
});

test("AboutScreen 已改为服务端数据源，不再引用硬编码 RELEASE_HISTORY", () => {
    const screen = fs.readFileSync(
        path.resolve(
            __dirname,
            "../../src/features/settings/screens/AboutScreen.tsx",
        ),
        "utf8",
    );
    assert.ok(!screen.includes("RELEASE_HISTORY"));
    assert.ok(screen.includes("useReleaseHistory"));
    const data = fs.readFileSync(
        path.resolve(
            __dirname,
            "../../src/features/settings/data/release-history.ts",
        ),
        "utf8",
    );
    assert.ok(!/RELEASE_HISTORY\s*[:=]/.test(data));
});
