import { mkdir, mkdtemp, readFile, writeFile, chmod, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, fileSha256 } from "./lib.mjs";

export const DELTA_VERSION = "5.1.3";
export const DELTA_ALGORITHM = "hdiffpatch-zlib-v1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = {
  'win32-x64': ['windows64', '77f141386e5d8f785c1c846e10fbbc19b6c05aa00e3f59cc44670fb3f0e2ae94'],
  'win32-arm64': ['windows_arm64', '92a627a55ac1b9d54ca258a4e99919c09b9ee3c3674c494196a09a28f308eed7'],
  'linux-x64': ['linux64', '628963bf2ee9108a97260fa5eef44acd9ec94369b76090a957c9182b3abbb558'],
  'linux-arm64': ['linux_arm64', '03e404e16d06479deaba645a09ed5c06636778b083b82bc7fc932ba34425430b'],
  'darwin-x64': ['macos', '9e9d7318db1ea5607dbdde41e6614cfe5b73c589034b38ee91a79f4ca80a940c'],
  'darwin-arm64': ['macos', '9e9d7318db1ea5607dbdde41e6614cfe5b73c589034b38ee91a79f4ca80a940c'],
};
export function deltaTools() {
  const entry = assets[`${process.platform}-${process.arch}`];
  const directory = path.join(root, '.expo', `hdiffpatch-v${DELTA_VERSION}`, entry?.[0] ?? 'unsupported');
  const ext = process.platform === 'win32' ? '.exe' : '';
  const diff = process.env.IRIS_HDIFFZ_PATH || path.join(directory, `hdiffz${ext}`);
  const patch = process.env.IRIS_HPATCHZ_PATH || path.join(directory, `hpatchz${ext}`);
  for (const executable of [diff, patch]) {
    if (!run(executable, ['-v'], { capture: true }).includes(` v${DELTA_VERSION}`)) throw new Error(`差量工具必须使用 ${DELTA_VERSION}`);
  }
  return { diff, patch };
}
export async function setupDeltaTools() {
  const entry = assets[`${process.platform}-${process.arch}`];
  if (!entry) throw new Error('当前平台请手动配置固定版本的 IRIS_HDIFFZ_PATH / IRIS_HPATCHZ_PATH');
  const directory = path.join(root, '.expo', `hdiffpatch-v${DELTA_VERSION}`);
  await mkdir(directory, { recursive: true });
  const archive = path.join(directory, `download-${entry[0]}.zip`);
  const response = await fetch(`https://github.com/sisong/HDiffPatch/releases/download/v${DELTA_VERSION}/hdiffpatch_v${DELTA_VERSION}_bin_${entry[0]}.zip`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`差量工具下载失败：${response.status}`);
  await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
  if (await fileSha256(archive) !== entry[1]) throw new Error('差量工具归档摘要不匹配，停止解压');
  run('tar', ['-xf', archive, '-C', directory]);
  if (process.platform !== 'win32') {
    for (const name of ['hdiffz', 'hpatchz']) await chmod(path.join(directory, entry[0], name), 0o755);
  }
  console.log(deltaTools());
}
export async function generatePatch(oldApk, targetApk, output, expectedBase, expectedTarget) {
  const tools = deltaTools();
  if (await fileSha256(oldApk) !== expectedBase || await fileSha256(targetApk) !== expectedTarget) throw new Error('生成差量包前 APK 摘要校验失败');
  const scratch = await mkdtemp(path.join(path.dirname(output), 'delta-verify-'));
  const reconstructed = path.join(scratch, 'reconstructed.apk');
  try {
    run(tools.diff, ['-c-zlib', '-s-64', oldApk, targetApk, output]);
    run(tools.patch, [oldApk, output, reconstructed]);
    if (await fileSha256(reconstructed) !== expectedTarget) throw new Error('差量合并结果与目标 APK 不一致');
    return { algorithm: DELTA_ALGORITHM, baseSha256: expectedBase, targetSha256: expectedTarget, sha256: await fileSha256(output), size: (await stat(output)).size };
  } finally { await rm(reconstructed, { force: true }); }
}
export async function verifyNativeUpdater(projectRoot = root) {
  const directory = path.join(projectRoot, 'modules/irisnote-updater');
  const manifest = JSON.parse(await readFile(path.join(directory, 'native-files.sha256.json'), 'utf8'));
  for (const [relative, expected] of Object.entries(manifest)) {
    if (await fileSha256(path.join(directory, relative)) !== expected) throw new Error(`差量原生库摘要不匹配：${relative}`);
  }
}
