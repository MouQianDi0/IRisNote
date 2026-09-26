import { createHash } from "node:crypto";
import {
    lstat,
    mkdir,
    mkdtemp,
    realpath,
    rm,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
    return mkdtemp(path.join(await realpath(base), "r-"));
}

// The cleanup capability belongs only to the directory created by this call.
// Never scan r-* or infer ownership of another build from its name or PID.
export async function acquireTemporaryReleaseWorkspace(
    root,
    environment = process.env,
) {
    const workspace = await createReleaseWorkspace(root, environment);
    const base = path.dirname(workspace);
    const original = await lstat(workspace, { bigint: true });
    let released = false;
    return {
        workspace,
        async release() {
            if (released) return;
            if ((await realpath(base)) !== base)
                throw new Error("临时构建目录的父路径已改变，拒绝清理");
            let current;
            try {
                current = await lstat(workspace, { bigint: true });
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
                released = true;
                return;
            }
            if (
                !current.isDirectory() ||
                current.isSymbolicLink() ||
                current.dev !== original.dev ||
                current.ino !== original.ino ||
                (await realpath(workspace)) !== workspace
            )
                throw new Error("临时构建目录已被替换或指向其他路径，拒绝清理");
            await rm(workspace, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 100,
            });
            released = true;
        },
    };
}

export async function withReleaseWorkspace(
    root,
    { reusable, environment = process.env },
    action,
) {
    const lease = reusable
        ? await acquireReleaseWorkspace(root, environment)
        : await acquireTemporaryReleaseWorkspace(root, environment);
    try {
        return await action(lease.workspace);
    } finally {
        try {
            await lease.release();
            if (!reusable)
                console.log(`临时构建目录已清理：${lease.workspace}`);
        } catch (error) {
            // Cleanup must not hide the build/upload failure or suggest rebuilding
            // an artifact that has already been saved and uploaded successfully.
            console.warn(
                `警告：${reusable ? "构建锁释放" : "临时构建目录清理"}失败：${lease.workspace}；${error.message}。请确认构建子进程已结束后手动处理。`,
            );
        }
    }
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
