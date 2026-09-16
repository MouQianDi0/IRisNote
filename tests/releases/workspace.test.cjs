const test = require('node:test');
const assert = require('node:assert/strict');

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
