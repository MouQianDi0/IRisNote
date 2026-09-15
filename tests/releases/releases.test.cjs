const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(relative, dependencies = {}, globals = {}) {
  const file = path.resolve(__dirname, '../..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency: ${name}`); }, URL, URLSearchParams, console, process: { env: {} }, setTimeout, clearTimeout, AbortController, ...globals }, { filename: file });
  return exports;
}
const policy = load('src/features/updates/release.ts');
const payload = Buffer.from('APK test bytes');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const installed = { version: '0.9.0', buildCode: 27, sha256: 'b'.repeat(64), deltaSupported: true };
const release = { packageName: policy.ANDROID_PACKAGE, version: '1.1.0', buildCode: 28, notes: '新增测试功能', sha256: hash(payload), size: payload.length, publishedAt: new Date().toISOString(), delivery: { mode: 'full', size: payload.length, sha256: hash(payload), downloadUrl: 'https://example.com/28.apk' } };
const patchBytes = Buffer.from('HDIFF test patch');
const deltaDelivery = { mode: 'delta', algorithm: 'hdiffpatch-zlib-v1', baseBuildCode: 27, baseSha256: installed.sha256, sha256: hash(patchBytes), size: patchBytes.length, downloadUrl: 'https://example.com/28.hdiff' };

test('checks internal build number, not marketing version', () => {
  assert.equal(policy.isNewerRelease(release, '27'), true);
  assert.equal(policy.isNewerRelease(release, '28'), false);
  assert.equal(policy.isNewerRelease(release, '29'), false);
  assert.equal(policy.isNewerRelease(release, null), false);
  assert.equal(policy.parseRelease(null, release.packageName), null);
});
test('rejects wrong package, unsafe URL, malformed hash and invalid sizes', () => {
  for (const change of [{ packageName: 'com.mouqiandi.NextNote' }, { delivery: { ...release.delivery, downloadUrl: 'http://example.com/a.apk' } }, { delivery: { ...release.delivery, downloadUrl: 'https://user:password@example.com/a.apk' } }, { sha256: 'bad' }, { size: 0 }, { size: 1024 ** 3 + 1 }, { buildCode: 1.5 }]) {
    assert.throws(() => policy.parseRelease({ ...release, ...change }, release.packageName, installed));
  }
});
test('major upgrades are full, feature and patch upgrades require matching deltas', () => {
  assert.equal(policy.parseRelease(release, release.packageName, installed).delivery.mode, 'full');
  const sameMajor = { ...installed, version: '1.0.0' };
  for (const version of ['1.1.0', '1.0.1']) {
    assert.equal(policy.parseRelease({ ...release, version, delivery: deltaDelivery }, release.packageName, sameMajor).delivery.mode, 'delta');
    assert.throws(() => policy.parseRelease({ ...release, version }, release.packageName, sameMajor), /不符合版本规则/);
  }
  assert.throws(() => policy.parseRelease({ ...release, delivery: deltaDelivery }, release.packageName, installed), /不符合版本规则/);
  assert.throws(() => policy.parseRelease({ ...release, delivery: { ...deltaDelivery, baseSha256: 'c'.repeat(64) } }, release.packageName, sameMajor), /旧版本不匹配/);
});
test('tool verifies APK identity and sole certificate', async () => {
  const lib = await import('../../scripts/release/lib.mjs');
  const info = lib.parseApkInfo("package: name='com.mouqiandi.irisNote' versionCode='28' versionName='1.1.0'");
  const row = { package_name: release.packageName, build_code: 28, version: '1.1.0' };
  lib.validateApkInfo(info, row);
  assert.throws(() => lib.validateApkInfo({ ...info, buildCode: 27 }, row));
  const digest = 'a'.repeat(64);
  assert.equal(lib.certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}`), digest);
  assert.throws(() => lib.certificateDigest('unsigned'));
  assert.throws(() => lib.certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}\nSigner #2 certificate SHA-256 digest: ${digest}`));
});
test('Windows batch lookup preserves npm installation directory', { skip: process.platform !== 'win32' }, async () => {
  const { run, npm } = await import('../../scripts/release/lib.mjs');
  assert.match(run(npm, ['--version'], { capture: true }), /^\d+\.\d+\.\d+$/);
  assert.throws(() => run(npm, ['--version&echo injected'], { capture: true }), /不支持/);
});

async function sandbox(options = {}) {
  const files = new Map();
  const calls = [];
  let lastCheck = null;
  let finish;
  const servedRelease = options.delta ? { ...release, delivery: deltaDelivery } : release;
  if (options.unavailable) servedRelease.delivery = { mode: 'unavailable', reason: '缺少匹配的差量包' };
  const downloaded = options.delta ? patchBytes : payload;
  const dependencies = {
    '@react-native-async-storage/async-storage': { getItem: async () => lastCheck, setItem: async (_key, value) => { lastCheck = value; } },
    'expo-application': { applicationId: release.packageName, nativeBuildVersion: '27', nativeApplicationVersion: options.delta ? '1.0.0' : '0.9.0' },
    '../../../modules/irisnote-updater': {
      getInstalledApk: async () => ({ ...installed, version: options.delta ? '1.0.0' : '0.9.0' }),
      applyPatch: async (args) => { if (options.mergeFailure) throw Error('差量合并失败'); files.set(args.outputUri, payload); return args.outputUri; },
      verifyApk: async () => {},
    },
    'expo-file-system': { File: class { constructor(uri) { this.uri = uri; } get exists() { return files.has(this.uri); } get size() { return files.get(this.uri)?.length; } open() { let offset = 0; const bytes = files.get(this.uri); return { readBytes(n) { const data = bytes.subarray(offset, offset + n); offset += data.length; return data; }, close() {} }; } } },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/', deleteAsync: async (uri) => { files.delete(uri); }, getContentUriAsync: async (uri) => `content://${uri}`,
      createDownloadResumable(_url, uri, _options, progress) { return {
        async downloadAsync() {
          if (options.wait) return new Promise((resolve) => { finish = resolve; });
          files.set(uri, options.corrupt ? Buffer.from('bad') : downloaded);
          progress({ totalBytesWritten: downloaded.length });
          return { uri, status: 200 };
        },
        async pauseAsync() { finish?.(undefined); },
      }; },
    },
    'expo-intent-launcher': { startActivityAsync: async (...args) => { calls.push(args); } },
    'react-native': { Platform: { OS: 'android' } },
    '@noble/hashes/sha2.js': await import('@noble/hashes/sha2.js'),
    '@noble/hashes/utils.js': await import('@noble/hashes/utils.js'),
    zustand: { create(init) { let state = init(); return { getState: () => state, setState: (patch) => { state = { ...state, ...patch }; } }; } },
    '@/shared/http/client': { API_BASE_URL: 'https://example.com/api' },
    './release': policy,
  };
  const store = load('src/features/updates/update-store.ts', dependencies, { fetch: async () => ({ ok: true, json: async () => ({ release: servedRelease }) }) });
  return { store, calls, files };
}
test('successful check and download require separate explicit installation', async () => {
  const { store, calls } = await sandbox();
  await store.checkForUpdate(true);
  assert.equal(store.useUpdateStore.getState().phase, 'available');
  await store.downloadUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'ready');
  assert.equal(calls.length, 0);
  await store.installUpdate();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'android.intent.action.VIEW');
});
test('corrupt downloads are removed and never installed', async () => {
  const { store, calls, files } = await sandbox({ corrupt: true });
  await store.checkForUpdate(true); await store.downloadUpdate(); await store.installUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'error');
  assert.equal(files.size, 0); assert.equal(calls.length, 0);
});
test('cancelled download does not become ready or trigger installation', async () => {
  const { store, calls } = await sandbox({ wait: true });
  await store.checkForUpdate(true);
  const work = store.downloadUpdate();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await store.cancelUpdate(); await work;
  assert.equal(store.useUpdateStore.getState().phase, 'available');
  assert.equal(calls.length, 0);
});
test('cached APK is rechecked before installation', async () => {
  const { store, calls, files } = await sandbox();
  await store.checkForUpdate(true); await store.downloadUpdate();
  files.set(store.useUpdateStore.getState().fileUri, Buffer.alloc(payload.length));
  await store.installUpdate(); assert.equal(calls.length, 0);
  assert.match(store.useUpdateStore.getState().error, /校验失败/);
});
test('delta download merges before ready and deletes patch file', async () => {
  const { store, calls, files } = await sandbox({ delta: true });
  await store.checkForUpdate(true); await store.downloadUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'ready');
  assert.equal([...files.keys()].some((key) => key.endsWith('.hdiff')), false);
  assert.equal(calls.length, 0);
  await store.installUpdate(); assert.equal(calls.length, 1);
});
test('failed merge and missing patch never fall back to full APK', async () => {
  for (const options of [{ delta: true, mergeFailure: true }, { delta: true, unavailable: true }]) {
    const { store, files, calls } = await sandbox(options);
    await store.checkForUpdate(true); await store.downloadUpdate(); await store.installUpdate();
    assert.equal(files.size, 0); assert.equal(calls.length, 0);
    assert.notEqual(store.useUpdateStore.getState().phase, 'ready');
  }
});
