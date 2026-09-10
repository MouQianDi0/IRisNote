export const EDITOR_LONG_TEXT_TARGET_LENGTH = 30_000;

const LONG_TEXT_UNIT =
    "这是一段用于 IRisNote 编辑器阶段零回归的长文本，包含中文、English words、数字 12345 与标点。\n";

export const editorPhaseZeroFixtures = {
    empty: {
        title: "",
        content: "",
    },
    longText: {
        title: "三万字符长文本",
        content: LONG_TEXT_UNIT.repeat(
            Math.ceil(EDITOR_LONG_TEXT_TARGET_LENGTH / LONG_TEXT_UNIT.length),
        ).slice(0, EDITOR_LONG_TEXT_TARGET_LENGTH),
    },
    markdownAndCode: {
        title: "Markdown 与代码",
        content: [
            "# 一级标题",
            "",
            "- 列表一",
            "- 列表二",
            "",
            "```ts",
            'const message = "IRisNote";',
            "console.log(message);",
            "```",
        ].join("\n"),
    },
    imageSyntax: {
        title: "图片语法",
        content:
            "![本地示例](file:///tmp/irisnote.png)\n![远程示例](https://example.com/image.png)",
    },
    unusualCharacters: {
        title: "异常字符与 Unicode",
        content:
            "组合字符：e\u0301｜Emoji：👩🏽‍💻📝｜换行：\r\n第二行｜零宽字符：A\u200bB｜替换符：�",
    },
} as const;
