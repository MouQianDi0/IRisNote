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
    base64FromDataUri,
    cacheableAvatarName,
    chooseAvatarSource,
    looksLikeAvatarImage,
} = require("../../src/features/profile/utils/avatar-cache-key.ts");

test("只缓存属于当前用户且命名合规的头像", () => {
    const url = "https://api.example.com/api/user/avatar/7_1718500000000.png";
    assert.equal(cacheableAvatarName(url, 7), "7_1718500000000.png");
    assert.equal(cacheableAvatarName(`${url}?t=1`, 7), "7_1718500000000.png");
    assert.equal(cacheableAvatarName(url, 8), null);
    assert.equal(
        cacheableAvatarName("https://api.example.com/api/user/avatar/../7_1718500000000.png", 7),
        "7_1718500000000.png",
    );
    assert.equal(
        cacheableAvatarName("https://api.example.com/api/user/avatar/7_1.png", 7),
        null,
    );
    assert.equal(
        cacheableAvatarName("https://api.example.com/api/user/avatar/7_1718500000000.svg", 7),
        null,
    );
    assert.equal(cacheableAvatarName("data:image/png;base64,AAAA", 7), null);
    assert.equal(cacheableAvatarName(null, 7), null);
});

test("本地缓存优先；云存储未授权时不使用网络地址", () => {
    const remote = "https://api.example.com/api/user/avatar/7_1718500000000.png";
    assert.deepEqual(
        chooseAvatarSource({ localUri: "file:///a.png", remoteUri: remote, networkAllowed: false }),
        { uri: "file:///a.png", from: "local" },
    );
    assert.deepEqual(
        chooseAvatarSource({ localUri: null, remoteUri: remote, networkAllowed: true }),
        { uri: remote, from: "remote" },
    );
    assert.equal(
        chooseAvatarSource({ localUri: null, remoteUri: remote, networkAllowed: false }),
        null,
    );
    assert.deepEqual(
        chooseAvatarSource({ localUri: null, remoteUri: "data:image/png;base64,AA", networkAllowed: false }),
        { uri: "data:image/png;base64,AA", from: "remote" },
    );
    assert.equal(
        chooseAvatarSource({ localUri: null, remoteUri: null, networkAllowed: true }),
        null,
    );
});

test("按文件头识别图片，拒绝错误页面等内容", () => {
    assert.equal(looksLikeAvatarImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
    assert.equal(
        looksLikeAvatarImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        true,
    );
    assert.equal(looksLikeAvatarImage(Buffer.from("GIF89a", "latin1")), true);
    assert.equal(looksLikeAvatarImage(Buffer.from("RIFF\0\0\0\0WEBP", "latin1")), true);
    assert.equal(looksLikeAvatarImage(Buffer.from("<!DOCTYPE html>", "utf8")), false);
    assert.equal(looksLikeAvatarImage(Buffer.from('{"error":"头像不存在"}', "utf8")), false);
    assert.equal(looksLikeAvatarImage(new Uint8Array(0)), false);
});

test("从 data URI 提取 base64 内容", () => {
    assert.equal(base64FromDataUri("data:image/jpeg;base64,/9j/4AAQ"), "/9j/4AAQ");
    assert.equal(base64FromDataUri("/9j/4AAQ"), null);
    assert.equal(base64FromDataUri("data:text/html;base64,PGh0bWw+"), null);
});
