// 动态卡三操作（取消通知/+30分钟/完成）的消费例程与抑制表：
// 标记解析、结束时间偏移（跨午夜拒绝）、账号隔离、冲突重读、最终一致（kept 留存）。
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
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
global.__DEV__ = false;
// AsyncStorage 内存替身：抑制表持久化断言依赖可读写的假实现。
const asyncStorageData = new Map();
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "@react-native-async-storage/async-storage")
    return {
      __esModule: true,
      default: {
        getItem: async (key) => asyncStorageData.get(key) ?? null,
        setItem: async (key, value) => {
          asyncStorageData.set(key, String(value));
        },
      },
    };
  return originalLoad.call(this, name, ...args);
};

const {
  parsePendingCardActions,
  postponeTodoEndTime,
  consumePendingCardActions,
  liveTodoCardSuppressions,
  TODO_CARD_SNOOZE_MINUTES,
} = require("@/features/todos/services/todo-card-action.service.ts");
const { TodoError } = require("@/features/todos/todos.types.ts");

const SUPPRESSION_KEY = "irisnote.live-todo.card-suppressions.v1";

const todo = (patch = {}) => ({
  ownerKey: "user:one",
  clientId: "00000000-0000-4000-8000-000000000001",
  body: "写周报",
  priority: "normal",
  dateId: "2030-09-20",
  startTime: "09:00",
  endTime: "10:00",
  isStarred: false,
  isPinned: false,
  reminderEnabled: true,
  timeZone: null,
  isCompleted: false,
  completedAt: null,
  localVersion: 3,
  createdAt: "2030-09-19T01:00:00.000Z",
  updatedAt: "2030-09-19T01:00:00.000Z",
  ...patch,
});

const action = (patch = {}) => ({
  id: "action-1",
  action: "complete",
  ownerKey: "user:one",
  clientId: "00000000-0000-4000-8000-000000000001",
  at: 1_910_000_000_000,
  ...patch,
});

/** 端口替身：completeTodo 的冲突注入由 conflictOnBaseVersions 触发。 */
function makePort(initial = {}) {
  const calls = { complete: [], update: [], dismiss: [], cleared: [] };
  const state = {
    ownerKey: "user:one",
    todos: new Map(),
    pending: [],
    conflictOnBaseVersions: new Set(),
  };
  Object.assign(state, initial);
  const port = {
    native: {
      consumePendingTodoActions: async () => JSON.stringify(state.pending),
      clearPendingTodoActions: async (payload) => {
        calls.cleared.push(JSON.parse(payload).map((item) => item.id));
      },
    },
    isCurrentOwner: (ownerKey) => ownerKey === state.ownerKey,
    findTodo: (ownerKey, clientId) => {
      if (ownerKey !== state.ownerKey) return { kind: "owner-mismatch" };
      const entity = state.todos.get(clientId);
      return entity ? { kind: "current", todo: entity } : { kind: "missing" };
    },
    updateTodo: async (ownerKey, base, patch, now) => {
      calls.update.push({ ownerKey, base, patch, now });
      if (state.conflictOnBaseVersions.has(base.localVersion))
        throw new TodoError("conflict", "待办已变化，请重试");
      const next = Object.freeze({
        ...base,
        ...patch,
        localVersion: base.localVersion + 1,
        updatedAt: now.toISOString(),
      });
      state.todos.set(base.clientId, next);
      return next;
    },
    completeTodo: async (ownerKey, base, now) => {
      calls.complete.push({ ownerKey, base, now });
      if (state.conflictOnBaseVersions.has(base.localVersion)) {
        // 模拟并发写入已落库：先推进版本再抛冲突，服务重读才能拿到新基点。
        const concurrent = Object.freeze({
          ...base,
          localVersion: base.localVersion + 1,
        });
        state.todos.set(base.clientId, concurrent);
        throw new TodoError("conflict", "待办已变化，请重试");
      }
      const next = Object.freeze({
        ...base,
        isCompleted: true,
        completedAt: now.toISOString(),
        localVersion: base.localVersion + 1,
        updatedAt: now.toISOString(),
      });
      state.todos.set(base.clientId, next);
      return next;
    },
    dismissCard: async (ownerKey, clientId) => {
      calls.dismiss.push({ ownerKey, clientId });
      // 与真实端口一致：抑制写入发生在端口实现内。
      await liveTodoCardSuppressions.suppress(ownerKey, clientId);
    },
  };
  return { port, calls, state };
}

test("标记解析：丢弃缺字段与未知动作，保留合法条目", () => {
  const parsed = parsePendingCardActions(
    JSON.stringify([
      action(),
      action({ id: "a2", action: "explode" }),
      action({ id: "a3", clientId: "" }),
      action({ id: "a4", ownerKey: "" }),
      { id: "a5", action: "snooze", clientId: "c" },
      "junk",
    ]),
  );
  assert.deepEqual(
    parsed.map((item) => item.id),
    ["action-1"],
  );
  assert.deepEqual(parsePendingCardActions("not-json"), []);
  assert.deepEqual(parsePendingCardActions("{}"), []);
});

test("+30分钟：仅结束时间后移 30 分钟，开始与日期不动", () => {
  const patch = postponeTodoEndTime(todo());
  assert.deepEqual(patch, { endTime: "10:30" });
  assert.equal(TODO_CARD_SNOOZE_MINUTES, 30);
});

test("+30分钟：无结束时间抛校验错误", () => {
  assert.throws(
    () => postponeTodoEndTime(todo({ endTime: null })),
    (cause) => cause instanceof TodoError && cause.code === "validation",
  );
});

test("+30分钟：跨过午夜按无效拒绝（数据模型同日结束≥开始）", () => {
  assert.throws(
    () => postponeTodoEndTime(todo({ startTime: "23:50", endTime: "23:59" })),
    (cause) => cause instanceof TodoError && cause.code === "validation",
  );
});

test("取消通知：记录抑制并清除标记，不触碰待办数据", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "cancel" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.dismiss, [
    { ownerKey: "user:one", clientId: entity.clientId },
  ]);
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.cleared, [["action-1"]]);
  assert.equal(
    liveTodoCardSuppressions.isSuppressed("user:one", entity.clientId),
    true,
  );
  assert.ok(
    String(asyncStorageData.get(SUPPRESSION_KEY)).includes(entity.clientId),
  );
});

test("完成：落库并清除标记", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "complete" })];
  const now = new Date();
  await consumePendingCardActions(port, now);
  assert.equal(calls.complete.length, 1);
  assert.equal(calls.complete[0].base.localVersion, 3);
  assert.deepEqual(calls.cleared, [["action-1"]]);
  assert.equal(state.todos.get(entity.clientId).isCompleted, true);
});

test("完成：已完成待办按废弃处理，不再重复落库", async () => {
  const entity = todo({ isCompleted: true });
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "complete" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.cleared, [["action-1"]]);
});

test("完成：待办已删除按废弃清除", async () => {
  const { port, calls, state } = makePort();
  state.pending = [action({ action: "complete" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.cleared, [["action-1"]]);
});

test("完成：账号不匹配保留标记等待切回", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.ownerKey = "user:two";
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "complete" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.cleared, []);
});

test("完成：版本冲突重读最新实体后重试成功", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  // 消费例程总是基于最新实体发起：库存 v4，首次冲突发生在 v4（并发写已推进）。
  state.todos.set(entity.clientId, todo({ localVersion: 4 }));
  state.conflictOnBaseVersions.add(4);
  state.pending = [action({ action: "complete" })];
  await consumePendingCardActions(port);
  assert.equal(calls.complete.length, 2);
  assert.equal(calls.complete[0].base.localVersion, 4);
  assert.equal(calls.complete[1].base.localVersion, 5);
  assert.deepEqual(calls.cleared, [["action-1"]]);
  assert.equal(state.todos.get(entity.clientId).localVersion, 6);
});

test("完成：重试仍冲突按“意图已被并发编辑取代”废弃清除", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, todo({ localVersion: 4 }));
  state.conflictOnBaseVersions.add(4);
  state.conflictOnBaseVersions.add(5);
  state.pending = [action({ action: "complete" })];
  await consumePendingCardActions(port);
  assert.equal(calls.complete.length, 2);
  assert.deepEqual(calls.cleared, [["action-1"]]);
  assert.equal(state.todos.get(entity.clientId).isCompleted, false);
});

test("+30分钟：更新待办结束时间并清除标记，开始不动", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "snooze" })];
  await consumePendingCardActions(port);
  assert.equal(calls.update.length, 1);
  assert.deepEqual(calls.update[0].patch, { endTime: "10:30" });
  assert.deepEqual(calls.cleared, [["action-1"]]);
  const stored = state.todos.get(entity.clientId);
  assert.equal(stored.endTime, "10:30");
  assert.equal(stored.startTime, "09:00");
  assert.equal(stored.dateId, "2030-09-20");
});

test("+30分钟：已完成待办废弃处理", async () => {
  const entity = todo({ isCompleted: true });
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "snooze" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.cleared, [["action-1"]]);
});

test("+30分钟：无结束时间废弃处理", async () => {
  const entity = todo({ endTime: null });
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "snooze" })];
  await consumePendingCardActions(port);
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.cleared, [["action-1"]]);
});

test("+30分钟：意外失败保留标记等待重试", async () => {
  const entity = todo();
  const { port, calls, state } = makePort();
  state.todos.set(entity.clientId, entity);
  state.pending = [action({ action: "snooze" })];
  port.updateTodo = async () => {
    calls.update.push({});
    throw new Error("database busy");
  };
  await consumePendingCardActions(port);
  assert.deepEqual(calls.cleared, []);
});
