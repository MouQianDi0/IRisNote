/* eslint-disable expo/no-dynamic-env-var -- Node CLI reads private build variables, never bundled into Expo. */
import { createReadStream, createWriteStream } from "node:fs";
import {
    copyFile,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    stat,
    writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { gradleEnvironment } from "../android/gradle-env.mjs";
import {
    deltaTools,
    generatePatch,
    setupDeltaTools,
    verifyNativeUpdater,
} from "./delta.mjs";
import { loadReleaseEnv } from "./env.mjs";
import {
    certificateDigest,
    fileSha256,
    npm,
    parseApkInfo,
    run,
    validateApkInfo,
} from "./lib.mjs";
import { releaseNinja, setupNinja } from "./ninja.mjs";
import { exportBuildSource } from "./source.mjs";
import { createReleaseWorkspace } from "./workspace.mjs";

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const [action, ...args] = process.argv.slice(2);
const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index < 0 ? undefined : args[index + 1];
};
const required = (name) => {
    const value = option(name);
    if (!value || value.startsWith("--")) throw new Error(`缺少 --${name}`);
    return value;
};
const envRequired = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`缺少环境变量 ${name}`);
    return value;
};
function code() {
    const value = required("build");
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2100000000)
        throw new Error("无效构建号");
    return Number(value);
}
function base() {
    const url = new URL(envRequired("IRIS_RELEASE_API"));
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new Error("IRIS_RELEASE_API 必须是无凭据的 HTTPS 地址");
    return url.toString().replace(/\/$/, "");
}
async function api(route, method = "GET", data) {
    const response = await fetch(`${base()}${route}`, {
        method,
        headers: {
            Authorization: `Bearer ${envRequired("IRIS_RELEASE_TOKEN")}`,
            "Content-Type": "application/json",
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
        redirect: "error",
    });
    if (!response.ok)
        throw new Error(
            `版本服务返回 HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`,
        );
    return response.json();
}
async function androidTools() {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error("请配置 ANDROID_HOME 或 ANDROID_SDK_ROOT");
    const versions = (await readdir(path.join(sdk, "build-tools")))
        .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!versions.length) throw new Error("没有可用的 Android build-tools");
    const directory = path.join(sdk, "build-tools", versions.at(-1));
    return {
        aapt: path.join(
            directory,
            process.platform === "win32" ? "aapt.exe" : "aapt",
        ),
        signer: path.join(
            directory,
            process.platform === "win32" ? "apksigner.bat" : "apksigner",
        ),
    };
}
async function inspect(apk, release) {
    const tools = await androidTools();
    const info = parseApkInfo(
        run(tools.aapt, ["dump", "badging", apk], { capture: true }),
    );
    validateApkInfo(info, release);
    const certificate = certificateDigest(
        run(tools.signer, ["verify", "--print-certs", apk], { capture: true }),
    );
    if (
        certificate !==
        envRequired("IRIS_CERTIFICATE_SHA256").replace(/:/g, "").toLowerCase()
    )
        throw new Error("APK 签名与正式证书不一致");
    return {
        ...info,
        certificate,
        sha256: await fileSha256(apk),
        size: (await stat(apk)).size,
    };
}
async function build() {
    await verifyNativeUpdater();
    const release = await api(`/${code()}`);
    const format = option("format") ?? "apk";
    if (
        !["apk", "aab"].includes(format) ||
        (format === "aab" && release.source !== "eas")
    )
        throw new Error(
            "AAB 目前使用 EAS production 渠道，预留时请选择 --source eas",
        );
    if (release.status !== "reserved")
        throw new Error("仅允许构建尚未上传的预留版本");
    const ninja = release.source === "self" ? await releaseNinja(root) : null;
    const workspace = await createReleaseWorkspace(root);
    console.log(`独立构建目录：${workspace}`);
    const checkout = path.join(workspace, "source");
    await mkdir(checkout);
    const selection = exportBuildSource(
        root,
        release.commit_sha,
        workspace,
        checkout,
    );
    console.log(`已排除非构建资料：${selection.excluded.join("、") || "无"}`);
    await verifyNativeUpdater(checkout);
    const buildEnv = {
        ...process.env,
        IRIS_BUILD_NUMBER: String(release.build_code),
        IRIS_BUILD_VERSION: release.version,
    };
    // Build scripts never receive the release service's administrative credential.
    delete buildEnv.IRIS_RELEASE_TOKEN;
    delete buildEnv.IRIS_KEYSTORE_PASSWORD;
    delete buildEnv.IRIS_KEY_PASSWORD;
    run(npm, ["ci"], { cwd: checkout, env: buildEnv });
    run(npm, ["run", "check"], { cwd: checkout, env: buildEnv });
    if (release.source === "eas") {
        const easFile = path.join(checkout, "eas.json");
        const eas = JSON.parse(await readFile(easFile, "utf8"));
        const profile = format === "aab" ? "production" : "preview";
        eas.build[profile].env = {
            ...eas.build[profile].env,
            IRIS_BUILD_NUMBER: String(release.build_code),
            IRIS_BUILD_VERSION: release.version,
        };
        for (const key of [
            "EXPO_PUBLIC_BASE_URL",
            "EXPO_PUBLIC_RELEASE_API_URL",
        ]) {
            if (process.env[key])
                eas.build[profile].env[key] = process.env[key];
        }
        await writeFile(easFile, JSON.stringify(eas, null, 2) + "\n");
        // EAS receives a deterministic checkout and persists the exact reservation in its profile.
        run("git", ["init"], { cwd: checkout });
        run("git", ["add", "."], { cwd: checkout });
        run(
            "git",
            [
                "-c",
                "user.name=IRisNote Builder",
                "-c",
                "user.email=builder@localhost",
                "commit",
                "-m",
                `Build ${release.build_code}`,
            ],
            { cwd: checkout },
        );
        delete buildEnv.IRIS_KEYSTORE_PASSWORD;
        delete buildEnv.IRIS_KEY_PASSWORD;
        delete buildEnv.IRIS_RELEASE_SIGNING;
        run(
            npm,
            [
                "run",
                "eas",
                "--",
                "build",
                "--platform",
                "android",
                "--profile",
                profile,
                "--non-interactive",
                "--wait",
            ],
            { cwd: checkout, env: buildEnv },
        );
        console.log(
            format === "aab"
                ? "AAB 已交由 EAS 构建；AAB 用于商店提交，不上传到 APK 更新接口。"
                : `从此次 EAS 构建下载 APK，然后执行 upload --build ${release.build_code} --apk <path>。上传时会核对真实产物。`,
        );
        return;
    }
    for (const name of [
        "IRIS_KEYSTORE_PATH",
        "IRIS_KEYSTORE_PASSWORD",
        "IRIS_KEY_ALIAS",
        "IRIS_KEY_PASSWORD",
        "IRIS_CERTIFICATE_SHA256",
    ])
        envRequired(name);
    buildEnv.IRIS_KEYSTORE_PATH = path.resolve(
        envRequired("IRIS_KEYSTORE_PATH"),
    );
    buildEnv.IRIS_RELEASE_SIGNING = "true";
    buildEnv.IRIS_KEYSTORE_PASSWORD = envRequired("IRIS_KEYSTORE_PASSWORD");
    buildEnv.IRIS_KEY_PASSWORD = envRequired("IRIS_KEY_PASSWORD");
    run(
        process.execPath,
        [
            "node_modules/expo/bin/cli",
            "prebuild",
            "--platform",
            "android",
            "--no-install",
        ],
        { cwd: checkout, env: buildEnv },
    );
    // Use the original project's socket directory, not the isolated checkout under
    // the Windows user Temp directory that triggered the AF_UNIX failure.
    const nativeBuildEnv = await gradleEnvironment(root, buildEnv);
    if (ninja) nativeBuildEnv.IRIS_NINJA_PATH = ninja;
    run(
        path.join(
            checkout,
            "android",
            process.platform === "win32" ? "gradlew.bat" : "gradlew",
        ),
        [
            "assembleRelease",
            "--no-daemon",
            ...(ninja
                ? [
                      "--init-script",
                      path.join(root, "scripts/android/ninja.init.gradle"),
                  ]
                : []),
        ],
        { cwd: path.join(checkout, "android"), env: nativeBuildEnv },
    );
    const apk = path.join(
        checkout,
        "android/app/build/outputs/apk/release/app-release.apk",
    );
    const info = await inspect(apk, release);
    const output = path.join(root, "dist", "releases", release.version);
    await mkdir(output, { recursive: true });
    const target = path.join(
        output,
        `IRisNote-${release.version}-${release.build_code}.apk`,
    );
    await copyFile(apk, target);
    await writeFile(
        `${target}.json`,
        JSON.stringify(
            { ...info, commit: release.commit_sha, source: release.source },
            null,
            2,
        ),
    );
    console.log(`已构建并校验：${target}\n尚未上传或发布。`);
}
async function preparePatches(release, apk) {
    const bases = await api(`/${release.build_code}/bases`);
    if (!bases.length) {
        console.log("此主版本没有历史已发布包，无需差量包。");
        return;
    }
    deltaTools();
    const output = path.join(root, "dist", "releases", release.version);
    await mkdir(output, { recursive: true });
    for (const old of bases) {
        if (old.patch_ready) {
            console.log(`构建 ${old.build_code} 的差量包已完成，跳过。`);
            continue;
        }
        const work = await mkdtemp(
            path.join(output, `${release.build_code}-from-${old.build_code}-`),
        );
        const oldApk = path.join(work, "base.apk");
        const response = await fetch(`${base()}/${old.build_code}/artifact`, {
            headers: {
                Authorization: `Bearer ${envRequired("IRIS_RELEASE_TOKEN")}`,
            },
            redirect: "error",
            signal: AbortSignal.timeout(30 * 60 * 1000),
        });
        if (!response.ok || !response.body)
            throw new Error(`无法下载旧构建 ${old.build_code}`);
        await pipeline(
            Readable.fromWeb(response.body),
            createWriteStream(oldApk, { flags: "wx" }),
        );
        await inspect(oldApk, old);
        const patchFile = path.join(work, "update.hdiff");
        const metadata = await generatePatch(
            oldApk,
            apk,
            patchFile,
            old.sha256,
            release.sha256,
        );
        await writeFile(
            `${patchFile}.json`,
            JSON.stringify(
                {
                    ...metadata,
                    baseBuildCode: old.build_code,
                    targetBuildCode: release.build_code,
                },
                null,
                2,
            ),
        );
        const uploaded = await fetch(
            `${base()}/${release.build_code}/patches/${old.build_code}`,
            {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${envRequired("IRIS_RELEASE_TOKEN")}`,
                    "Content-Type": "application/octet-stream",
                    "Content-Length": String(metadata.size),
                    "X-Patch-SHA256": metadata.sha256,
                    "X-Patch-Algorithm": metadata.algorithm,
                    "X-Base-SHA256": old.sha256,
                    "X-Target-SHA256": release.sha256,
                },
                body: createReadStream(patchFile),
                duplex: "half",
                redirect: "error",
                signal: AbortSignal.timeout(30 * 60 * 1000),
            },
        );
        if (!uploaded.ok)
            throw new Error(
                `差量包 ${old.build_code} → ${release.build_code} 上传失败：${uploaded.status}`,
            );
        console.log(
            `差量包已校验并上传：${old.build_code} → ${release.build_code}，${metadata.size} bytes（${((100 * metadata.size) / Number(release.size_bytes)).toFixed(1)}%）`,
        );
    }
}
async function main() {
    loadReleaseEnv(root);
    if (action === "setup-ninja") await setupNinja(root);
    else if (action === "setup-delta") await setupDeltaTools();
    else if (action === "patches") {
        const release = await api(`/${code()}`);
        if (release.status !== "draft") throw new Error("仅能为草稿生成差量包");
        const apk = path.resolve(required("apk"));
        const info = await inspect(apk, release);
        if (info.sha256 !== release.sha256)
            throw new Error("目标 APK 与已上传草稿不一致");
        await preparePatches(release, apk);
    } else if (action === "doctor") {
        run(process.execPath, ["--version"]);
        run("git", ["--version"]);
        run("java", ["-version"]);
        run("tar", ["--version"]);
        await releaseNinja(root);
        const tools = await androidTools();
        run(tools.aapt, ["version"]);
        run(tools.signer, ["version"]);
        deltaTools();
        await verifyNativeUpdater();
        console.log(
            "构建工具检查通过；签名、服务器连接和云端凭据在具体操作时检查。",
        );
    } else if (action === "reserve") {
        const source = required("source");
        if (!["self", "eas"].includes(source))
            throw new Error("--source 只能为 self 或 eas");
        const version = required("version");
        if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("版本号格式错误");
        const commit = run("git", ["rev-parse", "HEAD"], {
            cwd: root,
            capture: true,
        });
        const status = run(
            "git",
            ["status", "--porcelain", "--untracked-files=normal"],
            { cwd: root, capture: true },
        );
        if (
            status
                .split("\n")
                .some((line) => line && !line.includes(".codegraph/"))
        )
            throw new Error("请先提交应用改动；构建只使用已提交代码");
        const notes = await readFile(path.resolve(required("notes")), "utf8");
        console.log(
            JSON.stringify(
                await api("/reserve", "POST", {
                    version,
                    notes,
                    source,
                    commit,
                }),
                null,
                2,
            ),
        );
    } else if (action === "build") await build();
    else if (action === "inspect" || action === "upload") {
        const release = await api(`/${code()}`);
        const apk = path.resolve(required("apk"));
        const info = await inspect(apk, release);
        if (action === "inspect") {
            console.log(JSON.stringify(info, null, 2));
            return;
        }
        const response = await fetch(`${base()}/${release.build_code}/apk`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${envRequired("IRIS_RELEASE_TOKEN")}`,
                "Content-Type": "application/octet-stream",
                "Content-Length": String(info.size),
                "X-APK-SHA256": info.sha256,
                "X-Certificate-SHA256": info.certificate,
            },
            body: createReadStream(apk),
            duplex: "half",
            redirect: "error",
            signal: AbortSignal.timeout(30 * 60 * 1000),
        });
        if (!response.ok) throw new Error(`上传失败：HTTP ${response.status}`);
        await preparePatches(await api(`/${release.build_code}`), apk);
        console.log("完整产物及所需差量包已上传为草稿。请核对后运行 publish。");
    } else if (action === "publish" || action === "withdraw") {
        console.log(
            JSON.stringify(await api(`/${code()}/${action}`, "POST"), null, 2),
        );
    } else if (action === "status")
        console.log(JSON.stringify(await api(`/${code()}`), null, 2));
    else
        console.log(
            "IRisNote 发布工具\n  setup-ninja\n  setup-delta\n  doctor\n  reserve --source self|eas --version 1.1.0 --notes <file>\n  build --build <code>\n  inspect|upload|patches --build <code> --apk <file>\n  status|publish|withdraw --build <code>",
        );
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
