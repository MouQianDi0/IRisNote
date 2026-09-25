const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    detectClipboard,
    evaluateClipboardText,
} = require("@/features/excerpts/domain/clipboard-detection.ts");
const {
    EXCERPT_CONTENT_LIMIT,
    hashExcerptContent,
} = require("@/features/excerpts/domain/excerpt-validation.ts");
const {
    createSystemPreferences,
} = require("@/core/database/migrations/0011-create-system-preferences.ts");
const {
    SystemPreferencesRepository,
} = require("@/features/settings/data/system-preferences.repository.ts");

const hash = (text) => hashExcerptContent(text);
const empty = new Set();

// 记录每一步是否被调用，验证「任何一步不满足即停止」且未读取不必要的内容。
function sources(overrides = {}) {
    const calls = [];
    const step =
        (name, value) =>
        async (...args) => {
            calls.push(name);
            return typeof value === "function" ? value(...args) : value;
        };
    return {
        calls,
        sources: {
            enabled: step("enabled", overrides.enabled ?? true),
            hasText: step("hasText", overrides.hasText ?? true),
            readText: step("readText", overrides.text ?? "新内容"),
            lastHandledHash: step("lastHandled", overrides.lastHandled ?? null),
            lastWrittenHash: () => overrides.lastWritten ?? null,
            savedHashes: () => overrides.saved ?? empty,
        },
    };
}

test("开关关闭时不判断有无文字，也不读取剪贴板", async () => {
    const { calls, sources: input } = sources({ enabled: false });
    assert.deepEqual(await detectClipboard(input), {
        kind: "skip",
        reason: "disabled",
        hash: null,
    });
    assert.deepEqual(calls, ["enabled"]);
});

test("剪贴板没有文字时不读取内容", async () => {
    const { calls, sources: input } = sources({ hasText: false });
    assert.equal((await detectClipboard(input)).reason, "noText");
    assert.deepEqual(calls, ["enabled", "hasText"]);
});

test("新内容规范化后提示，并返回内容哈希", async () => {
    const { calls, sources: input } = sources({ text: "\n 链接 \n\n" });
    assert.deepEqual(await detectClipboard(input), {
        kind: "offer",
        content: " 链接",
        hash: hash(" 链接"),
    });
    assert.deepEqual(calls, ["enabled", "hasText", "readText", "lastHandled"]);
});

test("空白、已处理、超长、本应用复制、已存为摘录时不提示", () => {
    const context = {
        lastHandledHash: null,
        lastWrittenHash: null,
        savedHashes: empty,
    };
    assert.deepEqual(evaluateClipboardText(" \n\t", context), {
        kind: "skip",
        reason: "empty",
        hash: null,
    });
    assert.deepEqual(
        evaluateClipboardText("甲", {
            ...context,
            lastHandledHash: hash("甲"),
        }),
        { kind: "skip", reason: "handled", hash: null },
    );
    const long = "字".repeat(EXCERPT_CONTENT_LIMIT + 1);
    assert.deepEqual(evaluateClipboardText(long, context), {
        kind: "skip",
        reason: "tooLong",
        hash: hash(long),
    });
    assert.deepEqual(
        evaluateClipboardText("乙\n", {
            ...context,
            lastWrittenHash: hash("乙"),
        }),
        { kind: "skip", reason: "self", hash: hash("乙") },
    );
    assert.deepEqual(
        evaluateClipboardText("丙", {
            ...context,
            savedHashes: new Set([hash("丙")]),
        }),
        { kind: "skip", reason: "saved", hash: hash("丙") },
    );
});

test("剪贴板偏好默认关闭，只保存哈希，非法哈希按未处理读取", async (t) => {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    await createSystemPreferences.up({
        execAsync: async (sql) => sqlite.exec(sql),
    });
    const database = {
        async run(sql, params = []) {
            const result = sqlite.prepare(sql).run(...params);
            return { changes: Number(result.changes) };
        },
        async getFirst(sql, params = []) {
            return sqlite.prepare(sql).get(...params) ?? null;
        },
    };
    const repo = new SystemPreferencesRepository(database);
    assert.equal(await repo.clipboardAutoDetectEnabled(), false);
    assert.equal(await repo.clipboardHintDismissed(), false);
    assert.equal(await repo.clipboardLastHandledHash(), null);

    await repo.setClipboardAutoDetectEnabled(true);
    await repo.setClipboardHintDismissed();
    await repo.setClipboardLastHandledHash(hash("内容"));
    assert.equal(await repo.clipboardAutoDetectEnabled(), true);
    assert.equal(await repo.clipboardHintDismissed(), true);
    assert.equal(await repo.clipboardLastHandledHash(), hash("内容"));
    await repo.setClipboardAutoDetectEnabled(false);
    assert.equal(await repo.clipboardAutoDetectEnabled(), false);

    const stored = sqlite
        .prepare("SELECT key, value FROM system_preferences ORDER BY key")
        .all()
        .map((row) => [row.key, row.value]);
    assert.ok(stored.every(([, value]) => !value.includes("内容")));

    sqlite
        .prepare("UPDATE system_preferences SET value = ? WHERE key = ?")
        .run("不是哈希", "clipboard_last_handled_hash");
    assert.equal(await repo.clipboardLastHandledHash(), null);
});

const {
    createDetectionTrigger,
    PAGE_FOCUS_DELAY_MS,
    RESUME_DELAY_MS,
    WINDOW_FOCUS_DELAY_MS,
    WINDOW_FOCUS_FALLBACK_MS,
    CLIPBOARD_CHANGE_DELAY_MS,
} = require("@/features/excerpts/domain/clipboard-detection-trigger.ts");

function trigger(platform, initialAppState = "active") {
    const events = [];
    const instance = createDetectionTrigger({
        platform,
        initialAppState,
        schedule: (delay) => events.push(delay),
        cancel: () => events.push("cancel"),
    });
    return { events, instance };
}

test("进入摘录页时检测一次", () => {
    const { events, instance } = trigger("android");
    instance.pageFocused();
    assert.deepEqual(events, [PAGE_FOCUS_DELAY_MS]);
});

test("Android 停留在摘录页从后台回来：先排保底检测，窗口拿到焦点后改为立即检测", () => {
    const { events, instance } = trigger("android");
    instance.appStateChanged("background");
    instance.appStateChanged("active");
    instance.windowFocused();
    assert.deepEqual(events, [
        "cancel",
        WINDOW_FOCUS_FALLBACK_MS,
        WINDOW_FOCUS_DELAY_MS,
    ]);
    // 同一次回到前台只响应第一次焦点事件。
    instance.windowFocused();
    assert.equal(events.length, 3);
});

test("Android 未失焦也未进后台时收到焦点事件不检测", () => {
    const { events, instance } = trigger("android");
    instance.windowFocused();
    instance.appStateChanged("active");
    assert.deepEqual(events, []);
});

test("回到后台时取消未执行的检测，并放弃等待焦点", () => {
    const { events, instance } = trigger("android");
    instance.appStateChanged("background");
    instance.appStateChanged("active");
    instance.appStateChanged("background");
    instance.windowFocused();
    assert.deepEqual(events, ["cancel", WINDOW_FOCUS_FALLBACK_MS, "cancel"]);
});

test("iOS 回到前台直接延迟检测，不等待焦点事件", () => {
    const { events, instance } = trigger("ios", "background");
    instance.appStateChanged("active");
    assert.deepEqual(events, [RESUME_DELAY_MS]);
});

test("停留在前台时剪贴板变化会检测，后台时忽略", () => {
    const { events, instance } = trigger("android");
    instance.clipboardChanged();
    instance.appStateChanged("background");
    instance.clipboardChanged();
    assert.deepEqual(events, [CLIPBOARD_CHANGE_DELAY_MS, "cancel"]);
});

test("分屏、小窗等其他窗口抢走焦点后交还焦点时检测", () => {
    const { events, instance } = trigger("android");
    instance.windowBlurred(false);
    instance.windowFocused();
    assert.deepEqual(events, [WINDOW_FOCUS_DELAY_MS]);
    instance.windowFocused();
    assert.equal(events.length, 1);
});

test("应用内弹窗抢走焦点，关闭后主窗口重新获得焦点不检测", () => {
    const { events, instance } = trigger("android");
    instance.windowBlurred(true);
    instance.windowFocused();
    assert.deepEqual(events, []);
});

test("进后台前的失焦与回前台合并，只检测一次", () => {
    const { events, instance } = trigger("android");
    instance.windowBlurred(false);
    instance.appStateChanged("background");
    instance.appStateChanged("active");
    instance.windowFocused();
    instance.windowFocused();
    assert.deepEqual(events, [
        "cancel",
        WINDOW_FOCUS_FALLBACK_MS,
        WINDOW_FOCUS_DELAY_MS,
    ]);
});
