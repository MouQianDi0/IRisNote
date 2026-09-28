// Real password rules, error classification and HTTP client interceptors; no external network calls.
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
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
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

process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED = "1";
globalThis.__DEV__ = false;
const policy = require("@/core/cloud-storage/cloud-storage-policy.ts");
const api = require("@/shared/http/client.ts").default;
const { checkNewPassword } = require("@/shared/utils/password-policy.ts");
const {
  CLOUD_REQUIRED_MESSAGE,
  cloudRequiredMessage,
  describePasswordError,
  formatWait,
  isEmailChangeExpired,
} = require("@/features/profile/utils/password-errors.ts");
const securityApi = require("@/features/profile/api/account-security.api.ts");
const { maskEmail } = require("@/features/profile/utils/profile-validation.ts");
const { AxiosError } = require("axios");

const UNKNOWN = "结果未确认";
const httpError = (status, data) =>
  new AxiosError("failed", "ERR_BAD_REQUEST", {}, null, { status, data, headers: {}, config: {} });

test("新密码 6–64 个字符且不超过 72 字节，与服务端规则一致", () => {
  assert.equal(checkNewPassword(""), "请输入密码");
  assert.match(checkNewPassword("12345"), /6–64/);
  assert.equal(checkNewPassword(" 1234 "), null);
  assert.equal(checkNewPassword("a".repeat(64)), null);
  assert.match(checkNewPassword("a".repeat(65)), /6–64/);
  assert.equal(checkNewPassword("密".repeat(24)), null);
  assert.match(checkNewPassword("密".repeat(25)), /过长/);
  assert.equal(checkNewPassword("😀".repeat(18)), null);
  assert.match(checkNewPassword("😀".repeat(19)), /过长/);
  assert.equal(checkNewPassword("é".repeat(36)), null);
  assert.match(checkNewPassword("é".repeat(37)), /过长/);
});

test("云存储未开启且请求未发出时提示开启云存储", () => {
  const error = new policy.CloudStoragePermissionError();
  assert.deepEqual(describePasswordError(error, "失败", UNKNOWN), {
    kind: "cloud",
    message: CLOUD_REQUIRED_MESSAGE,
  });
});

test("请求已发出后授权撤销或没有响应时，修改结果按未知处理", () => {
  const revoked = new policy.CloudStoragePermissionError("changed", true);
  assert.equal(describePasswordError(revoked, "失败", UNKNOWN).kind, "unknown");
  const offline = new AxiosError("Network Error", "ERR_NETWORK", {}, null, undefined);
  assert.deepEqual(describePasswordError(offline, "失败", UNKNOWN), { kind: "unknown", message: UNKNOWN });
  // 发送验证码没有副作用，没有响应只是普通失败
  assert.equal(describePasswordError(offline, "失败").kind, "failed");
});

test("服务端错误：剩余次数、锁定等待时间与限流文案不重复拼接", () => {
  assert.equal(
    describePasswordError(httpError(400, { error: "当前密码错误", remainingAttempts: 3 }), "失败", UNKNOWN).message,
    "当前密码错误，还可尝试 3 次",
  );
  assert.deepEqual(
    describePasswordError(httpError(429, { error: "当前密码错误次数过多", retryAfter: 900 }), "失败", UNKNOWN),
    { kind: "failed", message: "当前密码错误次数过多，请 15 分钟后再试", retryAfter: 900 },
  );
  assert.equal(
    describePasswordError(httpError(429, { error: "请求过于频繁，请 42 秒后再试", retryAfter: 42 }), "失败").message,
    "请求过于频繁，请 42 秒后再试",
  );
  assert.equal(describePasswordError(httpError(500, {}), "修改失败", UNKNOWN).message, "修改失败");
  assert.equal(formatWait(59), "59 秒");
  assert.equal(formatWait(61), "2 分钟");
});

test("邮箱掩码保留首字符与域名", () => {
  assert.equal(maskEmail("owner@example.com"), "o***@example.com");
  assert.equal(maskEmail("invalid"), "invalid");
});

let calls;
beforeEach(() => {
  storedValues.clear();
  storedValues.set("token", "current-token");
  calls = [];
  api.defaults.adapter = async (config) => {
    calls.push(config);
    const user = { id: 41, email: "o@example.com", avatar: "/api/user/avatar/41_1.png" };
    const data = /\/(send|send-current|send-new)$/.test(config.url)
      ? { message: "验证码已发送" }
      : /verify-(current|password)$/.test(config.url)
        ? { ticket: "t".repeat(43), expires_in: 600 }
        : config.url.endsWith("/email-change/confirm")
          ? { user }
          : { token: "next-token", user };
    return { config, data, headers: {}, status: 200, statusText: "OK" };
  };
});
afterEach(() => policy.setCloudStorageSession(null, false, false));

test("密码接口受云授权控制：未开启时不发出请求", async () => {
  policy.setCloudStorageSession(41, true, false);
  await assert.rejects(securityApi.changePassword("old-pass", "new-pass"), (error) => {
    assert.equal(describePasswordError(error, "失败", UNKNOWN).kind, "cloud");
    return true;
  });
  assert.equal(calls.length, 0);
});

test("开启云存储后按约定路径与字段提交，并规范化头像地址", async () => {
  policy.setCloudStorageSession(41, true, true);
  const changed = await securityApi.changePassword("old-pass", "new-pass");
  await securityApi.sendPasswordResetCode();
  const reset = await securityApi.confirmPasswordReset("123456", "reset-pass");

  assert.deepEqual(calls.map((config) => [config.method, config.url]), [
    ["post", "/user/password/change"],
    ["post", "/user/password-reset/send"],
    ["post", "/user/password-reset/confirm"],
  ]);
  assert.deepEqual(JSON.parse(calls[0].data), { current_password: "old-pass", new_password: "new-pass" });
  assert.deepEqual(JSON.parse(calls[2].data), { code: "123456", new_password: "reset-pass" });
  assert.ok(calls.every((config) => config.timeout === 15000));
  assert.ok(calls.every((config) => config.headers.get("Authorization") === "Bearer current-token"));
  assert.equal(calls[0].headers.get("X-Device-Id"), undefined);
  assert.ok(calls[1].headers.get("X-Device-Id"));
  assert.ok(calls[2].headers.get("X-Device-Id"));
  assert.equal(changed.token, "next-token");
  assert.match(changed.user.avatar, /^https?:\/\/.+41_1\.png$/);
  assert.equal(reset.token, "next-token");
});

test("修改邮箱：云存储提示按操作命名，凭据过期错误码可识别", () => {
  assert.equal(cloudRequiredMessage("修改邮箱"), "修改邮箱需要开启云存储，请先在「同步与备份」中开启");
  const cloud = describePasswordError(new policy.CloudStoragePermissionError(), "失败", undefined, cloudRequiredMessage("修改邮箱"));
  assert.match(cloud.message, /^修改邮箱/);
  assert.equal(isEmailChangeExpired(httpError(400, { error: "验证已过期，请重新验证", code: "EMAIL_CHANGE_EXPIRED" })), true);
  assert.equal(isEmailChangeExpired(httpError(409, { error: "账号邮箱已变化，请重新验证", code: "EMAIL_CHANGE_EXPIRED" })), true);
  assert.equal(isEmailChangeExpired(httpError(409, { error: "该邮箱已被使用" })), false);
  assert.equal(isEmailChangeExpired(new Error("x")), false);
});

test("修改邮箱接口受云授权控制，按约定路径与字段提交并携带设备标识", async () => {
  policy.setCloudStorageSession(41, true, false);
  await assert.rejects(securityApi.sendEmailChangeCurrentCode());
  assert.equal(calls.length, 0);

  policy.setCloudStorageSession(41, true, true);
  await securityApi.sendEmailChangeCurrentCode();
  const byCode = await securityApi.verifyEmailChangeByCode("111111");
  const byPassword = await securityApi.verifyEmailChangeByPassword(" secret ");
  await securityApi.sendEmailChangeNewCode(byCode.ticket, "next@example.com");
  const user = await securityApi.confirmEmailChange(byCode.ticket, "222222");

  assert.deepEqual(calls.map((config) => config.url), [
    "/user/email-change/send-current",
    "/user/email-change/verify-current",
    "/user/email-change/verify-password",
    "/user/email-change/send-new",
    "/user/email-change/confirm",
  ]);
  assert.deepEqual(JSON.parse(calls[1].data), { code: "111111" });
  assert.deepEqual(JSON.parse(calls[2].data), { password: " secret " });
  assert.deepEqual(JSON.parse(calls[3].data), { ticket: "t".repeat(43), new_email: "next@example.com" });
  assert.deepEqual(JSON.parse(calls[4].data), { ticket: "t".repeat(43), code: "222222" });
  assert.ok(calls.every((config) => config.timeout === 15000 && config.headers.get("X-Device-Id")));
  assert.equal(byPassword.expires_in, 600);
  assert.match(user.avatar, /^https?:\/\/.+41_1\.png$/);
});
