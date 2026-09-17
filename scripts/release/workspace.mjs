import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";

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

// Never reclaim a lock by PID alone: an interrupted build may leave child JVMs alive.
export async function acquireReleaseWorkspace(root, environment = process.env) {
    const identity = await realpath(root);
    const key = createHash("sha256")
        .update(identity)
        .digest("hex")
        .slice(0, 12);
    const base = releaseBuildRoot(root, environment);
    await mkdir(base, { recursive: true });
    const workspace = path.join(await realpath(base), `reuse-${key}`);
    await mkdir(workspace, { recursive: true });
    if ((await realpath(workspace)) !== workspace)
        throw new Error("构建工作区不能是符号链接或目录联接");
    const lock = path.join(workspace, "build.lock");
    try {
        await mkdir(lock);
    } catch (error) {
        if (error.code === "EEXIST")
            throw new Error(
                `构建工作区已锁定：${lock}；请等待构建结束。异常退出后须核实子进程已结束再手动解除锁，或使用 --fresh。`,
            );
        throw error;
    }
    try {
        await writeFile(
            path.join(lock, "owner.json"),
            JSON.stringify({
                pid: process.pid,
                root: identity,
                startedAt: new Date().toISOString(),
            }),
        );
    } catch (error) {
        await rm(lock, { recursive: true, force: true });
        throw error;
    }
    return {
        workspace,
        release: () => rm(lock, { recursive: true, force: true }),
    };
}
