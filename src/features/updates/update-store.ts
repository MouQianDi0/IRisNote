import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { File } from "expo-file-system";
import * as FS from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { create } from "zustand";
import { API_BASE_URL } from "@/shared/http/client";
import { ANDROID_PACKAGE, isNewerRelease, parseRelease, type AppRelease } from "./release";
import NativeUpdater from "../../../modules/irisnote-updater";

type Phase = "idle" | "checking" | "available" | "latest" | "downloading" | "verifying" | "merging" | "ready" | "installing" | "error";
type State = { visible: boolean; phase: Phase; release: AppRelease | null; progress: number; received: number; error: string; fileUri: string | null };
export const useUpdateStore = create<State>(() => ({ visible: false, phase: "idle", release: null, progress: 0, received: 0, error: "", fileUri: null }));
const set = useUpdateStore.setState;
const lastCheckKey = "irisnote.release.last-check";
let busy = false;
let generation = 0;
let download: FS.DownloadResumable | null = null;
const message = (error: unknown) => error instanceof Error ? error.message : "操作失败，请稍后重试";
export function updateSupported() { return Platform.OS === "android" && Application.applicationId === ANDROID_PACKAGE && !!Application.nativeBuildVersion; }

export async function checkForUpdate(manual = false) {
  if (busy) { if (manual) set({ visible: true }); return; }
  if (!updateSupported()) {
    if (manual) set({ visible: true, phase: "error", error: "请在正式 Android 安装包中检查更新" });
    return;
  }
  const cached = useUpdateStore.getState();
  busy = true;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!manual) {
      const last = Number(await AsyncStorage.getItem(lastCheckKey));
      if (last && Date.now() - last < 6 * 60 * 60 * 1000) return;
    }
    set({ phase: "checking", error: "", ...(manual ? { visible: true } : {}) });
    await AsyncStorage.setItem(lastCheckKey, String(Date.now()));
    const endpoint = process.env.EXPO_PUBLIC_RELEASE_API_URL?.trim() || `${API_BASE_URL.replace(/\/$/, "")}/releases`;
    if (new URL(endpoint).protocol !== "https:") throw new Error("更新服务地址必须使用 HTTPS");
    timer = setTimeout(() => controller.abort(), 12000);
    const installed = NativeUpdater ? await NativeUpdater.getInstalledApk() : {
      version: Application.nativeApplicationVersion ?? "0.0.0", buildCode: Number(Application.nativeBuildVersion), sha256: "", deltaSupported: false,
    };
    const query = new URLSearchParams({ version: installed.version, buildCode: String(installed.buildCode), sha256: installed.sha256, deltaSupported: String(installed.deltaSupported) });
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/latest?${query}`, { signal: controller.signal });
    if (!response.ok) throw new Error("暂时无法检查更新，请稍后重试");
    const data = await response.json();
    const release = parseRelease(data.release, Application.applicationId!, installed);
    if (isNewerRelease(release, Application.nativeBuildVersion)) {
      const keepFile = release!.delivery.mode !== "unavailable" && !!cached.fileUri && cached.release?.buildCode === release!.buildCode && cached.release.sha256 === release!.sha256;
      set({ release, phase: keepFile ? "ready" : "available", visible: true, fileUri: keepFile ? cached.fileUri : null });
    } else set({ release: null, phase: "latest", fileUri: null });
  } catch (error) {
    set({ phase: "error", error: message(error) });
  } finally { if (timer) clearTimeout(timer); busy = false; }
}

async function verifyFile(uri: string, release: { size: number; sha256: string }, current: number) {
  const file = new File(uri);
  if (!file.exists || file.size !== release.size) throw new Error("下载文件大小不匹配，请重新下载");
  const handle = file.open();
  const hash = sha256.create();
  try {
    let read = 0;
    while (read < release.size) {
      if (current !== generation) throw new Error("下载已取消");
      const chunk = handle.readBytes(Math.min(256 * 1024, release.size - read));
      if (!chunk.length) throw new Error("安装包不完整");
      hash.update(chunk); read += chunk.length;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (bytesToHex(hash.digest()) !== release.sha256) throw new Error("安装包校验失败，请重新下载");
  } finally { handle.close(); }
}

export async function downloadUpdate() {
  const release = useUpdateStore.getState().release;
  if (busy || !release || !updateSupported() || !FS.cacheDirectory) return;
  const transfer = release.delivery;
  if (transfer.mode === "unavailable") { set({ error: transfer.reason }); return; }
  busy = true;
  const current = ++generation;
  const uri = `${FS.cacheDirectory}irisnote-release-${release.buildCode}.apk`;
  const downloadedUri = transfer.mode === "delta" ? `${FS.cacheDirectory}irisnote-release-${release.buildCode}.hdiff` : uri;
  let complete = false;
  try {
    await FS.deleteAsync(uri, { idempotent: true });
    if (downloadedUri !== uri) await FS.deleteAsync(downloadedUri, { idempotent: true });
    set({ phase: "downloading", progress: 0, received: 0, error: "", fileUri: null, visible: true });
    download = FS.createDownloadResumable(transfer.downloadUrl, downloadedUri, {}, (event) => {
      if (current !== generation) return;
      set({ received: event.totalBytesWritten, progress: Math.min(1, event.totalBytesWritten / transfer.size) });
      if (event.totalBytesWritten > transfer.size) void cancelUpdate();
    });
    const result = await download.downloadAsync();
    if (current !== generation) return;
    if (!result || result.status !== 200) throw new Error("下载失败，请重试");
    set({ phase: "verifying" });
    await verifyFile(downloadedUri, transfer, current);
    if (transfer.mode === "delta") {
      if (!NativeUpdater) throw new Error("当前安装版本不支持差量合并，请先安装基础版本");
      set({ phase: "merging" });
      await NativeUpdater.applyPatch({ ...targetOptions(uri, release), patchUri: downloadedUri, baseSha256: transfer.baseSha256, patchSha256: transfer.sha256 });
    }
    set({ phase: "verifying" });
    await verifyFile(uri, release, current);
    if (NativeUpdater) await NativeUpdater.verifyApk(targetOptions(uri, release));
    if (current !== generation) return;
    complete = true;
    set({ phase: "ready", fileUri: uri, progress: 1 });
  } catch (error) { if (current === generation) set({ phase: "error", error: message(error) }); }
  finally {
    download = null;
    if (!complete) await FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    if (downloadedUri !== uri) await FS.deleteAsync(downloadedUri, { idempotent: true }).catch(() => undefined);
    busy = false;
  }
}

function targetOptions(uri: string, release: AppRelease) {
  return { outputUri: uri, targetSha256: release.sha256, targetSize: String(release.size), targetVersion: release.version, targetBuildCode: String(release.buildCode) };
}

export async function cancelUpdate() {
  generation++;
  await download?.pauseAsync().catch(() => undefined);
  set({ phase: "available", progress: 0, received: 0, error: "" });
}
export async function installUpdate() {
  const { fileUri, release } = useUpdateStore.getState();
  if (!fileUri || !release || busy) return;
  busy = true;
  try {
    set({ phase: "verifying", error: "" });
    await verifyFile(fileUri, release, generation);
    if (NativeUpdater) await NativeUpdater.verifyApk(targetOptions(fileUri, release));
    const uri = await FS.getContentUriAsync(fileUri);
    set({ phase: "installing" });
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: uri, type: "application/vnd.android.package-archive", flags: 1,
    });
    set({ phase: "ready" });
  } catch (error) { set({ phase: "ready", error: `未完成安装：${message(error)}。可检查安装权限后重试。` }); }
  finally { busy = false; }
}
export async function openInstallSettings() {
  try {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", { data: `package:${ANDROID_PACKAGE}` });
  } catch { set({ error: "无法打开安装权限设置，请在系统设置中允许 IRisNote 安装未知应用" }); }
}
