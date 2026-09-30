const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    parseMarkdown,
    parseMarkdownInline,
} = require("../../src/shared/utils/markdown/parse-markdown.ts");

test("Markdown 标题、无序列表与有序列表保留原编号", () => {
    assert.deepEqual(
        parseMarkdown(
            "# 更新说明\n## 体验优化 ##\n- **清晰**阅读\n* 第二条\n+ 第三条\n3. 打开设置\n4) 检查更新",
        ),
        [
            { kind: "heading", text: "更新说明", level: 1 },
            { kind: "heading", text: "体验优化", level: 2 },
            { kind: "item", text: "**清晰**阅读", marker: "•" },
            { kind: "item", text: "第二条", marker: "•" },
            { kind: "item", text: "第三条", marker: "•" },
            { kind: "item", text: "打开设置", marker: "3." },
            { kind: "item", text: "检查更新", marker: "4)" },
        ],
    );
});

test("行内加粗与代码混排，代码中的星号不再解析", () => {
    assert.deepEqual(
        parseMarkdownInline("支持 **加粗**、__强调__ 与 `**原文**`。"),
        [
            { kind: "text", text: "支持 " },
            { kind: "strong", text: "加粗" },
            { kind: "text", text: "、" },
            { kind: "strong", text: "强调" },
            { kind: "text", text: " 与 " },
            { kind: "code", text: "**原文**" },
            { kind: "text", text: "。" },
        ],
    );
});

test("空内容与不完整、未支持语法不丢失正文", () => {
    assert.deepEqual(parseMarkdown(" \r\n\t"), []);
    const raw = "**未闭合 `代码 [链接](https://example.com) <b>原文</b>";
    assert.deepEqual(parseMarkdownInline(raw), [{ kind: "text", text: raw }]);
    const table = "| 项目 | 内容 |\n| --- | --- |\n| A | B |";
    assert.deepEqual(parseMarkdown(table), [
        { kind: "paragraph", text: table },
    ]);
    const fenced = "```md\n# 原文\n- **保留**\n```";
    assert.deepEqual(parseMarkdown(fenced), [
        { kind: "literal", text: fenced },
    ]);
    assert.deepEqual(parseMarkdown("~~~\n# 未闭合"), [
        { kind: "literal", text: "~~~\n# 未闭合" },
    ]);
});

test("最长合法更新说明不截断，连续普通行保持换行", () => {
    const notes = "正文".repeat(6000);
    assert.deepEqual(parseMarkdown(notes), [
        { kind: "paragraph", text: notes },
    ]);
    assert.deepEqual(parseMarkdownInline(notes), [
        { kind: "text", text: notes },
    ]);
    assert.deepEqual(parseMarkdown("第一行\n第二行\n\n第三行"), [
        { kind: "paragraph", text: "第一行\n第二行" },
        { kind: "paragraph", text: "第三行" },
    ]);
});

test("公共解析不内置更新业务标题，调用方可显式配置", () => {
    assert.deepEqual(parseMarkdown("新增功能"), [
        { kind: "paragraph", text: "新增功能" },
    ]);
    assert.deepEqual(
        parseMarkdown("自定义标题", { plainTextHeadings: ["自定义标题"] }),
        [{ kind: "heading", text: "自定义标题", level: 2 }],
    );
    assert.deepEqual(
        parseMarkdown("```\n自定义标题\n```", {
            plainTextHeadings: ["自定义标题"],
        }),
        [{ kind: "literal", text: "```\n自定义标题\n```" }],
    );
});
