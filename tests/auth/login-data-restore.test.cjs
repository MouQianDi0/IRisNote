const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
    fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
    }).outputText, filename);
const { createLoginDataRestoreController } = require("../../src/features/auth/services/login-data-restore.ts");
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

test("only explicit login queues recovery; repeated start joins once and categories precede notes", async () => {
    const controller = createLoginDataRestoreController();
    assert.equal(controller.getState(), null);
    const events = [];
    const gate = deferred();
    const tasks = {
        categories: async () => { events.push("categories"); await gate.promise; },
        notes: async () => { events.push("notes"); },
        todos: async () => { events.push("todos"); },
    };
    controller.request(1, "token-a");
    const id = controller.getState().id;
    const first = controller.start(id, tasks);
    assert.strictEqual(controller.start(id, tasks), first);
    assert.deepEqual(events, ["categories", "todos"]);
    gate.resolve();
    await first;
    assert.deepEqual(events, ["categories", "todos", "notes"]);
    assert.equal(controller.getState().phase, "done");
    await controller.start(id, tasks);
    assert.equal(events.length, 3);
    controller.request(1, "token-a");
    await controller.start(controller.getState().id, tasks);
    assert.equal(events.length, 6, "another manual login must pull again, even for the same account/token");
});

test("partial failure preserves completed domains; retry runs only failed work", async () => {
    const controller = createLoginDataRestoreController();
    const calls = { categories: 0, notes: 0, todos: 0 };
    const tasks = {
        categories: async () => { calls.categories++; },
        notes: async () => { if (++calls.notes === 1) throw Error("offline"); },
        todos: async () => { calls.todos++; },
    };
    controller.request(1, "a");
    const id = controller.getState().id;
    await controller.start(id, tasks);
    assert.equal(controller.getState().phase, "failed");
    controller.retry(id);
    await controller.start(id, tasks);
    assert.equal(controller.getState().phase, "done");
    assert.deepEqual(calls, { categories: 1, notes: 2, todos: 1 });
});

test("category failure defers notes but permits independent todos", async () => {
    const controller = createLoginDataRestoreController();
    const calls = [];
    controller.request(1, "a");
    await controller.start(controller.getState().id, {
        categories: async () => { throw Error("offline"); },
        notes: async () => calls.push("notes"),
        todos: async () => calls.push("todos"),
    });
    assert.deepEqual(calls, ["todos"]);
    assert.equal(controller.getState().phase, "failed");
});

test("logout and A-B-A invalidate old tasks and old retry actions", async () => {
    const controller = createLoginDataRestoreController();
    const gate = deferred();
    let oldSignal;
    const tasks = {
        categories: async (signal) => { oldSignal = signal; await gate.promise; },
        notes: async () => assert.fail("old notes must not run"),
        todos: async () => {},
    };
    controller.request(1, "a");
    const oldId = controller.getState().id;
    const old = controller.start(oldId, tasks);
    controller.request(2, "b");
    controller.request(1, "a");
    assert.equal(oldSignal.aborted, true);
    gate.resolve();
    await old;
    assert.equal(controller.getState().phase, "pending");
    const currentId = controller.getState().id;
    controller.retry(oldId);
    assert.equal(controller.getState().id, currentId);
    controller.cancel();
    assert.equal(controller.getState(), null);
    await controller.start(currentId, tasks);
    assert.equal(controller.getState(), null);
});
