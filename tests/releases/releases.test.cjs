/* global __dirname */
const { Buffer } = require('node:buffer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(relative, dependencies = {}, globals = {}) {
  const file = path.resolve(__dirname, '../..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency: ${name}`); }, URL, URLSearchParams, console, Error, process: { env: {} }, setTimeout, clearTimeout, AbortController, ...globals }, { filename: file });
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

test('policy v2 accepts only the declared three-release window and validates the full APK', () => {
  const current = { ...installed, version: '1.0.0' };
  for (const behind of [1, 2, 3, 4, 9]) {
    const candidate = { ...release, updatePolicy: { version: 2, releasesBehind: behind, mandatory: behind >= 3 }, delivery: behind > 3 ? release.delivery : deltaDelivery };
    const parsed = policy.parseRelease(candidate, release.packageName, current);
    assert.equal(policy.isRequiredUpdate(parsed), behind >= 3);
    assert.equal(parsed.delivery.mode, behind > 3 ? 'full' : 'delta');
    assert.throws(() => policy.parseRelease({ ...candidate, delivery: behind > 3 ? deltaDelivery : release.delivery }, release.packageName, current), /不符合版本规则/);
  }
  for (const updatePolicy of [null, { version: 1, releasesBehind: 4, mandatory: true }, { version: 2, releasesBehind: 0, mandatory: false }, { version: 2, releasesBehind: 2.5, mandatory: false }, { version: 2, releasesBehind: 3, mandatory: false }, { version: 2, releasesBehind: 2, mandatory: true }])
    assert.throws(() => policy.parseRelease({ ...release, updatePolicy }, release.packageName, current), /无效更新策略/);
  assert.throws(() => policy.parseRelease({ ...release, updatePolicy: { version: 2, releasesBehind: 4, mandatory: true }, delivery: { ...release.delivery, sha256: 'c'.repeat(64) } }, release.packageName, current), /完整包信息不匹配/);
});

test('policy v3 full-package barrier requires the full APK inside the delta window without changing mandatory', () => {
  const current = { ...installed, version: '1.0.0' };
  for (const behind of [1, 2, 3, 4]) {
    const updatePolicy = { version: 3, releasesBehind: behind, mandatory: behind >= 3, fullPackageRequired: true };
    const parsed = policy.parseRelease({ ...release, updatePolicy }, release.packageName, current);
    assert.equal(parsed.delivery.mode, 'full');
    assert.equal(policy.isFullPackageRequired(parsed), true);
    assert.equal(policy.isRequiredUpdate(parsed), behind >= 3);
    assert.throws(() => policy.parseRelease({ ...release, updatePolicy, delivery: deltaDelivery }, release.packageName, current), /不符合版本规则/);
    // Without the flag, a full APK inside the window is still refused rather than trusted.
    const plain = { ...updatePolicy, fullPackageRequired: false };
    assert.equal(policy.isFullPackageRequired(policy.parseRelease({ ...release, updatePolicy: plain, delivery: behind > 3 ? release.delivery : deltaDelivery }, release.packageName, current)), false);
    if (behind <= 3) assert.throws(() => policy.parseRelease({ ...release, updatePolicy: plain }, release.packageName, current), /不符合版本规则/);
  }
  for (const fullPackageRequired of [undefined, 'true', 1, null])
    assert.throws(() => policy.parseRelease({ ...release, updatePolicy: { version: 3, releasesBehind: 1, mandatory: false, fullPackageRequired } }, release.packageName, current), /无效更新策略/);
  assert.equal(policy.isFullPackageRequired(null), false);
  assert.equal(policy.isFullPackageRequired({ ...release, updatePolicy: { version: 2, releasesBehind: 4, mandatory: true } }), false);
});
test('tool verifies APK identity and sole certificate', async () => {
  const lib = await import('../../scripts/release/lib.mjs');
  const info = lib.parseApkInfo("package: name='com.mouqiandi.irisNote' versionCode='28' versionName='1.1.0'");
  const row = { package_name: release.packageName, build_code: 28, version: '1.1.0' };
  lib.validateApkInfo(info, row);
  assert.throws(() => lib.validateApkInfo({ ...info, buildCode: 27 }, row));
  const digest = 'a'.repeat(64);
  assert.equal(lib.certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}`), digest);
  assert.equal(lib.certificateDigest(`V2 Signer: certificate DN: CN=Test\r\nV2 Signer: certificate SHA-256 digest: ${digest.toUpperCase()}\r\nV2 Signer: certificate SHA-1 digest: ignored\r\n`), digest);
  assert.equal(lib.certificateDigest(`V3 Signer: certificate SHA-256 digest: ${digest}`), digest);
  assert.throws(() => lib.certificateDigest('unsigned'));
  assert.throws(() => lib.certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}\nSigner #2 certificate SHA-256 digest: ${digest}`));
  assert.throws(() => lib.certificateDigest(`V2 Signer: certificate SHA-256 digest: ${digest}\nV2 Signer: certificate SHA-256 digest: ${'b'.repeat(64)}`));
  assert.throws(() => lib.certificateDigest(`Signer #1 certificate SHA-256 digest: ${digest}\nV2 Signer: certificate SHA-256 digest: ${digest}`));
  assert.throws(() => lib.certificateDigest(`V2 Signer: certificate SHA-256 digest: ${digest}0`));
});
test('Windows batch lookup preserves npm installation directory', { skip: process.platform !== 'win32' }, async () => {
  const { run, npm } = await import('../../scripts/release/lib.mjs');
  assert.match(run(npm, ['--version'], { capture: true }), /^\d+\.\d+\.\d+$/);
  assert.throws(() => run(npm, ['--version&echo injected'], { capture: true }), /不支持/);
});

async function sandbox(options = {}) {
  const files = options.files ?? new Map(), calls = [], scans = [], order = [], warnings = [], cacheOrder = [];
  const progressListeners = new Set(), appListeners = new Set();
  let allowed = options.permission !== false;
  const appState = { currentState: options.background ? 'background' : 'active', addEventListener(_event, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; } };
  const setPermission = (value) => { allowed = value; };
  const setAppState = (value) => { appState.currentState = value; for (const listener of appListeners) listener(value); };
  const emit = (event) => { for (const listener of progressListeners) listener(event); };
  const verify = async (args) => {
    scans.push(args.verificationStage); order.push(args.verificationStage);
    await options.onVerify?.(args, { files, emit, setAppState });
    const bytes = files.get(args.outputUri);
    if (!bytes || bytes.length !== Number(args.targetSize) || hash(bytes) !== args.targetSha256) throw Error('安装包校验失败');
    return { timingsMs: { [args.verificationStage]: 10 } };
  };
  let finish;
  const storage = options.storage ?? new Map();
  const queries = [];
  const servedRelease = { ...release, delivery: options.delta ? { ...deltaDelivery } : { ...release.delivery } };
  if (options.behind) servedRelease.updatePolicy = options.fullPackage
    ? { version: 3, releasesBehind: options.behind, mandatory: options.behind >= 3, fullPackageRequired: true }
    : { version: 2, releasesBehind: options.behind, mandatory: options.behind >= 3 };
  const installedVersion = options.delta || options.sameMajor ? '1.0.0' : '0.9.0';
  if (options.unavailable) servedRelease.delivery = { mode: 'unavailable', reason: '缺少匹配的差量包' };
  const downloaded = options.delta ? patchBytes : payload;
  const dependencies = {
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
      removeItem: async key => { storage.delete(key); },
    },
    'expo-application': { applicationId: release.packageName, nativeBuildVersion: options.buildVersion ?? '27', nativeApplicationVersion: installedVersion },
    '../../../modules/irisnote-updater': options.missingNative ? null : {
      getInstalledApk: async () => ({ ...installed, version: installedVersion }),
      applyPatch: async (args) => {
        if (options.mergeFailure) throw Error('差量合并失败');
        scans.push('base', 'patch');
        assert.equal(args.baseSha256, installed.sha256);
        const patch = files.get(args.patchUri);
        if (!patch || patch.length !== Number(args.patchSize) || hash(patch) !== args.patchSha256) throw Error('差量包校验失败');
        files.set(args.outputUri, payload);
        return { ...await verify(args), outputUri: args.outputUri };
      },
      verifyApk: verify,
      canInstallPackages: async () => { order.push('permission'); return allowed; },
      addListener(_event, listener) { progressListeners.add(listener); return { remove: () => progressListeners.delete(listener) }; },
    },
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/',
      readDirectoryAsync: async () => {
        cacheOrder.push('list-cache');
        await options.onReadCache?.();
        if (options.listFailure) throw Error('list failed');
        return [...files.keys()].map(uri => uri.replace('file:///cache/', ''));
      },
      getInfoAsync: async (uri) => {
        if (uri === options.infoFailure) throw Error('stat failed');
        return { exists: files.has(uri), isDirectory: options.directories?.has(uri) ?? false };
      },
      deleteAsync: async (uri) => {
        if (uri === options.deleteFailure) throw Error('delete failed');
        files.delete(uri);
      }, getContentUriAsync: async (uri) => 'content://' + uri,
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
    'expo-intent-launcher': { ResultCode: { Success: -1, Canceled: 0, FirstUser: 1 }, startActivityAsync: async (...args) => {
      calls.push(args); order.push(args[0]);
      if (args[0] === 'android.settings.MANAGE_UNKNOWN_APP_SOURCES') await options.onSettings?.({ setPermission, setAppState, scans });
      else await options.onInstaller?.({ setAppState });
      return { resultCode: options.resultCode ?? 0 };
    } },
    'react-native': { Platform: { OS: 'android' }, AppState: appState, BackHandler: { exitApp: () => { order.push('exit'); } } },
    '@/features/notes/services/active-draft-flush': { flushActiveDrafts: async () => { order.push('flush'); await options.onFlush?.(); } },
    zustand: { create(init) { let state = init(); return { getState: () => state, setState: (patch) => { state = { ...state, ...patch }; } }; } },
    '@/shared/http/client': { API_BASE_URL: 'https://example.com/api' },
    './release': policy,
    '@/core/storage/storage-policy': load('src/core/storage/storage-policy.ts'),
  };
  const store = load('src/features/updates/update-store.ts', dependencies, { console: { ...console, warn: (...args) => warnings.push(args) }, fetch: async url => {
    cacheOrder.push('fetch');
    queries.push(url);
    if (options.offline) throw Error('offline');
    return { ok: true, json: async () => ({ release: servedRelease }) };
  } });
  return { store, calls, files, scans, order, storage, queries, warnings, cacheOrder, servedRelease, setPermission, setAppState, emit, progressListeners, appListeners };
}

test('offline startup removes installed and older update files, preserving newer files and unrelated data', async () => {
  const removable = ['irisnote-release-1.apk', 'irisnote-release-26.hdiff', 'irisnote-release-27.apk', 'irisnote-release-27.hdiff'];
  const retained = ['irisnote-release-28.apk', 'irisnote-release-28.hdiff', 'notes.db', 'share.txt', 'irisnote-release-026.apk', 'irisnote-release-0.apk', 'irisnote-release-2.apk.bak', 'irisnote-release-9007199254740993.apk', '../irisnote-release-1.apk', 'nested/irisnote-release-1.apk', 'irisnote-release-2.apk'];
  retained.push('irisnote-release-3.apk\n');
  const files = new Map([...removable, ...retained].map(name => [`file:///cache/${name}`, payload]));
  const s = await sandbox({ files, offline: true, directories: new Set(['file:///cache/irisnote-release-2.apk']) });
  await s.store.checkForUpdate();
  assert.deepEqual([...files.keys()].sort(), retained.map(name => `file:///cache/${name}`).sort());
  assert.ok(s.cacheOrder.indexOf('list-cache') < s.cacheOrder.indexOf('fetch'));
});

test('invalid installed build numbers never authorize cache deletion', async () => {
  for (const buildVersion of ['0', '-1', '27.5', '27x', ' 27', '27\n', '9007199254740993']) {
    const s = await sandbox({ buildVersion });
    s.files.set('file:///cache/irisnote-release-1.apk', payload);
    await s.store.checkForUpdate();
    assert.equal(s.files.size, 1);
    assert.equal(s.cacheOrder.includes('list-cache'), false);
  }
});

test('concurrent and later update checks clean only once per process', async () => {
  let releaseRead;
  const wait = new Promise(resolve => { releaseRead = resolve; });
  const s = await sandbox({ onReadCache: () => wait });
  const first = s.store.checkForUpdate();
  await s.store.checkForUpdate(true);
  releaseRead();
  await first;
  await s.store.checkForUpdate(true);
  assert.equal(s.cacheOrder.filter(item => item === 'list-cache').length, 1);
});

test('cleanup failures preserve startup, continue other files and retry after restart', async () => {
  for (const failure of ['deleteFailure', 'infoFailure', 'listFailure']) {
    const firstUri = 'file:///cache/irisnote-release-1.apk';
    const secondUri = 'file:///cache/irisnote-release-2.apk';
    const files = new Map([[firstUri, payload], [secondUri, payload]]);
    const s = await sandbox({ files, [failure]: failure === 'listFailure' ? true : firstUri });
    await s.store.checkForUpdate();
    assert.equal(s.store.useUpdateStore.getState().phase, 'available');
    assert.equal(s.warnings.length, 1);
    assert.equal(files.has(firstUri), true);
    assert.equal(files.has(secondUri), failure === 'listFailure');
    const restarted = await sandbox({ files });
    await restarted.store.checkForUpdate();
    assert.equal(files.size, 0);
  }
});

test('startup queries policy v3 despite a recent check in an earlier session', async () => {
  const storage = new Map([['irisnote.release.last-check', String(Date.now())]]);
  const s = await sandbox({ storage, behind: 4 });
  await s.store.checkForUpdate();
  assert.equal(new URL(s.queries[0]).searchParams.get('updatePolicy'), '3');
  assert.equal(s.store.useUpdateStore.getState().visible, true);
  await s.store.checkForUpdate();
  assert.equal(s.queries.length, 1);
});

test('mandatory updates survive an offline restart, but not installation of another build', async () => {
  const first = await sandbox({ behind: 4 });
  await first.store.checkForUpdate();
  const next = await sandbox({ storage: first.storage, offline: true });
  await next.store.checkForUpdate();
  assert.equal(policy.isRequiredUpdate(next.store.useUpdateStore.getState().release), true);
  assert.equal(next.store.useUpdateStore.getState().visible, true);
  const record = JSON.parse(first.storage.get('irisnote.release.required-update'));
  record.installedBuildCode = 20;
  first.storage.set('irisnote.release.required-update', JSON.stringify(record));
  const upgraded = await sandbox({ storage: first.storage, offline: true });
  await upgraded.store.checkForUpdate();
  assert.equal(upgraded.store.useUpdateStore.getState().release, null);
});

test('mandatory back action saves drafts then exits without dismissing the gate', async () => {
  const s = await sandbox({ behind: 3, delta: true });
  await s.store.checkForUpdate();
  await s.store.exitForRequiredUpdate();
  assert.deepEqual(s.order, ['flush', 'exit']);
  assert.equal(s.store.useUpdateStore.getState().visible, true);
});

test('draft-save failure blocks mandatory exit and permits retry', async () => {
  let fail = true;
  const s = await sandbox({ behind: 4, onFlush: () => { if (fail) throw Error('disk failed'); } });
  await s.store.checkForUpdate();
  await s.store.exitForRequiredUpdate();
  assert.equal(s.order.includes('exit'), false);
  assert.match(s.store.useUpdateStore.getState().error, /未退出应用/);
  assert.equal(s.store.useUpdateStore.getState().visible, true);
  fail = false;
  await s.store.exitForRequiredUpdate();
  assert.equal(s.order.at(-1), 'exit');
});

test('optional update remains dismissible and never exits on back', async () => {
  const s = await sandbox({ behind: 2, delta: true });
  await s.store.checkForUpdate(); s.store.hideUpdateDialog();
  await s.store.exitForRequiredUpdate();
  assert.equal(s.store.useUpdateStore.getState().visible, false);
  assert.equal(s.order.includes('exit'), false);
});

test('mandatory installer cancellation requests a result, saves and exits; installer failure permits retry', async () => {
  for (const resultCode of [0, 1, -1]) {
    const s = await sandbox({ behind: 4, resultCode });
    await s.store.checkForUpdate(); await s.store.downloadUpdate();
    assert.equal(s.calls[0][0], 'android.intent.action.INSTALL_PACKAGE');
    assert.equal(s.calls[0][1].extra['android.intent.extra.RETURN_RESULT'], true);
    assert.equal(s.order.includes('exit'), resultCode === 0);
    if (resultCode === 0) assert.equal(s.order.at(-2), 'flush');
    if (resultCode === 1) assert.match(s.store.useUpdateStore.getState().error, /安装未成功/);
  }
});

test('mandatory permission refusal exits without reopening settings', async () => {
  const s = await sandbox({ behind: 3, delta: true, permission: false });
  await s.store.checkForUpdate(); await s.store.downloadUpdate();
  assert.equal(s.calls.length, 1);
  assert.equal(s.order.at(-1), 'exit');
  assert.equal(s.scans.includes('install'), false);
});

test('mandatory exit invalidates an in-flight merge so it cannot launch the installer afterwards', async () => {
  let finish, began;
  const started = new Promise(resolve => { began = resolve; });
  const blocked = new Promise(resolve => { finish = resolve; });
  const s = await sandbox({ behind: 3, delta: true, onVerify: async args => {
    if (args.verificationStage === 'target') { began(); await blocked; }
  } });
  await s.store.checkForUpdate();
  const work = s.store.downloadUpdate(); await started;
  await s.store.exitForRequiredUpdate(); finish(); await work;
  assert.equal(s.calls.length, 0);
  assert.equal(s.order.at(-1), 'exit');
});

test('installer cancellation before foreground defers exit until the app resumes', async () => {
  const s = await sandbox({ behind: 4, onInstaller: ({ setAppState }) => setAppState('background') });
  const stop = s.store.observeUpdateLifecycle();
  await s.store.checkForUpdate(); await s.store.downloadUpdate();
  assert.equal(s.order.includes('exit'), false);
  s.setAppState('active');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(s.order.at(-1), 'exit');
  stop();
});

test('mandatory update dialog retains one update button and disables it while processing', async () => {
  const s = await sandbox({ behind: 4 });
  await s.store.checkForUpdate();
  const element = (type, props) => ({ type, props });
  const ui = load('src/features/updates/UpdateDialog.tsx', {
    '@/shared/theme': { colors: {} }, '@/shared/ui/Overlay/app-modal': { AppModal: 'Modal' },
    'expo-application': { nativeApplicationVersion: '0.9.0' },
    'react': { useEffect() {}, useState: () => [0, () => {}] },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])),
    './update-store': { ...s.store, useUpdateStore: () => s.store.useUpdateStore.getState() }, './release': policy,
  });
  const buttons = node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(buttons);
    return [...(node.type === 'Pressable' ? [node] : []), ...buttons(node.props?.children)];
  };
  assert.equal(buttons(ui.UpdateDialog()).length, 1);
  assert.equal(buttons(ui.UpdateDialog())[0].props.disabled, false);
  for (const phase of ['downloading', 'verifying', 'merging', 'installing', 'saving']) {
    s.store.useUpdateStore.setState({ phase });
    assert.equal(buttons(ui.UpdateDialog()).length, 1);
    assert.equal(buttons(ui.UpdateDialog())[0].props.disabled, true);
  }
  assert.equal(ui.UpdateDialog().props.onRequestClose, s.store.hideUpdateDialog);
});

test('download and install performs two native target scans and flushes before installer', async () => {
  const { store, calls, scans, order } = await sandbox();
  await store.checkForUpdate(true);
  assert.equal(store.useUpdateStore.getState().phase, 'available');
  await store.downloadUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'ready');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'android.intent.action.VIEW');
  assert.deepEqual(scans, ['target', 'install']);
  assert.equal(order.at(-2), 'flush');
  assert.ok(order.indexOf('permission') < order.indexOf('install'));
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
  const { store, calls, files, setAppState } = await sandbox({ background: true });
  await store.checkForUpdate(true); await store.downloadUpdate();
  files.set(store.useUpdateStore.getState().fileUri, Buffer.alloc(payload.length));
  setAppState('active'); await store.installUpdate();
  assert.equal(calls.length, 0);
  assert.equal(files.size, 0);
  assert.match(store.useUpdateStore.getState().error, /校验失败/);
});

test('delta preparation and installation scan target only twice and remove patch', async () => {
  const { store, calls, files, scans } = await sandbox({ delta: true });
  await store.checkForUpdate(true); await store.downloadUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'ready');
  assert.equal([...files.keys()].some((key) => key.endsWith('.hdiff')), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(scans, ['base', 'patch', 'target', 'install']);
});

test('full-package barrier downloads and verifies the full APK inside the delta window', async () => {
  const { store, calls, scans } = await sandbox({ behind: 1, sameMajor: true, fullPackage: true });
  await store.checkForUpdate(true);
  const served = store.useUpdateStore.getState().release;
  assert.equal(policy.isFullPackageRequired(served), true);
  assert.equal(policy.isRequiredUpdate(served), false);
  await store.downloadUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'ready');
  assert.deepEqual(scans, ['target', 'install']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'android.intent.action.VIEW');
});

test('failed merge and missing patch never fall back to full APK', async () => {
  for (const options of [{ delta: true, mergeFailure: true }, { delta: true, unavailable: true }]) {
    const { store, files, calls } = await sandbox(options);
    await store.checkForUpdate(true); await store.downloadUpdate(); await store.installUpdate();
    assert.equal(files.size, 0); assert.equal(calls.length, 0);
    assert.notEqual(store.useUpdateStore.getState().phase, 'ready');
  }
});

test('permission refusal preserves APK and never scans for install or loops settings', async () => {
  const { store, calls, files, scans } = await sandbox({ permission: false });
  await store.checkForUpdate(true); await store.downloadUpdate(); await store.resumePendingInstallation();
  assert.equal(store.useUpdateStore.getState().phase, 'permission');
  assert.equal(files.size, 1); assert.deepEqual(scans, ['target']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'android.settings.MANAGE_UNKNOWN_APP_SOURCES');
  assert.equal(calls[0][1].data, 'package:' + policy.ANDROID_PACKAGE);
});

test('returning from authorization automatically continues once, even with resume event', async () => {
  const { store, calls, scans, order } = await sandbox({ permission: false, onSettings: async ({ setPermission, setAppState, scans }) => {
    assert.deepEqual(scans, ['target']);
    setAppState('background'); setPermission(true); setAppState('active');
  } });
  const unsubscribe = store.observeUpdateLifecycle();
  await store.checkForUpdate(true); await store.downloadUpdate();
  assert.deepEqual(calls.map(([action]) => action), ['android.settings.MANAGE_UNKNOWN_APP_SOURCES', 'android.intent.action.VIEW']);
  assert.deepEqual(scans, ['target', 'install']);
  assert.equal(order[order.indexOf('android.settings.MANAGE_UNKNOWN_APP_SOURCES') - 1], 'flush');
  unsubscribe();
});

test('settings result before foreground defers installation until active', async () => {
  const { store, calls, setAppState, scans } = await sandbox({ permission: false, onSettings: async ({ setPermission, setAppState }) => {
    setAppState('background'); setPermission(true);
  } });
  await store.checkForUpdate(true); await store.downloadUpdate();
  assert.equal(calls.length, 1); assert.deepEqual(scans, ['target']);
  setAppState('active'); await store.resumePendingInstallation();
  assert.equal(calls.length, 2); assert.deepEqual(scans, ['target', 'install']);
});

test('background completion waits for foreground; installer cancellation does not reopen', async () => {
  const { store, calls, setAppState, scans } = await sandbox({ background: true });
  await store.checkForUpdate(true); await store.downloadUpdate();
  assert.deepEqual(scans, ['target']); assert.equal(calls.length, 0);
  const unsubscribe = store.observeUpdateLifecycle();
  setAppState('active'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  setAppState('background'); setAppState('active'); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  unsubscribe();
});

test('closing dialog keeps native work running; progress is scoped and duplicate actions ignored', async () => {
  let finish, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const { store, calls, progressListeners, scans } = await sandbox({ onVerify: async (args, { emit }) => {
    if (args.verificationStage !== 'target') return;
    emit({ requestId: args.requestId, stage: 'target', processed: 50, total: 100, elapsedMs: 25 });
    emit({ requestId: 'obsolete', stage: 'merge', processed: 0, total: 0, elapsedMs: 0 });
    entered(); await gate;
  } });
  await store.checkForUpdate(true);
  const work = store.downloadUpdate(); await started;
  store.hideUpdateDialog();
  assert.equal(store.useUpdateStore.getState().visible, false);
  assert.equal(store.useUpdateStore.getState().stageProgress, 0.5);
  await store.downloadUpdate(); await store.installUpdate(); await store.cancelUpdate();
  assert.equal(store.useUpdateStore.getState().phase, 'verifying');
  finish(); await work;
  assert.equal(store.useUpdateStore.getState().visible, false);
  assert.equal(calls.length, 1); assert.equal(progressListeners.size, 0);
  assert.deepEqual(scans, ['target', 'install']);
});

test('draft flush failure prevents external screens and allows explicit retry', async () => {
  for (const permission of [true, false]) {
    let fail = true;
    const { store, calls } = await sandbox({ permission, onFlush: async () => { if (fail) throw Error('草稿保存失败'); } });
    await store.checkForUpdate(true); await store.downloadUpdate();
    assert.equal(calls.length, 0); assert.match(store.useUpdateStore.getState().error, /草稿保存失败/);
    await store.resumePendingInstallation(); assert.equal(calls.length, 0);
    fail = false; await store.installUpdate(); assert.equal(calls.length, 1);
  }
});

test('permission revoked during install verification blocks installer', async () => {
  let revoke;
  const environment = await sandbox({ onVerify: async (args) => { if (args.verificationStage === 'install') revoke(); } });
  revoke = () => environment.setPermission(false);
  await environment.store.checkForUpdate(true); await environment.store.downloadUpdate();
  assert.equal(environment.calls.length, 0);
  assert.equal(environment.store.useUpdateStore.getState().phase, 'permission');
});

test('corrupt patch and absent native module fail closed without installation', async () => {
  for (const options of [{ delta: true, corrupt: true }, { missingNative: true }]) {
    const { store, calls, files } = await sandbox(options);
    await store.checkForUpdate(true); await store.downloadUpdate();
    assert.equal(calls.length, 0); assert.equal(files.size, 0);
  }
});
