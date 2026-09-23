const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_IMAGE = path.join("assets", "images", "IRisNote_iris.png");
const LEGACY_PREFIX = "../../../../assets/";

function resolveBrandImage(root, configuredValue, assetExtensions) {
    const value = configuredValue?.trim() ?? "";
    const localValue = !value || /^https?:\/\//i.test(value)
        ? DEFAULT_IMAGE
        : value;
    const normalizedValue = localValue.replace(/\\/g, "/");
    const candidate = normalizedValue.startsWith(LEGACY_PREFIX)
        ? path.resolve(root, "src/shared/ui/AppBrandIcon", localValue)
        : path.resolve(root, localValue);

    let imagePath;
    try {
        imagePath = fs.realpathSync(candidate);
    } catch {
        throw new Error(`EXPO_PUBLIC_IMAGE 指向的图片不存在：${localValue}`);
    }

    const projectRoot = fs.realpathSync(root);
    const relativePath = path.relative(projectRoot, imagePath);
    if (
        relativePath === ".." ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error("EXPO_PUBLIC_IMAGE 必须指向项目内的图片");
    }
    if (!fs.statSync(imagePath).isFile()) {
        throw new Error("EXPO_PUBLIC_IMAGE 必须指向图片文件");
    }
    const extension = path.extname(imagePath).slice(1).toLowerCase();
    if (!assetExtensions.includes(extension)) {
        throw new Error(`EXPO_PUBLIC_IMAGE 图片格式不受 Metro 支持：.${extension}`);
    }
    return imagePath;
}

module.exports = { resolveBrandImage };
