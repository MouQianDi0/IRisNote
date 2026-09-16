const { Buffer } = require('node:buffer');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

test('release archive excludes audited material while preserving committed Unicode inputs and checks', async t => {
  const { exportBuildSource } = await import('../../scripts/release/source.mjs');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-source-test-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const repo = path.join(work, 'repository');
  const checkout = path.join(work, 'source');
  fs.mkdirSync(repo); fs.mkdirSync(checkout);
  const kept = ['package.json', 'package-lock.json', 'LICENSE', '.gitignore', 'app.config.ts',
    'src/中文 功能.ts', 'assets/中文 图片.bin', 'modules/example/LICENSE.md',
    'scripts/check.cjs', 'tests/fixture.md', 'plugins/example.js', 'new-input/config.json',
    `assets/${'中文长名称'.repeat(22)}.txt`];
  const removed = ['docs/开发说明.md', 'releases/notes-1.0.0.txt', 'README.md',
    '.codegraph/index.db', '.claude/settings.json', '.vscode/settings.json', '待办事项.md', 'debug.log'];
  for (const name of [...kept, ...removed]) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), Buffer.from(`committed ${name}\0中文\n`));
  }
  // A valid empty ignore file avoids fixture text acting as ignore patterns.
  fs.writeFileSync(path.join(repo, '.gitignore'), '');
  const git = args => execFileSync('git', args, { cwd: repo, windowsHide: true });
  git(['init', '-q']); git(['add', '.']);
  git(['-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgSign=false', 'commit', '-qm', 'fixture']);
  const expected = new Map(kept.map(name => [name, fs.readFileSync(path.join(repo, name))]));
  fs.writeFileSync(path.join(repo, 'src/中文 功能.ts'), 'uncommitted change');
  fs.writeFileSync(path.join(repo, '.env.release.local'), 'test-only secret');
  const result = exportBuildSource(repo, 'HEAD', work, checkout);
  assert.ok(result.excluded.includes('docs'));
  for (const name of removed) assert.equal(fs.existsSync(path.join(checkout, name)), false, name);
  for (const [name, bytes] of expected) assert.deepEqual(fs.readFileSync(path.join(checkout, name)), bytes, name);
  assert.equal(fs.existsSync(path.join(checkout, '.env.release.local')), false);
});
