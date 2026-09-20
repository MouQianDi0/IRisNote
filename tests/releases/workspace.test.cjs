const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function fixture(t) {
  const parent = process.platform === 'win32' ? path.parse(process.cwd()).root : os.tmpdir();
  const base = await fs.mkdtemp(path.join(parent, 'iris-ws-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo');
  const buildRoot = path.join(base, 'builds');
  await fs.mkdir(root);
  return { base, root, buildRoot, environment: { IRIS_BUILD_ROOT: buildRoot },
    ...await import('../../scripts/release/workspace.mjs') };
}

test('temporary build cleanup preserves saved APK, other builds and reusable cache', async t => {
  const f = await fixture(t);
  const other = await f.acquireTemporaryReleaseWorkspace(f.root, f.environment);
  const cache = await f.acquireReleaseWorkspace(f.root, f.environment);
  await fs.writeFile(path.join(other.workspace, 'keep'), 'other build');
  await fs.writeFile(path.join(cache.workspace, 'keep'), 'native cache');
  const saved = path.join(f.root, 'dist', 'releases', 'version', 'app.apk');
  let temporary;
  const result = await f.withReleaseWorkspace(f.root, { reusable: false, environment: f.environment }, async workspace => {
    temporary = workspace;
    const apk = path.join(workspace, 'app.apk');
    await fs.writeFile(apk, 'signed APK');
    await fs.mkdir(path.dirname(saved), { recursive: true });
    await fs.copyFile(apk, saved);
    return 'uploaded';
  });
  assert.equal(result, 'uploaded');
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
  assert.equal(await fs.readFile(saved, 'utf8'), 'signed APK');
  assert.equal(await fs.readFile(path.join(other.workspace, 'keep'), 'utf8'), 'other build');
  assert.equal(await fs.readFile(path.join(cache.workspace, 'keep'), 'utf8'), 'native cache');
  await other.release();
  await other.release();
  await cache.release();
});

test('temporary workspace is cleaned on early return and asynchronous build failure', async t => {
  const f = await fixture(t);
  let early;
  await f.withReleaseWorkspace(f.root, { reusable: false, environment: f.environment }, async workspace => {
    early = workspace;
    return;
  });
  await assert.rejects(fs.stat(early), { code: 'ENOENT' });
  let failed;
  const error = new Error('build failed before APK was saved');
  await assert.rejects(f.withReleaseWorkspace(f.root, { reusable: false, environment: f.environment }, async workspace => {
    failed = workspace;
    await fs.writeFile(path.join(workspace, 'partial'), 'incomplete build');
    throw error;
  }), e => e === error);
  await assert.rejects(fs.stat(failed), { code: 'ENOENT' });
});

test('upload failure cleans temporary files but keeps the APK available for retry', async t => {
  const f = await fixture(t);
  const saved = path.join(f.root, 'app.apk');
  const error = new Error('upload failed');
  let temporary;
  await assert.rejects(f.withReleaseWorkspace(f.root, { reusable: false, environment: f.environment }, async workspace => {
    temporary = workspace;
    const apk = path.join(workspace, 'app.apk');
    await fs.writeFile(apk, 'verified APK');
    await fs.copyFile(apk, saved);
    throw error;
  }), e => e === error);
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
  assert.equal(await fs.readFile(saved, 'utf8'), 'verified APK');
});

test('default builds reuse one directory and release its lock after failure', async t => {
  const f = await fixture(t);
  let first;
  await f.withReleaseWorkspace(f.root, { reusable: true, environment: f.environment }, async workspace => {
    first = workspace;
    await fs.writeFile(path.join(workspace, 'keep'), 'cache');
    await assert.rejects(f.acquireReleaseWorkspace(f.root, f.environment), /已锁定/);
  });
  await assert.rejects(f.withReleaseWorkspace(f.root, { reusable: true, environment: f.environment }, async workspace => {
    assert.equal(workspace, first);
    assert.equal(await fs.readFile(path.join(workspace, 'keep'), 'utf8'), 'cache');
    throw new Error('build failed');
  }), /build failed/);
  await assert.rejects(fs.stat(path.join(first, 'build.lock')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(f.buildRoot), [path.basename(first)]);
});

test('cleanup refuses replaced workspace directory and junction to external data', async t => {
  const f = await fixture(t);
  const outside = path.join(f.base, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'external data');
  for (const junction of [false, true]) {
    const lease = await f.acquireTemporaryReleaseWorkspace(f.root, f.environment);
    await fs.rename(lease.workspace, lease.workspace + '-original');
    if (junction) await fs.symlink(outside, lease.workspace, 'junction');
    else await fs.mkdir(lease.workspace);
    await assert.rejects(lease.release(), /拒绝清理/);
    assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'external data');
    assert.ok(await fs.lstat(lease.workspace));
  }
});

test('cleanup refuses a redirected parent and does not follow nested junctions', async t => {
  const f = await fixture(t);
  const outside = path.join(f.base, 'outside');
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'keep'), 'external data');
  const safe = await f.acquireTemporaryReleaseWorkspace(f.root, f.environment);
  await fs.symlink(outside, path.join(safe.workspace, 'link'), 'junction');
  await safe.release();
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'external data');
  const lease = await f.acquireTemporaryReleaseWorkspace(f.root, f.environment);
  await fs.rename(f.buildRoot, f.buildRoot + '-original');
  await fs.symlink(outside, f.buildRoot, 'junction');
  await assert.rejects(lease.release(), /父路径已改变/);
  assert.equal(await fs.readFile(path.join(outside, 'keep'), 'utf8'), 'external data');
});

test('cleanup warning includes residual path and preserves original result or error', async t => {
  const f = await fixture(t);
  const warnings = t.mock.method(console, 'warn', () => {});
  const error = new Error('original upload error');
  for (const fail of [false, true]) {
    let residual;
    const operation = f.withReleaseWorkspace(f.root, { reusable: false, environment: f.environment }, async workspace => {
      residual = workspace;
      await fs.rename(workspace, workspace + '-original');
      await fs.mkdir(workspace);
      if (fail) throw error;
      return 'already uploaded';
    });
    if (fail) await assert.rejects(operation, e => e === error);
    else assert.equal(await operation, 'already uploaded');
    const message = warnings.mock.calls.at(-1).arguments[0];
    assert.ok(message.includes(residual));
    assert.match(message, /清理失败/);
    assert.ok(await fs.stat(residual));
  }
});

test('Windows build root is short, configurable and separate from user Temp', async () => {
  const { releaseBuildRoot } = await import('../../scripts/release/workspace.mjs');
  assert.equal(releaseBuildRoot('D:\\Note project\\IRisNote', {}, 'win32'), 'D:\\iris-build');
  assert.equal(releaseBuildRoot('D:\\Note project\\IRisNote', { IRIS_BUILD_ROOT: 'E:\\builds' }, 'win32'), 'E:\\builds');
  for (const bad of ['relative', 'D:\\long path', 'D:\\中文', 'D:\\' + 'a'.repeat(45), '\\\\server\\build']) {
    assert.throws(() => releaseBuildRoot('D:\\repo', { IRIS_BUILD_ROOT: bad }, 'win32'));
  }
  assert.equal(releaseBuildRoot('/repo', { IRIS_BUILD_ROOT: '/tmp/my builds' }, 'linux'), '/tmp/my builds');
});

test('Ninja compatibility rejects old versions and other platforms retain their toolchain', async () => {
  const { validateNinjaVersion, releaseNinja } = await import('../../scripts/release/ninja.mjs');
  for (const version of ['1.10.2', '1.11.1', 'invalid']) assert.throws(() => validateNinjaVersion(version));
  for (const version of ['1.12.0', '1.12.1', '1.13.0']) assert.doesNotThrow(() => validateNinjaVersion(version));
  assert.equal(await releaseNinja('/repo', {}, 'linux'), null);
});
