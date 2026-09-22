const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
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
// Protocol fixtures expose capability, then explicitly grant only their test owner.
process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = "1";
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "@react-native-async-storage/async-storage")
    return {
      __esModule: true,
      default: { getItem: async () => "new-account-token" },
    };
  return originalLoad.call(this, name, ...args);
};
const { createTodoTransport } = require("@/features/todos/api/todos.api.ts");
const client = require("@/shared/http/client.ts").default;
const {
  setCloudStorageSession,
  isCloudStoragePermissionError,
} = require("@/core/cloud-storage/cloud-storage-policy.ts");
Module._load = originalLoad;
const id = "00000000-0000-4000-8000-000000000001";
const entity = {
  id: 12,
  client_id: id,
  user_id: 7,
  body: "合同字段 😀",
  priority: "normal",
  date_id: "2026-09-20",
  start_time: "09:59",
  end_time: null,
  is_starred: false,
  is_pinned: false,
  reminder_enabled: true,
  time_zone: "Asia/Shanghai",
  is_completed: false,
  completed_at: null,
  created_at: "2026-09-20T01:00:00.000Z",
  updated_at: "2026-09-20T01:00:00.000Z",
  version: 1,
  deleted_at: null,
};
const op = {
  owner_key: "user:7",
  client_id: id,
  operation_id: "10000000-0000-4000-8000-000000000001",
  sequence: 1,
  attempts: 0,
  next_attempt_at: 0,
  request: {
    kind: "patch",
    id: 12,
    body: { expected_version: 1, body: "更新正文" },
  },
};
async function fixture(t, handler, { consented = true } = {}) {
  setCloudStorageSession(7, true, consented);
  t.after(() => setCloudStorageSession(null, false, false));
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const request = {
      url: new URL(req.url, "http://localhost"),
      method: req.method,
      headers: req.headers,
      body: raw ? JSON.parse(raw) : null,
    };
    requests.push(request);
    try {
      const reply = await handler(request);
      res.writeHead(reply.status ?? 200, {
        "content-type": "application/json",
        "x-request-id": "20000000-0000-4000-8000-000000000001",
        ...reply.headers,
      });
      res.end(JSON.stringify(reply.body));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { code: "TEST_HANDLER", message: error.message },
        }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  client.defaults.baseURL = `http://127.0.0.1:${server.address().port}/api`;
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const controller = new AbortController();
  return {
    requests,
    controller,
    api: createTodoTransport(7, "captured-account-token", controller.signal),
  };
}
const meta = (operation_id) => ({
  operation_id,
  replayed: false,
  changed: true,
});
test("本机 HTTP 使用冻结账号 token、固定幂等键、分钟字段，未上传所有者/本地版本", async (t) => {
  const f = await fixture(t, (req) => ({
    body: {
      data: { ...entity, body: "更新正文", version: 2 },
      meta: meta(req.headers["idempotency-key"]),
    },
  }));
  const result = await f.api.write(op);
  const req = f.requests[0];
  assert.equal(req.headers.authorization, "Bearer captured-account-token");
  assert.equal(req.headers["idempotency-key"], op.operation_id);
  assert.equal(req.url.pathname, "/api/todos/12");
  assert.equal(req.method, "PATCH");
  assert.deepEqual(req.body, op.request.body);
  assert.equal(result.data.version, 2);
  assert.equal(
    result.meta.request_id,
    "20000000-0000-4000-8000-000000000001",
  );
});
test("快照后续页固定 limit、原 token 与 cursor，不添加日期过滤", async (t) => {
  const f = await fixture(t, () => ({
    body: {
      data: [entity],
      page: {
        has_more: false,
        next_cursor: null,
        snapshot_token: "same-token",
      },
      sync: { changes_cursor: "opaque" },
    },
  }));
  const reply = await f.api.snapshot("page-two", "same-token");
  const query = f.requests[0].url.searchParams;
  assert.equal(query.get("limit"), "100");
  assert.equal(query.get("cursor"), "page-two");
  assert.equal(query.get("snapshot_token"), "same-token");
  assert.equal(query.has("date_from"), false);
  assert.equal(reply.data[0].start_time, "09:59");
});
test("拒绝他人资源、错误回执键、错身份、假布尔与无效分钟", async (t) => {
  let reply;
  const f = await fixture(t, () => ({ body: reply }));
  for (const data of [
    { ...entity, user_id: 8 },
    { ...entity, id: 99 },
    { ...entity, is_completed: "false" },
    { ...entity, start_time: "09:60" },
    { ...entity, completed_at: "invalid" },
  ]) {
    reply = { data, meta: meta(op.operation_id) };
    await assert.rejects(f.api.write(op), (e) => e.code === "INVALID_RESPONSE");
  }
  reply = { data: entity, meta: meta("wrong") };
  await assert.rejects(f.api.write(op), (e) => e.code === "INVALID_RESPONSE");
});
test("changes 保留大整数 change_seq 字符串，拒绝乱序，空页仍返回游标", async (t) => {
  let events = [
    { change_seq: "9007199254740993", operation: "upsert", data: entity },
    {
      change_seq: "9007199254740994",
      operation: "delete",
      id: 12,
      client_id: id,
      version: 2,
      deleted_at: entity.updated_at,
    },
  ];
  const f = await fixture(t, () => ({
    body: { data: events, page: { has_more: false, next_cursor: "next" } },
  }));
  assert.equal(
    (await f.api.changes("old")).data[0].change_seq,
    "9007199254740993",
  );
  events.reverse();
  await assert.rejects(
    f.api.changes("old"),
    (e) => e.code === "INVALID_RESPONSE",
  );
  events = [];
  assert.deepEqual(await f.api.changes("old"), {
    data: [],
    page: { has_more: false, next_cursor: "next" },
  });
});
test("429、处理中以及网关错误保留 Retry-After；冲突校验 current 与版本", async (t) => {
  let reply = {
    status: 429,
    headers: { "retry-after": "3" },
    body: { error: { code: "RATE_LIMITED", message: "raw details" } },
  };
  const f = await fixture(t, () => reply);
  await assert.rejects(
    f.api.write(op),
    (e) =>
      e.status === 429 &&
      e.retryAfter === 3000 &&
      e.requestId === "20000000-0000-4000-8000-000000000001" &&
      !e.message.includes("raw details"),
  );
  reply = {
    status: 409,
    headers: { "retry-after": "2" },
    body: { error: { code: "OPERATION_IN_PROGRESS" } },
  };
  await assert.rejects(
    f.api.write(op),
    (e) => e.code === "OPERATION_IN_PROGRESS" && e.retryAfter === 2000,
  );
  reply = {
    status: 409,
    body: {
      error: { code: "VERSION_CONFLICT" },
      current: { ...entity, version: 2 },
      current_version: 2,
    },
  };
  await assert.rejects(
    f.api.write(op),
    (e) => e.code === "VERSION_CONFLICT" && e.current.version === 2,
  );
  reply.body.current_version = 3;
  await assert.rejects(f.api.write(op), (e) => e.code === "INVALID_RESPONSE");
});
test("批量重试新外层键但固定项目指纹，逐项结果校验，delete 不带 value", async (t) => {
  const f = await fixture(t, (req) => ({
    body: {
      meta: meta(req.headers["idempotency-key"]),
      results: req.body.items.map((item) => ({
        operation_id: item.operation_id,
        id: item.id,
        status: "succeeded",
        changed: true,
        data: {
          id: item.id,
          client_id: id,
          version: 2,
          deleted_at: entity.updated_at,
        },
      })),
    },
  }));
  const remove = {
    ...op,
    request: { kind: "delete", id: 12, expected_version: 1 },
  };
  const first = await f.api.batch([remove]);
  await f.api.batch([remove]);
  assert.equal(
    first.meta.request_id,
    "20000000-0000-4000-8000-000000000001",
  );
  assert.notEqual(
    f.requests[0].headers["idempotency-key"],
    f.requests[1].headers["idempotency-key"],
  );
  assert.deepEqual(f.requests[0].body, f.requests[1].body);
  assert.equal(f.requests[0].body.action, "delete");
  assert.equal(Object.hasOwn(f.requests[0].body, "value"), false);
});
test("批量 HTTP 200 的失败项目保持失败，不接受错序回执或假成功墓碑", async (t) => {
  let bad = false;
  const f = await fixture(t, (req) => ({
    body: {
      meta: meta(req.headers["idempotency-key"]),
      results: [
        {
          id: bad ? 99 : 12,
          operation_id: op.operation_id,
          status: "failed",
          changed: false,
          error: { code: "VERSION_CONFLICT", message: "冲突" },
          retryable: false,
          current: { ...entity, version: 2 },
          current_version: 2,
        },
      ],
    },
  }));
  const star = {
    ...op,
    request: { kind: "set_starred", id: 12, expected_version: 1, value: true },
  };
  assert.equal((await f.api.batch([star])).results[0].status, "failed");
  bad = true;
  await assert.rejects(
    f.api.batch([star]),
    (e) => e.code === "INVALID_RESPONSE",
  );
});
test("请求取消后不再发出 HTTP 请求", async (t) => {
  const f = await fixture(t, () => ({ body: {} }));
  f.controller.abort();
  await assert.rejects(f.api.changes("cursor"));
  assert.equal(f.requests.length, 0);
});
test("未授权时待办读取、写入和批量操作均不发出 HTTP 请求", async (t) => {
  const f = await fixture(t, () => ({ body: {} }), { consented: false });
  for (const request of [
    () => f.api.snapshot(),
    () => f.api.changes("cursor"),
    () => f.api.byClientId(id),
    () => f.api.write(op),
    () => f.api.batch([{ ...op, request: { kind: "delete", id: 12, expected_version: 1 } }]),
  ]) {
    await assert.rejects(request(), isCloudStoragePermissionError);
  }
  assert.equal(f.requests.length, 0);
});
