import path from "node:path";
import { loadEnvFile } from "node:process";

/** Load only the release CLI's private config; existing shell variables win. */
export function loadReleaseEnv(root) {
    try {
        loadEnvFile(path.join(root, ".env.release.local"));
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw new Error(
                `无法读取 .env.release.local（${error.code || "未知错误"}）`,
            );
        }
    }
}
