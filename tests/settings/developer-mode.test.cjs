const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

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

const unlock = require("../../src/features/settings/utils/developer-unlock.ts");
const report = require("../../src/features/settings/utils/developer-environment-report.ts");
const logView = require("../../src/features/settings/utils/diagnostic-log-view.ts");
const { parseDiagnosticLines } = require("../../src/core/diagnostics/diagnostic-log.ts");

function tapTimes(times, gap, start = 1000) {
    let counter = unlock.initialDeveloperUnlockCounter;
    let result;
    for (let index = 0; index < times; index += 1) {
        result = unlock.tapDeveloperUnlock(counter, start + index * gap);
        counter = result.counter;
    }
    return result;
}

test("连点解锁：连续 7 次开启，第 6 次还差 1 次", () => {
    assert.equal(tapTimes(6, 300).remaining, 1);
    assert.equal(tapTimes(6, 300).unlocked, false);
    const done = tapTimes(unlock.DEVELOPER_UNLOCK_TAPS, 300);
    assert.equal(done.unlocked, true);
    assert.equal(done.remaining, 0);
    assert.deepEqual(done.counter, unlock.initialDeveloperUnlockCounter);
});

test("连点解锁：间隔超过阈值重新计数", () => {
    let counter = unlock.initialDeveloperUnlockCounter;
    for (let index = 0; index < 6; index += 1)
        counter = unlock.tapDeveloperUnlock(counter, 1000 + index * 200).counter;
    const late = unlock.tapDeveloperUnlock(
        counter,
        1000 + 5 * 200 + unlock.DEVELOPER_UNLOCK_TAP_GAP_MS + 1,
    );
    assert.equal(late.unlocked, false);
    assert.equal(late.counter.count, 1);
    assert.equal(late.remaining, unlock.DEVELOPER_UNLOCK_TAPS - 1);
});

test("连点解锁：只在剩余 3 次及以内提示", () => {
    assert.equal(unlock.developerUnlockHint(4), null);
    assert.equal(unlock.developerUnlockHint(3), "再点 3 次即可开启开发者模式");
    assert.equal(unlock.developerUnlockHint(1), "再点 1 次即可开启开发者模式");
    assert.equal(unlock.developerUnlockHint(0), null);
    // 第 4 次点击后剩 3 次，开始出现提示。
    assert.ok(unlock.developerUnlockHint(tapTimes(4, 200).remaining));
    assert.equal(unlock.developerUnlockHint(tapTimes(3, 200).remaining), null);
});

const snapshot = {
    appVersion: "0.6.0",
    buildCode: "60",
    applicationId: "com.mouqiandi.irisNote",
    runMode: "发布包",
    apiBaseUrl: "https://tech-mou.top/api",
    releaseApiUrl: "https://tech-mou.top/api/releases",
    cloudStorage: "已允许云存储",
    system: "Android 16（API 36）",
    nativeModules: "系统能力 已链接 · 更新器 已链接",
    notificationPermission: "已授权",
    exactAlarm: "已授权",
    liveUpdate: "支持提升式（Android 16+）",
    scheduledReminders: "3 条",
};

test("运行环境：展示行覆盖快照全部字段且顺序固定", () => {
    const rows = report.developerEnvironmentRows(snapshot);
    assert.equal(rows.length, Object.keys(snapshot).length);
    assert.deepEqual(rows[0], { label: "应用版本", value: "0.6.0" });
    assert.deepEqual(rows.at(-1), { label: "已排程提醒", value: "3 条" });
});

test("运行环境：复制文本只含快照字段，不含账号标识或令牌", () => {
    const text = report.formatDeveloperEnvironment(
        snapshot,
        new Date("2026-09-29T06:00:00.000Z"),
    );
    assert.match(text, /^IRisNote 运行环境（2026-09-29T06:00:00.000Z）/);
    assert.match(text, /API 地址：https:\/\/tech-mou\.top\/api/);
    assert.doesNotMatch(text, /token|令牌|email|邮箱|user:|userId|ownerUserId/i);
    assert.equal(text.split("\n").length, Object.keys(snapshot).length + 1);
});

test("运行环境：精确闹钟与动态通知标签", () => {
    assert.equal(report.exactAlarmLabel("granted"), "已授权");
    assert.equal(report.exactAlarmLabel("denied"), "未授权");
    assert.equal(report.exactAlarmLabel("not-required"), "无需授权");
    assert.equal(report.exactAlarmLabel("unavailable"), "不可用");
    assert.equal(report.liveUpdateLabel(true, true), "支持提升式（Android 16+）");
    assert.equal(report.liveUpdateLabel(false, true), "仅兼容卡片");
    assert.equal(report.liveUpdateLabel(false, false), "不支持");
});

const line = (level, event, details) =>
    JSON.stringify({
        timestamp: "2026-09-29T06:00:00.000Z",
        level,
        scope: "live_update",
        event,
        ...(details ? { details } : {}),
    });

test("诊断日志解析：跳过损坏行与非法级别，最新在前", () => {
    const events = parseDiagnosticLines([
        line("info", "first"),
        "{not json",
        JSON.stringify({ level: "info", scope: "x" }),
        line("verbose", "bad_level"),
        line("error", "last", { error: "TypeError" }),
    ]);
    assert.deepEqual(
        events.map((event) => event.event),
        ["last", "first"],
    );
    assert.deepEqual(events[0].details, { error: "TypeError" });
    assert.equal("details" in events[1], false);
});

test("诊断日志查看：按级别筛选与计数", () => {
    const events = parseDiagnosticLines([
        line("info", "a"),
        line("warning", "b"),
        line("error", "c"),
        line("info", "d"),
    ]);
    assert.deepEqual(logView.countDiagnosticLevels(events), {
        all: 4,
        info: 2,
        warning: 1,
        error: 1,
    });
    assert.deepEqual(
        logView.filterDiagnosticEvents(events, "info").map((e) => e.event),
        ["d", "a"],
    );
    assert.equal(logView.filterDiagnosticEvents(events, "all").length, 4);
});

test("诊断日志查看：详情与时间格式", () => {
    assert.equal(
        logView.diagnosticDetailsText({ error: "TypeError", saved: false }),
        "error=TypeError  saved=false",
    );
    assert.equal(logView.diagnosticDetailsText(undefined), "");
    assert.equal(logView.diagnosticTimeLabel("not-a-date"), "not-a-date");
    assert.match(
        logView.diagnosticTimeLabel("2026-09-29T06:05:09.000Z"),
        /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
});
