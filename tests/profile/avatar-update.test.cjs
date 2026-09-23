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
    describeAvatarError,
} = require("../../src/features/profile/utils/avatar-errors.ts");

test("云存储未授权优先提示开启云存储", () => {
    const result = describeAvatarError({
        code: "CLOUD_STORAGE_PERMISSION_REQUIRED",
        message: "Cloud storage disabled",
        response: { data: { error: "服务端错误" } },
    });
    assert.equal(result.title, "需要开启云存储");
});

test("选图权限、超限与读取失败转换为中文提示", () => {
    assert.equal(
        describeAvatarError(new Error("Media library permission is required."))
            .message,
        "需要相册权限才能选择头像",
    );
    assert.equal(
        describeAvatarError(new Error("Camera permission is required."))
            .message,
        "需要相机权限才能拍摄头像",
    );
    assert.equal(
        describeAvatarError(new Error("Avatar image must be 2MB or smaller."))
            .message,
        "图片需不超过 2MB，请重新选择",
    );
    assert.equal(
        describeAvatarError(new Error("Avatar base64 data was not returned."))
            .message,
        "无法读取所选图片，请重新选择",
    );
});

test("服务端返回的错误原因原样展示，空白原因回退通用提示", () => {
    assert.equal(
        describeAvatarError({ response: { data: { error: "不支持的格式" } } })
            .message,
        "不支持的格式",
    );
    assert.equal(
        describeAvatarError({ response: { data: { error: "  " } } }).message,
        "头像更新失败，请稍后再试",
    );
});

test("未知错误与非对象值不泄露原始英文信息", () => {
    assert.equal(
        describeAvatarError(new Error("socket hang up")).message,
        "头像更新失败，请稍后再试",
    );
    assert.equal(
        describeAvatarError(undefined).message,
        "头像更新失败，请稍后再试",
    );
});
