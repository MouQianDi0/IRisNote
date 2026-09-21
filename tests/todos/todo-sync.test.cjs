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
  TodoLocalRepository,
} = require("@/features/todos/data/todo-local.repository.ts");
const data = require("@/features/todos/data/todo-sync.repository.ts");
const {
  createLocalTodos,
} = require("@/core/database/migrations/0007-create-local-todos.ts");
const {
  createTodoSync,
} = require("@/core/database/migrations/0009-create-todo-sync.ts");
const {
  emptyTodoFields,
} = require("@/features/todos/services/todo-service.ts");
const { syncTodos } = require("@/features/todos/services/todo-sync.service.ts");
const { TodoApiError } = require("@/features/todos/sync.types.ts");
const wire = require("@/features/todos/api/todo-wire.ts");
const {
  todoSyncBanner,
} = require("@/features/todos/state/todo-sync-banner.ts");
const owner = "user:7";
const now = new Date("2026-09-20T01:00:00.000Z");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fields = (body = "本机待办") => ({
  ...emptyTodoFields("2026-09-20"),
  body,
});
const dto = (entity, version = 1, extra = {}) => ({
  id: 1,
  user_id: 7,
  client_id: entity.clientId,
  ...wire.business(entity),
  created_at: entity.createdAt,
  updated_at: now.toISOString(),
  version,
  deleted_at: null,
  ...extra,
});
function adapter(sqlite) {
  const tx = {
    run: async (sql, p = []) => {
      const r = sqlite.prepare(sql).run(...p);
      return {
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      };
    },
    getAll: async (sql, p = []) => sqlite.prepare(sql).all(...p),
    getFirst: async (sql, p = []) => sqlite.prepare(sql).get(...p) ?? null,
  };
  let tail = Promise.resolve();
  const enqueue = (fn) => {
    const result = tail.then(fn);
    tail = result.catch(() => {});
    return result;
  };
  return {
    run: (...args) => enqueue(() => tx.run(...args)),
    getAll: (...args) => enqueue(() => tx.getAll(...args)),
    getFirst: (...args) => enqueue(() => tx.getFirst(...args)),
    transaction: (fn) =>
      enqueue(async () => {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(tx);
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      }),
  };
}
async function setup(t, file = ":memory:") {
  const sqlite = new DatabaseSync(file);
  t.after(() => {
    if (sqlite.isOpen) sqlite.close();
  });
  const migration = { execAsync: async (sql) => sqlite.exec(sql) };
  await createLocalTodos.up(migration);
  await createTodoSync.up(migration);
  const port = adapter(sqlite);
  const repo = new TodoLocalRepository(port, data.recordTodoChanges);
  await repo.activate(owner);
  return {
    sqlite,
    port,
    repo,
    tx: (fn) => repo.syncTransaction(owner, fn),
    create: (n, body) => repo.create(owner, id(n), fields(body), now),
  };
}
async function state(ctx, n = 1) {
  return ctx.tx((tx) => data.getSyncRecord(tx, owner, id(n)));
}
async function operations(ctx) {
  return ctx.tx((tx) => data.prepareOperations(tx, owner, Date.now()));
}
async function synced(ctx, n = 1) {
  const e = await ctx.create(n);
  const op = (await operations(ctx)).find((o) => o.client_id === e.clientId);
  const remote = dto(e, 1, { id: n });
  await ctx.tx((tx) => data.acceptOperation(tx, op, remote));
  return remote;
}
const snapshot = (
  items = [],
  cursor = "baseline",
  more = false,
  next = null,
) => ({
  data: items,
  page: { has_more: more, next_cursor: next, snapshot_token: "snapshot" },
  sync: { changes_cursor: cursor },
});
const changes = (items = [], cursor = "next") => ({
  data: items,
  page: { has_more: false, next_cursor: cursor },
});
function transport(overrides = {}) {
  return {
    snapshot: async () => snapshot(),
    changes: async () => changes(),
    byClientId: async () => {
      throw Error("unexpected lookup");
    },
    write: async () => {
      throw Error("network unavailable");
    },
    batch: async () => {
      throw Error("network unavailable");
    },
    ...overrides,
  };
}
function run(ctx, remote, isCurrent = () => true) {
  return syncTodos({
    repository: ctx.repo,
    ownerKey: owner,
    transport: remote,
    isCurrent,
  });
}

test("待办同步汇总只在上传后显示成功横幅，待处理状态优先", () => {
  const success = todoSyncBanner({ pending: 0, uploaded: 2 }, () => {});
  assert.equal(success.title, "待办已同步");
  assert.equal(success.message, "已将 2 项修改上传到云端");
  assert.equal(success.type, "success");
  assert.deepEqual(success.lifetime, { mode: "timed", durationMs: 4000 });
  assert.equal(todoSyncBanner({ pending: 0, uploaded: 0 }, () => {}), null);
  const pending = todoSyncBanner({ pending: 1, uploaded: 2 }, () => {});
  assert.equal(pending.title, "待办尚未全部同步");
  assert.equal(pending.type, "important");
  assert.deepEqual(pending.lifetime, { mode: "persistent" });
  assert.equal(pending.action.label, "查看待办同步");
});

test("本地事实与 outbox 意图原子提交，失败全部回滚，游客不入云端", async (t) => {
  const c = await setup(t);
  const original = c.repo.list(owner);
  c.sqlite.exec(
    "CREATE TRIGGER reject_sync BEFORE INSERT ON todo_sync_state BEGIN SELECT RAISE(ABORT,'disk failure'); END;",
  );
  await assert.rejects(c.create(1), /disk failure/);
  assert.strictEqual(c.repo.list(owner), original);
  assert.equal(
    c.sqlite.prepare("SELECT count(*) n FROM local_todos").get().n,
    0,
  );
  c.sqlite.exec("DROP TRIGGER reject_sync");
  await c.create(1);
  assert.equal((await state(c)).dirty, true);
  await c.repo.activate("guest:local");
  await c.repo.create("guest:local", id(2), fields(), now);
  assert.equal(
    c.sqlite.prepare("SELECT count(*) n FROM todo_sync_state").get().n,
    1,
  );
});
test("发出后请求冻结，编辑保留后继意图，旧回执只确认发送时序号", async (t) => {
  const c = await setup(t);
  const base = await c.create(1);
  const [op] = await operations(c);
  await c.repo.update(owner, base, { body: "稍后的内容" }, now);
  const [retry] = await operations(c);
  assert.deepEqual(retry.request, op.request);
  assert.equal(retry.operation_id, op.operation_id);
  await c.tx((tx) => data.acceptOperation(tx, op, dto(base)));
  assert.equal(c.repo.get(owner, id(1)).body, "稍后的内容");
  assert.equal((await state(c)).dirty, true);
  const [patch] = await operations(c);
  assert.equal(patch.request.kind, "patch");
  assert.equal(patch.request.body.expected_version, 1);
  assert.equal(patch.request.body.body, "稍后的内容");
  assert.notEqual(patch.operation_id, op.operation_id);
});
test("断网重试保存原键和原指纹，创建回执恢复后不重复创建", async (t) => {
  const c = await setup(t);
  const base = await c.create(1);
  const calls = [];
  let lost = true;
  const remote = transport({
    write: async (op) => {
      calls.push(op);
      if (lost) {
        lost = false;
        throw Error("response lost");
      }
      return { data: dto(base) };
    },
    snapshot: async () => snapshot([dto(base)]),
  });
  await run(c, remote);
  assert.equal((await state(c)).dirty, true);
  assert.equal(
    c.sqlite.prepare("SELECT count(*) n FROM todo_outbox").get().n,
    1,
  );
  await c.port.run("UPDATE todo_outbox SET next_attempt_at=0");
  await run(c, remote);
  assert.equal(calls[0].operation_id, calls[1].operation_id);
  assert.deepEqual(calls[0].request, calls[1].request);
  assert.equal((await state(c)).status, "synced");
});
test("未发送创建随后删除可消除，已冻结创建后删除必须恢复并发送墓碑请求", async (t) => {
  const c = await setup(t);
  const first = await c.create(1);
  await c.repo.delete(owner, [first]);
  assert.deepEqual(await operations(c), []);
  const second = await c.create(2);
  const [create] = await operations(c);
  await c.repo.delete(owner, [second]);
  await c.tx((tx) =>
    data.acceptOperation(tx, create, dto(second, 1, { id: 2 })),
  );
  assert.equal(c.repo.list(owner).length, 0);
  const [remove] = await operations(c);
  assert.equal(remove.request.kind, "delete");
  assert.equal(remove.request.expected_version, 1);
});
test("本地版本与服务端版本分离，旧增量和重放不能覆盖新镜像", async (t) => {
  const c = await setup(t);
  const remote = await synced(c);
  await c.tx((tx) =>
    data.applyRemote(tx, owner, { ...remote, version: 5, body: "最新云端" }),
  );
  const version = c.repo.get(owner, id(1)).localVersion;
  await c.tx((tx) =>
    data.applyRemote(tx, owner, { ...remote, version: 3, body: "陈旧回包" }),
  );
  assert.equal(c.repo.get(owner, id(1)).body, "最新云端");
  assert.equal(c.repo.get(owner, id(1)).localVersion, version);
});
test("版本冲突保存三方，采用本地以新键和最新云端版本重试", async (t) => {
  const c = await setup(t);
  const original = await synced(c);
  await c.repo.update(
    owner,
    c.repo.get(owner, id(1)),
    { body: "本地修改" },
    now,
  );
  const [op] = await operations(c);
  const cloud = { ...original, version: 2, body: "另一设备" };
  await c.tx((tx) => data.failOperation(tx, op, "冲突", false, 0, cloud, true));
  const conflict = await state(c);
  assert.equal(conflict.base.body, original.body);
  assert.equal(conflict.remote.body, "另一设备");
  assert.equal(conflict.candidate.body, "本地修改");
  await c.tx((tx) =>
    data.resolveTodoConflict(
      tx,
      owner,
      id(1),
      conflict.sequence,
      JSON.stringify(cloud),
      "local",
    ),
  );
  const [retry] = await operations(c);
  assert.notEqual(retry.operation_id, op.operation_id);
  assert.equal(retry.request.body.expected_version, 2);
});
test("冲突选择时版本再次变化必须拒绝，不能丢弃新增本地编辑", async (t) => {
  const c = await setup(t);
  const cloud = await synced(c);
  await c.repo.update(owner, c.repo.get(owner, id(1)), { body: "候选" }, now);
  await c.tx((tx) => data.applyRemote(tx, owner, { ...cloud, version: 2 }));
  const s = await state(c);
  await c.repo.update(
    owner,
    c.repo.get(owner, id(1)),
    { body: "弹窗后继续编辑" },
    now,
  );
  await assert.rejects(
    c.tx((tx) =>
      data.resolveTodoConflict(
        tx,
        owner,
        id(1),
        s.sequence,
        JSON.stringify(s.remote),
        "cloud",
      ),
    ),
    /已变化/,
  );
  assert.equal(c.repo.get(owner, id(1)).body, "弹窗后继续编辑");
});
test("云端删除并发编辑不复活，另存分配新身份并保留候选", async (t) => {
  const c = await setup(t);
  const remote = await synced(c);
  await c.repo.update(
    owner,
    c.repo.get(owner, id(1)),
    { body: "恢复候选" },
    now,
  );
  const tomb = {
    id: 1,
    client_id: id(1),
    version: 2,
    deleted_at: now.toISOString(),
  };
  await c.tx((tx) => data.applyRemote(tx, owner, tomb));
  const s = await state(c);
  await assert.rejects(
    c.tx((tx) =>
      data.resolveTodoConflict(
        tx,
        owner,
        id(1),
        s.sequence,
        JSON.stringify(tomb),
        "local",
      ),
    ),
    /另存/,
  );
  await c.tx((tx) =>
    data.resolveTodoConflict(
      tx,
      owner,
      id(1),
      s.sequence,
      JSON.stringify(tomb),
      "copy",
    ),
  );
  assert.equal(c.repo.list(owner).length, 1);
  assert.notEqual(c.repo.list(owner)[0].clientId, remote.client_id);
  assert.equal(c.repo.list(owner)[0].body, "恢复候选");
});
test("部分全量页失败不清本地、不建立游标，下次从新快照恢复", async (t) => {
  const c = await setup(t);
  const remote = await synced(c);
  let page = 0;
  await assert.rejects(
    run(
      c,
      transport({
        snapshot: async () => {
          if (page++) throw Error("offline");
          return snapshot([], "baseline", true, "page2");
        },
      }),
    ),
    /offline/,
  );
  assert.equal(c.repo.list(owner).length, 1);
  assert.equal(await c.tx((tx) => data.readCursor(tx, owner)), undefined);
  await run(c, transport({ snapshot: async () => snapshot([remote]) }));
  assert.equal(await c.tx((tx) => data.readCursor(tx, owner)), "baseline");
});
test("游标过期完整重建移除干净缺失镜像，保留未确认编辑与创建", async (t) => {
  const c = await setup(t);
  await synced(c, 1);
  await synced(c, 2);
  await c.create(3);
  await c.repo.update(owner, c.repo.get(owner, id(2)), { body: "待提交" }, now);
  await c.tx((tx) => data.saveCursor(tx, owner, "expired"));
  await run(
    c,
    transport({
      changes: async () => {
        throw new TodoApiError(410, "SYNC_CURSOR_EXPIRED", "expired");
      },
    }),
  );
  assert.throws(() => c.repo.get(owner, id(1)), /已被删除/);
  assert.equal(c.repo.get(owner, id(2)).body, "待提交");
  assert.equal(c.repo.get(owner, id(3)).body, "本机待办");
  assert.equal(await c.tx((tx) => data.readCursor(tx, owner)), "baseline");
});
test("增量页实体和游标同事务，游标写入失败回滚实体", async (t) => {
  const c = await setup(t);
  const remote = await synced(c);
  await c.tx((tx) => data.saveCursor(tx, owner, "old"));
  c.sqlite.exec(
    "CREATE TRIGGER reject_cursor BEFORE UPDATE ON todo_sync_cursors BEGIN SELECT RAISE(ABORT,'disk full'); END;",
  );
  await assert.rejects(
    run(
      c,
      transport({
        changes: async () =>
          changes([
            {
              operation: "upsert",
              change_seq: "9007199254740993",
              data: { ...remote, version: 2, body: "不应提交" },
            },
          ]),
      }),
    ),
    /disk full/,
  );
  assert.equal(c.repo.get(owner, id(1)).body, remote.body);
  assert.equal(await c.tx((tx) => data.readCursor(tx, owner)), "old");
});
test("批量部分成功独立确认，失败项目保留相同 operation_id，外层成功不等于全成功", async (t) => {
  const c = await setup(t);
  const a = await synced(c, 1);
  const b = await synced(c, 2);
  await c.repo.batch(owner, c.repo.list(owner), { isStarred: true }, now);
  let sent;
  const result = await run(
    c,
    transport({
      batch: async (ops) => {
        sent = ops;
        return {
          results: [
            {
              status: "succeeded",
              data: { ...a, version: 2, is_starred: true },
            },
            {
              status: "failed",
              error: { code: "TEMPORARILY_UNAVAILABLE", message: "retry" },
              retryable: true,
              retry_after: 2,
            },
          ],
        };
      },
      snapshot: async () =>
        snapshot([{ ...a, version: 2, is_starred: true }, b]),
    }),
  );
  assert.deepEqual(result, { pending: 1, uploaded: 1 });
  assert.equal(sent.length, 2);
  assert.equal((await state(c, 1)).status, "synced");
  assert.equal((await state(c, 2)).dirty, true);
  await c.port.run("UPDATE todo_outbox SET next_attempt_at=0");
  const [retry] = await operations(c);
  assert.equal(retry.operation_id, sent[1].operation_id);
});
test("401 保留冻结操作并停止本轮拉取", async (t) => {
  const c = await setup(t);
  await c.create(1);
  let reads = 0;
  await assert.rejects(
    run(
      c,
      transport({
        write: async () => {
          throw new TodoApiError(401, "UNAUTHENTICATED", "expired");
        },
        snapshot: async () => {
          reads++;
          return snapshot();
        },
      }),
    ),
    (error) => error.status === 401,
  );
  assert.equal(reads, 0);
  assert.equal(
    c.sqlite.prepare("SELECT count(*) n FROM todo_outbox").get().n,
    1,
  );
  assert.equal((await state(c)).dirty, true);
});
test("账号切换后的旧回包不得写回或清理旧账号 outbox", async (t) => {
  const c = await setup(t);
  const e = await c.create(1);
  let current = true;
  await assert.rejects(
    run(
      c,
      transport({
        write: async () => {
          current = false;
          await c.repo.activate("user:8");
          return { data: dto(e) };
        },
      }),
      () => current,
    ),
    /会话/,
  );
  assert.equal(c.repo.list("user:8").length, 0);
  assert.equal(
    c.sqlite.prepare("SELECT count(*) n FROM todo_outbox").get().n,
    1,
  );
});
test("SQLite 关闭重开保留冻结请求、候选和游标", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iris-todo-sync-"));
  const file = path.join(dir, "test.sqlite");
  const c = await setup(t, file);
  const e = await c.create(1);
  const [op] = await operations(c);
  await c.repo.update(owner, e, { body: "重启后候选" }, now);
  await c.tx((tx) => data.saveCursor(tx, owner, "durable"));
  c.sqlite.close();
  const reopened = new DatabaseSync(file);
  t.after(() => {
    reopened.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = adapter(reopened);
  const repo = new TodoLocalRepository(port, data.recordTodoChanges);
  await repo.activate(owner);
  const [recovered] = await repo.syncTransaction(owner, (tx) =>
    data.prepareOperations(tx, owner, Date.now()),
  );
  assert.equal(recovered.operation_id, op.operation_id);
  assert.deepEqual(recovered.request, op.request);
  assert.equal(repo.get(owner, id(1)).body, "重启后候选");
  assert.equal(
    await port
      .getFirst("SELECT cursor FROM todo_sync_cursors")
      .then((r) => r.cursor),
    "durable",
  );
});
test("后端 UUID 契约不限 v4，迁移保留旧待办并能导入其他 UUID", async (t) => {
  const c = await setup(t);
  const remote = {
    ...(await synced(c)),
    id: 2,
    client_id: "00000000-0000-7000-8000-000000000002",
  };
  await c.tx((tx) => data.applyRemote(tx, owner, wire.activeRemote(remote, 7)));
  assert.equal(c.repo.list(owner).length, 2);
});
test("404 明确不存在变为删除冲突，不能用旧云端值继续覆盖", async (t) => {
  const c = await setup(t);
  await synced(c);
  await c.repo.update(owner, c.repo.get(owner, id(1)), { body: "候选" }, now);
  await run(
    c,
    transport({
      write: async () => {
        throw new TodoApiError(404, "TODO_NOT_FOUND", "不存在");
      },
    }),
  );
  const s = await state(c);
  assert.equal(s.status, "conflict");
  assert.equal(s.remote, null);
  assert.equal(s.candidate.body, "候选");
});
test("创建键过期返回 CLIENT_ID_EXISTS，按稳定身份恢复；内容不同进入冲突", async (t) => {
  const c = await setup(t);
  const e = await c.create(1);
  const existing = dto(e, 4, { body: "另一设备修改" });
  await run(
    c,
    transport({
      write: async () => {
        throw new TodoApiError(409, "CLIENT_ID_EXISTS", "existing");
      },
      byClientId: async () => existing,
      snapshot: async () => snapshot([existing]),
    }),
  );
  const s = await state(c);
  assert.equal(s.status, "conflict");
  assert.equal(s.candidate.body, e.body);
  assert.equal(s.remote.version, 4);
});

test("迁移 8 到 9 保留旧待办全部字段和独立提醒绑定，失败可回滚", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const migration = { execAsync: async sql => sqlite.exec(sql) };
  await createLocalTodos.up(migration);
  const {createTodoReminderBindings} = require("@/core/database/migrations/0008-create-todo-reminder-bindings.ts");
  await createTodoReminderBindings.up(migration);
  const port = adapter(sqlite);
  const repo = new TodoLocalRepository(port);
  await repo.activate(owner);
  await repo.create(owner,id(1),fields("旧数据 😀"),now);
  const before = sqlite.prepare("SELECT * FROM local_todos").all();
  const {TodoReminderRepository} = require("@/features/todos/data/todo-reminder.repository.ts");
  const bindings = new TodoReminderRepository(port);
  await bindings.put({owner_key:owner,todo_id:id(1),notification_id:"existing-notification",todo_version:1,trigger_at:now.getTime(),state:"scheduled",last_error:null,updated_at:now.toISOString()});
  const saved = await bindings.list();
  sqlite.exec("BEGIN IMMEDIATE");
  await createTodoSync.up(migration);
  sqlite.exec("ROLLBACK");
  assert.deepEqual(sqlite.prepare("SELECT * FROM local_todos").all(),before);
  sqlite.exec("BEGIN IMMEDIATE");await createTodoSync.up(migration);sqlite.exec("COMMIT");
  assert.deepEqual(sqlite.prepare("SELECT * FROM local_todos").all(),before);
  assert.deepEqual(await bindings.list(),saved);
});

test("云端成功而本地确认事务失败，原 outbox 与本地候选均保留", async (t) => {
  const c=await setup(t);const e=await c.create(1);const [op]=await operations(c);
  c.sqlite.exec("CREATE TRIGGER reject_receipt BEFORE UPDATE ON todo_sync_state BEGIN SELECT RAISE(ABORT,'receipt disk full'); END;");
  await assert.rejects(c.tx(tx=>data.acceptOperation(tx,op,dto(e))),/receipt disk full/);
  assert.equal(c.repo.get(owner,id(1)).body,e.body);
  assert.equal(c.sqlite.prepare("SELECT operation_id FROM todo_outbox").get().operation_id,op.operation_id);
  c.sqlite.exec("DROP TRIGGER reject_receipt");await c.tx(tx=>data.acceptOperation(tx,op,dto(e)));
  assert.equal((await state(c)).status,"synced");
});

test("云端更新后的提交广播驱动提醒重新安排，完成与删除取消提醒", async (t) => {
  const c=await setup(t);
  const {TodoReminderCoordinator}=require("@/features/todos/state/todo-reminder-coordinator.ts");
  const bindings=new Map();const scheduled=new Map();const calls=[];
  const coordinator=new TodoReminderCoordinator({list:async()=>[...bindings.values()],put:async row=>{bindings.set(row.todo_id,row);},remove:async row=>{bindings.delete(row.todo_id);}},
    {permission:async()=>({granted:true,canAskAgain:false}),scheduled:async()=>[...scheduled.keys()].map(identifier=>({identifier})),
      schedule:async(identifier,at)=>{scheduled.set(identifier,at);calls.push(['schedule',at]);return identifier;},cancel:async identifier=>{scheduled.delete(identifier);calls.push(['cancel']);}},
    ()=>({ownerKey:owner,ready:c.repo.ready,generation:c.repo.generation,entities:c.repo.list(owner)}),()=>{},()=>new Date(2026,8,20).getTime());
  let pending=Promise.resolve();const unsubscribe=c.repo.subscribe(()=>{pending=coordinator.reconcile();});t.after(unsubscribe);
  const remote=dto({clientId:id(1),...fields(),isCompleted:false,completedAt:null,createdAt:now.toISOString()},1,{date_id:'2030-09-20',start_time:'09:37'});
  await c.tx(tx=>data.applyRemote(tx,owner,remote));await pending;assert.equal(scheduled.size,1);
  await c.tx(tx=>data.applyRemote(tx,owner,{...remote,version:2,start_time:'10:59'}));await pending;assert.equal(scheduled.size,1);assert.equal(calls.filter(c=>c[0]==='cancel').length,1);
  await c.tx(tx=>data.applyRemote(tx,owner,{...remote,version:3,is_completed:true,completed_at:now.toISOString()}));await pending;assert.equal(scheduled.size,0);
  await c.tx(tx=>data.applyRemote(tx,owner,{...remote,version:4}));await pending;assert.equal(scheduled.size,1);
  await c.tx(tx=>data.applyRemote(tx,owner,{id:1,client_id:id(1),version:5,deleted_at:now.toISOString()}));await pending;assert.equal(scheduled.size,0);
});

test("前台协调器合并唤醒、不并发发送，停止取消在途请求", async (t) => {
  const {startTodoSyncCoordinator}=require("@/features/todos/state/todo-sync-coordinator.ts");
  t.mock.timers.enable({apis:['setTimeout']});
  let release;let signal;let calls=0;let success=0;
  const coordinator=startTodoSyncCoordinator({run:async value=>{signal=value;calls++;await new Promise(resolve=>{release=resolve;});return 0;},onError:()=>{},onSuccess:()=>{success++;}});
  t.after(()=>coordinator.stop());coordinator.setActive(true);coordinator.setOnline(true);
  t.mock.timers.tick(1000);await Promise.resolve();assert.equal(calls,1);
  coordinator.wake();coordinator.wake();t.mock.timers.tick(60000);assert.equal(calls,1);
  coordinator.stop();assert.equal(signal.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));assert.equal(success,0);
});

test("401 后协调器暂停，网络重连及重试按钮不偷偷更换身份发送", async (t) => {
  const {startTodoSyncCoordinator}=require("@/features/todos/state/todo-sync-coordinator.ts");
  t.mock.timers.enable({apis:['setTimeout']});let calls=0;
  const coordinator=startTodoSyncCoordinator({run:async()=>{calls++;throw new TodoApiError(401,'UNAUTHENTICATED','expired');},onError:()=>{},onSuccess:()=>{}});
  t.after(()=>coordinator.stop());coordinator.setActive(true);coordinator.setOnline(true);
  t.mock.timers.tick(1000);await new Promise(resolve=>setImmediate(resolve));
  coordinator.wake();coordinator.setOnline(false);coordinator.setOnline(true);t.mock.timers.tick(60000);assert.equal(calls,1);
});
