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
} = require("../../src/shared/utils/markdown/parse-markdown.ts");
const {
    releaseNotesMarkdownOptions,
} = require("../../src/features/updates/release-notes.ts");
const parseUpdateNotes = (notes) =>
    parseMarkdown(notes, releaseNotesMarkdownOptions);

test("旧版说明保留版本标题、分组和没有列表的普通段落", () => {
    assert.deepEqual(
        parseUpdateNotes(
            "IRisNote 1.2.3 更新说明\r\n\r\n新增功能\r\n- 支持分组\r\n\r\n这是一段提醒。\r\n请保留数据。",
        ),
        [
            { kind: "paragraph", text: "IRisNote 1.2.3 更新说明" },
            { kind: "heading", text: "新增功能", level: 2 },
            { kind: "item", text: "支持分组", marker: "•" },
            { kind: "paragraph", text: "这是一段提醒。\n请保留数据。" },
        ],
    );
});
