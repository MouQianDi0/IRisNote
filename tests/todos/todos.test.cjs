const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
  if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
  return originalResolve.call(this, name, ...args);
};
require.extensions[".ts"] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(compiled.outputText, filename);
};

const {
  TodoMemoryRepository,
} = require("@/features/todos/data/todo-memory.repository.ts");
const {
  assertValidTodo,
  isValidDateId,
  isValidTime,
  normalizeTodoFields,
} = require("@/features/todos/domain/todo-validation.ts");
const {
  todoStatus,
  todoDisplayState,
  todoTitle,
  todoTimeLabel,
  nextTodoRefresh,
} = require("@/features/todos/domain/todo-state.ts");
const {
  queryTodos,
  queryTodosByWeek,
} = require("@/features/todos/domain/todo-query.ts");
const {
  emptyTodoFields,
  saveTodoForm,
  prepareTodoExit,
  newTodoId,
  todoFields,
} = require("@/features/todos/services/todo-service.ts");
const { seedTodoPreview } = require("@/features/todos/testing/todo-seeds.ts");
const { toDateId, addDays } = require("@/shared/utils/date-id.ts");

const owner = "user:one";
const instant = new Date(2026, 8, 18, 9, 37, 0, 0);
const dateId = toDateId(instant);
const id = (value) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const fields = (patch = {}) => ({
  ...emptyTodoFields(dateId),
  body: "计划\n完整正文",
  ...patch,
});
function setup() {
  const repo = new TodoMemoryRepository();
  repo.activate(owner);
  return repo;
}
function create(repo, value, patch = {}, when = instant) {
  return repo.create(owner, id(value), fields(patch), when);
}
function expectCode(action, code) {
  assert.throws(action, (error) => error.code === code);
}

test("日期校验拒绝进位、格式错误并允许闰日和四位低年份", () => {
  for (const value of [
    "2026-02-30",
    "2026-02-29",
    "2026-13-01",
    "2026-00-01",
    "2026-9-18",
    "0000-01-01",
  ])
    assert.equal(isValidDateId(value), false, value);
  for (const value of ["2024-02-29", "2026-09-18", "0099-01-01"])
    assert.equal(isValidDateId(value), true, value);
});

test("每小时的全部分钟有效；拒绝越界和非 HH:mm 格式", () => {
  for (let minute = 0; minute < 60; minute++)
    assert.equal(isValidTime(`09:${String(minute).padStart(2, "0")}`), true);
  assert.equal(isValidTime("23:59"), true);
  for (const value of ["24:00", "09:60", "9:01", "09:01:00"])
    assert.equal(isValidTime(value), false);
});

test("正文长度按码点，保留空格段落并统一换行；时区缺失不阻断", () => {
  assertValidTodo(fields({ body: "😀".repeat(4000), timeZone: null }));
  expectCode(
    () => assertValidTodo(fields({ body: "😀".repeat(4001) })),
    "validation",
  );
  expectCode(() => assertValidTodo(fields({ body: " \n\t" })), "validation");
  assert.equal(
    normalizeTodoFields(fields({ body: " a\r\nb\rc " })).body,
    " a\nb\nc ",
  );
});

test("结束无开始、早于开始均失败；同刻允许零时长", () => {
  expectCode(() => assertValidTodo(fields({ endTime: "09:37" })), "validation");
  expectCode(
    () => assertValidTodo(fields({ startTime: "10:00", endTime: "09:37" })),
    "validation",
  );
  assertValidTodo(fields({ startTime: "09:37", endTime: "09:37" }));
});

test("创建/编辑的确认、取消、遮罩和返回共用退出规则", () => {
  const repo = setup();
  const base = create(repo, 1);
  const blank = fields({ body: " \n" });
  assert.equal(prepareTodoExit(null, blank, "dismiss"), null);
  assert.equal(prepareTodoExit(null, fields(), "cancel"), null);
  expectCode(() => prepareTodoExit(null, blank, "confirm"), "validation");
  for (const reason of ["confirm", "dismiss"])
    expectCode(() => prepareTodoExit(base, blank, reason), "validation");
  assert.equal(prepareTodoExit(base, blank, "cancel"), null);
  expectCode(
    () => prepareTodoExit(null, fields({ endTime: "10:00" }), "dismiss"),
    "validation",
  );
  assert.equal(prepareTodoExit(null, fields(), "dismiss").body, fields().body);
  assert.equal(repo.list(owner).length, 1);
});

test("开始等于现在进入进行中；结束等于现在尚未过期，超过 1ms 过期", () => {
  const repo = setup();
  const todo = create(repo, 1, { startTime: "09:37", endTime: "09:37" });
  assert.equal(todoStatus(todo, new Date(instant.getTime() - 1)), "pending");
  assert.equal(todoStatus(todo, instant), "inProgress");
  assert.equal(todoStatus(todo, new Date(instant.getTime() + 1)), "expired");
  assert.equal(nextTodoRefresh([todo], instant), 1);
});

test("全天和仅开始待办当天进行中，次日过期；未来日期待进行", () => {
  const repo = setup();
  const allDay = create(repo, 1);
  const startOnly = create(repo, 2, { startTime: "08:00" });
  const tomorrow = new Date(2026, 8, 19, 0, 0);
  for (const todo of [allDay, startOnly]) {
    assert.equal(todoStatus(todo, instant), "inProgress");
    assert.equal(todoStatus(todo, tomorrow), "expired");
  }
  assert.equal(
    todoStatus(create(repo, 3, { dateId: addDays(dateId, 1) }), instant),
    "pending",
  );
  assert.equal(
    nextTodoRefresh([allDay], new Date(2026, 8, 18, 23, 59, 59, 500)),
    500,
  );
});

test("五色显示按优先级和所属日期推导，完成优先于过期", () => {
  const repo = setup();
  for (const priority of ["low", "normal", "high"])
    assert.equal(
      todoDisplayState(
        create(repo, { low: 1, normal: 2, high: 3 }[priority], { priority }),
        instant,
      ),
      priority,
    );
  const history = create(repo, 4, { dateId: addDays(dateId, -1) });
  const done = repo.complete(owner, history, true, instant);
  assert.equal(todoStatus(done, instant), "completed");
  assert.equal(todoDisplayState(done, instant), "ended");
  const todayDone = repo.complete(owner, repo.get(owner, id(1)), true, instant);
  assert.equal(todoDisplayState(todayDone, instant), "done");
});

test("标题投影与时间摘要不新增事实字段", () => {
  assert.equal(todoTitle({ body: " \n第一行\n下一行 " }), "第一行");
  assert.equal(todoTimeLabel({ startTime: null, endTime: null }), "全天");
  assert.equal(todoTimeLabel({ startTime: "09:01", endTime: null }), "09:01");
  assert.equal(
    todoTimeLabel({ startTime: "09:01", endTime: "09:37" }),
    "09:01–09:37",
  );
});

test("相同创建 ID 重试返回原回执且不重复广播，不同内容拒绝覆盖", () => {
  const repo = setup();
  let broadcasts = 0;
  repo.subscribe(() => broadcasts++);
  const original = create(repo, 1, { body: " a\r\nb " });
  assert.equal(
    create(repo, 1, { body: " a\nb " }, new Date(instant.getTime() + 1000)),
    original,
  );
  assert.equal(broadcasts, 1);
  assert.equal(repo.list(owner).length, 1);
  expectCode(() => create(repo, 1, { body: "其他内容" }), "duplicate");
  assert.equal(repo.get(owner, id(1)).createdAt, original.createdAt);
  assert.equal(Object.isFrozen(original), true);
});

test("无变化编辑和重复完成不更新版本或时间；取消完成清空时间", () => {
  const repo = setup();
  const base = create(repo, 1);
  assert.equal(
    repo.update(owner, base, {}, new Date(instant.getTime() + 1000)),
    base,
  );
  assert.equal(repo.complete(owner, base, false, instant), base);
  const done = repo.complete(owner, base, true, instant);
  assert.equal(done.completedAt, instant.toISOString());
  assert.equal(
    repo.complete(owner, done, true, new Date(instant.getTime() + 1000)),
    done,
  );
  assert.equal(repo.complete(owner, done, false, instant).completedAt, null);
});

test("会话外完成后保存正文，仅合并修改字段并保留完成结果", () => {
  const repo = setup();
  const base = create(repo, 1);
  repo.complete(owner, base, true, instant);
  const saved = saveTodoForm(
    repo,
    owner,
    repo.generation,
    base.clientId,
    base,
    { ...todoFields(base), body: "新正文" },
    instant,
  );
  assert.equal(saved.body, "新正文");
  assert.equal(saved.isCompleted, true);
  assert.equal(saved.localVersion, 3);
});

test("同字段冲突拒绝覆盖，已删除记录不可由旧表单复活", () => {
  const repo = setup();
  const base = create(repo, 1);
  const current = repo.update(owner, base, { body: "其他修改" }, instant);
  expectCode(
    () => repo.update(owner, base, { body: "旧表单修改" }, instant),
    "conflict",
  );
  assert.equal(repo.get(owner, base.clientId), current);
  repo.delete(owner, [current]);
  expectCode(
    () =>
      saveTodoForm(
        repo,
        owner,
        repo.generation,
        base.clientId,
        base,
        todoFields(base),
        instant,
      ),
    "missing",
  );
  assert.equal(repo.list(owner).length, 0);
});

test("所有者切换清空快照，切换回来也拒绝旧会话代次", () => {
  const repo = setup();
  const base = create(repo, 1);
  const generation = repo.generation;
  repo.activate("user:two");
  assert.equal(repo.list("user:two").length, 0);
  expectCode(() => repo.create(owner, id(2), fields(), instant), "owner");
  repo.activate(owner);
  expectCode(
    () => saveTodoForm(repo, owner, generation, id(2), null, fields(), instant),
    "owner",
  );
  assert.equal(repo.list(owner).length, 0);
  assert.equal(base.ownerKey, owner);
});

test("批量任一版本过期或目标缺失时全部不改/不删", () => {
  const repo = setup();
  const a = create(repo, 1),
    b = create(repo, 2);
  const changed = repo.update(owner, b, { body: "变更" }, instant);
  expectCode(
    () => repo.batch(owner, [a, b], { isPinned: true }, instant),
    "conflict",
  );
  expectCode(() => repo.delete(owner, [a, b]), "conflict");
  expectCode(
    () =>
      repo.batch(
        owner,
        [a, { clientId: id(9), localVersion: 1 }],
        { isStarred: true },
        instant,
      ),
    "missing",
  );
  assert.equal(repo.get(owner, a.clientId), a);
  assert.equal(repo.get(owner, b.clientId), changed);
});

test("批量写入原子且只广播一次，无效布尔值不产生部分写入", () => {
  const repo = setup();
  const a = create(repo, 1),
    b = create(repo, 2);
  let broadcasts = 0;
  repo.subscribe(() => broadcasts++);
  expectCode(
    () => repo.batch(owner, [a, b], { isStarred: "invalid" }, instant),
    "validation",
  );
  assert.equal(broadcasts, 0);
  assert.equal(repo.get(owner, a.clientId), a);
  repo.batch(owner, [a, b], { isStarred: true, isPinned: true }, instant);
  assert.equal(broadcasts, 1);
  const targets = repo.list(owner);
  assert.equal(
    targets.every((todo) => todo.isStarred && todo.isPinned),
    true,
  );
  repo.delete(owner, targets);
  assert.equal(broadcasts, 2);
  assert.equal(repo.list(owner).length, 0);
});

test("日期、状态、正文大小写搜索在排序前统一过滤，完成只进入全部", () => {
  const repo = setup();
  const a = create(repo, 1, { body: "标题\nSome BODY text" });
  repo.complete(owner, a, true, instant);
  create(repo, 2, { startTime: "10:00" });
  create(repo, 3, { dateId: addDays(dateId, -1) });
  const query = { dateId, filter: "all", sort: "timeAsc", keyword: " body " };
  assert.deepEqual(
    queryTodos(repo.list(owner), query, instant).map((todo) => todo.clientId),
    [a.clientId],
  );
  assert.equal(
    queryTodos(
      repo.list(owner),
      { ...query, keyword: "", filter: "pending" },
      instant,
    ).length,
    1,
  );
  assert.equal(
    queryTodos(repo.list(owner), { ...query, keyword: "不存在" }, instant)
      .length,
    0,
  );
});

test("置顶先于时间、全天末尾、倒序和优先级均具有确定次序", () => {
  const repo = setup();
  create(repo, 1, { isPinned: true });
  create(repo, 2, { startTime: "09:00", priority: "low" });
  create(repo, 3, { startTime: "10:00", priority: "high" });
  create(repo, 4, { priority: "high" });
  create(repo, 5, { startTime: "09:00", priority: "normal" });
  const query = { dateId, filter: "all", keyword: "", sort: "timeAsc" };
  const ordered = (sort) =>
    queryTodos(repo.list(owner), { ...query, sort }, instant).map((todo) =>
      Number(todo.clientId.slice(-12)),
    );
  assert.deepEqual(ordered("timeAsc"), [1, 2, 5, 3, 4]);
  assert.deepEqual(ordered("timeDesc"), [1, 3, 2, 5, 4]);
  assert.deepEqual(ordered("priority"), [1, 3, 5, 2, 4]);
});

test("整周查询覆盖周一至周日、日期升序且关键词可过滤", () => {
  const repo = setup();
  const mondayId = addDays(dateId, -4);
  const sundayId = addDays(mondayId, 6);
  create(repo, 1, { dateId: sundayId, body: "周例会\n完整正文" });
  create(repo, 2, { dateId: mondayId });
  create(repo, 3, { dateId: addDays(mondayId, -1) });
  create(repo, 4, { dateId: addDays(dateId, 7) });
  const weekQuery = {
    weekId: mondayId,
    filter: "all",
    keyword: "",
    sort: "timeAsc",
  };
  assert.deepEqual(
    queryTodosByWeek(repo.list(owner), weekQuery, instant).map((todo) =>
      Number(todo.clientId.slice(-12)),
    ),
    [2, 1],
  );
  assert.deepEqual(
    queryTodosByWeek(
      repo.list(owner),
      { ...weekQuery, keyword: "周例会" },
      instant,
    ).map((todo) => Number(todo.clientId.slice(-12))),
    [1],
  );
});

test("整周查询组内排序与单日一致，筛选、空周与非周一 weekId 行为确定", () => {
  const repo = setup();
  const mondayId = addDays(dateId, -4);
  create(repo, 1, { startTime: "09:00", priority: "low" });
  create(repo, 2, { startTime: "10:00", priority: "high" });
  create(repo, 3, { startTime: "11:00", isPinned: true });
  create(repo, 4, { priority: "high" });
  const done = create(repo, 5, { startTime: "08:00" });
  repo.complete(owner, done, true, instant);
  create(repo, 6, { dateId: addDays(mondayId, 7) });
  create(repo, 7, { dateId: addDays(mondayId, 9) });
  const weekQuery = {
    weekId: mondayId,
    filter: "all",
    keyword: "",
    sort: "timeAsc",
  };
  const ordered = (patch = {}) =>
    queryTodosByWeek(repo.list(owner), { ...weekQuery, ...patch }, instant).map(
      (todo) => Number(todo.clientId.slice(-12)),
    );
  assert.deepEqual(ordered(), [3, 5, 1, 2, 4]);
  assert.deepEqual(ordered({ sort: "priority" }), [3, 2, 5, 1, 4]);
  assert.deepEqual(ordered({ filter: "pending" }), [3, 2]);
  assert.deepEqual(ordered({ keyword: "不存在" }), []);
  assert.deepEqual(ordered({ weekId: addDays(mondayId, 2) }), [3, 5, 1, 2, 4, 6]);
  assert.deepEqual(
    queryTodosByWeek(
      repo.list(owner),
      { ...weekQuery, weekId: addDays(mondayId, 14) },
      instant,
    ),
    [],
  );
});

test("种子只写独立预览命名空间，覆盖动态日期与五种显示态", async () => {
  const repo = setup();
  await seedTodoPreview(repo, owner, instant);
  assert.equal(repo.list(owner).length, 0);
  const preview = "preview:user:one";
  repo.activate(preview);
  await seedTodoPreview(repo, preview, instant);
  const samples = repo.list(preview);
  assert.equal(samples.length, 8);
  assert.deepEqual(
    [...new Set(samples.map((todo) => todoDisplayState(todo, instant)))].sort(),
    ["done", "ended", "high", "low", "normal"],
  );
  await seedTodoPreview(repo, preview, instant);
  assert.equal(repo.list(preview).length, 8);
});

test("生成的会话 ID 为 UUID v4且无重复；非法身份拒绝创建", () => {
  const values = Array.from({ length: 100 }, newTodoId);
  assert.equal(new Set(values).size, values.length);
  for (const value of values)
    assert.match(
      value,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  expectCode(() => setup().create(owner, "", fields(), instant), "validation");
});
