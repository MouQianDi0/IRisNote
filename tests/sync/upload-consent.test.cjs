// Real SQLite queue/coordinator; only native network, notices and runtime UI are stubbed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    });
    module._compile(output.outputText, filename);
};

const networkListeners = new Set();
const online = { type: 'WIFI', isConnected: true, isInternetReachable: true };
let networkReads = 0;
const notices = [];
const network = {
    NetworkStateType: { UNKNOWN: 'UNKNOWN' },
    async getNetworkStateAsync() { networkReads++; return online; },
    addNetworkStateListener(listener) { networkListeners.add(listener); return { remove: () => networkListeners.delete(listener) }; },
};
const notifications = {
    captureNotificationSession: () => () => true,
    isServerConnectionBannerSuppressed: () => false,
    onServerConnectionBannerSuppressionChanged: () => () => {},
    banner: {
        update: () => false,
        show: value => { notices.push(value); },
        resolve: (_id, value) => { notices.push(value); return false; },
    },
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
    if (name === 'expo-network') return network;
    if (name === '@/core/notifications') return notifications;
    return originalLoad.call(this, name, ...args);
};
const runtimePath = require.resolve('../../src/core/sync/upload-queue.runtime.ts');
require.cache[runtimePath] = { id: runtimePath, filename: runtimePath, loaded: true,
    exports: { updateUploadQueueRuntime() {} } };
// This test process opens the build capability explicitly. Consent is granted per scenario only.
process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = '1';
const policy = require('../../src/core/cloud-storage/cloud-storage-policy.ts');
const queue = require('../../src/core/sync/upload-queue.repository.ts');
const { notifyUploadQueueChanged } = require('../../src/core/sync/upload-queue.events.ts');
const { createUploadQueue } = require('../../src/core/database/migrations/0005-create-upload-queue.ts');
const { startUploadQueueCoordinator } = require('../../src/core/sync/upload-queue-coordinator.ts');
const settled = () => new Promise(setImmediate);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
async function until(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!await predicate()) {
        if (Date.now() > deadline) assert.fail(message);
        await settled();
    }
}

async function fixture(t) {
    policy.setCloudStorageSession(1, true, false);
    networkReads = 0;
    notices.length = 0;
    const sql = new DatabaseSync(':memory:');
    const bindings = values => Array.isArray(values) ? values : [values];
    const database = {
        async run(source, values = []) {
            const result = sql.prepare(source).run(...bindings(values));
            return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
        },
        async getFirst(source, values = []) { return sql.prepare(source).get(...bindings(values)) ?? null; },
        async getAll(source, values = []) { return sql.prepare(source).all(...bindings(values)); },
    };
    await createUploadQueue.up({ execAsync: async source => sql.exec(source) });
    const coordinators = [];
    const finishPending = [];
    let enqueueSequence = 0;
    t.after(async () => {
        coordinators.forEach(coordinator => coordinator.stop());
        policy.setCloudStorageSession(null, false, false);
        finishPending.forEach(finish => finish());
        for (let i = 0; i < 10; i++) await settled();
        sql.close();
    });
    return {
        database, finishPending,
        async enqueue(key = 'note:1') {
            await queue.enqueueUploadTask(database, {
                ownerUserId: 1, kind: 'note-sync', dedupeKey: key,
                title: key, operationLabel: '新建笔记', payload: { clientId: key }, estimatedBytes: 24,
            });
            // Queue ordering uses created_at; make insertion order deterministic within one millisecond.
            await database.run('UPDATE upload_queue_tasks SET created_at = ? WHERE owner_user_id = ? AND dedupe_key = ?',
                [new Date(Date.UTC(2026, 8, 22) + enqueueSequence++).toISOString(), 1, key]);
        },
        tasks: () => queue.listUploadTasks(database, 1),
        start(overrides = {}) {
            const coordinator = startUploadQueueCoordinator({
                database, ownerUserId: 1, probe: async () => {},
                execute: async () => ({ state: 'accepted', transferredBytes: 24 }),
                openQueue() {}, openNetworkSettings: async () => {}, ...overrides,
            });
            coordinators.push(coordinator);
            return coordinator;
        },
    };
}

test('without consent a coordinator cannot start or probe and the local queue remains intact', async t => {
    const f = await fixture(t);
    await f.enqueue();
    let probes = 0, executions = 0;
    assert.throws(() => f.start({ probe: async () => { probes++; }, execute: async () => { executions++; } }), policy.isCloudStoragePermissionError);
    notifyUploadQueueChanged();
    networkListeners.forEach(listener => listener(online));
    await settled();
    assert.equal(probes, 0);
    assert.equal(executions, 0);
    assert.equal(networkReads, 0);
    assert.equal((await f.tasks())[0].status, 'queued');
    assert.equal((await f.tasks())[0].attemptCount, 0);
});

test('revoking consent aborts an outstanding probe and never begins execution', async t => {
    const f = await fixture(t);
    await f.enqueue();
    policy.setCloudStorageSession(1, true, true);
    const started = deferred(), pending = deferred();
    f.finishPending.push(() => pending.resolve());
    let probeSignal, executions = 0;
    f.start({
        probe: async signal => {
            probeSignal = signal;
            signal.addEventListener('abort', () => pending.resolve(), { once: true });
            started.resolve();
            await pending.promise;
        },
        execute: async () => { executions++; return { state: 'accepted', transferredBytes: 0 }; },
    });
    await started.promise;
    policy.setCloudStorageSession(1, true, false);
    await settled();
    assert.equal(probeSignal.aborted, true, 'consent revocation must abort a pending probe without relying on React cleanup');
    notifyUploadQueueChanged();
    networkListeners.forEach(listener => listener(online));
    await settled();
    assert.equal(executions, 0);
    assert.equal((await f.tasks())[0].status, 'queued');
});

test('revoking during a retry delay prevents every later retry and network wakeup', async t => {
    const f = await fixture(t);
    await f.enqueue();
    policy.setCloudStorageSession(1, true, true);
    let probes = 0, executions = 0;
    f.start({
        probe: async () => { probes++; },
        execute: async () => { executions++; return { state: 'retry', transferredBytes: 0, message: 'offline' }; },
    });
    await until(() => notices.some(item => item.title === '云同步失败，正在自动重试'), 'coordinator never entered its retry delay');
    policy.setCloudStorageSession(1, true, false);
    notifyUploadQueueChanged();
    networkListeners.forEach(listener => listener(online));
    await delay(1100);
    assert.equal(executions, 1);
    assert.equal(probes, 1);
    assert.equal((await f.tasks())[0].status, 'queued');
    assert.equal((await f.tasks())[0].attemptCount, 1);
});

test('a reopened coordinator waits for the old execution receipt and retains an unknown create as blocked', async t => {
    const f = await fixture(t);
    await f.enqueue('uncertain-create');
    await f.enqueue('safe-next-task');
    policy.setCloudStorageSession(1, true, true);
    const started = deferred(), oldExecution = deferred();
    f.finishPending.push(() => oldExecution.resolve({ state: 'blocked', transferredBytes: 24, message: '此前创建请求结果未知' }));
    const firstCalls = [];
    const first = f.start({ execute: async task => { firstCalls.push(task.dedupeKey); started.resolve(); return oldExecution.promise; } });
    await started.promise;
    assert.equal((await f.tasks()).find(task => task.dedupeKey === 'uncertain-create').status, 'running');
    policy.setCloudStorageSession(1, true, false);
    first.stop();
    policy.setCloudStorageSession(1, true, true);
    let reopenedProbes = 0;
    const reopenedCalls = [];
    f.start({
        probe: async () => { reopenedProbes++; },
        execute: async task => { reopenedCalls.push(task.dedupeKey); return { state: 'accepted', transferredBytes: 24 }; },
    });
    for (let i = 0; i < 10; i++) await settled();
    assert.equal(reopenedProbes, 0);
    assert.deepEqual(reopenedCalls, []);
    const stillRunning = (await f.tasks()).find(task => task.dedupeKey === 'uncertain-create');
    assert.equal(stillRunning.status, 'running');
    assert.equal(stillRunning.attemptCount, 1);
    oldExecution.resolve({ state: 'blocked', transferredBytes: 24, message: '此前创建请求结果未知' });
    await until(async () => (await f.tasks()).length === 1 && reopenedCalls.length === 1, 'new session did not resume after old bookkeeping settled');
    assert.deepEqual(firstCalls, ['uncertain-create']);
    assert.deepEqual(reopenedCalls, ['safe-next-task']);
    const [retained] = await f.tasks();
    assert.equal(retained.dedupeKey, 'uncertain-create');
    assert.equal(retained.status, 'blocked');
    assert.match(retained.lastError, /结果未知/);
    assert.equal(retained.attemptCount, 1);
});

test('revoking an active execution retains retry work without claiming the next task', async t => {
    const f = await fixture(t);
    await f.enqueue('in-flight');
    await f.enqueue('untouched-next');
    policy.setCloudStorageSession(1, true, true);
    const started = deferred(), response = deferred();
    f.finishPending.push(() => response.resolve({ state: 'suspended', transferredBytes: 0 }));
    const executed = [];
    let probes = 0;
    f.start({
        probe: async () => { probes++; },
        execute: async task => { executed.push(task.dedupeKey); started.resolve(); return response.promise; },
    });
    await started.promise;
    policy.setCloudStorageSession(1, true, false);
    response.resolve({ state: 'suspended', transferredBytes: 0 });
    await until(async () => (await f.tasks()).every(task => task.status === 'queued'), 'interrupted task was not retained as queued');
    notifyUploadQueueChanged();
    networkListeners.forEach(listener => listener(online));
    for (let i = 0; i < 10; i++) await settled();
    assert.deepEqual(executed, ['in-flight']);
    assert.equal(probes, 1);
    const tasks = await f.tasks();
    assert.equal(tasks.find(task => task.dedupeKey === 'in-flight').attemptCount, 1);
    assert.equal(tasks.find(task => task.dedupeKey === 'untouched-next').attemptCount, 0);
});
