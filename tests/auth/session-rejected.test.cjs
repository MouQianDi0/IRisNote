// Real HTTP client interceptors with a fake adapter; no external network calls.
const { test, beforeEach, afterEach } = require("node:test");
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
require.extensions[".ts"] = (module, filename) => {
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
};

const storedValues = new Map();
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === "@react-native-async-storage/async-storage") {
    return {
      __esModule: true,
      default: {
        getItem: async (key) => storedValues.get(key) ?? null,
        async setItem(key, value) { storedValues.set(key, value); },
      },
    };
  }
  return originalLoad.call(this, name, ...args);
};

globalThis.__DEV__ = false;
const api = require("@/shared/http/client.ts").default;
const {
  onSessionRejected,
  rejectedSessionToken,
} = require("@/shared/http/session-events.ts");
const { AxiosError } = require("axios");

const reply = (status) => async (config) => {
  const response = { config, data: { error: "x" }, headers: {}, status, statusText: "" };
  if (status < 400) return response;
  throw new AxiosError("failed", "ERR_BAD_REQUEST", config, null, response);
};

let rejected;
let unsubscribe;
beforeEach(() => {
  storedValues.clear();
  storedValues.set("token", "current-token");
  rejected = [];
  unsubscribe = onSessionRejected((token) => rejected.push(token));
});
afterEach(() => unsubscribe());

test("需登录接口返回 401 时发布本次请求实际使用的令牌", async () => {
  api.defaults.adapter = reply(401);
  await assert.rejects(api.get("/user/profile"));
  assert.deepEqual(rejected, ["current-token"]);
});

test("调用方显式携带的旧令牌被拒时发布旧令牌，由订阅方判定与当前令牌不同", async () => {
  api.defaults.adapter = reply(401);
  await assert.rejects(
    api.get("/user/profile", { headers: { Authorization: "Bearer old-token" } }),
  );
  assert.deepEqual(rejected, ["old-token"]);
});

test("登录接口的 401、未带令牌的请求和其他错误码都不算会话失效", async () => {
  api.defaults.adapter = reply(401);
  await assert.rejects(api.post("/auth/login", { email: "a@b.c", password: "x" }));
  storedValues.delete("token");
  await assert.rejects(api.get("/user/profile"));
  storedValues.set("token", "current-token");
  for (const status of [403, 500, 503]) {
    api.defaults.adapter = reply(status);
    await assert.rejects(api.get("/user/profile"));
  }
  api.defaults.adapter = reply(200);
  await api.get("/user/profile");
  assert.deepEqual(rejected, []);
});

test("只从 Bearer 请求头取令牌，并排除认证接口", () => {
  assert.equal(rejectedSessionToken("/user/profile", "Bearer abc"), "abc");
  assert.equal(rejectedSessionToken("/user/profile", "bearer abc"), "abc");
  assert.equal(rejectedSessionToken("/auth/login-code", "Bearer abc"), null);
  assert.equal(rejectedSessionToken(undefined, "Bearer abc"), null);
  assert.equal(rejectedSessionToken("/user/profile", undefined), null);
  assert.equal(rejectedSessionToken("/user/profile", "Basic abc"), null);
  assert.equal(rejectedSessionToken("/user/profile", "Bearer "), null);
});
