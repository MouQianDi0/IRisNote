// node --test tests/sync/note-write-coalescing.test.cjs
// 笔记星标/置顶写入合并与写入后同步防抖；网络与同步服务均为假实现。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return resolve.call(
        this,
        name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name,
        ...args,
    );
};
require.extensions[".ts"] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
    });
    module._compile(result.outputText, filename);
};

const {
    createNoteStatusWriter,
    NOTE_STATUS_DEBOUNCE_MS,
} = require("../../src/features/notes/services/note-status-writer.ts");
const cloudPolicy = require("../../src/core/cloud-storage/cloud-storage-policy.ts");
const events = require("../../src/features/notes/notes.events.ts");

const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/** 模拟一条笔记的界面值：每次 toggle 与 hook 一样先乐观翻转再交给调度器。 */
function harness(t, send = async () => {}) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const sent = [];
    const failures = [];
    const ui = { value: false, session: true, access: () => {} };
    const writer = createNoteStatusWriter({
        async send(serverId, value) {
            assert.equal(serverId, 100);
            sent.push(value);
            return send(value);
        },
    });
    const toggle = () => {
        const confirmed = ui.value;
        ui.value = !ui.value;
        writer.request({
            owner: 1,
            noteId: 10,
            serverId: 100,
            confirmed,
            desired: ui.value,
            checkAccess: () => ui.access(),
            isCurrentSession: () => ui.session,
            onFailed(value) {
                failures.push(value);
                ui.value = value;
            },
        });
    };
    const tick = async (ms) => {
        t.mock.timers.tick(ms);
        await settle();
    };
    return { sent, failures, ui, toggle, tick };
}

test("status writer debounces with the same window as todos", () => {
    assert.equal(NOTE_STATUS_DEBOUNCE_MS, 1000);
});

test("rapid toggles inside the window send only the final value", async (t) => {
    const h = harness(t);
    h.toggle();
    await h.tick(300);
    h.toggle();
    await h.tick(300);
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS - 1);
    assert.deepEqual(h.sent, []);
    await h.tick(1);
    assert.deepEqual(h.sent, [true]);
    assert.deepEqual(h.failures, []);
});

test("toggling back to the confirmed value sends nothing", async (t) => {
    const h = harness(t);
    h.toggle();
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS * 3);
    assert.deepEqual(h.sent, []);
    assert.equal(h.ui.value, false);
});

test("a toggle during an in-flight write is sent after it, one request at a time", async (t) => {
    const first = deferred();
    const replies = [first.promise, Promise.resolve()];
    const h = harness(t, () => replies.shift());
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.sent, [true]);
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.sent, [true], "must not overlap the in-flight write");
    first.resolve();
    await h.tick(0);
    assert.deepEqual(h.sent, [true, false]);
    assert.deepEqual(h.failures, []);
    assert.equal(h.ui.value, false);
});

test("a write that ends on the value just confirmed does not resend", async (t) => {
    const first = deferred();
    const h = harness(t, () => first.promise);
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    h.toggle();
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    first.resolve();
    await h.tick(0);
    assert.deepEqual(h.sent, [true]);
    assert.equal(h.ui.value, true);
});

test("a failure with no newer toggle rolls back to the confirmed value", async (t) => {
    const h = harness(t, async () => {
        throw new Error("offline");
    });
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.sent, [true]);
    assert.deepEqual(h.failures, [false]);
    assert.equal(h.ui.value, false);
});

test("an older failure never overwrites a newer toggle; the latest value is resent", async (t) => {
    const first = deferred();
    const replies = [first.promise, Promise.resolve()];
    const h = harness(t, () => replies.shift());
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    h.toggle();
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    first.reject(new Error("timeout"));
    await h.tick(0);
    assert.deepEqual(h.failures, []);
    assert.deepEqual(h.sent, [true, true]);
    assert.equal(h.ui.value, true);
});

test("revoked cloud access fails before any request is dispatched", async (t) => {
    const h = harness(t);
    h.toggle();
    h.ui.access = () => {
        throw new Error("云存储授权或账号已变化，请重新操作");
    };
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.sent, []);
    assert.deepEqual(h.failures, [false]);
});

test("a stale session drops the rollback and later toggles start fresh", async (t) => {
    let fail = true;
    const h = harness(t, async () => {
        if (fail) throw new Error("offline");
    });
    h.toggle();
    h.ui.session = false;
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.failures, []);
    assert.equal(h.ui.value, true, "stale session must not touch the UI");
    fail = false;
    h.ui.session = true;
    h.ui.value = false;
    h.toggle();
    await h.tick(NOTE_STATUS_DEBOUNCE_MS);
    assert.deepEqual(h.sent, [true, true]);
    assert.deepEqual(h.failures, []);
});

function coordinatorWithFakeSync(calls) {
    const filename = path.join(
        root,
        "src/features/notes/services/note-sync-coordinator.ts",
    );
    const localRequire = Module.createRequire(filename);
    const stubs = {
        "../api/notes-sync.api": { notesSyncTransport: {} },
        "../data/note-local.repository": { getLocalNotes: async () => [] },
        "../notes.cache": {
            removeCachedNoteById() {},
            setCachedNote() {},
        },
        "./note-sync.service": {
            runNoteSync: async () => {
                calls.sync++;
                return { notes: [] };
            },
        },
        "./note-trash.service": { synchronizeNoteTrash: async () => {} },
    };
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    new Function("require", "module", "exports", code)(
        (name) => stubs[name] ?? localRequire(name),
        mod,
        mod.exports,
    );
    return mod.exports;
}

test("a burst of note writes triggers one sync pass after the writes go quiet", async (t) => {
    cloudPolicy.setCloudStorageSession(1, true, true);
    t.after(() => cloudPolicy.setCloudStorageSession(null, false, false));
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
    const calls = { sync: 0 };
    const local = coordinatorWithFakeSync(calls);
    local.setNoteSyncOwner(1);
    const coordinator = local.startNoteSyncCoordinator({}, 1);
    t.after(() => coordinator.stop());
    coordinator.setActive(true);
    t.mock.timers.tick(100);
    await settle();
    assert.equal(calls.sync, 1, "foreground activation still syncs promptly");

    for (let i = 0; i < 5; i++) {
        events.beginNoteCloudWrite()();
        t.mock.timers.tick(local.NOTE_SYNC_AFTER_WRITE_MS - 100);
        await settle();
    }
    assert.equal(calls.sync, 1, "writes keep postponing the pull");
    t.mock.timers.tick(100);
    await settle();
    assert.equal(calls.sync, 2);
    t.mock.timers.tick(local.NOTE_SYNC_AFTER_WRITE_MS * 2);
    await settle();
    assert.equal(calls.sync, 2);
});
