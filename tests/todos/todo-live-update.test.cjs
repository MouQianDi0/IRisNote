const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
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
  LIVE_TODO_MAX_CARDS,
  liveUpdateNotificationId,
  liveUpdateEligibleTodo,
  desiredTodoLiveUpdate,
  desiredTodoLiveUpdates,
} = require("@/features/todos/services/todo-live-update.service.ts");
const {
  TodoLiveUpdateCoordinator,
} = require("@/features/todos/state/todo-live-update-coordinator.ts");
const {
  LIVE_TODO_CHANNEL,
} = require("@/core/system-notifications/system-notification.types.ts");

const todo = (patch = {}) => ({
  ownerKey: "user:one",
  clientId: "00000000-0000-4000-8000-000000000001",
  body: "写周报",
  dateId: "2030-09-20",
  startTime: "09:00",
  endTime: "10:00",
  reminderEnabled: true,
  isCompleted: false,
  localVersion: 1,
  priority: "normal",
  isStarred: false,
  isPinned: false,
  timeZone: "Asia/Shanghai",
  createdAt: "2030-09-19T00:00:00Z",
  updatedAt: "2030-09-19T00:00:00Z",
  completedAt: null,
  ...patch,
});
// 2030-09-20 为 todo.dateId 当天（本地民用时区）
const at = (hour, minute, second = 0) =>
  new Date(2030, 8, 20, hour, minute, second);

test("动态通知整型 ID 稳定、区分账号与待办且大于保留段", () => {
  const first = liveUpdateNotificationId("user:one", "todo-1");
  assert.equal(first, liveUpdateNotificationId("user:one", "todo-1"));
  assert.ok(Number.isInteger(first) && first > 16);
  assert.notEqual(first, liveUpdateNotificationId("user:one", "todo-2"));
  assert.notEqual(first, liveUpdateNotificationId("user:two", "todo-1"));
});

test("进行中资格与列表状态口径一致：恰好开始/结束仍在窗口内", () => {
  assert.equal(liveUpdateEligibleTodo(todo(), at(9, 30)), true);
  assert.equal(liveUpdateEligibleTodo(todo(), at(9, 0)), true);
  assert.equal(liveUpdateEligibleTodo(todo(), at(10, 0)), true);
  assert.equal(liveUpdateEligibleTodo(todo(), at(10, 1)), false);
  assert.equal(liveUpdateEligibleTodo(todo(), at(8, 59)), false);
  assert.equal(liveUpdateEligibleTodo(todo({ dateId: "2030-09-21" }), at(9, 30)), false);
  assert.equal(liveUpdateEligibleTodo(todo({ startTime: null }), at(9, 30)), false);
  assert.equal(liveUpdateEligibleTodo(todo({ isCompleted: true }), at(9, 30)), false);
  assert.equal(
    liveUpdateEligibleTodo(todo({ reminderEnabled: false }), at(9, 30)),
    false,
  );
});

test("有结束时间的进行中卡片计算分钟进度", () => {
  const card = desiredTodoLiveUpdate(todo(), at(9, 15));
  assert.ok(card);
  assert.equal(card.channelId, LIVE_TODO_CHANNEL);
  assert.equal(card.indeterminate, false);
  assert.equal(card.progress, 15);
  assert.equal(card.max, 60);
  assert.equal(card.text, "已进行 15 / 60 分钟");
  assert.equal(card.ongoing, true);
  assert.equal(
    card.notificationId,
    liveUpdateNotificationId("user:one", todo().clientId),
  );
});

test("仅开始时间的待办使用不定进度并显示开始时刻", () => {
  const card = desiredTodoLiveUpdate(todo({ endTime: null }), at(9, 5));
  assert.ok(card);
  assert.equal(card.indeterminate, true);
  assert.equal(card.max, 0);
  assert.equal(card.progress, 0);
  assert.equal(card.text, "已开始 09:00，进行中");
});

test("标题复用提醒摘要脱敏：控制字符折叠为空格", () => {
  const card = desiredTodoLiveUpdate(
    todo({ body: "带\u0007控制\u202e字符\n第二行" }),
    at(9, 30),
  );
  assert.ok(card);
  assert.equal(card.title, "带 控制 字符");
});

test("汇总按通知 ID 确定性排序并截断到上限", () => {
  const entities = Array.from({ length: 5 }, (_, index) =>
    todo({
      clientId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      startTime: `09:0${index}`,
      endTime: "11:00",
    }),
  );
  const cards = desiredTodoLiveUpdates(entities, at(9, 30));
  assert.equal(cards.length, LIVE_TODO_MAX_CARDS);
  const ids = cards.map((card) => card.notificationId);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids);
  const full = entities
    .map((item) => liveUpdateNotificationId(item.ownerKey, item.clientId))
    .sort((a, b) => a - b);
  assert.deepEqual(ids, full.slice(0, LIVE_TODO_MAX_CARDS));
  assert.deepEqual(desiredTodoLiveUpdates([], at(9, 30)), []);
});

test("协调器：发卡、按内容去重更新、完成后撤卡、停机清场", async () => {
  const posts = [];
  const cancels = [];
  let entities = [todo()];
  let granted = true;
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => granted,
      post: async (card) => posts.push({ ...card }),
      cancel: async (id) => cancels.push(id),
    },
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );

  await coordinator.start();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].progress, 30);

  // 分钟与文案未变：不重复发卡
  await coordinator.refresh();
  assert.equal(posts.length, 1);

  // 待办完成：撤下对应卡片
  entities = [todo({ isCompleted: true })];
  await coordinator.refresh();
  assert.equal(cancels.length, 1);
  assert.equal(cancels[0], posts[0].notificationId);

  // 权限被收回：已发卡片全部撤下且不再新发
  entities = [todo()];
  granted = true;
  await coordinator.refresh();
  assert.equal(posts.length, 2);
  granted = false;
  await coordinator.refresh();
  assert.equal(posts.length, 2);
  assert.equal(cancels.length, 2);

  // 恢复权限后重发，stop 撤下全部；重复 stop 幂等
  granted = true;
  await coordinator.refresh();
  assert.equal(posts.length, 3);
  await coordinator.stop();
  assert.equal(cancels.length, 3);
  await coordinator.stop();
  assert.equal(cancels.length, 3);
});

test("协调器：能力不可用时 refresh 为空操作", async () => {
  const posts = [];
  const cancels = [];
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => false,
      permissionGranted: async () => true,
      post: async (card) => posts.push(card),
      cancel: async (id) => cancels.push(id),
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.refresh();
  await coordinator.stop();
  assert.equal(posts.length, 0);
  assert.equal(cancels.length, 0);
});

test("协调器：时间推进后同一卡片原位更新而非新发", async () => {
  const posts = [];
  let minute = 30;
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => true,
      post: async (card) => posts.push({ ...card }),
      cancel: async () => {},
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, minute),
  );
  await coordinator.start();
  minute = 45;
  await coordinator.refresh();
  assert.equal(posts.length, 2);
  assert.equal(posts[0].notificationId, posts[1].notificationId);
  assert.equal(posts[0].progress, 30);
  assert.equal(posts[1].progress, 45);
  await coordinator.stop();
});

test("协调器：去重包含标题，编辑正文后原位更新标题", async () => {
  const posts = [];
  let body = "写周报";
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => true,
      post: async (card) => posts.push({ ...card }),
      cancel: async () => {},
    },
    () => ({
      ownerKey: "user:one",
      ready: true,
      entities: [todo({ endTime: null, body })],
    }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(posts.length, 1);
  // 无结束时间的不定进度卡：text/progress/indeterminate 恒定，仅标题变化
  body = "写月报";
  await coordinator.refresh();
  assert.equal(posts.length, 2);
  assert.equal(posts[0].notificationId, posts[1].notificationId);
  assert.equal(posts[1].title, "写月报");
  await coordinator.stop();
});

test("协调器：stop 使权限读取中的刷新失效，不再发卡", async () => {
  const posts = [];
  let resolvePermission;
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
      post: async (card) => posts.push({ ...card }),
      cancel: async () => {},
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  const started = coordinator.start();
  await coordinator.stop();
  resolvePermission(true);
  await started;
  assert.equal(posts.length, 0);
  // stop 之后由仓库订阅触发的 refresh 直接跳过（active 门）
  await coordinator.refresh();
  assert.equal(posts.length, 0);
});

test("协调器：post 在途时 stop，恢复后补撤该卡且不写入状态", async () => {
  const posts = [];
  const cancels = [];
  let hanging = false;
  let resolveHanging;
  let entities = [todo()];
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => true,
      post: (card) => {
        posts.push({ ...card });
        if (!hanging) return Promise.resolve();
        return new Promise((resolve) => {
          resolveHanging = resolve;
        });
      },
      cancel: async (id) => cancels.push(id),
    },
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(posts.length, 1);
  hanging = true;
  entities = [todo({ body: "写月报" })];
  const pending = coordinator.refresh();
  // 让本轮 run() 越过权限读取、停在 post 的 await 上
  await new Promise((resolve) => setImmediate(resolve));
  await coordinator.stop();
  assert.equal(cancels.length, 1);
  resolveHanging();
  await pending;
  assert.equal(posts.length, 2);
  assert.equal(cancels.length, 2);
  assert.deepEqual(cancels, [
    posts[0].notificationId,
    posts[0].notificationId,
  ]);
});

test("协调器：start 幂等，已启动时再次 start 仅刷新", async () => {
  const posts = [];
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => true,
      post: async (card) => posts.push({ ...card }),
      cancel: async () => {},
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  await coordinator.start();
  assert.equal(posts.length, 1);
  await coordinator.stop();
});

test("协调器：post 失败不落状态，下一轮重试成功", async () => {
  const posts = [];
  const cancels = [];
  let failures = 1;
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => true,
      post: async (card) => {
        posts.push({ ...card });
        if (failures > 0) {
          failures -= 1;
          throw new Error("post failed");
        }
      },
      cancel: async (id) => cancels.push(id),
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(posts.length, 1);
  await coordinator.refresh();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].notificationId, posts[0].notificationId);
  await coordinator.stop();
  assert.equal(cancels.length, 1);
});

test("协调器：权限读取失败时本轮跳过且不抛出", async () => {
  const posts = [];
  const coordinator = new TodoLiveUpdateCoordinator(
    {
      supported: () => true,
      permissionGranted: async () => {
        throw new Error("permission read failed");
      },
      post: async (card) => posts.push({ ...card }),
      cancel: async () => {},
    },
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(posts.length, 0);
  await coordinator.stop();
});
