const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(
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
const {
  todoStartInstant,
  desiredTodoReminder,
  reminderSummary,
  resolveReminderTarget,
  todoNotificationIdentifier,
  afterSavedTodoReminder,
} = require("@/features/todos/services/todo-reminder.service.ts");
const {
  TodoReminderCoordinator,
} = require("@/features/todos/state/todo-reminder-coordinator.ts");
const {
  TodoReminderRepository,
} = require("@/features/todos/data/todo-reminder.repository.ts");
const {
  SystemPreferencesRepository,
} = require("@/features/settings/data/system-preferences.repository.ts");
const { databaseMigrations } = require("@/core/database/migrations/index.ts");
const {
  createTodoSync,
} = require("@/core/database/migrations/0009-create-todo-sync.ts");
const {
  parseTodoNotificationData,
} = require("@/core/system-notifications/system-notification.types.ts");
const todo = (patch = {}) => ({
  ownerKey: "user:one",
  clientId: "00000000-0000-4000-8000-000000000001",
  body: "工作内容",
  dateId: "2030-09-20",
  startTime: "09:37",
  endTime: null,
  reminderEnabled: true,
  isCompleted: false,
  localVersion: 1,
  priority: "normal",
  isStarred: false,
  isPinned: false,
  timeZone: "Asia/Shanghai",
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-20T00:00:00Z",
  completedAt: null,
  ...patch,
});
const now = new Date(2030, 8, 19, 9, 0).getTime();
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture(initial = [todo()]) {
  const rows = new Map(),
    osQueue = new Map(),
    calls = [],
    errors = [];
  let current = {
    ready: true,
    ownerKey: "user:one",
    generation: 1,
    entities: initial,
  };
  let granted = true,
    failCancel = false,
    failSchedule = false;
  const hooks = {};
  const key = (row) => `${row.owner_key}/${row.todo_id}`;
  const bindings = {
    async list() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async put(row) {
      await hooks.put?.(row);
      rows.set(key(row), { ...row });
    },
    async remove(row) {
      rows.delete(key(row));
    },
  };
  const notifications = {
    async permission() {
      return { granted, canAskAgain: !granted };
    },
    async scheduled() {
      return [...osQueue.keys()].map((identifier) => ({ identifier }));
    },
    async schedule(identifier, at, body, data) {
      calls.push(["schedule", identifier, at]);
      if (failSchedule) throw Error("OS scheduling failure");
      osQueue.set(identifier, { at, body, data });
      await hooks.schedule?.();
      return identifier;
    },
    async cancel(identifier) {
      calls.push(["cancel", identifier]);
      if (failCancel) throw Error("OS cancellation failure");
      osQueue.delete(identifier);
    },
  };
  const coordinator = new TodoReminderCoordinator(
    bindings,
    notifications,
    () => current,
    (error) => errors.push(error),
    () => now,
  );
  return {
    rows,
    osQueue,
    calls,
    errors,
    bindings,
    notifications,
    coordinator,
    hooks,
    setTodos(entities) {
      current = { ...current, entities };
    },
    setOwner(ownerKey, entities = []) {
      current = {
        ready: true,
        ownerKey,
        generation: current.generation + 1,
        entities,
      };
    },
    setGranted(value) {
      granted = value;
    },
    setFailCancel(value) {
      failCancel = value;
    },
    setFailSchedule(value) {
      failSchedule = value;
    },
    snapshot: () => current,
  };
}

test("开始时间每分钟解析、过去时间和无开始时间不提醒", () => {
  assert.equal(new Date(todoStartInstant(todo())).getMinutes(), 37);
  assert.equal(desiredTodoReminder(todo(), todoStartInstant(todo())), null);
  assert.equal(desiredTodoReminder(todo({ startTime: null }), now), null);
  assert.equal(
    desiredTodoReminder(todo({ reminderEnabled: false }), now),
    null,
  );
  assert.equal(desiredTodoReminder(todo({ isCompleted: true }), now), null);
  assert.throws(() => todoStartInstant(todo({ dateId: "2030-02-30" })));
  assert.throws(() => todoStartInstant(todo({ startTime: "24:00" })));
});

test("明确保存才弹权限，自动保存只给开启入口，异常不会拒绝已保存结果", async () => {
  const calls = [];
  const port = {
    isCurrent: () => true,
    permission: async () => ({ granted: false, canAskAgain: true }),
    request: async () => {
      calls.push("request");
      return { granted: false, canAskAgain: false };
    },
    publish: () => calls.push("publish"),
    showDisabled: () => calls.push("disabled"),
    showError: () => calls.push("error"),
    reconcile: async () => {
      calls.push("reconcile");
    },
  };
  await afterSavedTodoReminder(todo(), "dismiss", port, now);
  assert.deepEqual(calls, ["publish", "disabled", "reconcile"]);
  calls.length = 0;
  await afterSavedTodoReminder(todo(), "confirm", port, now);
  assert.deepEqual(calls, ["request", "publish", "disabled", "reconcile"]);
  calls.length = 0;
  await afterSavedTodoReminder(
    todo({ isCompleted: true }),
    "confirm",
    port,
    now,
  );
  assert.deepEqual(calls, []);
  await afterSavedTodoReminder(
    todo(),
    "confirm",
    {
      ...port,
      permission: async () => {
        throw Error("OS");
      },
    },
    now,
  );
  assert.deepEqual(calls, ["error"]);
});

test("权限查询或请求期间会话过期，不继续弹窗或显示旧会话结果", async () => {
  let active = true;
  const calls = [];
  const port = {
    isCurrent: () => active,
    permission: async () => {
      active = false;
      return { granted: false, canAskAgain: true };
    },
    request: async () => {
      calls.push("request");
      return { granted: true, canAskAgain: true };
    },
    publish: () => calls.push("publish"),
    showDisabled: () => calls.push("disabled"),
    showError: () => calls.push("error"),
    reconcile: async () => {
      calls.push("reconcile");
    },
  };
  await afterSavedTodoReminder(todo(), "confirm", port, now);
  assert.deepEqual(calls, []);
  active = true;
  await afterSavedTodoReminder(
    todo(),
    "confirm",
    {
      ...port,
      permission: async () => ({ granted: false, canAskAgain: true }),
      request: async () => {
        active = false;
        return { granted: true, canAskAgain: true };
      },
    },
    now,
  );
  assert.deepEqual(calls, []);
});

test("时区变化重算民用时刻，DST 缺失分钟拒绝，重复小时固定取较早时刻", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Asia/Shanghai";
    const shanghai = todoStartInstant(todo());
    process.env.TZ = "America/New_York";
    assert.notEqual(todoStartInstant(todo()), shanghai);
    assert.throws(
      () =>
        todoStartInstant(todo({ dateId: "2030-03-10", startTime: "02:30" })),
      /时区不存在/,
    );
    assert.equal(
      new Date(
        todoStartInstant(todo({ dateId: "2030-11-03", startTime: "01:30" })),
      ).toISOString(),
      "2030-11-03T05:30:00.000Z",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("通知摘要移除控制字符并限制长度，点击只解析当前账号现存待办", () => {
  assert.equal(reminderSummary("a\n\u202eb"), "a b");
  assert.equal(Array.from(reminderSummary("😀".repeat(150))).length, 100);
  const data = {
    kind: "todo-start",
    ownerKey: "user:one",
    todoId: todo().clientId,
  };
  assert.equal(resolveReminderTarget(data, "user:other", [todo()]), null);
  assert.equal(resolveReminderTarget(data, "user:one", []), null);
  assert.equal(
    resolveReminderTarget(data, "user:one", [todo()]).dateId,
    "2030-09-20",
  );
  assert.equal(parseTodoNotificationData(undefined), null);
  assert.equal(parseTodoNotificationData({ ...data, ownerKey: 42 }), null);
});

test("重复保存和并发对账幂等，仅创建一条提醒", async () => {
  const f = fixture();
  await Promise.all([
    f.coordinator.reconcile(),
    f.coordinator.reconcile(),
    f.coordinator.reconcile(),
  ]);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 1);
  assert.equal(f.calls.filter(([call]) => call === "schedule").length, 1);
  assert.equal([...f.rows.values()][0].state, "scheduled");
});

test("修改先取消再重建，完成取消，取消完成重新提醒，关闭开关取消", async () => {
  const f = fixture();
  await f.coordinator.reconcile();
  f.setTodos([todo({ startTime: "10:01", localVersion: 2 })]);
  await f.coordinator.reconcile();
  assert.deepEqual(
    f.calls.map(([call]) => call),
    ["schedule", "cancel", "schedule"],
  );
  f.setTodos([todo({ isCompleted: true, localVersion: 3 })]);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 0);
  f.setTodos([todo({ localVersion: 4 })]);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 1);
  f.setTodos([todo({ reminderEnabled: false, localVersion: 5 })]);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 0);
});

test("删除取消失败保留清理记录，前台重试成功后清除", async () => {
  const f = fixture();
  await f.coordinator.reconcile();
  f.setFailCancel(true);
  f.setTodos([]);
  await f.coordinator.reconcile();
  assert.equal([...f.rows.values()][0].state, "cancel");
  assert.equal(f.osQueue.size, 1);
  f.setFailCancel(false);
  await f.coordinator.reconcile();
  assert.equal(f.rows.size, 0);
  assert.equal(f.osQueue.size, 0);
});

test("旧通知取消失败禁止安排新时间", async () => {
  const f = fixture();
  await f.coordinator.reconcile();
  f.setFailCancel(true);
  f.setTodos([todo({ startTime: "10:00", localVersion: 2 })]);
  await f.coordinator.reconcile();
  assert.equal(f.calls.filter(([call]) => call === "schedule").length, 1);
  f.setFailCancel(false);
  await f.coordinator.reconcile();
  assert.equal([...f.rows.values()][0].todo_version, 2);
});

test("权限拒绝保留待办和失败状态，授权后对账可恢复，撤销后清理", async () => {
  const f = fixture();
  f.setGranted(false);
  await f.coordinator.reconcile();
  assert.equal(f.snapshot().entities.length, 1);
  assert.equal(f.osQueue.size, 0);
  assert.equal([...f.rows.values()][0].state, "error");
  f.setGranted(true);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 1);
  f.setGranted(false);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 0);
});

test("调度失败保留可重试状态，不修改待办事实", async () => {
  const f = fixture();
  f.setFailSchedule(true);
  await f.coordinator.reconcile();
  assert.equal([...f.rows.values()][0].state, "error");
  assert.equal(f.snapshot().entities[0].localVersion, 1);
  f.setFailSchedule(false);
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 1);
});

test("系统已调度但数据库回执失败，重启对账不会留下重复提醒", async () => {
  const f = fixture();
  let failReceipt = true;
  f.hooks.put = (row) => {
    if (row.state === "scheduled" && failReceipt) {
      failReceipt = false;
      throw Error("database receipt");
    }
  };
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.size, 1);
  const restarted = new TodoReminderCoordinator(
    f.bindings,
    f.notifications,
    f.snapshot,
    () => {},
    () => now,
  );
  await restarted.reconcile();
  assert.equal(f.osQueue.size, 1);
  assert.equal([...f.rows.values()][0].state, "scheduled");
});

test("系统队列丢失与孤儿请求均能在重启恢复，不取消其他功能请求", async () => {
  const f = fixture();
  await f.coordinator.reconcile();
  f.osQueue.clear();
  f.osQueue.set("irisnote.todo.orphan", {});
  f.osQueue.set("another-feature", {});
  await f.coordinator.reconcile();
  assert.equal(f.osQueue.has("irisnote.todo.orphan"), false);
  assert.equal(f.osQueue.has("another-feature"), true);
  assert.equal(
    f.osQueue.has(todoNotificationIdentifier(todo().ownerKey, todo().clientId)),
    true,
  );
});

test("调度进行中切换账号，完成后立刻撤销旧账号请求", async () => {
  const f = fixture();
  const entered = deferred(),
    release = deferred();
  f.hooks.schedule = async () => {
    entered.resolve();
    await release.promise;
  };
  const pending = f.coordinator.reconcile();
  await entered.promise;
  f.setOwner("user:two");
  void f.coordinator.reconcile();
  release.resolve();
  await pending;
  assert.equal(f.osQueue.size, 0);
  assert.equal(f.rows.size, 0);
});

test("连续编辑期间只保留最新版本的开始时刻", async () => {
  const f = fixture();
  const entered = deferred(),
    release = deferred();
  let once = true;
  f.hooks.schedule = async () => {
    if (once) {
      once = false;
      entered.resolve();
      await release.promise;
    }
  };
  const pending = f.coordinator.reconcile();
  await entered.promise;
  f.setTodos([todo({ startTime: "11:59", localVersion: 5 })]);
  void f.coordinator.reconcile();
  release.resolve();
  await pending;
  assert.equal(f.osQueue.size, 1);
  assert.equal([...f.rows.values()][0].todo_version, 5);
  assert.equal(
    [...f.osQueue.values()][0].at,
    todoStartInstant(todo({ startTime: "11:59" })),
  );
});

test("迁移 1–11 后提醒绑定与系统偏好均可落盘重开", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "iris-reminders-"));
  const filename = path.join(directory, "database.sqlite");
  let db = new DatabaseSync(filename);
  t.after(() => {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const migrationPort = {
    execAsync: async (sql) => db.exec(sql),
    getAllAsync: async (sql) => db.prepare(sql).all(),
    runAsync: async (sql, params) =>
      params ? db.prepare(sql).run(params) : db.prepare(sql).run(),
  };
  for (const migration of databaseMigrations) await migration.up(migrationPort);
  // 合并 PR #113 后链尾是 0010 笔记迁移（非可重入设计）；
  // 本测试原始意图是 todo 链末尾迁移可重入，显式重放 0009。
  await createTodoSync.up({ execAsync: async (sql) => db.exec(sql) });
  const port = {
    async run(sql, params = []) {
      return db.prepare(sql).run(...params);
    },
    async getAll(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    async getFirst(sql, params = []) {
      return db.prepare(sql).get(...params) ?? null;
    },
  };
  const repository = new TodoReminderRepository(port);
  const preferences = new SystemPreferencesRepository(port);
  const record = {
    owner_key: "user:one",
    todo_id: todo().clientId,
    notification_id: "local-id",
    todo_version: 2,
    trigger_at: now,
    state: "cancel",
    last_error: "retry",
    updated_at: new Date(now).toISOString(),
  };
  await repository.put(record);
  await preferences.setRuntimeNotificationEnabled(true);
  db.close();
  db = new DatabaseSync(filename);
  assert.deepEqual({ ...(await repository.list())[0] }, record);
  assert.equal(await preferences.runtimeNotificationEnabled(), true);
  await repository.put({ ...record, state: "scheduled", todo_version: 3 });
  assert.equal((await repository.list()).length, 1);
  await port.run("DELETE FROM local_todos");
  assert.equal((await repository.list()).length, 1);
  await assert.rejects(repository.put({ ...record, state: "invalid" }));
  await repository.remove(record);
  assert.equal((await repository.list()).length, 0);
  await preferences.setRuntimeNotificationEnabled(false);
  assert.equal(await preferences.runtimeNotificationEnabled(), false);
});
