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
    BIO_MAX,
    NICKNAME_MAX,
    checkBio,
    checkGenderCustom,
    checkNickname,
    codePointLength,
    formatGender,
    parseCreatedAt,
} = require("../../src/features/profile/utils/profile-validation.ts");

test("长度按 Unicode 码点计数，与服务端一致", () => {
    assert.equal(codePointLength("小明"), 2);
    assert.equal(codePointLength("😀"), 1);
    assert.equal(codePointLength("👨‍👩‍👧"), 5);
});

test("用户名去首尾空白，拒绝空白、换行与超长", () => {
    assert.deepEqual(checkNickname("  小明 "), { value: "小明", error: null });
    assert.equal(checkNickname("   ").error, "用户名不能为空");
    assert.equal(checkNickname("小\n明").error, "用户名不能包含换行");
    assert.equal(checkNickname("字".repeat(NICKNAME_MAX)).error, null);
    assert.match(checkNickname("字".repeat(NICKNAME_MAX + 1)).error, /30/);
});

test("简介可清空，统一换行并限制 200 字", () => {
    assert.deepEqual(checkBio("  \n "), { value: null, error: null });
    assert.deepEqual(checkBio(" 第一行\r\n第二行 "), {
        value: "第一行\n第二行",
        error: null,
    });
    assert.equal(checkBio("字".repeat(BIO_MAX)).error, null);
    assert.match(checkBio("字".repeat(BIO_MAX + 1)).error, /200/);
});

test("自定义性别必填、单行、最多 20 字", () => {
    assert.equal(checkGenderCustom(" ").error, "请填写自定义性别");
    assert.equal(checkGenderCustom("a\nb").error, "自定义性别不能包含换行");
    assert.deepEqual(checkGenderCustom(" 非二元 "), { value: "非二元", error: null });
    assert.match(checkGenderCustom("字".repeat(21)).error, /20/);
});

test("性别展示文案", () => {
    assert.equal(formatGender(null, null), "不设置");
    assert.equal(formatGender(undefined, undefined), "不设置");
    assert.equal(formatGender("male", null), "男");
    assert.equal(formatGender("female", null), "女");
    assert.equal(formatGender("custom", " 非二元 "), "非二元");
    assert.equal(formatGender("custom", "  "), "不设置");
});

test("注册时间为空或无法解析时返回 null，不显示为 1970 年", () => {
    assert.equal(parseCreatedAt(null), null);
    assert.equal(parseCreatedAt(undefined), null);
    assert.equal(parseCreatedAt(""), null);
    assert.equal(parseCreatedAt("not-a-date"), null);
    assert.equal(
        parseCreatedAt("2026-06-15T12:00:00.000Z").toISOString(),
        "2026-06-15T12:00:00.000Z",
    );
});
