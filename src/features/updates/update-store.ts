import { flushActiveDrafts } from "@/features/notes/services/active-draft-flush";
import { installedUpdateFile } from "@/core/storage/storage-policy";
import { API_BASE_URL } from "@/shared/http/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as FS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { AppState, BackHandler, Platform } from "react-native";
import { create } from "zustand";
import NativeUpdater, {
    type TargetOptions,
    type UpdateStage,
    type VerificationResult,
} from "../../../modules/irisnote-updater";
import {
    ANDROID_PACKAGE,
    isNewerRelease,
    isRequiredUpdate,
    parseRelease,
    type AppRelease,
} from "./release";

type Phase =
    | "idle"
    | "checking"
    | "available"
    | "latest"
    | "downloading"
    | "verifying"
    | "merging"
    | "ready"
    | "permission"
    | "saving"
    | "installing"
    | "error";
type State = {
    visible: boolean;
    phase: Phase;
    release: AppRelease | null;
    progress: number;
    received: number;
    error: string;
    fileUri: string | null;
    stage: UpdateStage | null;
    stageProgress: number | null;
    stageStartedAt: number;
    timingsMs: VerificationResult["timingsMs"];
};
export const useUpdateStore = create<State>(() => ({
    visible: false,
    phase: "idle",
    release: null,
    progress: 0,
    received: 0,
    error: "",
    fileUri: null,
    stage: null,
    stageProgress: null,
    stageStartedAt: 0,
    timingsMs: {},
}));
const set = useUpdateStore.setState;
const lastCheckKey = "irisnote.release.last-check";
const requiredUpdateKey = "irisnote.release.required-update";
let checkedThisSession = false;
let cleanupAttemptedThisSession = false;
let pendingExit = false;
let exiting = false;
let busy = false;
let generation = 0;
let download: FS.DownloadResumable | null = null;
let pendingInstall = false;
let requestSequence = 0;
const foreground = () => AppState.currentState === "active";
const message = (error: unknown) =>
    error instanceof Error ? error.message : "操作失败，请稍后重试";
export function updateSupported() {
    return (
        Platform.OS === "android" &&
        Application.applicationId === ANDROID_PACKAGE &&
        !!Application.nativeBuildVersion
    );
}

async function cleanupInstalledUpdateFiles() {
    if (cleanupAttemptedThisSession) return;
    cleanupAttemptedThisSession = true;
    const cacheDirectory = FS.cacheDirectory;
    const buildVersion = Application.nativeBuildVersion;
    if (!cacheDirectory || !buildVersion || !/^[1-9]\d*$/.test(buildVersion))
        return;
    const installedBuildCode = Number(buildVersion);
    if (
        !Number.isSafeInteger(installedBuildCode) ||
        String(installedBuildCode) !== buildVersion
    )
        return;
    try {
        const names = await FS.readDirectoryAsync(cacheDirectory);
        for (const name of names) {
            if (!installedUpdateFile(name, buildVersion)) continue;
            const uri = `${cacheDirectory}${name}`;
            try {
                const info = await FS.getInfoAsync(uri);
                if (info.exists && !info.isDirectory)
                    await FS.deleteAsync(uri, { idempotent: true });
            } catch (error) {
                console.warn("清理已安装更新文件失败", name, message(error));
            }
        }
    } catch (error) {
        console.warn("读取更新缓存目录失败", message(error));
    }
}

export async function checkForUpdate(manual = false) {
    if (busy) {
        if (manual) set({ visible: true });
        return;
    }
    if (manual && useUpdateStore.getState().fileUri) {
        set({ visible: true });
        return;
    }
    if (!updateSupported()) {
        if (manual)
            set({
                visible: true,
                phase: "error",
                error: "请在正式 Android 安装包中检查更新",
            });
        return;
    }
    let cached = useUpdateStore.getState();
    busy = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        // The running binary's build number is available offline. Keep newer
        // packages for the installer; never clean immediately after launching it.
        await cleanupInstalledUpdateFiles();
        if (!manual && checkedThisSession) {
            const last = Number(await AsyncStorage.getItem(lastCheckKey));
            if (last && Date.now() - last < 6 * 60 * 60 * 1000) return;
        }
        set({
            phase: "checking",
            error: "",
            ...(manual ? { visible: true } : {}),
        });
        const endpoint =
            process.env.EXPO_PUBLIC_RELEASE_API_URL?.trim() ||
            `${API_BASE_URL.replace(/\/$/, "")}/releases`;
        if (new URL(endpoint).protocol !== "https:")
            throw new Error("更新服务地址必须使用 HTTPS");
        timer = setTimeout(() => controller.abort(), 12000);
        const installed = NativeUpdater
            ? await NativeUpdater.getInstalledApk()
            : {
                  version: Application.nativeApplicationVersion ?? "0.0.0",
                  buildCode: Number(Application.nativeBuildVersion),
                  sha256: "",
                  deltaSupported: false,
              };
        // Once a mandatory policy is known, restarting offline must not dismiss it.
        const saved = await AsyncStorage.getItem(requiredUpdateKey);
        if (saved) {
            try {
                const record = JSON.parse(saved) as Record<string, unknown>;
                if (record.installedBuildCode === installed.buildCode) {
                    const remembered = parseRelease(
                        record.release,
                        Application.applicationId!,
                        installed,
                    );
                    if (
                        isRequiredUpdate(remembered) &&
                        isNewerRelease(
                            remembered,
                            Application.nativeBuildVersion,
                        )
                    ) {
                        set({ release: remembered, visible: true });
                        cached = useUpdateStore.getState();
                    }
                }
            } catch {
                // A corrupt local record never becomes a trusted update instruction.
                await AsyncStorage.removeItem(requiredUpdateKey);
            }
        }
        const query = new URLSearchParams({
            version: installed.version,
            buildCode: String(installed.buildCode),
            sha256: installed.sha256,
            deltaSupported: String(installed.deltaSupported),
            updatePolicy: "3",
        });
        const response = await fetch(
            `${endpoint.replace(/\/$/, "")}/latest?${query}`,
            { signal: controller.signal },
        );
        if (!response.ok) throw new Error("暂时无法检查更新，请稍后重试");
        const data = await response.json();
        const release = parseRelease(
            data.release,
            Application.applicationId!,
            installed,
        );
        checkedThisSession = true;
        if (isNewerRelease(release, Application.nativeBuildVersion)) {
            const keepFile =
                release!.delivery.mode !== "unavailable" &&
                !!cached.fileUri &&
                cached.release?.buildCode === release!.buildCode &&
                cached.release.sha256 === release!.sha256;
            set({
                release,
                phase: keepFile ? "ready" : "available",
                visible: true,
                fileUri: keepFile ? cached.fileUri : null,
            });
        } else set({ release: null, phase: "latest", fileUri: null });
        if (isRequiredUpdate(release)) {
            await AsyncStorage.setItem(
                requiredUpdateKey,
                JSON.stringify({
                    installedBuildCode: installed.buildCode,
                    release,
                }),
            );
        } else await AsyncStorage.removeItem(requiredUpdateKey);
        await AsyncStorage.setItem(lastCheckKey, String(Date.now()));
    } catch (error) {
        set({ phase: "error", error: message(error) });
    } finally {
        if (timer) clearTimeout(timer);
        busy = false;
    }
}

function updater() {
    if (!NativeUpdater)
        throw new Error("当前安装包缺少原生更新模块，请安装完整版本");
    return NativeUpdater;
}

async function nativeTask(
    stage: UpdateStage,
    action: (requestId: string) => Promise<VerificationResult>,
) {
    const native = updater();
    const current = generation;
    const requestId = `${generation}-${++requestSequence}`;
    set({
        phase: "verifying",
        stage,
        stageProgress: null,
        stageStartedAt: Date.now(),
    });
    const listener = native.addListener("onProgress", (event) => {
        if (event.requestId !== requestId || current !== generation) return;
        set({
            phase: event.stage === "merge" ? "merging" : "verifying",
            stage: event.stage,
            stageProgress:
                event.total > 0
                    ? Math.min(1, event.processed / event.total)
                    : null,
            stageStartedAt: Date.now() - event.elapsedMs,
        });
    });
    try {
        const result = await action(requestId);
        if (current !== generation) return;
        set({
            timingsMs: {
                ...useUpdateStore.getState().timingsMs,
                ...result.timingsMs,
            },
        });
    } finally {
        listener.remove();
    }
}

export async function downloadUpdate() {
    const release = useUpdateStore.getState().release;
    if (
        busy ||
        exiting ||
        pendingExit ||
        !release ||
        !updateSupported() ||
        !FS.cacheDirectory
    )
        return;
    const transfer = release.delivery;
    if (transfer.mode === "unavailable") {
        set({ error: transfer.reason });
        return;
    }
    if (!NativeUpdater) {
        set({
            phase: "error",
            error: "当前安装包缺少原生更新模块，请安装完整版本",
        });
        return;
    }
    busy = true;
    pendingInstall = false;
    const current = ++generation;
    const uri = `${FS.cacheDirectory}irisnote-release-${release.buildCode}.apk`;
    const downloadedUri =
        transfer.mode === "delta"
            ? `${FS.cacheDirectory}irisnote-release-${release.buildCode}.hdiff`
            : uri;
    let complete = false;
    try {
        await FS.deleteAsync(uri, { idempotent: true });
        if (downloadedUri !== uri)
            await FS.deleteAsync(downloadedUri, { idempotent: true });
        set({
            phase: "downloading",
            progress: 0,
            received: 0,
            error: "",
            fileUri: null,
            visible: true,
            stage: null,
            stageProgress: null,
            timingsMs: {},
        });
        download = FS.createDownloadResumable(
            transfer.downloadUrl,
            downloadedUri,
            {},
            (event) => {
                if (current !== generation) return;
                set({
                    received: event.totalBytesWritten,
                    progress: Math.min(
                        1,
                        event.totalBytesWritten / transfer.size,
                    ),
                });
                if (event.totalBytesWritten > transfer.size)
                    void cancelUpdate();
            },
        );
        const result = await download.downloadAsync();
        if (current !== generation) return;
        if (!result || result.status !== 200)
            throw new Error("下载失败，请重试");
        if (transfer.mode === "delta") {
            await nativeTask("base", (requestId) =>
                updater().applyPatch({
                    ...targetOptions(uri, release, requestId, "target"),
                    patchUri: downloadedUri,
                    patchSize: String(transfer.size),
                    baseSha256: transfer.baseSha256,
                    patchSha256: transfer.sha256,
                }),
            );
        } else {
            await nativeTask("target", (requestId) =>
                updater().verifyApk(
                    targetOptions(uri, release, requestId, "target"),
                ),
            );
        }
        if (current !== generation) return;
        complete = true;
        set({ phase: "ready", fileUri: uri, progress: 1 });
        pendingInstall = true;
    } catch (error) {
        if (current === generation)
            set({ phase: "error", error: message(error), visible: true });
    } finally {
        download = null;
        if (!complete)
            await FS.deleteAsync(uri, { idempotent: true }).catch(
                () => undefined,
            );
        if (downloadedUri !== uri)
            await FS.deleteAsync(downloadedUri, { idempotent: true }).catch(
                () => undefined,
            );
        busy = false;
    }
    await resumePendingInstallation();
}

function targetOptions(
    uri: string,
    release: AppRelease,
    requestId: string,
    verificationStage: "target" | "install",
): TargetOptions {
    return {
        requestId,
        verificationStage,
        outputUri: uri,
        targetSha256: release.sha256,
        targetSize: String(release.size),
        targetVersion: release.version,
        targetBuildCode: String(release.buildCode),
    };
}

export async function cancelUpdate() {
    if (useUpdateStore.getState().phase !== "downloading") return;
    pendingInstall = false;
    generation++;
    await download?.pauseAsync().catch(() => undefined);
    set({ phase: "available", progress: 0, received: 0, error: "" });
}

export function hideUpdateDialog() {
    if (isRequiredUpdate(useUpdateStore.getState().release)) {
        void exitForRequiredUpdate();
        return;
    }
    set({ visible: false });
}

export async function exitForRequiredUpdate() {
    if (!isRequiredUpdate(useUpdateStore.getState().release)) return;
    pendingExit = true;
    if (exiting || !foreground()) return;
    exiting = true;
    const previousPhase = useUpdateStore.getState().phase;
    try {
        await saveBeforeLeaving();
        pendingInstall = false;
        generation++;
        await download?.pauseAsync().catch(() => undefined);
        set({
            visible: true,
            phase: useUpdateStore.getState().fileUri ? "ready" : "available",
        });
        pendingExit = false;
        BackHandler.exitApp();
    } catch (error) {
        pendingExit = false;
        set({
            visible: true,
            phase: previousPhase,
            error: `草稿保存失败，未退出应用：${message(error)}`,
        });
    } finally {
        exiting = false;
    }
}

export async function resumePendingInstallation() {
    if (pendingInstall && foreground() && !busy && !pendingExit && !exiting)
        await installUpdate();
}

/** Mounted once with the application, not tied to the update dialog's visibility. */
export function observeUpdateLifecycle() {
    const listener = AppState.addEventListener("change", (state) => {
        if (state === "active") {
            if (isRequiredUpdate(useUpdateStore.getState().release))
                set({ visible: true });
            if (pendingExit) void exitForRequiredUpdate();
            else if (pendingInstall) void resumePendingInstallation();
            else if (!busy) void checkForUpdate();
        }
    });
    void resumePendingInstallation();
    return () => listener.remove();
}

async function saveBeforeLeaving() {
    set({ phase: "saving" });
    await flushActiveDrafts();
}

export async function installUpdate() {
    const { fileUri, release } = useUpdateStore.getState();
    if (!fileUri || !release || busy || pendingExit || exiting) return;
    const current = generation;
    pendingInstall = true;
    if (!foreground()) return;
    busy = true;
    try {
        const native = updater();
        set({ error: "" });
        if (!(await native.canInstallPackages())) {
            if (!foreground()) return;
            await saveBeforeLeaving();
            if (!foreground() || current !== generation || pendingExit) return;
            set({ phase: "permission" });
            // Resolves when the settings activity returns. No hash scans while awaiting consent.
            await IntentLauncher.startActivityAsync(
                "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
                {
                    data: `package:${ANDROID_PACKAGE}`,
                },
            );
            if (current !== generation) return;
            if (!(await native.canInstallPackages())) {
                pendingInstall = false;
                set({
                    phase: "permission",
                    visible: true,
                    error: "尚未允许安装，请开启“允许来自此来源的应用”，再继续安装。",
                });
                if (isRequiredUpdate(release)) await exitForRequiredUpdate();
                return;
            }
        }
        if (!foreground() || current !== generation || pendingExit) return;
        try {
            await nativeTask("install", (requestId) =>
                native.verifyApk(
                    targetOptions(fileUri, release, requestId, "install"),
                ),
            );
        } catch (error) {
            pendingInstall = false;
            await FS.deleteAsync(fileUri, { idempotent: true }).catch(
                () => undefined,
            );
            set({
                phase: "error",
                fileUri: null,
                visible: true,
                error: `安装前验证失败：${message(error)}`,
            });
            return;
        }
        if (!foreground() || current !== generation || pendingExit) return;
        if (!(await native.canInstallPackages())) {
            pendingInstall = false;
            set({
                phase: "permission",
                visible: true,
                error: "安装权限已关闭，请重新授权后继续。",
            });
            return;
        }
        const uri = await FS.getContentUriAsync(fileUri);
        await saveBeforeLeaving();
        if (!foreground() || current !== generation || pendingExit) return;
        pendingInstall = false;
        set({ phase: "installing" });
        const required = isRequiredUpdate(release);
        const result = await IntentLauncher.startActivityAsync(
            required
                ? "android.intent.action.INSTALL_PACKAGE"
                : "android.intent.action.VIEW",
            {
                data: uri,
                type: "application/vnd.android.package-archive",
                flags: 1,
                ...(required
                    ? { extra: { "android.intent.extra.RETURN_RESULT": true } }
                    : {}),
            },
        );
        if (current !== generation) return;
        set({ phase: "ready" });
        if (
            required &&
            result.resultCode === IntentLauncher.ResultCode.Canceled
        )
            await exitForRequiredUpdate();
        else if (
            required &&
            result.resultCode !== IntentLauncher.ResultCode.Success
        )
            set({ visible: true, error: "安装未成功，请重试。" });
    } catch (error) {
        pendingInstall = false;
        set({
            phase: "ready",
            visible: true,
            error: `未完成安装：${message(error)}`,
        });
    } finally {
        busy = false;
        if (pendingInstall) {
            set({ phase: "ready" });
            void resumePendingInstallation();
        }
    }
}
export async function openInstallSettings() {
    await installUpdate();
}
