// node --test tests/sync/note-write-coalescing.test.cjs
// 笔记写入后同步防抖：本地标记切换、正文上传等写入连续发生时只拉取一轮；同步服务为假实现。
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

const cloudPolicy = require("../../src/core/cloud-storage/cloud-storage-policy.ts");
const events = require("../../src/features/notes/notes.events.ts");

const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

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
