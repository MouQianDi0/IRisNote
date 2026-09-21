/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const loader = pathToFileURL(path.resolve(__dirname, '../../scripts/release/env.mjs')).href;
const releaseCli = path.resolve(__dirname, '../../scripts/release/cli.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-release-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, body, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { loadReleaseEnv } from ${JSON.stringify(loader)};
     import assert from 'node:assert/strict';
     const root = ${JSON.stringify(root)};
     ${body}`], { cwd: os.tmpdir(), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('loads from explicit root, parses quoted values and preserves shell overrides', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env.release.local'), [
    'IRIS_TEST_OVERRIDE=file', 'IRIS_TEST_EMPTY=file',
    "IRIS_TEST_PATH='D:\\Signing Files\\release.jks'",
    "IRIS_TEST_SECRET='dummy # value'",
  ].join('\n'));
  const result = run(root, `
    delete process.env.IRIS_TEST_PATH; delete process.env.IRIS_TEST_SECRET;
    loadReleaseEnv(root);
    assert.equal(process.env.IRIS_TEST_OVERRIDE, 'shell');
    assert.equal(process.env.IRIS_TEST_EMPTY, '');
    assert.equal(process.env.IRIS_TEST_PATH, ${JSON.stringify('D:\\Signing Files\\release.jks')});
    assert.equal(process.env.IRIS_TEST_SECRET, 'dummy # value');
  `, { IRIS_TEST_OVERRIDE: 'shell', IRIS_TEST_EMPTY: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('missing release file is optional and application .env.local is not loaded', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.env.local'), 'IRIS_TEST_APP_ONLY=unexpected');
  const result = run(root, `
    delete process.env.IRIS_TEST_APP_ONLY;
    loadReleaseEnv(root);
    assert.equal(process.env.IRIS_TEST_APP_ONLY, undefined);
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('unreadable release configuration stops instead of silently continuing', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.env.release.local'));
  const result = run(root, "assert.throws(() => loadReleaseEnv(root), /无法读取/);");
  assert.equal(result.status, 0, result.stderr);
});

test('EAS builds receive the explicit Todo cloud-sync feature flag', () => {
  const source = fs.readFileSync(releaseCli, 'utf8');
  assert.match(source, /"EXPO_PUBLIC_TODO_CLOUD_SYNC"/);
});
