import path from "node:path";
import { createHash } from "node:crypto";
import {
    chmod,
    copyFile,
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    rename,
    rm,
    writeFile,
} from "node:fs/promises";

const schema = 1;
const sourceCaches = new Set(["node_modules", "android"]);
const nativeCaches = new Set([
    ".gradle",
    ".cxx",
    "build",
    "app/.cxx",
    "app/build",
]);

async function exists(file) {
    try {
        return await lstat(file);
    } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
    }
}

// Check the whole managed tree before recursive deletion. Never follow a junction.
async function assertTree(directory) {
    const info = await exists(directory);
    if (!info) return;
    if (info.isSymbolicLink())
        throw new Error(`构建目录包含链接，拒绝清理：${directory}`);
    if (info.isDirectory()) {
        for (const entry of await readdir(directory))
            await assertTree(path.join(directory, entry));
    }
}

async function remove(directory, root) {
    const relative = path.relative(root, directory);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("拒绝清理构建工作区之外的路径");
    // rm unlinks links without traversing them; verify every parent is inside the workspace.
    const parent = await realpath(path.dirname(directory));
    const parentRelative = path.relative(root, parent);
    if (parentRelative.startsWith("..") || path.isAbsolute(parentRelative))
        throw new Error("构建清理路径越界");
    const target = await exists(directory);
    if (target?.isSymbolicLink()) {
        await rm(directory, { force: true });
        return;
    }
    if (target) {
        const resolved = path.relative(root, await realpath(directory));
        if (!resolved || resolved.startsWith("..") || path.isAbsolute(resolved))
            throw new Error("构建清理目标越界");
    }
    await rm(directory, { recursive: true, force: true });
}

export async function resetBuildSnapshot(workspace) {
    workspace = await realpath(workspace);
    const snapshot = path.join(workspace, "incoming");
    await remove(snapshot, workspace);
    await mkdir(snapshot);
    return snapshot;
}

// Only the named cache directories survive. Equal source bytes retain their mtimes.
export async function syncTree(from, to, preserve = new Set(), relative = "") {
    await mkdir(to, { recursive: true });
    const incoming = new Set(await readdir(from));
    for (const name of await readdir(to)) {
        const key = relative ? `${relative}/${name}` : name;
        if (preserve.has(key)) continue;
        if (!incoming.has(name))
            await remove(path.join(to, name), await realpath(to));
    }
    for (const name of incoming) {
        const key = relative ? `${relative}/${name}` : name;
        if (preserve.has(key))
            throw new Error(`提交源码与缓存目录冲突：${key}`);
        const source = path.join(from, name),
            target = path.join(to, name);
        const info = await lstat(source);
        let previous = await exists(target);
        if (info.isSymbolicLink() || previous?.isSymbolicLink())
            throw new Error(`构建源码不支持链接：${key}`);
        if (previous && info.isDirectory() !== previous.isDirectory()) {
            await remove(target, await realpath(to));
            previous = null;
        }
        if (info.isDirectory()) await syncTree(source, target, preserve, key);
        else {
            if (
                !previous ||
                info.size !== previous.size ||
                !(await readFile(source)).equals(await readFile(target))
            )
                await copyFile(source, target);
            if (process.platform !== "win32") await chmod(target, info.mode);
        }
    }
}

async function sourceFingerprint(directory, hash, includeSrc, relative = "") {
    for (const name of (await readdir(directory)).sort()) {
        const key = relative ? `${relative}/${name}` : name;
        // Application JS/TS is bundled again on every release. All other committed
        // inputs (including local modules, plugins, assets, scripts and .npmrc) invalidate reuse.
        if (key === "src" && !includeSrc) continue;
        const file = path.join(directory, name),
            info = await lstat(file);
        hash.update(
            JSON.stringify([
                key,
                info.mode,
                info.isDirectory() ? "directory" : info.size,
            ]),
        );
        if (info.isDirectory())
            await sourceFingerprint(file, hash, includeSrc, key);
        else hash.update(await readFile(file));
    }
}

export async function dependencyFingerprint(snapshot, environment, npmVersion) {
    const hash = createHash("sha256");
    const env = Object.entries(environment)
        .filter(
            ([name]) =>
                !["IRIS_BUILD_NUMBER", "IRIS_BUILD_VERSION"].includes(name),
        )
        .sort(([a], [b]) => a.localeCompare(b));
    hash.update(
        JSON.stringify([
            schema,
            process.version,
            process.platform,
            process.arch,
            npmVersion,
            env,
        ]),
    );
    const packageText = await readFile(
        path.join(snapshot, "package.json"),
        "utf8",
    );
    const lockText = await readFile(
        path.join(snapshot, "package-lock.json"),
        "utf8",
    );
    const localDependencies =
        /"(?:file:|link:)|"link"\s*:\s*true|"workspaces"\s*:/.test(
            packageText + lockText,
        );
    await sourceFingerprint(snapshot, hash, localDependencies);
    return hash.digest("hex");
}

async function readState(file) {
    try {
        return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError)
            return null;
        throw error;
    }
}

export async function prepareCachedSource(
    workspace,
    snapshot,
    environment,
    npmVersion,
) {
    workspace = await realpath(workspace);
    await assertTree(snapshot);
    const checkout = path.join(workspace, "source");
    const stateFile = path.join(workspace, "ready.json");
    const state = await readState(stateFile);
    // A failed/interrupted run is never treated as a complete cache on the next run.
    await remove(stateFile, workspace);
    const key = await dependencyFingerprint(snapshot, environment, npmVersion);
    const pkg = JSON.parse(
        await readFile(path.join(snapshot, "package.json"), "utf8"),
    );
    const lifecycle = [
        "preinstall",
        "install",
        "postinstall",
        "prepublish",
        "preprepare",
        "prepare",
        "postprepare",
    ];
    const hasLifecycle = lifecycle.some((name) => pkg.scripts?.[name]);
    const lock = path.join(checkout, "node_modules", ".package-lock.json");
    const installed = await exists(lock);
    const marker = installed
        ? createHash("sha256")
              .update(await readFile(lock))
              .digest("hex")
        : null;
    const reuse =
        !hasLifecycle &&
        state?.schema === schema &&
        state.key === key &&
        marker &&
        state.marker === marker;
    if (!reuse) await remove(checkout, workspace);
    else {
        // Source tree is fully reconciled; only dependency/native caches are opaque.
        for (const entry of await readdir(checkout)) {
            if (!sourceCaches.has(entry))
                await assertTree(path.join(checkout, entry));
        }
        for (const entry of sourceCaches) {
            if ((await exists(path.join(checkout, entry)))?.isSymbolicLink())
                throw new Error(`缓存根目录不能是链接：${entry}`);
        }
    }
    await syncTree(snapshot, checkout, sourceCaches);
    return {
        checkout,
        reuse: Boolean(reuse),
        async complete() {
            if (!(await exists(lock))) {
                console.log("npm 未生成依赖安装标记，下次将重新安装依赖。");
                return;
            }
            const marker = createHash("sha256")
                .update(await readFile(lock))
                .digest("hex");
            await writeFile(stateFile, JSON.stringify({ schema, key, marker }));
        },
    };
}

// Generate Android from scratch at its final absolute path. Merge only known
// build outputs back afterwards, so removed config plugins cannot leave old code.
export async function regenerateAndroid(workspace, checkout, prebuild) {
    workspace = await realpath(workspace);
    const android = path.join(checkout, "android");
    const previous = path.join(workspace, "previous-android");
    const generated = path.join(workspace, "generated-android");
    await remove(previous, workspace);
    await remove(generated, workspace);
    const hadAndroid = Boolean(await exists(android));
    if (hadAndroid) {
        await assertTree(android);
        await rename(android, previous);
    }
    await prebuild();
    if (hadAndroid) {
        await assertTree(android);
        await syncTree(android, previous, nativeCaches);
        await rename(android, generated);
        await rename(previous, android);
        await remove(generated, workspace);
    }
}

export async function timed(label, action) {
    const start = performance.now();
    try {
        return await action();
    } finally {
        console.log(
            `[耗时] ${label}：${((performance.now() - start) / 1000).toFixed(1)} 秒`,
        );
    }
}
