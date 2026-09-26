/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function registry() {
  const filename = path.resolve(__dirname, '../../src/features/notes/services/active-draft-flush.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports }, { filename });
  return exports;
}

test('installation barrier waits for every active editor write', async () => {
  const { registerActiveDraftFlush, flushActiveDrafts } = registry();
  let finish, completed = false, second = false;
  registerActiveDraftFlush(() => new Promise((resolve) => { finish = resolve; }));
  registerActiveDraftFlush(async () => { second = true; });
  const work = flushActiveDrafts().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(second, true); assert.equal(completed, false);
  finish(); await work;
  assert.equal(completed, true);
});

test('write failure blocks installation; retry awaits a successful write', async () => {
  const { registerActiveDraftFlush, flushActiveDrafts } = registry();
  let broken = true;
  registerActiveDraftFlush(async () => { if (broken) throw Error('disk full'); });
  await assert.rejects(flushActiveDrafts(), /disk full/);
  broken = false; await flushActiveDrafts();
});

test('unmounting editor keeps its pending final write inside the barrier', async () => {
  const { registerActiveDraftFlush, flushActiveDrafts } = registry();
  let finish, writes = 0, completed = false;
  const unregister = registerActiveDraftFlush(() => {
    writes++;
    return new Promise((resolve) => { finish = resolve; });
  });
  unregister(); unregister();
  const work = flushActiveDrafts().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false); assert.equal(writes, 1);
  finish(); await work; await flushActiveDrafts();
  assert.equal(writes, 1);
});

test('failed final write is reported even if it settled before install request', async () => {
  const { registerActiveDraftFlush, flushActiveDrafts } = registry();
  let broken = true, saved = false;
  registerActiveDraftFlush(async () => { if (broken) throw Error('disk full'); saved = true; })();
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(flushActiveDrafts(), /disk full/);
  await assert.rejects(flushActiveDrafts(), /disk full/);
  broken = false;
  await flushActiveDrafts();
  assert.equal(saved, true);
});
