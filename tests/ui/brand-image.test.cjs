const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveBrandImage } = require("../../scripts/brand-image.cjs");

const root = path.resolve(__dirname, "../..");
const extensions = ["png", "jpg", "jpeg", "webp"];

test("project-local image can be changed through EXPO_PUBLIC_IMAGE without a source registry", () => {
    assert.equal(
        resolveBrandImage(root, "./assets/images/notification-icon.png", extensions),
        path.resolve(root, "assets/images/notification-icon.png"),
    );
    assert.equal(
        resolveBrandImage(root, "../../../../assets/images/IRisNote_iris.png", extensions),
        path.resolve(root, "assets/images/IRisNote_iris.png"),
    );
});

test("missing and external image paths fail before bundling", () => {
    assert.throws(
        () => resolveBrandImage(root, "./assets/images/missing.png", extensions),
        /图片不存在/,
    );
    assert.throws(
        () => resolveBrandImage(root, __filename, extensions),
        /图片格式不受 Metro 支持/,
    );
    assert.throws(
        () => resolveBrandImage(root, path.parse(root).root, extensions),
        /必须指向项目内的图片/,
    );
});
