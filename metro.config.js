const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("node:path");
const { resolveBrandImage } = require("./scripts/brand-image.cjs");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite 的 Web 实现需要把 WASM 作为静态资源交给 Metro。
if (!config.resolver.assetExts.includes("wasm")) {
    config.resolver.assetExts.push("wasm");
}

// SharedArrayBuffer 只有在跨源隔离页面中可用；本地 Web 开发同样需要这些响应头。
config.server.enhanceMiddleware = (middleware) => {
    return (request, response, next) => {
        response.setHeader(
            "Cross-Origin-Embedder-Policy",
            "credentialless",
        );
        response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        return middleware(request, response, next);
    };
};

const nativewindConfig = withNativewind(config);
const previousResolveRequest = nativewindConfig.resolver.resolveRequest;
const brandImagePath = resolveBrandImage(
    __dirname,
    process.env.EXPO_PUBLIC_IMAGE,
    nativewindConfig.resolver.assetExts,
);
const brandImageImporter = path.join(
    __dirname,
    "src/shared/ui/AppBrandIcon/AppBrandIcon.tsx",
);

nativewindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
    if (
        moduleName === "./brand-image" &&
        path.normalize(context.originModulePath) === brandImageImporter
    ) {
        return context.resolveRequest(context, brandImagePath, platform);
    }
    return previousResolveRequest
        ? previousResolveRequest(context, moduleName, platform)
        : context.resolveRequest(context, moduleName, platform);
};

module.exports = nativewindConfig;
