const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  });
  module._compile(result.outputText, filename);
};
const { NotificationStore, selectBanners } = require('../../src/core/notifications/notification.store.ts');
function setup() {
  let time = 0;
  const store = new NotificationStore(() => time);
  return { store, advance(ms) { time += ms; store.tick(); }, show(id, extra = {}) { return store.show({ id, title: id, type: 'success', ...extra }); } };
}

test('critical persists while independent ordinary timers finish', () => {
  const { store, show, advance } = setup();
  show('fault', { lifetime: { mode: 'until-resolved' }, type: 'important' });
  show('saved'); show('short', { lifetime: { mode: 'timed', durationMs: 1000 } });
  const selected = selectBanners(store.getSnapshot());
  assert.deepEqual(selected.pinned.map(x => x.id), ['fault']);
  assert.equal(selected.ordinary.length, 2);
  store.setVisible(['fault', 'saved', 'short']); advance(1000);
  assert.deepEqual(store.getSnapshot().map(x => x.id), ['fault', 'saved']);
  assert.equal(store.dismiss('fault'), false);
  advance(4000); assert.deepEqual(store.getSnapshot().map(x => x.id), ['fault']);
});
test('pause reasons and background preserve remaining lifetime', () => {
  const { store, show, advance } = setup(); show('one'); store.setVisible(['one']);
  advance(1000); store.pause('one', 'touch', true); store.pause('one', 'focus', true);
  advance(10000); store.pause('one', 'touch', false); advance(10000);
  store.pause('one', 'focus', false); store.setActive(false); advance(10000);
  store.setActive(true); advance(3999); assert.equal(store.getSnapshot().length, 1);
  advance(1); assert.equal(store.getSnapshot().length, 0);
});
test('queue waits without consuming display duration; stale items expire', () => {
  const { store, show, advance } = setup(); show('queued'); advance(10000);
  store.setVisible(['queued']); advance(4999); assert.equal(store.getSnapshot().length, 1);
  advance(1); assert.equal(store.getSnapshot().length, 0);
  show('stale', { queueTtlMs: 1000 }); advance(1000); assert.equal(store.getSnapshot().length, 0);
});
test('duplicate show does not reset time; update does not reset unless explicit', () => {
  const { store, show, advance } = setup(); show('one'); store.setVisible(['one']); advance(3000);
  show('one'); store.update('one', { title: 'updated' }); advance(2000);
  assert.equal(store.getSnapshot().length, 0);
  show('one'); store.setVisible([]); store.setVisible(['one']); advance(3000);
  store.update('one', { lifetime: { mode: 'timed', durationMs: 5000 } }); advance(4999);
  assert.equal(store.getSnapshot().length, 1); advance(1); assert.equal(store.getSnapshot().length, 0);
});
test('resolve clears stale fields and restores auto-dismiss', () => {
  const { store, show, advance } = setup();
  show('fault', { lifetime: { mode: 'until-resolved' }, message: 'failed', action: { label: 'retry', onPress() {} }, progress: { mode: 'indeterminate' } });
  store.setVisible(['fault']); store.resolve('fault', { type: 'success', title: 'recovered' });
  const item = store.getSnapshot()[0];
  assert.equal(item.action, undefined); assert.equal(item.message, undefined); assert.equal(item.progress, undefined);
  assert.equal(item.lifetime.mode, 'timed'); advance(5000); assert.equal(store.getSnapshot().length, 0);
});
test('multiple critical conditions retain ordinary slot and never overflow out', () => {
  const { store, show } = setup();
  for (let n = 0; n < 6; n++) show(`fault${n}`, { lifetime: { mode: 'until-resolved' } });
  for (let n = 0; n < 30; n++) show(`normal${n}`);
  const { pinned, ordinary } = selectBanners(store.getSnapshot());
  assert.equal(pinned.length, 6); assert.equal(ordinary.length, 2);
  assert.equal(store.getSnapshot().filter(x => x.lifetime.mode !== 'until-resolved').length, 20);
});
test('snapshot remains referentially stable when ticking without a transition', () => {
  const { store, show, advance } = setup(); show('one'); const snapshot = store.getSnapshot();
  advance(100); assert.equal(store.getSnapshot(), snapshot);
});
test('session reset invalidates callbacks, preserving only application notices', () => {
  const { store, show } = setup(); const current = store.captureSession();
  show('session'); show('app', { scope: 'app' }); store.clearSession();
  assert.equal(current(), false); assert.deepEqual(store.getSnapshot().map(x => x.id), ['app']);
  assert.equal(store.update('session', { title: 'stale' }), false);
});
test('busy action cannot run twice and old success cannot dismiss resolved content', async () => {
  const { store, show } = setup(); let finish; let calls = 0;
  show('one', { action: { label: 'retry', dismissOnSuccess: true, onPress: () => { calls++; return new Promise(r => { finish = r; }); } } });
  const pending = store.invoke('one', 'action'); await store.invoke('one', 'action'); assert.equal(calls, 1);
  store.resolve('one', { type: 'success', title: 'new state' }); finish(); await pending;
  assert.equal(store.getSnapshot()[0].title, 'new state'); assert.equal(store.getSnapshot()[0].busy, false);
});
test('failed actions retain notice; successful navigation dismisses ordinary notice', async () => {
  const { store, show } = setup();
  show('one', { action: { label: 'retry', onPress: async () => { throw new Error('private details'); } } });
  await store.invoke('one', 'action'); assert.equal(store.getSnapshot()[0].busy, false);
  assert.equal(store.getSnapshot()[0].message.includes('private'), false);
  store.update('one', { bodyAction: { label: 'view', onPress() {}, dismissOnSuccess: true } });
  await store.invoke('one', 'bodyAction'); assert.equal(store.getSnapshot().length, 0);
});
test('critical action cannot auto-dismiss and sessions ignore stale action completion', async () => {
  const { store, show } = setup();
  show('critical', { lifetime: { mode: 'until-resolved' }, action: { label: 'retry', onPress() {}, dismissOnSuccess: true } });
  await store.invoke('critical', 'action'); assert.equal(store.getSnapshot().length, 1);
  let finish;
  show('action', { action: { label: 'go', onPress: () => new Promise(r => { finish = r; }), dismissOnSuccess: true } });
  const pending = store.invoke('action', 'action'); store.clearSession(); show('action'); finish(); await pending;
  assert.equal(store.getSnapshot()[0].title, 'action');
});
test('invalid timing rejected; resolving missing notice never recreates it', () => {
  const { store, show } = setup();
  assert.throws(() => show('one', { lifetime: { mode: 'timed', durationMs: -1 } }));
  assert.equal(store.resolve('missing', { title: 'late', type: 'success' }), false);
});

test('old action completion does not unlock a new action using the same ID', async () => {
  const { store, show } = setup(); let finishOld; let finishNew;
  show('same', { action: { label: 'old', onPress: () => new Promise(r => { finishOld = r; }) } });
  const old = store.invoke('same', 'action'); store.dismiss('same');
  show('same', { action: { label: 'new', onPress: () => new Promise(r => { finishNew = r; }) } });
  const next = store.invoke('same', 'action'); finishOld(); await old;
  assert.equal(store.getSnapshot()[0].busy, true);
  finishNew(); await next; assert.equal(store.getSnapshot()[0].busy, false);
});

const events = require('../../src/shared/http/connection-events.ts');
const { banner, notificationStore } = require('../../src/core/notifications/notification.service.ts');
const { startConnectionCoordinator } = require('../../src/core/notifications/server-connection-coordinator.ts');
test('connection failures aggregate, recovery resolves, stale and business failures do not create faults', () => {
  banner.clearSession(); events.resetConnectionSession();
  const coordinator = startConnectionCoordinator(async () => {});
  coordinator.setActive(false);
  const emit = outcome => events.publishConnectionEvent({ ...events.requestConnectionStamp(), outcome });
  emit('reachable'); assert.equal(notificationStore.getSnapshot().length, 0);
  emit('unavailable'); assert.equal(notificationStore.getSnapshot().length, 0);
  emit('unavailable'); assert.equal(notificationStore.getSnapshot()[0].lifetime.mode, 'until-resolved');
  const stale = events.requestConnectionStamp(); emit('success');
  events.publishConnectionEvent({ ...stale, outcome: 'unavailable' });
  assert.equal(notificationStore.getSnapshot()[0].title, '服务器连接已恢复');
  emit('unavailable'); emit('unavailable'); assert.equal(notificationStore.getSnapshot()[0].lifetime.mode, 'until-resolved');
  coordinator.stop(); banner.clearSession();
});
