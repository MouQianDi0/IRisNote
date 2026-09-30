const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withExcerptCapture(config) {
    return withDangerousMod(config, [
        "android",
        async (result) => {
            const destination = path.join(
                result.modRequest.platformProjectRoot,
                "app/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptCaptureHostActivity.kt",
            );
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.copyFile(
                path.join(__dirname, "android/ExcerptCaptureHostActivity.kt"),
                destination,
            );
            return result;
        },
    ]);
};
