const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const withExcerptCapture = require("../../plugins/with-excerpt-capture");

test("干净 prebuild 生成 Expo 捕获宿主，重复执行幂等且不改主 Activity", async (t) => {
    const platformProjectRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "iris-capture-build-"),
    );
    t.after(() => fs.rm(platformProjectRoot, { recursive: true, force: true }));
    const main = path.join(
        platformProjectRoot,
        "app/src/main/java/MainActivity.kt",
    );
    await fs.mkdir(path.dirname(main), { recursive: true });
    await fs.writeFile(main, "existing main activity\n");
    const config = withExcerptCapture({ name: "IRisNote", slug: "irisnote" });
    const request = { modRequest: { platformProjectRoot }, modResults: {} };
    const result = await config.mods.android.dangerous(request);
    assert.equal(result.modRequest.platformProjectRoot, platformProjectRoot);
    const generated = path.join(
        platformProjectRoot,
        "app/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptCaptureHostActivity.kt",
    );
    const template = await fs.readFile(
        path.resolve(
            __dirname,
            "../../plugins/android/ExcerptCaptureHostActivity.kt",
        ),
        "utf8",
    );
    assert.equal(await fs.readFile(generated, "utf8"), template);
    await config.mods.android.dangerous(request);
    assert.equal(await fs.readFile(generated, "utf8"), template);
    assert.equal(await fs.readFile(main, "utf8"), "existing main activity\n");
});
