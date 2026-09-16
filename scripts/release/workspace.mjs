import path from "node:path";
import os from "node:os";
import { mkdir, mkdtemp } from "node:fs/promises";

export function releaseBuildRoot(
    root,
    environment = process.env,
    platform = process.platform,
) {
    const paths = platform === "win32" ? path.win32 : path.posix;
    const configured = environment.IRIS_BUILD_ROOT;
    const base =
        configured ||
        (platform === "win32"
            ? paths.join(paths.parse(root).root, "iris-build")
            : os.tmpdir());
    if (!paths.isAbsolute(base))
        throw new Error("IRIS_BUILD_ROOT 必须是绝对路径");
    const resolved = paths.normalize(base);
    if (
        platform === "win32" &&
        (!/^[A-Za-z]:\\[A-Za-z0-9_\\-]+$/.test(resolved) ||
            resolved.length > 40)
    ) {
        throw new Error(
            "Windows IRIS_BUILD_ROOT 请使用不超过 40 字符的本地英文短路径，例如 D:\\iris-build",
        );
    }
    return resolved;
}

export async function createReleaseWorkspace(root, environment = process.env) {
    const base = releaseBuildRoot(root, environment);
    await mkdir(base, { recursive: true });
    return mkdtemp(path.join(base, "r-"));
}
