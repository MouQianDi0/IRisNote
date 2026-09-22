// Real policy, HTTP interceptors and SQLite repository; no external network calls.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
const compile = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
};
require.extensions[".ts"] = compile;

const storedValues = new Map();
let readStorage;
const storage = {
  getItem: (key) => readStorage(key),
  async setItem(key, value) { storedValues.set(key, value); },
};
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "@react-native-async-storage/async-storage") {
    return { __esModule: true, default: storage };
  }
  return originalLoad.call(this, name, ...args);
};

// A test build can expose cloud capability, but every test starts without consent.
process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = "1";
globalThis.__DEV__ = false;
const policy = require("@/core/cloud-storage/cloud-storage-policy.ts");
const api = require("@/shared/http/client.ts").default;
const { getApiErrorMessage } = require("@/shared/http/errors.ts");
const { onConnectionEvent } = require("@/shared/http/connection-events.ts");
const { CanceledError, AxiosError, isCancel } = require("axios");
const {
  SystemPreferencesRepository,
} = require("@/features/settings/data/system-preferences.repository.ts");
const { databaseMigrations } = require("@/core/database/migrations/index.ts");

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const response = (config, data = { ok: true }) => ({
  config, data, headers: {}, status: 200, statusText: "OK",
});
const isPermission = (dispatched) => (error) => {
  assert.ok(policy.isCloudStoragePermissionError(error));
  assert.equal(error.requestDispatched, dispatched);
  assert.equal(policy.isCloudStorageRequestDispatched(error), dispatched);
  return true;
};
const grant = (owner = 41) => policy.setCloudStorageSession(owner, true, true);

beforeEach(() => {
  policy.setCloudStorageSession(null, false, false);
  storedValues.clear();
  storedValues.set("token", "test-token");
  readStorage = async (key) => storedValues.get(key) ?? null;
  api.defaults.adapter = async () => {
    throw new Error("This test must explicitly provide its network adapter");
  };
});
afterEach(() => policy.setCloudStorageSession(null, false, false));

function freshPolicy(value, legacyValue) {
  const filename = path.join(root, "src/core/cloud-storage/cloud-storage-policy.ts");
  const previous = process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED;
  const previousLegacy = process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC;
  if (value === undefined) delete process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED;
  else process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = value;
  if (legacyValue === undefined) delete process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC;
  else process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC = legacyValue;
  try {
    const isolated = new Module(filename, module);
    isolated.filename = filename;
    isolated.paths = Module._nodeModulePaths(path.dirname(filename));
    compile(isolated, filename);
    return isolated.exports;
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED;
    else process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = previous;
    if (previousLegacy === undefined) delete process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC;
    else process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC = previousLegacy;
  }
}

test("环境默认开放能力，只有 0 或非法配置关闭，均不隐式授予用户权限", () => {
  for (const value of [undefined, "", " ", "1", " 1 "]) {
    const isolated = freshPolicy(value);
    assert.equal(isolated.getCloudStorageSnapshot().available, true);
    assert.equal(isolated.getCloudStorageSnapshot().enabled, false);
    assert.throws(() => isolated.assertCloudStorageAllowed(), isPermission(false));
  }
  for (const value of ["0", "false", "true", "2", "enabled"]) {
    const isolated = freshPolicy(value);
    isolated.setCloudStorageSession(41, true, true);
    assert.equal(isolated.getCloudStorageSnapshot().available, false);
    assert.equal(isolated.getCloudStorageSnapshot().enabled, false);
    assert.throws(() => isolated.assertCloudStorageAllowed(), isPermission(false));
  }
});

test("旧待办开关不能授予权限或覆盖统一环境变量", () => {
  for (const legacy of ["0", "1"]) {
    const isolated = freshPolicy(undefined, legacy);
    isolated.setCloudStorageSession(41, true, false);
    assert.equal(isolated.getCloudStorageSnapshot().available, true);
    assert.equal(isolated.getCloudStorageSnapshot().enabled, false);
    assert.throws(() => isolated.assertCloudStorageAllowed(), isPermission(false));
  }
  const disabled = freshPolicy("0", "1");
  disabled.setCloudStorageSession(41, true, true);
  assert.throws(() => disabled.assertCloudStorageAllowed(), isPermission(false));
});

test("未登录、首用未授权、读取期间都拒绝；显式授权只放行当前账号", () => {
  assert.throws(() => policy.captureCloudStorageAccess(), isPermission(false));
  policy.setCloudStorageSession(41, true, false);
  assert.throws(() => policy.createCloudStorageRequest(), isPermission(false));
  policy.setCloudStorageSession(41, false, true);
  assert.throws(() => policy.assertCloudStorageAllowed(41), isPermission(false));
  grant();
  assert.doesNotThrow(() => policy.assertCloudStorageAllowed(41));
  assert.throws(() => policy.assertCloudStorageAllowed(42), isPermission(false));
  policy.setCloudStorageSession(null, true, true);
  assert.throws(() => policy.assertCloudStorageAllowed(), isPermission(false));
});

test("关闭授权同步取消所有活动租约，已释放请求不再受影响", () => {
  grant();
  const first = policy.createCloudStorageRequest();
  const second = policy.createCloudStorageRequest();
  const released = policy.createCloudStorageRequest();
  released.release();
  let aborted = 0;
  first.signal.addEventListener("abort", () => { aborted += 1; });
  second.signal.addEventListener("abort", () => { aborted += 1; });
  policy.setCloudStorageSession(41, true, false);
  assert.equal(aborted, 2);
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
  assert.equal(released.signal.aborted, false);
  assert.throws(first.assertCurrent, isPermission(false));
});

test("关闭再开启与 A-B-A 账号切换都不能让旧任务恢复权限", () => {
  grant();
  const beforeDisable = policy.captureCloudStorageAccess(41);
  policy.setCloudStorageSession(41, true, false);
  grant();
  assert.throws(beforeDisable, isPermission(false));
  const beforeSwitch = policy.captureCloudStorageAccess(41);
  const lease = policy.createCloudStorageRequest();
  grant(42);
  grant(41);
  assert.equal(lease.signal.aborted, true);
  assert.throws(beforeSwitch, isPermission(false));
  assert.doesNotThrow(policy.captureCloudStorageAccess(41));
});

test("重复写入相同授权不取消任务，订阅只收到真实状态变化", () => {
  grant();
  const lease = policy.createCloudStorageRequest();
  let notifications = 0;
  const unsubscribe = policy.subscribeCloudStorage(() => { notifications += 1; });
  try {
    const generation = policy.getCloudStorageSnapshot().generation;
    grant();
    assert.equal(policy.getCloudStorageSnapshot().generation, generation);
    assert.equal(lease.signal.aborted, false);
    assert.equal(notifications, 0);
    policy.setCloudStorageSession(41, true, false);
    assert.equal(notifications, 1);
  } finally { unsubscribe(); }
});

test("未授权时笔记、待办、头像、读写及未知未来端点一律零发包", async () => {
  policy.setCloudStorageSession(41, true, false);
  let calls = 0;
  const events = [];
  const unsubscribe = onConnectionEvent((event) => events.push(event));
  api.defaults.adapter = async (config) => { calls += 1; return response(config); };
  const routes = [
    ["get", "/notes"], ["post", "/notes"], ["patch", "/notes/1"],
    ["delete", "/notes/1"], ["get", "/todos/sync"], ["post", "/todos/sync"],
    ["get", "/categories"], ["post", "/user/avatar"], ["get", "/user/avatar"],
    ["patch", "/user/profile"], ["get", "/future-cloud-resource"],
    ["post", "/future-cloud-resource"], ["get", "/auth/login"],
    ["post", "/auth/login/future-storage"],
  ];
  try {
    for (const [method, url] of routes) {
      await assert.rejects(api.request({ method, url }), isPermission(false));
    }
    assert.equal(calls, 0);
    assert.deepEqual(events, []);
  } finally { unsubscribe(); }
});

test("未授权仍可登录、验证码及读取基础账号资料", async () => {
  const calls = [];
  api.defaults.adapter = async (config) => { calls.push(config); return response(config); };
  for (const url of ["/auth/register", "/auth/login", "/auth/login-code", "/verify/send", "/verify/check"]) {
    await api.post(url, {});
  }
  await api.get("/user/profile");
  assert.equal(calls.length, 6);
  assert.ok(calls.slice(0, 5).every((config) => config.headers.get("X-Device-Id")));
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
});

test("显式授权后真实 Axios adapter 收到读写和 token，完成后释放租约", async () => {
  grant();
  const calls = [];
  api.defaults.adapter = async (config) => { calls.push(config); return response(config); };
  await api.get("/notes");
  await api.post("/future-cloud-resource", { value: "content" });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((config) => config.headers.get("Authorization") === "Bearer test-token"));
  assert.equal(calls[1].data, JSON.stringify({ value: "content" }));
  policy.setCloudStorageSession(41, true, false);
  assert.ok(calls.every((config) => !config.signal.aborted));
});

const requestEntrypoints = [
  ["callable config", () => api({ method: "post", url: "/notes", data: { content: "account A" } })],
  ["callable URL", () => api("/notes", { method: "post", data: { content: "account A" } })],
  ["request config", () => api.request({ method: "post", url: "/notes", data: { content: "account A" } })],
  ["request URL", () => api.request("/notes", { method: "post", data: { content: "account A" } })],
  ...["get", "delete", "head", "options"].map((method) => [method, () => api[method]("/notes")]),
  ...["post", "put", "patch", "postForm", "putForm", "patchForm"].map((method) =>
    [method, () => api[method]("/notes", { content: "account A" })]),
];

test("所有 Axios 入口同步绑定调用账号，同 tick A→B 不能用 B token 上传 A 内容", async () => {
  const calls = [];
  api.defaults.adapter = async (config) => { calls.push(config); return response(config); };
  for (const [name, send] of requestEntrypoints) {
    grant(41);
    storedValues.set("token", "token-a");
    const pending = send();
    policy.setCloudStorageSession(null, false, false);
    grant(42);
    storedValues.set("token", "token-b");
    await assert.rejects(pending, isPermission(false), name);
    assert.equal(calls.length, 0, name);
  }
});

test("登录换 token 前同步撤权，旧调用和 Auth 未刷新窗口的新调用均零发包", async () => {
  grant(41);
  storedValues.set("token", "token-a");
  const calls = [];
  api.defaults.adapter = async (config) => { calls.push(config); return response(config); };
  const oldPending = api.post("/notes", { content: "account A" });
  policy.setCloudStorageSession(null, false, false);
  storedValues.set("token", "token-b");
  const duringAuthRefresh = api.post("/notes", { content: "must remain local" });
  await Promise.all([
    assert.rejects(oldPending, isPermission(false)),
    assert.rejects(duringAuthRefresh, isPermission(false)),
  ]);
  assert.equal(calls.length, 0);
  policy.setCloudStorageSession(42, true, false);
  await assert.rejects(api.get("/notes"), isPermission(false));
  assert.equal(calls.length, 0);
  grant(42);
  await api.post("/notes", { content: "account B" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get("Authorization"), "Bearer token-b");
  assert.equal(calls[0].data, JSON.stringify({ content: "account B" }));
});

test("所有 Axios 入口同 tick 关闭再开启后旧调用仍拒绝，不重新获取授权", async () => {
  let calls = 0;
  api.defaults.adapter = async (config) => { calls += 1; return response(config); };
  for (const [name, send] of requestEntrypoints) {
    grant();
    const pending = send();
    policy.setCloudStorageSession(41, true, false);
    grant();
    await assert.rejects(pending, isPermission(false), name);
    assert.equal(calls, 0, name);
  }
});

test("所有 Axios 入口调用时未授权，即刻开启也不能使原请求获得授权", async () => {
  let calls = 0;
  api.defaults.adapter = async (config) => { calls += 1; return response(config); };
  for (const [name, send] of requestEntrypoints) {
    policy.setCloudStorageSession(41, true, false);
    const pending = send();
    grant();
    await assert.rejects(pending, isPermission(false), name);
    assert.equal(calls, 0, name);
  }
});

test("callable、request 和表单方法在授权不变时保留 Axios 正常发送能力", async () => {
  grant();
  const calls = [];
  api.defaults.adapter = async (config) => { calls.push(config); return response(config); };
  for (const [name, send] of requestEntrypoints) {
    const result = await send();
    assert.equal(result.status, 200, name);
    assert.equal(calls.at(-1).headers.get("Authorization"), "Bearer test-token", name);
  }
  assert.equal(calls.length, requestEntrypoints.length);
  assert.deepEqual(calls.map((config) => config.method), [
    "post", "post", "post", "post", "get", "delete", "head", "options",
    "post", "put", "patch", "post", "put", "patch",
  ]);
});

test("异步读取 token 期间关闭授权，不发送请求且错误标记未发包", async () => {
  grant();
  const started = deferred();
  const token = deferred();
  readStorage = async () => { started.resolve(); return token.promise; };
  let calls = 0;
  api.defaults.adapter = async (config) => { calls += 1; return response(config); };
  const pending = api.post("/notes", { content: "private" });
  const rejected = assert.rejects(pending, isPermission(false));
  await started.promise;
  policy.setCloudStorageSession(41, true, false);
  token.resolve("test-token");
  await rejected;
  assert.equal(calls, 0);
});

test("请求转换期间撤权，在真实 adapter 调用前拒绝且标记零发包", async () => {
  grant();
  let calls = 0;
  api.defaults.adapter = async (config) => { calls += 1; return response(config); };
  await assert.rejects(api.post("/notes", { content: "private" }, {
    transformRequest: [(data) => {
      policy.setCloudStorageSession(41, true, false);
      return JSON.stringify(data);
    }],
  }), isPermission(false));
  assert.equal(calls, 0);
});

test("在途请求因撤权取消，归一为权限错误并保留已发包标记", async () => {
  grant();
  const started = deferred();
  const events = [];
  const unsubscribe = onConnectionEvent((event) => events.push(event));
  let captured;
  api.defaults.adapter = (config) => new Promise((resolve, reject) => {
    captured = config;
    config.signal.addEventListener("abort", () => reject(new CanceledError("aborted", config)), { once: true });
    started.resolve();
  });
  try {
    const pending = api.post("/notes", { content: "private" });
    const rejected = assert.rejects(pending, isPermission(true));
    await started.promise;
    policy.setCloudStorageSession(41, true, false);
    await rejected;
    assert.equal(captured.signal.aborted, true);
    assert.deepEqual(events, []);
  } finally { unsubscribe(); }
});

test("撤权后旧响应即便成功到达也拒绝，重新开启不能接收旧响应", async () => {
  grant();
  const started = deferred();
  const arrived = deferred();
  api.defaults.adapter = async (config) => {
    started.resolve();
    await arrived.promise;
    return response(config, { content: "old account response" });
  };
  const pending = api.get("/notes");
  const rejected = assert.rejects(pending, isPermission(true));
  await started.promise;
  policy.setCloudStorageSession(41, true, false);
  grant();
  arrived.resolve();
  await rejected;
});

test("账号 A-B-A 后在途响应失效，不写入新会话", async () => {
  grant();
  const started = deferred();
  const arrived = deferred();
  api.defaults.adapter = async (config) => {
    started.resolve();
    await arrived.promise;
    return response(config);
  };
  const rejected = assert.rejects(api.get("/notes"), isPermission(true));
  await started.promise;
  grant(42);
  grant(41);
  arrived.resolve();
  await rejected;
});

test("调用者主动取消保留 Axios 取消语义，网络错误不伪装为权限错误", async () => {
  grant();
  const started = deferred();
  const controller = new AbortController();
  api.defaults.adapter = (config) => new Promise((resolve, reject) => {
    config.signal.addEventListener("abort", () => reject(new CanceledError("caller canceled", config)), { once: true });
    started.resolve();
  });
  const rejected = assert.rejects(api.get("/notes", { signal: controller.signal }), (error) => {
    assert.ok(isCancel(error));
    assert.equal(policy.isCloudStoragePermissionError(error), false);
    return true;
  });
  await started.promise;
  controller.abort();
  await rejected;
  api.defaults.adapter = async (config) => { throw new AxiosError("offline", "ERR_NETWORK", config); };
  await assert.rejects(api.get("/notes"), (error) => error.code === "ERR_NETWORK");
});

test("权限提示沿用统一错误信息，不能退化为一般网络错误", () => {
  const error = new policy.CloudStoragePermissionError("请开启云存储");
  assert.equal(getApiErrorMessage(error, "网络请求失败"), "请开启云存储");
});

test("真实 SQLite 迁移 1–11 后授权默认拒绝并按账号独立持久保存", async (t) => {
  const sql = new DatabaseSync(":memory:");
  t.after(() => sql.close());
  const migrationPort = {
    execAsync: async (source) => sql.exec(source),
    getAllAsync: async (source) => sql.prepare(source).all(),
    runAsync: async (source, params) => params ? sql.prepare(source).run(params) : sql.prepare(source).run(),
  };
  for (const migration of databaseMigrations.filter((item) => item.version <= 11)) {
    await migration.up(migrationPort);
  }
  const database = {
    async run(source, params = []) { return sql.prepare(source).run(...params); },
    async getFirst(source, params = []) { return sql.prepare(source).get(...params) ?? null; },
  };
  const repository = new SystemPreferencesRepository(database);
  assert.equal(await repository.cloudStorageConsent(41), false);
  assert.equal(await repository.cloudStorageConsent(42), false);
  await repository.setCloudStorageConsent(41, true);
  assert.equal(await repository.cloudStorageConsent(41), true);
  assert.equal(await repository.cloudStorageConsent(42), false);
  await repository.setCloudStorageConsent(42, true);
  await repository.setCloudStorageConsent(41, false);
  const reopenedRepository = new SystemPreferencesRepository(database);
  assert.equal(await reopenedRepository.cloudStorageConsent(41), false);
  assert.equal(await reopenedRepository.cloudStorageConsent(42), true);
  assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM system_preferences WHERE key LIKE 'cloud_storage_consent:user:%'").get().count, 2);
  const rows = sql.prepare("SELECT updated_at FROM system_preferences WHERE key LIKE 'cloud_storage_consent:user:%'").all();
  assert.ok(rows.every((row) => Number.isFinite(Date.parse(row.updated_at))));
  await repository.setRuntimeNotificationEnabled(true);
  await repository.setExactAlarmAccess("granted");
  assert.equal(await repository.cloudStorageConsent(41), false);
  assert.equal(await repository.cloudStorageConsent(42), true);
});

// Exercise the production TSX body with hook slots, layout-effect cleanup and
// external-store subscriptions. This intentionally tests provider lifecycle and
// asynchronous IO, not React rendering or native UI behavior.
async function providerHarness(t, { consents = [], auth, beforeRead, beforeWrite } = {}) {
  const sql = new DatabaseSync(":memory:");
  const migration = databaseMigrations.find((item) => item.version === 11);
  await migration.up({ execAsync: async (source) => sql.exec(source) });
  const queries = { reads: [], writes: [] };
  const hooks = { beforeRead, beforeWrite };
  const database = {
    async run(source, params = []) {
      queries.writes.push(params[0]);
      await hooks.beforeWrite?.(params);
      return sql.prepare(source).run(...params);
    },
    async getFirst(source, params = []) {
      queries.reads.push(params[0]);
      const row = sql.prepare(source).get(...params) ?? null;
      await hooks.beforeRead?.(params);
      return row;
    },
  };
  for (const [owner, consent] of consents) {
    sql.prepare("INSERT INTO system_preferences (key, value, updated_at) VALUES (?, ?, ?)")
      .run(`cloud_storage_consent:user:${owner}`, consent ? "1" : "0", new Date().toISOString());
  }
  let currentAuth = auth ?? { user: { id: 41 }, token: "token-a", loading: false };
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let value;
  let mounted = true;
  const cells = [];
  const sameDeps = (before, after) => before && after &&
    before.length === after.length && before.every((entry, index) => Object.is(entry, after[index]));
  const slot = (kind, initialize) => {
    const index = cursor++;
    if (!cells[index]) cells[index] = { kind, ...initialize() };
    assert.equal(cells[index].kind, kind, "Provider hook order must remain stable");
    return cells[index];
  };
  const react = {
    createContext: () => ({ Provider: Symbol("Provider") }),
    useContext: () => value,
    useState(initial) {
      const cell = slot("state", () => ({ value: typeof initial === "function" ? initial() : initial }));
      return [cell.value, (next) => {
        const resolved = typeof next === "function" ? next(cell.value) : next;
        if (!Object.is(resolved, cell.value)) { cell.value = resolved; dirty = true; }
      }];
    },
    useRef(initial) {
      return slot("ref", () => ({ value: { current: initial } })).value;
    },
    useMemo(factory, deps) {
      const cell = slot("memo", () => ({}));
      if (!sameDeps(cell.deps, deps)) { cell.value = factory(); cell.deps = deps; }
      return cell.value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useLayoutEffect(effect, deps) {
      const cell = slot("layout", () => ({}));
      if (!sameDeps(cell.deps, deps)) {
        cell.deps = deps;
        effects.push(() => { cell.cleanup?.(); cell.cleanup = effect(); });
      }
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      slot("store", () => ({ cleanup: subscribe(() => { dirty = true; }) }));
      return getSnapshot();
    },
  };
  const filename = path.join(root, "src/core/cloud-storage/cloud-storage-provider.tsx");
  const isolated = new Module(filename, module);
  isolated.filename = filename;
  isolated.paths = Module._nodeModulePaths(path.dirname(filename));
  const actualRequire = isolated.require.bind(isolated);
  isolated.require = (name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
    if (name === "@/core/database") return { useApplicationDatabase: () => database };
    if (name === "@/features/auth/hooks/useAuth") return { useAuth: () => currentAuth };
    return actualRequire(name);
  };
  compile(isolated, filename);
  const { CloudStorageProvider } = isolated.exports;
  const render = (nextAuth = currentAuth) => {
    assert.ok(mounted, "Cannot render an unmounted provider");
    currentAuth = nextAuth;
    for (let attempts = 0; attempts < 20; attempts += 1) {
      cursor = 0;
      dirty = false;
      effects = [];
      value = CloudStorageProvider({ children: null }).props.value;
      for (const effect of effects) effect();
      if (!dirty) return value;
    }
    throw new Error("Provider did not settle after layout effects");
  };
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    for (const cell of cells) cell.cleanup?.();
  };
  t.after(() => { unmount(); sql.close(); });
  render();
  return {
    render, unmount, hooks, queries,
    get value() { return value; },
    async settle() {
      await new Promise((resolve) => setImmediate(resolve));
      return mounted ? render() : undefined;
    },
  };
}

test("Provider 授权读取完成前禁用，读取失败继续拒绝并显示可恢复错误", async (t) => {
  const read = deferred();
  const harness = await providerHarness(t, { consents: [[41, true]], beforeRead: () => read.promise });
  assert.equal(harness.value.ready, false);
  assert.equal(harness.value.enabled, false);
  assert.throws(() => policy.assertCloudStorageAllowed(41), isPermission(false));
  read.reject(new Error("database read failed"));
  await harness.settle();
  assert.equal(harness.value.ready, true);
  assert.equal(harness.value.enabled, false);
  assert.match(harness.value.error, /无法读取云存储授权/);
});

test("Provider 读取期间同步 logout 先于 Auth 重渲染，旧读取不能恢复授权", async (t) => {
  const read = deferred();
  const harness = await providerHarness(t, { consents: [[41, true]], beforeRead: () => read.promise });
  policy.setCloudStorageSession(null, false, false);
  read.resolve();
  // Auth still reports account A here: the synchronous policy revocation must win.
  await harness.settle();
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, null);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(harness.value.enabled, false);
  harness.render({ user: null, token: null, loading: false });
  assert.equal(harness.value.ownerUserId, null);
});

test("Provider 授权写盘期间同步 logout 先于 Auth 重渲染，旧保存不能重新开启", async (t) => {
  const harness = await providerHarness(t);
  await harness.settle();
  const write = deferred();
  harness.hooks.beforeWrite = () => write.promise;
  const saving = harness.value.setConsent(true);
  harness.render();
  assert.equal(harness.value.saving, true);
  assert.equal(harness.value.enabled, false);
  policy.setCloudStorageSession(null, false, false);
  write.resolve();
  await saving;
  await harness.settle();
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, null);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.saving, false);
});

test("Provider token 变化使旧读取失效，新会话完成读取后才能启用", async (t) => {
  const first = deferred();
  const second = deferred();
  let reads = 0;
  const harness = await providerHarness(t, {
    consents: [[41, true]],
    beforeRead: () => (++reads === 1 ? first.promise : second.promise),
  });
  harness.render({ user: { id: 41 }, token: "token-b", loading: false });
  first.resolve();
  await harness.settle();
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(harness.value.ready, false);
  second.resolve();
  await harness.settle();
  assert.equal(harness.value.enabled, true);
  assert.equal(harness.value.ready, true);
  assert.equal(reads, 2);
});

test("Provider 未登录 token 时不读取授权，账号切换不会继承前一账号授权", async (t) => {
  const harness = await providerHarness(t, {
    consents: [[41, true]],
    auth: { user: { id: 41 }, token: null, loading: false },
  });
  await harness.settle();
  assert.equal(harness.queries.reads.length, 0);
  assert.equal(harness.value.enabled, false);
  harness.render({ user: { id: 41 }, token: "token-a", loading: false });
  await harness.settle();
  assert.equal(harness.value.enabled, true);
  harness.render({ user: { id: 42 }, token: "token-b", loading: false });
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.consented, false);
  await harness.settle();
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.ownerUserId, 42);
  assert.equal(harness.value.ready, true);
});

test("Provider 开启须等待写盘成功，写盘失败不授权且允许重试，重复保存被串行化", async (t) => {
  const harness = await providerHarness(t);
  await harness.settle();
  const write = deferred();
  harness.hooks.beforeWrite = () => write.promise;
  const saving = harness.value.setConsent(true);
  harness.render();
  assert.equal(harness.value.enabled, false);
  const repeated = harness.value.setConsent(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.queries.writes.length, 1);
  write.reject(new Error("disk full"));
  await Promise.all([saving, repeated]);
  await harness.settle();
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.saving, false);
  assert.match(harness.value.error, /授权保存失败/);
  harness.hooks.beforeWrite = undefined;
  await harness.value.setConsent(true);
  await harness.settle();
  assert.equal(harness.value.enabled, true);
  assert.equal(harness.value.error, null);
});

test("Provider 关闭立即撤权取消租约，关闭写盘失败也不能恢复旧授权", async (t) => {
  const harness = await providerHarness(t, { consents: [[41, true]] });
  await harness.settle();
  const lease = policy.createCloudStorageRequest();
  const write = deferred();
  harness.hooks.beforeWrite = () => write.promise;
  const saving = harness.value.setConsent(false);
  assert.equal(lease.signal.aborted, true);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  write.reject(new Error("disk full"));
  await saving;
  await harness.settle();
  assert.equal(harness.value.enabled, false);
  assert.match(harness.value.error, /关闭设置保存失败/);
});

test("Provider 同一渲染回调先开启再关闭，最后关闭意图不能被 pending 保存吞掉", async (t) => {
  const harness = await providerHarness(t);
  await harness.settle();
  const setter = harness.value.setConsent;
  const enabling = setter(true);
  const disabling = setter(false);
  await Promise.all([enabling, disabling]);
  await harness.settle();
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.consented, false);
  harness.render({ user: { id: 41 }, token: "token-refreshed", loading: false });
  await harness.settle();
  assert.equal(harness.value.enabled, false);
  assert.equal(harness.value.consented, false);
});

test("Provider 卸载后旧授权读取不能再改变会话", async (t) => {
  const read = deferred();
  const harness = await providerHarness(t, { consents: [[41, true]], beforeRead: () => read.promise });
  harness.unmount();
  read.resolve();
  await harness.settle();
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, null);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
});

function consentControllerFixture(t, { consents = [], beforeRead, beforeWrite } = {}) {
  const { createCloudStorageConsentController } = require("@/core/cloud-storage/cloud-storage-consent-controller.ts");
  const stored = new Map(consents);
  const reads = [];
  const writes = [];
  const states = [];
  const hooks = { beforeRead, beforeWrite };
  const controller = createCloudStorageConsentController({
    async readConsent(owner) {
      reads.push(owner);
      const value = stored.get(owner) ?? false;
      await hooks.beforeRead?.(owner);
      return value;
    },
    async writeConsent(owner, enabled) {
      writes.push([owner, enabled]);
      await hooks.beforeWrite?.(owner, enabled);
      stored.set(owner, enabled);
    },
    onState: (state) => states.push(state),
  });
  t.after(() => controller.deactivate());
  return {
    controller, stored, hooks, reads, writes, states,
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
  };
}

test("授权控制器 enable 未落盘再关闭，旧 enable 不能恢复运行权限且最终保存 false", async (t) => {
  const started = deferred();
  const write = deferred();
  const fixture = consentControllerFixture(t, {
    beforeWrite: async (owner, enabled) => {
      if (enabled) { started.resolve(); await write.promise; }
    },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  const transitions = [];
  const unsubscribe = policy.subscribeCloudStorage(() => transitions.push(policy.getCloudStorageSnapshot().enabled));
  t.after(unsubscribe);
  const enabling = fixture.controller.setConsent(41, true);
  await started.promise;
  const disabling = fixture.controller.setConsent(41, false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  write.resolve();
  await Promise.all([enabling, disabling]);
  assert.equal(fixture.stored.get(41), false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.ok(transitions.every((enabled) => enabled === false));
  assert.deepEqual(fixture.writes, [[41, true], [41, false]]);
});

test("授权控制器 false 未落盘再开启，写入顺序有序且最后 true 落盘后才开启", async (t) => {
  const disabledStarted = deferred();
  const disableWrite = deferred();
  const enabledStarted = deferred();
  const enableWrite = deferred();
  const fixture = consentControllerFixture(t, {
    consents: [[41, true]],
    beforeWrite: async (owner, enabled) => {
      if (enabled) { enabledStarted.resolve(); await enableWrite.promise; }
      else { disabledStarted.resolve(); await disableWrite.promise; }
    },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  const lease = policy.createCloudStorageRequest();
  const disabling = fixture.controller.setConsent(41, false);
  assert.equal(lease.signal.aborted, true);
  await disabledStarted.promise;
  const enabling = fixture.controller.setConsent(41, true);
  await fixture.settle();
  assert.deepEqual(fixture.writes, [[41, false]]);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  disableWrite.resolve();
  await enabledStarted.promise;
  assert.equal(fixture.stored.get(41), false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  enableWrite.resolve();
  await Promise.all([disabling, enabling]);
  assert.deepEqual(fixture.writes, [[41, false], [41, true]]);
  assert.equal(fixture.stored.get(41), true);
  assert.equal(policy.getCloudStorageSnapshot().enabled, true);
});

test("授权控制器读取期间全局 logout 撤权，迟到的 true 读取不得复活", async (t) => {
  const read = deferred();
  const started = deferred();
  const fixture = consentControllerFixture(t, {
    consents: [[41, true]],
    beforeRead: () => { started.resolve(); return read.promise; },
  });
  fixture.controller.activate(41);
  await started.promise;
  policy.setCloudStorageSession(null, false, false);
  read.resolve();
  await fixture.settle();
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, null);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
});

test("授权控制器保存期间全局 logout 撤权，迟到保存不得复活", async (t) => {
  const write = deferred();
  const started = deferred();
  const fixture = consentControllerFixture(t, {
    beforeWrite: () => { started.resolve(); return write.promise; },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  const enabling = fixture.controller.setConsent(41, true);
  await started.promise;
  policy.setCloudStorageSession(null, false, false);
  write.resolve();
  await enabling;
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, null);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
});

test("授权控制器 A→B 后旧 setter 和旧保存不能关闭或污染 B 的授权", async (t) => {
  const write = deferred();
  const started = deferred();
  const fixture = consentControllerFixture(t, {
    consents: [[42, true]],
    beforeWrite: (owner) => { if (owner === 41) { started.resolve(); return write.promise; } },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  const saveA = fixture.controller.setConsent(41, true);
  await started.promise;
  fixture.controller.activate(42);
  await fixture.settle();
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, 42);
  assert.equal(policy.getCloudStorageSnapshot().enabled, true);
  const writesBefore = fixture.writes.length;
  await fixture.controller.setConsent(41, false);
  assert.equal(fixture.writes.length, writesBefore);
  assert.equal(policy.getCloudStorageSnapshot().enabled, true);
  write.resolve();
  await saveA;
  assert.equal(policy.getCloudStorageSnapshot().ownerUserId, 42);
  assert.equal(policy.getCloudStorageSnapshot().enabled, true);
  assert.equal(fixture.stored.get(42), true);
});

test("授权控制器关闭写盘失败仍保持运行禁用，重试 false 能覆盖旧磁盘授权", async (t) => {
  const fixture = consentControllerFixture(t, {
    consents: [[41, true]],
    beforeWrite: async () => { throw new Error("disk full"); },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  await fixture.controller.setConsent(41, false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(fixture.stored.get(41), true);
  assert.match(fixture.controller.getState().error, /关闭设置保存失败/);
  fixture.hooks.beforeWrite = undefined;
  await fixture.controller.setConsent(41, false);
  assert.equal(fixture.stored.get(41), false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(fixture.controller.getState().error, null);
});

test("授权控制器关闭写盘失败后重进账号，旧磁盘 true 不得重新授予权限", async (t) => {
  const fixture = consentControllerFixture(t, {
    consents: [[41, true], [42, true]],
    beforeWrite: async () => { throw new Error("disk full"); },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  await fixture.controller.setConsent(41, false);
  fixture.controller.deactivate();
  fixture.controller.activate(42);
  await fixture.settle();
  assert.equal(policy.getCloudStorageSnapshot().enabled, true);
  fixture.controller.activate(41);
  await fixture.settle();
  assert.equal(fixture.stored.get(41), true);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.match(fixture.controller.getState().error, /关闭设置保存失败/);
  fixture.hooks.beforeWrite = undefined;
  await fixture.controller.setConsent(41, false);
  fixture.controller.deactivate();
  fixture.controller.activate(41);
  await fixture.settle();
  assert.equal(fixture.stored.get(41), false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  assert.equal(fixture.controller.getState().error, null);
});

test("授权控制器 pending 写入后同账号重新激活，等待旧写落盘再读取", async (t) => {
  const write = deferred();
  const started = deferred();
  const fixture = consentControllerFixture(t, {
    consents: [[41, true]],
    beforeWrite: () => { started.resolve(); return write.promise; },
  });
  fixture.controller.activate(41);
  await fixture.settle();
  const disabling = fixture.controller.setConsent(41, false);
  await started.promise;
  fixture.controller.deactivate();
  fixture.controller.activate(41);
  await fixture.settle();
  assert.equal(fixture.reads.length, 1);
  assert.equal(policy.getCloudStorageSnapshot().ready, false);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
  write.resolve();
  await disabling;
  await fixture.settle();
  assert.equal(fixture.reads.length, 2);
  assert.equal(policy.getCloudStorageSnapshot().ready, true);
  assert.equal(policy.getCloudStorageSnapshot().enabled, false);
});
