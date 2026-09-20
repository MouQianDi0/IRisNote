const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const { PNG } = require("pngjs");
const root = path.resolve(__dirname, "../..");

function service(platform, initial = { granted: false, canAskAgain: true }) {
  let permissions = initial;
  const calls = [];
  const native = {
    AndroidImportance: { HIGH: 4, NONE: 0 },
    AndroidNotificationVisibility: { PRIVATE: 0 },
    IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    async setNotificationChannelAsync(...args) {
      calls.push(["channel", ...args]);
    },
    async getPermissionsAsync() {
      calls.push(["permission"]);
      return permissions;
    },
    async getNotificationChannelAsync() {
      return { importance: 4 };
    },
    async requestPermissionsAsync(options) {
      calls.push(["request", options]);
      permissions = { granted: true, canAskAgain: true };
      return permissions;
    },
    async getAllScheduledNotificationsAsync() {
      return [];
    },
    async scheduleNotificationAsync(request) {
      calls.push(["schedule", request]);
      return request.identifier;
    },
    async cancelScheduledNotificationAsync(id) {
      calls.push(["cancel", id]);
    },
    async dismissNotificationAsync(id) {
      calls.push(["dismiss", id]);
    },
  };
  const stubs = {
    "expo-notifications": native,
    "expo-application": { applicationId: "com.mouqiandi.irisNote" },
    "expo-intent-launcher": {
      async startActivityAsync(...args) {
        calls.push(["settings", ...args]);
      },
    },
    "react-native": {
      Platform: { OS: platform },
      Linking: {
        async openURL(url) {
          calls.push(["settings", url]);
        },
      },
    },
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", output)(
      (name) => {
        if (stubs[name]) return stubs[name];
        if (name.startsWith("."))
          return load(path.resolve(path.dirname(filename), `${name}.ts`));
        throw Error(`Unexpected import ${name}`);
      },
      module,
      module.exports,
    );
    cache.set(filename, module.exports);
    return module.exports;
  }
  return {
    ...load(
      path.join(
        root,
        "src/core/system-notifications/system-notification.service.ts",
      ),
    ),
    calls,
    native,
  };
}

test("启动只建 HIGH/PRIVATE 渠道，不弹权限且不创建 sync 渠道", async () => {
  const s = service("android");
  await s.initializeSystemNotifications();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0][1], "irisnote.reminders.v1");
  assert.deepEqual(s.calls[0][2], {
    name: "待办提醒",
    importance: 4,
    sound: "default",
    enableVibrate: true,
    lockscreenVisibility: 0,
    showBadge: false,
  });
});

test("主动申请先创建渠道，并发请求合并成一次权限弹窗", async () => {
  const s = service("android");
  const results = await Promise.all([
    s.requestSystemNotificationPermission(),
    s.requestSystemNotificationPermission(),
  ]);
  assert.equal(s.calls[0][0], "channel");
  assert.equal(s.calls.filter(([call]) => call === "request").length, 1);
  assert.equal(
    results.every((value) => value.granted),
    true,
  );
});

test("权限不可再次请求或 Android 渠道已关闭时不重复弹窗", async () => {
  const s = service("android", { granted: false, canAskAgain: false });
  assert.equal((await s.requestSystemNotificationPermission()).granted, false);
  assert.equal(
    s.calls.some(([call]) => call === "request"),
    false,
  );
  const blocked = service("android", { granted: true, canAskAgain: true });
  blocked.native.getNotificationChannelAsync = async () => ({ importance: 0 });
  assert.deepEqual(await blocked.systemNotifications.permission(), {
    granted: false,
    canAskAgain: false,
  });
});

test("iOS provisional 可调度；只申请 alert/sound，不申请 badge/critical/timeSensitive", async () => {
  const provisional = service("ios", {
    granted: false,
    canAskAgain: true,
    ios: { status: 3 },
  });
  assert.equal(
    (await provisional.systemNotifications.permission()).granted,
    true,
  );
  const s = service("ios");
  await s.requestSystemNotificationPermission();
  assert.deepEqual(s.calls.find(([call]) => call === "request")[1], {
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  assert.equal(
    s.calls.some(([call]) => call === "channel"),
    false,
  );
  const at = Date.now() + 60_000;
  await s.systemNotifications.schedule("id", at, "摘要", {
    kind: "todo-start",
    ownerKey: "user:1",
    todoId: "1",
  });
  const request = s.calls.find(([call]) => call === "schedule")[1];
  assert.equal(request.content.interruptionLevel, "active");
  assert.equal(request.trigger.date.getTime(), at);
  assert.equal(request.trigger.repeats, undefined);
  await s.systemNotifications.cancel("id");
  assert.deepEqual(s.calls.slice(-2), [
    ["cancel", "id"],
    ["dismiss", "id"],
  ]);
});

test("系统设置链接使用平台入口，Web 不调用通知原生 API", async () => {
  const android = service("android");
  await android.openSystemNotificationSettings();
  assert.deepEqual(android.calls[0], [
    "settings",
    "android.settings.APP_NOTIFICATION_SETTINGS",
    {
      extra: { "android.provider.extra.APP_PACKAGE": "com.mouqiandi.irisNote" },
    },
  ]);
  const ios = service("ios");
  await ios.openSystemNotificationSettings();
  assert.deepEqual(ios.calls[0], ["settings", "app-settings:"]);
  const web = service("web");
  await web.initializeSystemNotifications();
  assert.equal(
    (await web.requestSystemNotificationPermission()).granted,
    false,
  );
  assert.deepEqual(await web.systemNotifications.scheduled(), []);
  assert.deepEqual(web.calls, []);
});

test("最终 Expo 原生配置移除 APNs entitlement，且没有远程后台通知或精确闹钟声明", () => {
  const config = JSON.parse(
    execFileSync(
      process.execPath,
      ["node_modules/expo/bin/cli", "config", "--type", "introspect", "--json"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 10_000_000,
      },
    ),
  );
  const native = config._internal.modResults;
  assert.equal(config.ios.bundleIdentifier, "com.mouqiandi.irisNote");
  assert.equal(native.ios.entitlements["aps-environment"], undefined);
  assert.equal(
    (native.ios.infoPlist.UIBackgroundModes ?? []).includes(
      "remote-notification",
    ),
    false,
  );
  assert.equal(
    JSON.stringify(native.android.manifest).includes("SCHEDULE_EXACT_ALARM"),
    false,
  );
});

test("Android 通知图标为 96px 白色透明 PNG，且有非空图形和透明背景", () => {
  const png = PNG.sync.read(
    fs.readFileSync(path.join(root, "assets/images/notification-icon.png")),
  );
  assert.equal(png.width, 96);
  assert.equal(png.height, 96);
  const alpha = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    alpha.add(png.data[i + 3]);
    if (png.data[i + 3])
      assert.deepEqual([...png.data.subarray(i, i + 3)], [255, 255, 255]);
  }
  assert.equal(alpha.has(0), true);
  assert.equal(alpha.has(255), true);
});

test("Expo Go 安全入口不静态加载通知原生模块，原生实现单独保留", () => {
  const provider = fs.readFileSync(
    path.join(
      root,
      "src/core/system-notifications/system-notification-provider.tsx",
    ),
    "utf8",
  );
  const nativeProvider = fs.readFileSync(
    path.join(
      root,
      "src/core/system-notifications/system-notification-native-provider.tsx",
    ),
    "utf8",
  );
  assert.match(provider, /isRunningInExpoGo/);
  assert.match(provider, /lazy\(\(\)\s*=>\s*import\("\.\/system-notification-native-provider"\)/);
  assert.doesNotMatch(provider, /from "expo-notifications"/);
  assert.doesNotMatch(provider, /from "\.\/system-notification\.service"/);
  assert.match(nativeProvider, /from "expo-notifications"/);
});
