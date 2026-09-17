const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function fixture(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'iris-cache-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const snapshot = path.join(workspace, 'incoming');
  const write = async (root, name, value) => {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  };
  await write(snapshot, 'package.json', JSON.stringify({ scripts: { check: 'node check.js' } }));
  await write(snapshot, 'package-lock.json', '{}');
  await write(snapshot, 'src/中文.ts', 'first');
  await write(snapshot, 'app.config.ts', 'config');
  const api = await import('../../scripts/release/cache.mjs');
  const env = { IRIS_BUILD_NUMBER: '1', IRIS_BUILD_VERSION: '0.1.0', EXPO_PUBLIC_BASE_URL: 'https://example.invalid' };
  const prepare = () => api.prepareCachedSource(workspace, snapshot, env, '11.0.0');
  const seed = async () => {
    const cache = await prepare();
    await write(cache.checkout, 'node_modules/.package-lock.json', 'installed');
    await write(cache.checkout, 'android/app/build/output', 'native');
    await cache.complete();
    return cache;
  };
  return { workspace, snapshot, write, env, prepare, seed, ...api };
}

test('business code and release number changes reuse dependencies while deleting stale source', async t => {
  const f = await fixture(t);
  const first = await f.seed();
  const before = await fs.stat(path.join(first.checkout, 'app.config.ts'));
  await f.write(first.checkout, 'src/removed.ts', 'stale');
  await f.write(first.checkout, '.env.local', 'must not survive');
  await f.write(f.snapshot, 'src/中文.ts', 'second');
  f.env.IRIS_BUILD_NUMBER = '2'; f.env.IRIS_BUILD_VERSION = '0.1.1';
  const second = await f.prepare();
  assert.equal(second.reuse, true);
  assert.equal(second.checkout, first.checkout);
  assert.equal(await fs.readFile(path.join(second.checkout, 'src/中文.ts'), 'utf8'), 'second');
  await assert.rejects(fs.stat(path.join(second.checkout, 'src/removed.ts')), { code: 'ENOENT' });
  await assert.rejects(fs.stat(path.join(second.checkout, '.env.local')), { code: 'ENOENT' });
  assert.equal((await fs.stat(path.join(second.checkout, 'app.config.ts'))).mtimeMs, before.mtimeMs);
  assert.equal(await fs.readFile(path.join(second.checkout, 'android/app/build/output'), 'utf8'), 'native');
});

for (const change of ['lock', 'plugin', 'local module', 'environment', 'npm version', 'lifecycle', 'damaged marker']) {
  test(`${change} invalidates dependency and native caches`, async t => {
    const f = await fixture(t); const first = await f.seed();
    if (change === 'lock') await f.write(f.snapshot, 'package-lock.json', '{"changed":true}');
    if (change === 'plugin') await f.write(f.snapshot, 'plugins/native.js', 'changed');
    if (change === 'local module') await f.write(f.snapshot, 'modules/example/index.ts', 'changed');
    if (change === 'environment') f.env.EXPO_PUBLIC_BASE_URL = 'https://other.invalid';
    if (change === 'lifecycle') await f.write(f.snapshot, 'package.json', '{"scripts":{"prepare":"node src/install.js"}}');
    if (change === 'damaged marker') await f.write(first.checkout, 'node_modules/.package-lock.json', 'corrupt');
    const next = change === 'npm version'
      ? await f.prepareCachedSource(f.workspace, f.snapshot, f.env, '12.0.0') : await f.prepare();
    assert.equal(next.reuse, false);
    await assert.rejects(fs.stat(path.join(next.checkout, 'android/app/build/output')), { code: 'ENOENT' });
  });
}

test('an incomplete build is not reused on retry', async t => {
  const f = await fixture(t); await f.seed();
  assert.equal((await f.prepare()).reuse, true);
  assert.equal((await f.prepare()).reuse, false);
});

test('local dependencies include src in the fingerprint', async t => {
  const f = await fixture(t);
  await f.write(f.snapshot, 'package.json', '{"dependencies":{"local":"file:src/local"}}');
  await f.seed();
  await f.write(f.snapshot, 'src/local/index.js', 'changed');
  assert.equal((await f.prepare()).reuse, false);
});

test('corrupt cache state is rebuilt instead of trusted', async t => {
  const f = await fixture(t); await f.seed();
  await f.write(f.workspace, 'ready.json', 'incomplete-json');
  assert.equal((await f.prepare()).reuse, false);
});

test('missing npm install marker prevents reuse without failing a finished build', async t => {
  const f = await fixture(t); const first = await f.prepare();
  await first.complete();
  assert.equal((await f.prepare()).reuse, false);
});

test('snapshot reset removes a junction without touching its external target', async t => {
  const f = await fixture(t);
  const external = path.join(f.workspace, 'external');
  await f.write(external, 'keep', 'keep');
  await fs.rm(f.snapshot, { recursive: true });
  await fs.symlink(external, f.snapshot, 'junction');
  await f.resetBuildSnapshot(f.workspace);
  assert.equal((await fs.lstat(f.snapshot)).isSymbolicLink(), false);
  assert.equal(await fs.readFile(path.join(external, 'keep'), 'utf8'), 'keep');
});

test('an unchanged root install lifecycle is run again even when the fingerprint matches', async t => {
  const f = await fixture(t);
  await f.write(f.snapshot, 'package.json', '{"scripts":{"postinstall":"node src/setup.js"}}');
  await f.seed();
  assert.equal((await f.prepare()).reuse, false);
});

test('prebuild starts clean at final path, removes old native sources and keeps build outputs', async t => {
  const f = await fixture(t); const cache = await f.seed();
  await f.write(cache.checkout, 'android/old-plugin.java', 'removed plugin');
  await f.write(cache.checkout, 'android/app/build.gradle', 'unchanged');
  const before = await fs.stat(path.join(cache.checkout, 'android/app/build.gradle'));
  await f.regenerateAndroid(f.workspace, cache.checkout, async () => {
    await assert.rejects(fs.stat(path.join(cache.checkout, 'android')), { code: 'ENOENT' });
    await f.write(cache.checkout, 'android/app/build.gradle', 'unchanged');
    await f.write(cache.checkout, 'android/app/src/AndroidManifest.xml', 'new version');
  });
  await assert.rejects(fs.stat(path.join(cache.checkout, 'android/old-plugin.java')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(cache.checkout, 'android/app/build/output'), 'utf8'), 'native');
  assert.equal((await fs.stat(path.join(cache.checkout, 'android/app/build.gradle'))).mtimeMs, before.mtimeMs);
  assert.equal(await fs.readFile(path.join(cache.checkout, 'android/app/src/AndroidManifest.xml'), 'utf8'), 'new version');
});

test('file/directory replacements are reconciled', async t => {
  const f = await fixture(t); const cache = await f.seed();
  await f.write(cache.checkout, 'src/becomes-file/old', 'old');
  await f.write(cache.checkout, 'src/becomes-directory', 'old');
  await f.write(f.snapshot, 'src/becomes-file', 'new');
  await f.write(f.snapshot, 'src/becomes-directory/new', 'new');
  const next = await f.prepare();
  assert.equal(await fs.readFile(path.join(next.checkout, 'src/becomes-file'), 'utf8'), 'new');
  assert.equal(await fs.readFile(path.join(next.checkout, 'src/becomes-directory/new'), 'utf8'), 'new');
});

test('junction in source is refused without modifying its external target', async t => {
  const f = await fixture(t); const cache = await f.seed();
  const outside = path.join(f.workspace, 'external');
  await f.write(outside, 'keep', 'keep');
  await fs.symlink(outside, path.join(cache.checkout, 'src/link'), 'junction');
  await assert.rejects(f.prepare(), /链接/);
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'keep');
});

test('same project has an exclusive lease, another project uses a separate workspace', async t => {
  const { acquireReleaseWorkspace } = await import('../../scripts/release/workspace.mjs');
  // Windows release roots must be short ASCII paths, unlike the user's Temp path.
  const drive = path.parse(process.cwd()).root;
  const base = await fs.mkdtemp(path.join(process.platform === 'win32' ? drive : os.tmpdir(), 'iris-test-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const a = path.join(base, 'a'), b = path.join(base, 'b');
  await fs.mkdir(a); await fs.mkdir(b);
  const env = { IRIS_BUILD_ROOT: base };
  const first = await acquireReleaseWorkspace(a, env);
  try {
    await assert.rejects(acquireReleaseWorkspace(a, env), /已锁定/);
    const other = await acquireReleaseWorkspace(b, env);
    assert.notEqual(other.workspace, first.workspace); await other.release();
  } finally { await first.release(); }
  const again = await acquireReleaseWorkspace(a, env);
  assert.equal(again.workspace, first.workspace); await again.release();
});
