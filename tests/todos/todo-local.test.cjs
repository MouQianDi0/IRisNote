const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const { DatabaseSync } = require("node:sqlite");
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
  TodoLocalRepository,
  LOCAL_GUEST_OWNER_KEY,
  todoFromRow,
} = require("@/features/todos/data/todo-local.repository.ts");
const {
  createLocalTodos,
} = require("@/core/database/migrations/0007-create-local-todos.ts");
const {
  databaseMigrations,
  CURRENT_DATABASE_VERSION,
} = require("@/core/database/migrations/index.ts");
const {
  emptyTodoFields,
  saveTodoForm,
} = require("@/features/todos/services/todo-service.ts");
const { seedTodoPreview } = require("@/features/todos/testing/todo-seeds.ts");

const owner = "user:one";
const now = new Date("2026-09-19T09:37:00.000Z");
const later = new Date("2026-09-19T09:38:00.000Z");
const id = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const fields = (patch = {}) => ({
  ...emptyTodoFields("2026-09-19"),
  body: "计划\n完整正文 😀 ' ?",
  ...patch,
});
const expectCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Execute production SQL against an isolated Node SQLite database. Hooks control
// async boundaries; this does not simulate or claim Expo/Android acceptance.
function databaseAdapter(sqlite) {
  const hooks = {};
  const statements = [];
  const tx = {
    async run(sql, params = []) {
      statements.push(sql);
      await hooks.run?.(sql, params);
      const result = sqlite.prepare(sql).run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getAll(sql, params = []) {
      const rows = sqlite.prepare(sql).all(...params);
      await hooks.read?.(sql, params);
      return rows;
    },
    async getFirst(sql, params = []) {
      return sqlite.prepare(sql).get(...params) ?? null;
    },
  };
  let tail = Promise.resolve();
  const enqueue = (task) => {
    const next = tail.then(task);
    tail = next.catch(() => {});
    return next;
  };
  const port = {
    run: (...args) => enqueue(() => tx.run(...args)),
    getAll: (...args) => enqueue(() => tx.getAll(...args)),
    getFirst: (...args) => enqueue(() => tx.getFirst(...args)),
    transaction: (task) =>
      enqueue(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const result = await task(tx);
          await hooks.beforeCommit?.();
          sqlite.exec("COMMIT");
          await hooks.afterCommit?.();
          return result;
        } catch (error) {
          if (sqlite.isTransaction) sqlite.exec("ROLLBACK");
          throw error;
        }
      }),
  };
  return { port, hooks, statements };
}
const migrationPort = (sqlite) => ({
  execAsync: async (sql) => sqlite.exec(sql),
  getAllAsync: async (sql) => sqlite.prepare(sql).all(),
  runAsync: async (sql, params) =>
    params ? sqlite.prepare(sql).run(params) : sqlite.prepare(sql).run(),
});
async function setup(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  await createLocalTodos.up(migrationPort(sqlite));
  const adapter = databaseAdapter(sqlite);
  const repo = new TodoLocalRepository(adapter.port);
  await repo.activate(owner);
  return {
    ...adapter,
    sqlite,
    repo,
    create: (number, patch = {}) =>
      repo.create(owner, id(number), fields(patch), now),
  };
}

test("迁移 1–6 升级到 7，保留既有表数据，迁移可重复且具备所有者日期索引", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const database = migrationPort(sqlite);
  for (const migration of databaseMigrations.filter((item) => item.version < 7))
    await migration.up(database);
  sqlite.exec(
    "INSERT INTO local_notes (owner_user_id, client_id, title, created_at, local_updated_at) VALUES (1, 1, '保留笔记', '2026-09-19', '2026-09-19')",
  );
  await createLocalTodos.up(database);
  await createLocalTodos.up(database);
  assert.equal(CURRENT_DATABASE_VERSION, 9);
  assert.equal(
    sqlite.prepare("SELECT title FROM local_notes").get().title,
    "保留笔记",
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM local_todos").get().count,
    0,
  );
  assert.deepEqual(
    sqlite
      .prepare("PRAGMA index_info(idx_local_todos_owner_date)")
      .all()
      .map((row) => row.name),
    ["owner_key", "date_id"],
  );
});

test("全部字段写入文件 SQLite，关闭重开恢复稳定 ID、版本与游客数据", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "irisnote-todos-"));
  const filename = path.join(directory, "test.sqlite");
  let sqlite = new DatabaseSync(filename);
  t.after(() => {
    sqlite.close();
    fs.unlinkSync(filename);
    fs.rmdirSync(directory);
  });
  await createLocalTodos.up(migrationPort(sqlite));
  let repo = new TodoLocalRepository(databaseAdapter(sqlite).port);
  await repo.activate(LOCAL_GUEST_OWNER_KEY);
  const created = await repo.create(
    LOCAL_GUEST_OWNER_KEY,
    id(1),
    fields({
      priority: "high",
      isStarred: true,
      isPinned: true,
      reminderEnabled: false,
      startTime: "09:01",
      endTime: "09:37",
      timeZone: "Asia/Shanghai",
    }),
    now,
  );
  const completed = await repo.complete(
    LOCAL_GUEST_OWNER_KEY,
    created,
    true,
    later,
  );
  sqlite.close();
  sqlite = new DatabaseSync(filename);
  repo = new TodoLocalRepository(databaseAdapter(sqlite).port);
  await repo.activate(LOCAL_GUEST_OWNER_KEY);
  assert.deepEqual(repo.get(LOCAL_GUEST_OWNER_KEY, id(1)), completed);
  assert.equal(completed.localVersion, 2);
  assert.equal(Object.isFrozen(repo.list(LOCAL_GUEST_OWNER_KEY)), true);
  assert.equal(Object.isFrozen(repo.get(LOCAL_GUEST_OWNER_KEY, id(1))), true);
});

test("创建幂等、无变化不增版本；并发编辑合并非重叠字段并保留完成状态", async (t) => {
  const { repo, create, statements } = await setup(t);
  const created = await create(1);
  let broadcasts = 0;
  repo.subscribe(() => {
    broadcasts += 1;
  });
  statements.length = 0;
  assert.deepEqual(await create(1), created);
  assert.deepEqual(await repo.update(owner, created, {}, later), created);
  assert.deepEqual(await repo.complete(owner, created, false, later), created);
  await repo.batch(owner, [created], { isPinned: false }, later);
  assert.equal(statements.length, 0);
  assert.equal(broadcasts, 0);
  await expectCode(create(1, { body: "重复身份不同内容" }), "duplicate");
  await repo.complete(owner, created, true, later);
  const edited = await saveTodoForm(
    repo,
    owner,
    repo.generation,
    id(1),
    created,
    fields({ body: "新正文" }),
    later,
  );
  assert.equal(edited.isCompleted, true);
  assert.equal(edited.localVersion, 3);
  await expectCode(
    repo.update(owner, created, { body: "覆盖" }, later),
    "conflict",
  );
  const merged = await repo.update(owner, created, { isStarred: true }, later);
  assert.equal(merged.body, "新正文");
  assert.equal(merged.localVersion, 4);
  await expectCode(repo.complete(owner, created, false, later), "conflict");
  await repo.delete(owner, [merged]);
  await expectCode(
    repo.update(owner, merged, { body: "不能复活" }, later),
    "missing",
  );
});

test("相同 ID 在游客、两个账号间隔离，切换立即清空快照但不删库", async (t) => {
  const { repo, create } = await setup(t);
  const accountOne = await create(1);
  for (const target of ["user:two", LOCAL_GUEST_OWNER_KEY]) {
    const loading = repo.activate(target);
    assert.equal(repo.ready, false);
    assert.deepEqual(repo.list(target), []);
    await loading;
    await repo.create(target, id(1), fields({ body: target }), now);
    await expectCode(repo.delete(owner, [accountOne]), "owner");
  }
  await repo.activate(owner);
  assert.deepEqual(repo.list(owner), [accountOne]);
  await repo.activate("user:two");
  assert.equal(repo.get("user:two", id(1)).body, "user:two");
});

test("真实 SQLite 字段检查拒绝非法值，读取映射也拒绝损坏数据", async (t) => {
  const { create, sqlite } = await setup(t);
  await create(1);
  for (const assignment of [
    "date_id = '2026-02-30'",
    "date_id = '0000-01-01'",
    "end_time = '09:37'",
    "start_time = '24:00'",
    "priority = 'medium'",
    "is_starred = 2",
    "local_version = 0",
    "local_version = 1.5",
    "is_completed = 1",
    "client_id = 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'",
    "body = ''",
  ]) {
    assert.throws(
      () => sqlite.exec(`UPDATE local_todos SET ${assignment}`),
      /CHECK constraint failed/,
    );
  }
  const row = sqlite.prepare("SELECT * FROM local_todos").get();
  for (const patch of [
    { is_pinned: 2 },
    { local_version: 1.5 },
    { created_at: "wrong" },
    { completed_at: now.toISOString() },
    { client_id: "wrong" },
  ])
    assert.throws(() => todoFromRow({ ...row, ...patch }));
  assert.throws(
    () => sqlite.exec("INSERT INTO local_todos SELECT * FROM local_todos"),
    /UNIQUE constraint failed/,
  );
});

test("批量冲突全不改；第二条 SQL 失败回滚，成功后只广播一次", async (t) => {
  const { repo, create, hooks, sqlite } = await setup(t);
  const first = await create(1);
  const second = await create(2);
  const before = repo.list(owner);
  await expectCode(
    repo.batch(
      owner,
      [first, { ...second, localVersion: 99 }],
      { isPinned: true },
      later,
    ),
    "conflict",
  );
  assert.deepEqual(repo.list(owner), before);
  let calls = 0;
  let broadcasts = 0;
  repo.subscribe(() => {
    broadcasts += 1;
  });
  hooks.run = (sql) => {
    if (sql.startsWith("UPDATE") && ++calls === 2) throw new Error("磁盘故障");
  };
  await assert.rejects(
    repo.batch(owner, [first, second], { isStarred: true }, later),
    /磁盘故障/,
  );
  assert.equal(
    sqlite.prepare("SELECT SUM(is_starred) AS total FROM local_todos").get()
      .total,
    0,
  );
  assert.deepEqual(repo.list(owner), before);
  assert.equal(broadcasts, 0);
  delete hooks.run;
  await repo.batch(owner, [first, second], { isStarred: true }, later);
  assert.equal(broadcasts, 1);
  assert.ok(
    repo
      .list(owner)
      .every((entity) => entity.isStarred && entity.localVersion === 2),
  );
  const updated = repo.list(owner);
  calls = 0;
  hooks.run = () => {
    if (++calls === 2) throw new Error("删除失败");
  };
  await assert.rejects(repo.delete(owner, updated), /删除失败/);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS total FROM local_todos").get().total,
    2,
  );
  assert.deepEqual(repo.list(owner), updated);
  delete hooks.run;
  await repo.delete(owner, updated);
  assert.deepEqual(repo.list(owner), []);
});

test("COMMIT 前不发布，提交失败保留旧快照且可重试", async (t) => {
  const { repo, create, hooks, sqlite } = await setup(t);
  hooks.beforeCommit = () => {
    assert.deepEqual(repo.list(owner), []);
    throw new Error("提交失败");
  };
  await assert.rejects(create(1), /提交失败/);
  assert.deepEqual(repo.list(owner), []);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS total FROM local_todos").get().total,
    0,
  );
  delete hooks.beforeCommit;
  await create(1);
  assert.equal(repo.list(owner).length, 1);
});

test("丢弃 A→B→A 的过期加载，加载失败可重新激活恢复", async (t) => {
  const { repo, create, port, hooks } = await setup(t);
  await create(1);
  const second = new TodoLocalRepository(port);
  const started = deferred();
  const release = deferred();
  hooks.read = async () => {
    started.resolve();
    await release.promise;
  };
  const oldLoad = second.activate(owner);
  const rejected = expectCode(oldLoad, "owner");
  await started.promise;
  const intermediate = second.activate("user:two");
  const intermediateRejected = expectCode(intermediate, "owner");
  const latest = second.activate(owner);
  release.resolve();
  await Promise.all([rejected, intermediateRejected, latest]);
  assert.equal(second.ready, true);
  assert.equal(second.list(owner).length, 1);
  hooks.read = () => {
    throw new Error("读取失败");
  };
  await assert.rejects(second.activate("user:two"), /读取失败/);
  assert.equal(second.ready, false);
  assert.deepEqual(second.list("user:two"), []);
  delete hooks.read;
  await second.activate("user:two");
  assert.equal(second.ready, true);
});

test("切换发生在写事务内时回滚，排队的旧账号命令不得写入", async (t) => {
  const { repo, create, hooks, sqlite } = await setup(t);
  const started = deferred();
  const release = deferred();
  hooks.run = async () => {
    started.resolve();
    await release.promise;
  };
  const writing = create(1);
  const firstRejected = expectCode(writing, "owner");
  const queued = create(2);
  const queuedRejected = expectCode(queued, "owner");
  await started.promise;
  const loading = repo.activate("user:two");
  assert.deepEqual(repo.list("user:two"), []);
  release.resolve();
  await Promise.all([firstRejected, queuedRejected, loading]);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS total FROM local_todos").get().total,
    0,
  );
});

test("COMMIT 回执期间切换账号，旧写入保留原归属且不发布到新快照", async (t) => {
  const { repo, create, hooks } = await setup(t);
  const committed = deferred();
  const release = deferred();
  hooks.afterCommit = async () => {
    committed.resolve();
    await release.promise;
  };
  const writing = create(1);
  const rejected = expectCode(writing, "owner");
  await committed.promise;
  const loading = repo.activate("user:two");
  release.resolve();
  await Promise.all([rejected, loading]);
  assert.deepEqual(repo.list("user:two"), []);
  await repo.activate(owner);
  assert.equal(repo.list(owner).length, 1);
});

test("重复激活共享加载；注销或数据库端口替换使旧会话失效", async (t) => {
  const { repo, create, port, hooks } = await setup(t);
  const base = await create(1);
  const second = new TodoLocalRepository(port);
  const first = second.activate(owner);
  assert.equal(second.activate(owner), first);
  await first;
  const oldGeneration = second.generation;
  second.deactivate();
  assert.equal(second.ownerKey, null);
  assert.equal(second.ready, false);
  assert.throws(
    () =>
      saveTodoForm(second, owner, oldGeneration, id(1), base, fields(), now),
    /会话已失效/,
  );
  const started = deferred();
  const release = deferred();
  hooks.read = async () => {
    started.resolve();
    await release.promise;
  };
  const pending = second.activate(owner);
  const rejected = expectCode(pending, "owner");
  await started.promise;
  const changed = second.activate(owner, { ...port });
  release.resolve();
  await Promise.all([rejected, changed]);
  assert.equal(second.list(owner).length, 1);
});

test("两仓库同时写入使用数据库最新版本，陈旧快照不能覆盖；预览种子等待落盘", async (t) => {
  const { repo, create, port } = await setup(t);
  const base = await create(1);
  const peer = new TodoLocalRepository(port);
  await peer.activate(owner);
  const results = await Promise.allSettled([
    repo.update(owner, base, { body: "版本一" }, later),
    peer.update(owner, base, { body: "版本二" }, later),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    results.find((item) => item.status === "rejected").reason.code,
    "conflict",
  );
  const preview = "preview:guest:local";
  await repo.activate(preview);
  await seedTodoPreview(repo, preview, now);
  await peer.activate(preview);
  assert.equal(peer.list(preview).length, 8);
  assert.equal(
    peer.list(preview).filter((entity) => entity.isCompleted).length,
    2,
  );
  await seedTodoPreview(peer, preview, now);
  assert.equal(peer.list(preview).length, 8);
});

test("store 加载锁、失败重试与旧横幅隔离；切换清除查询而保留落盘数据", async (t) => {
  const { port, hooks } = await setup(t);
  const notices = [];
  const originalLoad = Module._load;
  const previousDev = global.__DEV__;
  global.__DEV__ = false;
  Module._load = function (name, ...args) {
    if (name === "@/core/notifications")
      return { banner: { show: (notice) => notices.push(notice) } };
    return originalLoad.call(this, name, ...args);
  };
  let store;
  try {
    store = require("@/features/todos/state/todo-store.ts");
  } finally {
    Module._load = originalLoad;
  }
  t.after(() => {
    store.deactivateTodoOwner();
    if (previousDev === undefined) delete global.__DEV__;
    else global.__DEV__ = previousDev;
  });
  const {
    activateTodoOwner,
    deactivateTodoOwner,
    todoRepository,
    useTodoStore,
    selectTodoDate,
  } = store;
  const loading = activateTodoOwner(owner, port);
  assert.equal(activateTodoOwner(owner, port), loading);
  assert.equal(useTodoStore.getState().ready, false);
  await loading;
  await todoRepository.create(owner, id(1), fields(), now);
  selectTodoDate(owner, "2026-09-20");
  await activateTodoOwner(owner, port);
  assert.equal(useTodoStore.getState().selectedDateId, "2026-09-20");
  hooks.read = () => {
    throw new Error("暂时无法读取");
  };
  await activateTodoOwner("user:two", port);
  assert.equal(useTodoStore.getState().ready, false);
  assert.equal(useTodoStore.getState().selectedDateId, null);
  assert.deepEqual(useTodoStore.getState().entities, []);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].type, "important");
  delete hooks.read;
  await notices[0].action.onPress();
  assert.equal(useTodoStore.getState().ready, true);
  assert.equal(todoRepository.ownerKey, "user:two");
  await activateTodoOwner(owner, port);
  assert.equal(useTodoStore.getState().entities.length, 1);
  await notices[0].action.onPress();
  assert.equal(todoRepository.ownerKey, owner);
  deactivateTodoOwner();
  assert.equal(useTodoStore.getState().ready, false);
  assert.equal(useTodoStore.getState().ownerKey, null);
  assert.deepEqual(useTodoStore.getState().entities, []);
});
