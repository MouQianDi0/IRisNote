const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

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

module.exports = withNativewind(config);
