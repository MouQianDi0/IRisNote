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
  desiredTodoLiveTimeline,
  desiredTodoLiveTimelines,
  createTodoLiveDemoTimeline,
  desiredTodoLiveDemoUpdate,
} = require("@/features/todos/services/todo-live-update.service.ts");
const {
  TodoLiveUpdateCoordinator,
} = require("@/features/todos/state/todo-live-update-coordinator.ts");
const {
  LIVE_TEST_NOTIFICATION_ID,
  LIVE_TODO_CHANNEL,
  LIVE_TODO_SUMMARY_CHANNEL,
  LIVE_TODO_SUMMARY_NOTIFICATION_ID,
} = require("@/core/system-notifications/system-notification.types.ts");
const {
  todoSummaryTimeline,
  desiredTodoSummary,
} = require("@/features/todos/services/todo-aggregate-live.service.ts");

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

test("聚合卡四场景、计数、独立渠道及结束窗口", () => {
  const entities = [
    todo({ clientId: "one", startTime: "11:00", endTime: "12:00", reminderEnabled: false, isStarred: true }),
    todo({ clientId: "two", startTime: null, endTime: null, reminderEnabled: false }),
  ];
  const timeline = todoSummaryTimeline(entities, at(9, 0), false);
  const today = desiredTodoSummary(timeline, at(9, 0));
  assert.equal(today.scene, "today");
  // 胶囊标题只显示进行/临近计数，今日总量放副标题。
  assert.equal(today.title, "进行中 0");
  // 重要 = 创建时 priority=high（fixture 默认 normal，isStarred 不再计入）。
  assert.equal(today.text, "今日 2 条待办 | 0条重要 | 2条待完成 | 0条进行中 | 0条已完成");
  assert.equal(today.notificationId, LIVE_TODO_SUMMARY_NOTIFICATION_ID);
  assert.equal(today.channelId, LIVE_TODO_SUMMARY_CHANNEL);
  assert.equal(desiredTodoSummary(timeline, at(10, 0)).scene, "near");
  assert.equal(desiredTodoSummary(timeline, at(10, 30)).scene, "near");
  const activeCard = desiredTodoSummary(timeline, at(11, 30));
  assert.equal(activeCard.scene, "active");
  // 胶囊不再展示 chronometer 倒计时；标题只显示进行/临近计数。
  assert.equal(activeCard.title, "进行中 1");
  assert.equal(activeCard.secondsEligible, false);
  assert.equal(activeCard.chronoAt, null);
  assert.equal(activeCard.text, "今日 2 条待办 | 0条重要 | 2条待完成 | 1条进行中 | 0条已完成");
  const short = todoSummaryTimeline([
    todo({ startTime: "09:00", endTime: "10:00" }),
    todo({ clientId: "soon", startTime: "10:10", endTime: null }),
  ], at(9, 30), true);
  const shortCard = desiredTodoSummary(short, at(9, 30, 30), true);
  assert.equal(shortCard.title, "进行中 1·临近 1");
  assert.equal(shortCard.text, "今日 2 条待办 | 0条重要 | 2条待完成 | 1条进行中 | 0条已完成");
  assert.equal(desiredTodoSummary(todoSummaryTimeline([], at(9, 0), true), at(9, 0)), null);
  const endedTimeline = todoSummaryTimeline([todo({ endTime: "10:00" })], at(10, 1), true);
  assert.equal(desiredTodoSummary(endedTimeline, at(10, 1)).scene, "ended");
  assert.equal(desiredTodoSummary(endedTimeline, at(10, 10)), null);
  assert.equal(desiredTodoSummary(todoSummaryTimeline([todo()], at(10, 1), false), at(10, 1)), null);
  const completedTimeline = todoSummaryTimeline([todo({
    isCompleted: true, completedAt: at(9, 45).toISOString(),
  })], at(9, 46), true);
  assert.equal(desiredTodoSummary(completedTimeline, at(9, 46)).text, "1·已完成");
  assert.equal(desiredTodoSummary(completedTimeline, at(9, 55)), null);
});

test("聚合摘要脱敏截断且最早开始项确定性优先", () => {
  const first = todo({ clientId: "first", body: "  开会\n保密内容", startTime: "10:00" });
  const second = todo({ clientId: "second", body: "后来", startTime: "10:30" });
  const a = desiredTodoSummary(todoSummaryTimeline([second, first], at(9, 30), false), at(9, 30));
  const b = desiredTodoSummary(todoSummaryTimeline([first, second], at(9, 30), false), at(9, 30));
  assert.deepEqual(a, b);
  assert.equal(a.scene, "near");
  // 文案改为纯计数后确定性由标题承载：进行/临近数量与输入顺序无关。
  assert.equal(a.title, "进行中 0·临近 2");
  assert.equal(a.text, "今日 2 条待办 | 0条重要 | 2条待完成 | 0条进行中 | 0条已完成");
});

test("协调器聚合卡独立权限、后台快照和提升唯一性", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, { summaryPermissionGranted: async () => true }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.summaries.length, 1);
  assert.equal(sinks.summaries[0].scene, "active");
  await coordinator.handoff();
  assert.equal(sinks.handoffs.find((card) => card.id === LIVE_TODO_SUMMARY_NOTIFICATION_ID).summarySeenActivity, true);
  // 仅聚合卡与重要（priority=high）事件携带提升式请求；普通事件非提升。
  assert.equal(sinks.handoffs.filter((card) => card.promoted).length, 1);
  await coordinator.stop();
  assert.equal(sinks.cancels.includes(LIVE_TODO_SUMMARY_NOTIFICATION_ID), true);
});

test("逐条渠道关闭时聚合卡仍发，且后台只移交聚合快照", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      permissionGranted: async () => false,
      summaryPermissionGranted: async () => true,
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 0);
  assert.equal(sinks.summaries.length, 1);
  await coordinator.handoff();
  assert.deepEqual(sinks.handoffs.map((card) => card.id), [LIVE_TODO_SUMMARY_NOTIFICATION_ID]);
  await coordinator.stop();
});

/** 统一 port 桩：sinks 收集 handoff/persistTimeline/timelineCancels/fgs 调用记录。 */
function portStub(sinks = {}, overrides = {}) {
  sinks.posts ??= [];
  sinks.cancels ??= [];
  sinks.handoffs ??= [];
  sinks.timelineCancels ??= [];
  sinks.persists ??= [];
  sinks.fgs ??= [];
  sinks.summaries ??= [];
  return {
    supported: () => true,
    progressStyleSupported: () => true,
    permissionGranted: async () => true,
    summaryPermissionGranted: async () => false,
    post: async (card) => sinks.posts.push({ ...card }),
    postSummary: async (card) => sinks.summaries.push({ ...card }),
    cancel: async (id) => sinks.cancels.push(id),
    handoff: async (cards) => sinks.handoffs.push(...cards),
    cancelTimeline: async () => sinks.timelineCancels.push(true),
    persistTimeline: async (cards) => sinks.persists.push(...cards),
    ensureForegroundService: async (active) => sinks.fgs.push(active),
    ...overrides,
  };
}

test("动态通知整型 ID 稳定、区分账号与待办且避开诊断保留段", () => {
  const first = liveUpdateNotificationId("user:one", "todo-1");
  assert.equal(first, liveUpdateNotificationId("user:one", "todo-1"));
  assert.ok(Number.isInteger(first) && first >= 10_000);
  assert.notEqual(first, liveUpdateNotificationId("user:one", "todo-2"));
  assert.notEqual(first, liveUpdateNotificationId("user:two", "todo-1"));
});

test("60 秒模拟待办走真实卡片与原生时间线，且不占三张真实卡片额度", async () => {
  const start = at(9, 30).getTime();
  const demo = createTodoLiveDemoTimeline(start);
  assert.equal(demo.endAt - demo.startAt, 60_000);
  assert.equal(demo.notificationId, LIVE_TEST_NOTIFICATION_ID);
  assert.equal(demo.channelId, LIVE_TODO_CHANNEL);
  assert.equal(demo.promoted, true);
  assert.equal(desiredTodoLiveDemoUpdate(demo, new Date(start - 1)), null);
  assert.equal(desiredTodoLiveDemoUpdate(demo, new Date(start + 60_000)), null);

  const sinks = {};
  let now = new Date(start + 1_000);
  let demoTimeline = demo;
  const entities = [0, 1, 2].map((index) => todo({
    clientId: `real-${index}`,
  }));
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({ ownerKey: "user:one", ready: true, entities, demoTimeline }),
    () => now,
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 4);
  assert.equal(coordinator.hasPosted(LIVE_TEST_NOTIFICATION_ID, demo.endAt), true);
  assert.equal(coordinator.hasPosted(LIVE_TEST_NOTIFICATION_ID, demo.endAt + 1), false);
  assert.equal(sinks.posts.find((card) => card.notificationId === LIVE_TEST_NOTIFICATION_ID).text,
    "已进行 0 / 1 分钟");

  await coordinator.handoff();
  assert.equal(sinks.handoffs.length, 4);
  assert.deepEqual(sinks.handoffs.find((card) => card.id === LIVE_TEST_NOTIFICATION_ID), {
    id: LIVE_TEST_NOTIFICATION_ID,
    channelId: LIVE_TODO_CHANNEL,
    title: demo.title,
    textStarted: null,
    startAt: start,
    endAt: start + 60_000,
    promoted: true,
  });

  now = new Date(start + 60_001);
  demoTimeline = null;
  await coordinator.start();
  assert.equal(coordinator.hasPosted(LIVE_TEST_NOTIFICATION_ID), false);
  assert.equal(sinks.posts.filter((card) => card.notificationId === LIVE_TEST_NOTIFICATION_ID).length, 1);
  await coordinator.stop();
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

test("时间线资格前瞻：未开始的当日待办入快照，过结束时刻排除", () => {
  assert.equal(
    desiredTodoLiveTimeline(todo({ startTime: "11:00", endTime: "12:00" }), at(9, 30)) !==
      null,
    true,
  );
  assert.equal(
    desiredTodoLiveTimeline(todo(), at(10, 1)),
    null,
  );
  assert.equal(
    desiredTodoLiveTimeline(todo({ endTime: null, startTime: "11:00" }), at(9, 30)) !==
      null,
    true,
  );
});

test("时间线快照携带墙钟重算所需的全部字段", () => {
  const card = desiredTodoLiveTimeline(todo(), at(9, 30));
  assert.ok(card);
  assert.equal(card.channelId, LIVE_TODO_CHANNEL);
  assert.equal(card.startAt, at(9, 0).getTime());
  assert.equal(card.endAt, at(10, 0).getTime());
  assert.equal(card.textStarted, null);
  // 普通事件（非 high）降级为非提升动态通知。
  assert.equal(card.promoted, false);
  const high = desiredTodoLiveTimeline(todo({ priority: "high" }), at(9, 30));
  assert.ok(high);
  assert.equal(high.promoted, true);
  const open = desiredTodoLiveTimeline(todo({ endTime: null }), at(9, 30));
  assert.ok(open);
  assert.equal(open.endAt, null);
  assert.equal(open.textStarted, "已开始 09:00，进行中");
});

test("时间线汇总（全部进行中）组内按通知 ID 排序截断", () => {
  const entities = Array.from({ length: 5 }, (_, index) =>
    todo({
      clientId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      startTime: `09:0${index}`,
      endTime: "11:00",
    }),
  );
  const cards = desiredTodoLiveTimelines(entities, at(9, 30));
  assert.equal(cards.length, LIVE_TODO_MAX_CARDS);
  const ids = cards.map((card) => card.notificationId);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids);
  assert.deepEqual(desiredTodoLiveTimelines([], at(9, 30)), []);
});

test("时间线快照进行中优先：未来卡不挤掉进行中卡", () => {
  // 6 个候选按 notificationId 排序：最小 3 个作未来卡、最大 3 个作进行中卡——
  // 旧口径（纯 ID 截断）会全部取未来卡，新口径保证进行中卡全部保留。
  const pool = Array.from({ length: 6 }, (_, index) =>
    `00000000-0000-4000-8000-${String(10 + index).padStart(12, "0")}`,
  );
  const byId = pool
    .map((clientId) => ({
      clientId,
      id: liveUpdateNotificationId("user:one", clientId),
    }))
    .sort((a, b) => a.id - b.id);
  const futureIds = byId.slice(0, 3);
  const activeIds = byId.slice(3);
  const entities = [
    ...activeIds.map(({ clientId }) =>
      todo({ clientId, startTime: "09:00", endTime: "11:00" }),
    ),
    ...futureIds.map(({ clientId }) =>
      todo({ clientId, startTime: "13:00", endTime: "14:00" }),
    ),
  ];
  const cards = desiredTodoLiveTimelines(entities, at(9, 30));
  assert.equal(cards.length, LIVE_TODO_MAX_CARDS);
  assert.deepEqual(
    [...new Set(cards.map((card) => card.notificationId))].sort(
      (a, b) => a - b,
    ),
    activeIds.map(({ id }) => id).sort((a, b) => a - b),
  );
});

test("有结束时间的进行中卡片计算分钟进度并携带倒计时锚点", () => {
  const card = desiredTodoLiveUpdate(todo(), at(9, 15));
  assert.ok(card);
  assert.equal(card.channelId, LIVE_TODO_CHANNEL);
  assert.equal(card.indeterminate, false);
  assert.equal(card.progress, 15);
  assert.equal(card.max, 60);
  assert.equal(card.text, "已进行 15 / 60 分钟");
  assert.equal(card.ongoing, true);
  assert.equal(card.promoted, false);
  const highCard = desiredTodoLiveUpdate(todo({ priority: "high" }), at(9, 15));
  assert.equal(highCard.promoted, true);
  assert.equal(card.chronoAt, at(10, 0).getTime());
  assert.equal(card.chronoCountdown, true);
  assert.equal(
    card.notificationId,
    liveUpdateNotificationId("user:one", todo().clientId),
  );
});

test("仅开始时间的待办使用不定进度、正计时锚点并显示开始时刻", () => {
  const card = desiredTodoLiveUpdate(todo({ endTime: null }), at(9, 5));
  assert.ok(card);
  assert.equal(card.indeterminate, true);
  assert.equal(card.max, 0);
  assert.equal(card.progress, 0);
  assert.equal(card.text, "已开始 09:00，进行中");
  assert.equal(card.chronoAt, at(9, 0).getTime());
  assert.equal(card.chronoCountdown, false);
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
  const sinks = {};
  let entities = [todo()];
  let granted = true;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, { permissionGranted: async () => granted }),
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );

  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  assert.equal(sinks.posts[0].progress, 30);

  // 分钟与文案未变：不重复发卡
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 1);

  // 待办完成：撤下对应卡片
  entities = [todo({ isCompleted: true })];
  await coordinator.refresh();
  assert.equal(sinks.cancels.length, 1);
  assert.equal(sinks.cancels[0], sinks.posts[0].notificationId);

  // 权限被收回：已发卡片全部撤下且不再新发
  entities = [todo()];
  granted = true;
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  granted = false;
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.cancels.length, 2);

  // 恢复权限后重发，stop 撤下全部；重复 stop 幂等
  granted = true;
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 3);
  await coordinator.stop();
  assert.equal(sinks.cancels.length, 3);
  await coordinator.stop();
  assert.equal(sinks.cancels.length, 3);
});

test("协调器：能力不可用时 refresh 为空操作", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, { supported: () => false }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.refresh();
  await coordinator.stop();
  assert.equal(sinks.posts.length, 0);
  assert.equal(sinks.cancels.length, 0);
  assert.equal(sinks.timelineCancels.length, 0);
});

test("协调器：时间推进后同一卡片原位更新而非新发", async () => {
  const sinks = {};
  let minute = 30;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, minute),
  );
  await coordinator.start();
  minute = 45;
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.posts[0].notificationId, sinks.posts[1].notificationId);
  assert.equal(sinks.posts[0].progress, 30);
  assert.equal(sinks.posts[1].progress, 45);
  await coordinator.stop();
});

test("协调器：去重包含标题，编辑正文后原位更新标题", async () => {
  const sinks = {};
  let body = "写周报";
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({
      ownerKey: "user:one",
      ready: true,
      entities: [todo({ endTime: null, body })],
    }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  // 无结束时间的不定进度卡：text/progress/indeterminate 恒定，仅标题变化
  body = "写月报";
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.posts[0].notificationId, sinks.posts[1].notificationId);
  assert.equal(sinks.posts[1].title, "写月报");
  await coordinator.stop();
});

test("协调器：stop 使权限读取中的刷新失效，不再发卡", async () => {
  const sinks = {};
  let resolvePermission;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      permissionGranted: () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  const started = coordinator.start();
  // 让 start 越过收回接管权的 await，停在 run() 的权限读取上
  await new Promise((resolve) => setImmediate(resolve));
  await coordinator.stop();
  resolvePermission(true);
  await started;
  assert.equal(sinks.posts.length, 0);
  // stop 之后由仓库订阅触发的 refresh 直接跳过（active 门）
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 0);
});

test("协调器：post 在途时 stop，恢复后补撤该卡且不写入状态", async () => {
  const sinks = {};
  let hanging = false;
  let resolveHanging;
  let entities = [todo()];
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      post: (card) => {
        sinks.posts.push({ ...card });
        if (!hanging) return Promise.resolve();
        return new Promise((resolve) => {
          resolveHanging = resolve;
        });
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  hanging = true;
  entities = [todo({ body: "写月报" })];
  const pending = coordinator.refresh();
  // 让本轮 run() 越过权限读取、停在 post 的 await 上
  await new Promise((resolve) => setImmediate(resolve));
  await coordinator.stop();
  assert.equal(sinks.cancels.length, 1);
  resolveHanging();
  await pending;
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.cancels.length, 2);
  assert.deepEqual(sinks.cancels, [
    sinks.posts[0].notificationId,
    sinks.posts[0].notificationId,
  ]);
});

test("协调器：start 幂等，已启动时再次 start 仅刷新", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  await coordinator.stop();
});

test("协调器：post 失败不落状态，下一轮重试成功", async () => {
  const sinks = {};
  let failures = 1;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      post: async (card) => {
        sinks.posts.push({ ...card });
        if (failures > 0) {
          failures -= 1;
          throw new Error("post failed");
        }
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.posts[1].notificationId, sinks.posts[0].notificationId);
  await coordinator.stop();
  assert.equal(sinks.cancels.length, 1);
});

test("协调器：权限读取失败时本轮跳过且不抛出", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      permissionGranted: async () => {
        throw new Error("permission read failed");
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 0);
  await coordinator.stop();
});

test("协调器：handoff 移交时间线（含未来卡）、停 JS 驱动且不撤已发卡片", async () => {
  const sinks = {};
  const future = todo({
    clientId: "00000000-0000-4000-8000-000000000002",
    startTime: "11:00",
    endTime: "12:00",
  });
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({
      ownerKey: "user:one",
      ready: true,
      entities: [todo(), future],
    }),
    () => at(9, 30),
  );
  await coordinator.start();
  // 未来卡未开始：前台只发进行中一张
  assert.equal(sinks.posts.length, 1);

  await coordinator.handoff();
  // 时间线快照含进行中 + 未来两张，映射为原生契约（notificationId → id）
  assert.equal(sinks.handoffs.length, 2);
  const activeId = liveUpdateNotificationId("user:one", todo().clientId);
  const activeHandoff = sinks.handoffs.find((card) => card.id === activeId);
  assert.ok(activeHandoff);
  assert.equal(activeHandoff.startAt, at(9, 0).getTime());
  assert.equal(activeHandoff.endAt, at(10, 0).getTime());
  // 有资格卡：handoff 只移交，不取消原生接管（start 已收回过一次）
  assert.equal(sinks.timelineCancels.length, 1);
  // handoff 不撤已发卡片
  assert.equal(sinks.cancels.length, 0);
  // JS 例行驱动已停：handoff 后订阅触发的 refresh 是空操作
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 1);
  await coordinator.stop();
});

test("协调器：handoff 权限未授予或无资格卡时取消原生接管", async () => {
  const sinks = {};
  let granted = true;
  let entities = [todo()];
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, { permissionGranted: async () => granted }),
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);

  // 权限被收回：handoff 取消原生接管并撤下已发卡片（start 已收回过一次）
  granted = false;
  await coordinator.handoff();
  assert.equal(sinks.handoffs.length, 0);
  assert.equal(sinks.timelineCancels.length, 2);
  assert.equal(sinks.cancels.length, 1);

  // 无资格卡（全部完成）：同样取消原生接管
  granted = true;
  entities = [todo({ isCompleted: true })];
  await coordinator.refresh();
  await coordinator.handoff();
  assert.equal(sinks.handoffs.length, 0);
  assert.equal(sinks.timelineCancels.length, 3);
  await coordinator.stop();
});

test("协调器：start 收回原生接管权（cancelTimeline），handoff 后可重新接管", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.timelineCancels.length, 1);
  await coordinator.handoff();
  assert.equal(sinks.handoffs.length, 1);
  // 回前台：重新收回接管权并恢复 JS 驱动（handoff 已清空卡片状态，重新发卡）
  await coordinator.start();
  assert.equal(sinks.timelineCancels.length, 2);
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  await coordinator.stop();
});

test("协调器：start 等待收回期间 stop 插入，恢复后不再复活协调器", async () => {
  const sinks = {};
  const pendingTimelineResolves = [];
  // 仅 start 的首次 cancelTimeline 挂起；stop 的后续调用立即放行，避免互相等待
  let firstTimelineGate = true;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      cancelTimeline: () => {
        if (firstTimelineGate) {
          firstTimelineGate = false;
          return new Promise((resolve) => {
            pendingTimelineResolves.push(resolve);
          });
        }
        return Promise.resolve();
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  const started = coordinator.start();
  await coordinator.stop();
  // 放行 start 挂起的收回调用：stop 已插入，start 恢复后放弃启动
  pendingTimelineResolves.splice(0).forEach((resolve) => resolve());
  await started;
  // stop 之后 start 放弃启动：无例行驱动、不发卡
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 0);
});

test("协调器：start 收回接管失败时放弃本轮启动，保持原生驱动", async () => {
  const sinks = {};
  let reclaimFails = true;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      cancelTimeline: async () => {
        if (reclaimFails) throw new Error("reclaim failed");
        sinks.timelineCancels.push(true);
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  // 收回失败：不接管、不发卡、不建例行驱动
  assert.equal(sinks.posts.length, 0);
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 0);
  // 收回恢复后：下一次 start 正常接管
  reclaimFails = false;
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  await coordinator.stop();
});

test("协调器：开关开启时先持久化快照再启动前台服务，停止时撤销", async () => {
  const sinks = {};
  const order = [];
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      persistTimeline: async (cards) => {
        sinks.persists.push(...cards.map((card) => ({ ...card })));
        order.push("persist");
      },
      ensureForegroundService: async (active) => {
        sinks.fgs.push(active);
        order.push(active ? "fgs-start" : "fgs-stop");
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  // 开关关闭且 FGS 未运行：不产生任何 FGS 调用
  assert.deepEqual(sinks.fgs, []);
  coordinator.setForegroundServiceEnabled(true);
  await new Promise((resolve) => setImmediate(resolve));
  // 数据先于启动：FGS 启动时快照已就位
  assert.deepEqual(order, ["persist", "fgs-start"]);
  assert.equal(sinks.persists.length, 1);
  assert.equal(sinks.persists[0].id, sinks.posts[0].notificationId);
  await coordinator.stop();
  assert.deepEqual(sinks.fgs, [true, false]);
});

test("协调器：开关关闭停止前台服务后强制重发，避免锚点卡永久消失", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  coordinator.setForegroundServiceEnabled(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sinks.fgs, [true]);
  coordinator.setForegroundServiceEnabled(false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sinks.fgs, [true, false]);
  // FGS 停止移除锚点卡通知：已发表清空，内容无差异也强制原位重发
  await coordinator.refresh();
  assert.equal(sinks.posts.length, 2);
  assert.equal(sinks.posts[1].notificationId, sinks.posts[0].notificationId);
  await coordinator.stop();
  assert.equal(sinks.cancels.length, 1);
});

test("协调器：handoff 移交失败时撤销原生接管并撤下已发卡片", async () => {
  const sinks = {};
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      handoff: async () => {
        throw new Error("schedule failed");
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  await coordinator.handoff();
  // 失败：撤销可能的半写原生状态（start 已收回 1 次 + 失败撤销 1 次）
  assert.equal(sinks.timelineCancels.length, 2);
  // 卡片被撤下，不留冻结错误进度
  assert.deepEqual(sinks.cancels, [sinks.posts[0].notificationId]);
  await coordinator.stop();
});

test("协调器：handoff 在途时 start 重新接管，移交落地后被撤销避免双驱动", async () => {
  const sinks = {};
  let resolveHandoff;
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      handoff: () =>
        new Promise((resolve) => {
          resolveHandoff = resolve;
        }),
    }),
    () => ({ ownerKey: "user:one", ready: true, entities: [todo()] }),
    () => at(9, 30),
  );
  const handoffDone = coordinator.handoff();
  // 让 handoff 越过权限读取，停在 port.handoff 的 await 上
  await new Promise((resolve) => setImmediate(resolve));
  // 用户快速回前台：start 收回接管权并重建 JS 驱动
  await coordinator.start();
  resolveHandoff();
  await handoffDone;
  // 移交落地后被补偿撤销（start 的收回 + handoff 的撤销）
  assert.equal(sinks.timelineCancels.length, 2);
  // JS 新代已重新认领卡片：handoff 清场让位，不撤卡
  assert.equal(sinks.cancels.length, 0);
  assert.equal(sinks.posts.length, 1);
  await coordinator.stop();
});

test("协调器：post 在途时 handoff 成功移交，恢复后不误撤原生接管的卡", async () => {
  const sinks = {};
  let hanging = false;
  let resolveHanging;
  let entities = [todo()];
  const coordinator = new TodoLiveUpdateCoordinator(
    portStub(sinks, {
      post: (card) => {
        sinks.posts.push({ ...card });
        if (!hanging) return Promise.resolve();
        return new Promise((resolve) => {
          resolveHanging = resolve;
        });
      },
    }),
    () => ({ ownerKey: "user:one", ready: true, entities }),
    () => at(9, 30),
  );
  await coordinator.start();
  assert.equal(sinks.posts.length, 1);
  hanging = true;
  entities = [todo({ body: "写月报" })];
  const pending = coordinator.refresh();
  // 让本轮 run() 越过权限读取、停在 post 的 await 上
  await new Promise((resolve) => setImmediate(resolve));
  await coordinator.handoff();
  assert.equal(sinks.handoffs.length, 1);
  resolveHanging();
  await pending;
  // 原生已接管该卡：恢复后不补撤（原生下一节拍续算）
  assert.equal(sinks.cancels.length, 0);
  assert.equal(sinks.posts.length, 2);
  await coordinator.stop();
});
