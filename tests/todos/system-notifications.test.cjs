const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const { PNG } = require("pngjs");
const root = path.resolve(__dirname, "../..");

function service(
  platform,
  initial = { granted: false, canAskAgain: true },
  exactAlarm = "denied",
) {
  let permissions = initial;
  const calls = [];
  const native = {
    AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2, NONE: 0 },
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
    async getPresentedNotificationsAsync() {
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
      ActivityAction: {
        REQUEST_SCHEDULE_EXACT_ALARM:
          "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
      },
      async startActivityAsync(...args) {
        calls.push(["settings", ...args]);
      },
    },
    "react-native": {
      Platform: { OS: platform, Version: platform === "android" ? 36 : 0 },
      Linking: {
        async openURL(url) {
          calls.push(["settings", url]);
        },
      },
    },
    "@/core/diagnostics": {
      diagnosticErrorCategory: () => "Error",
      opaqueDiagnosticId: (value) => `opaque:${value}`,
      recordDiagnostic: async () => {},
    },
    "@modules/irisnote-system": {
      async getExactAlarmAccess() {
        return exactAlarm;
      },
      async postProgressNotification(payload) {
        calls.push(["native-post", payload]);
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

test("Android 精确提醒读取特殊权限并打开闹钟和提醒设置", async () => {
  const android = service("android", undefined, "denied");
  assert.equal(await android.exactAlarmAccess(), "denied");
  await android.openExactAlarmSettings();
  assert.deepEqual(android.calls.at(-1), [
    "settings",
    "android.settings.REQUEST_SCHEDULE_EXACT_ALARM",
    { data: "package:com.mouqiandi.irisNote" },
  ]);
  const ios = service("ios");
  assert.equal(await ios.exactAlarmAccess(), "not-required");
});

test("常驻通知使用 LOW 独立渠道且不可侧滑，关闭时同时取消和移除", async () => {
  const s = service("android", { granted: true, canAskAgain: true });
  await s.ensureRuntimeNotification();
  const channel = s.calls.find(
    ([call, id]) => call === "channel" && id === "irisnote.runtime.v1",
  );
  assert.deepEqual(channel[2], {
    name: "运行状态",
    description: "显示 IRisNote 正在运行",
    importance: 2,
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: 0,
  });
  const request = s.calls.find(
    ([call, value]) =>
      call === "schedule" && value.identifier === "irisnote.runtime.status",
  )[1];
  assert.equal(request.content.title, "IRisNote正在运行");
  assert.equal(request.content.sticky, true);
  assert.equal(request.content.autoDismiss, false);
  assert.deepEqual(request.trigger, { channelId: "irisnote.runtime.v1" });
  await s.removeRuntimeNotification();
  assert.deepEqual(s.calls.slice(-2), [
    ["cancel", "irisnote.runtime.status"],
    ["dismiss", "irisnote.runtime.status"],
  ]);
});

test("测试通知使用 DEFAULT 独立渠道并发送可自动关闭的普通通知", async () => {
  const s = service("android", { granted: true, canAskAgain: true });
  await s.sendDiagnosticTestNotification();
  const channel = s.calls.find(
    ([call, id]) => call === "channel" && id === "irisnote.diagnostics.v1",
  );
  assert.equal(channel[2].importance, 3);
  assert.equal(channel[2].sound, "default");
  const request = s.calls.find(
    ([call, value]) =>
      call === "schedule" && value.content.data.kind === "diagnostic-test",
  )[1];
  assert.equal(request.content.autoDismiss, true);
  assert.equal(request.content.sticky, undefined);
  assert.deepEqual(request.trigger, { channelId: "irisnote.diagnostics.v1" });
});

test("待办动态通知测试复用 LOW 渠道，渠道关闭时不视为可展示", async () => {
  const s = service("android", { granted: true, canAskAgain: true });
  assert.equal(await s.liveTodoNotificationPermission(), true);
  assert.equal(s.calls.some(([call, id]) =>
    call === "channel" && id === "irisnote.live-todo.v1"), true);
  assert.equal(s.calls.some(([call, id]) =>
    call === "channel" && id === "irisnote.live-test.v1"), false);
  s.native.getNotificationChannelAsync = async () => ({ importance: 0 });
  assert.equal(await s.liveTodoNotificationPermission(), false);
});

test("聚合渠道独立关闭且只有状态卡请求提升", async () => {
  const s = service("android", { granted: true, canAskAgain: true });
  s.native.getNotificationChannelAsync = async (id) => ({
    importance: id === "irisnote.live-todo.v1" ? 0 : 2,
  });
  assert.equal(await s.liveTodoNotificationPermission(), false);
  assert.equal(await s.liveTodoSummaryNotificationPermission(), true);
  const channels = s.calls.filter(([kind]) => kind === "channel");
  assert.equal(channels.find(([, id]) => id === "irisnote.live-todo-summary.v1")[2].importance, 2);
  await s.postStateCard({
    id: 7002, channelId: "irisnote.live-todo-summary.v1", title: "待办 2·临近 1",
    text: "脱敏标题", iconResourceName: "ic_live_todo_near",
  });
  const payload = s.calls.find(([kind]) => kind === "native-post")[1];
  assert.equal(payload.promoted, true);
  assert.equal(payload.ongoing, true);
  assert.equal(payload.iconResourceName, "ic_live_todo_near");
  assert.equal(payload.channelId, "irisnote.live-todo-summary.v1");
});

test("最终 Expo 原生配置移除 APNs entitlement 与远程后台通知，精确闹钟权限只由本地模块声明", () => {
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
  // 单一来源约束：app.json 不重复声明，权限由模块 Manifest 经 gradle 合并。
  assert.equal(
    JSON.stringify(native.android.manifest).includes("SCHEDULE_EXACT_ALARM"),
    false,
  );
});

test("Android 系统模块声明精确闹钟权限并限制日志来源写入 Download/irisnoteLog", () => {
  const kotlin = fs.readFileSync(
    path.join(
      root,
      "modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/IrisNoteSystemModule.kt",
    ),
    "utf8",
  );
  assert.match(kotlin, /canScheduleExactAlarms\(\)/);
  assert.match(kotlin, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(kotlin, /Environment\.DIRECTORY_DOWNLOADS}\/irisnoteLog/);
  assert.match(kotlin, /cacheDir\.canonicalFile/);
  const manifest = fs.readFileSync(
    path.join(
      root,
      "modules/irisnote-system/android/src/main/AndroidManifest.xml",
    ),
    "utf8",
  );
  assert.match(manifest, /android\.permission\.SCHEDULE_EXACT_ALARM/);
  const help = fs.readFileSync(
    path.join(root, "src/features/settings/screens/HelpFeedbackScreen.tsx"),
    "utf8",
  );
  assert.match(help, /保存并分享/);
  assert.match(help, /Download\/irisnoteLog/);
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
  assert.match(
    provider,
    /lazy\(\(\)\s*=>\s*import\("\.\/system-notification-native-provider"\)/,
  );
  assert.doesNotMatch(provider, /from "expo-notifications"/);
  assert.doesNotMatch(provider, /from "\.\/system-notification\.service"/);
  assert.match(nativeProvider, /from "expo-notifications"/);
});
