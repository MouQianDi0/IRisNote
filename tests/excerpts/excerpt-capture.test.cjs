const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
const root = path.resolve(__dirname, "../..");
const { ExcerptCaptureController } = require(
    path.join(
        root,
        "src/features/excerpts/services/excerpt-capture-controller.ts",
    ),
);
const { hashExcerptContent } = require(
    path.join(root, "src/features/excerpts/domain/excerpt-validation.ts"),
);

function harness() {
    let now = 1_800_000_000_000;
    const startedAt = now;
    let owner = "user:1";
    let active = true;
    let text = "其他应用复制的正文";
    const events = [];
    const saved = new Map();
    const stashed = new Set();
    const repository = {
        generation: 1,
        assertSession(key, generation) { assert.equal(key, owner); assert.equal(generation, repository.generation); },
        list: () => [...saved.values()],
        save: async (key, id, content, source) => {
            events.push(["save", key, content, source]);
            const hash = hashExcerptContent(content);
            const entity = saved.get(hash) ?? { content, contentHash: hash, clientId: id };
            const duplicated = saved.has(hash);
            saved.set(hash, entity);
            return { entity, duplicated };
        },
    };
    const stash = {
        hashes: async () => stashed,
        add: async (key, content) => {
            const hash = hashExcerptContent(content);
            if (stashed.has(hash)) return "duplicate";
            stashed.add(hash); return "added";
        },
        list: async () => [], reorder: async () => {}, update: async () => "saved", remove: async () => {}, clear: async () => stashed.clear(),
    };
    const ports = {
        readOwner: async () => owner,
        readSession: async () => ({ sessionId: "session-1", ownerKey: owner, startedAt, endsAt: startedAt + 30 * 60_000, durationMinutes: 30 }),
        active: async () => active,
        activate: async (key) => events.push(["activate", key]),
        repository, stash,
        clipboard: { hasText: async () => true, readText: async () => { events.push("read"); return text; }, lastWrittenHash: () => null },
        consumed: (offer) => events.push(["consumed", offer.hash]),
        now: () => now,
    };
    const controller = new ExcerptCaptureController("session-1", ports);
    return { controller, ports, repository, stash, saved, stashed, events,
        setOwner: (value) => { owner = value; }, setActive: (value) => { active = value; },
        setText: (value) => { text = value; }, advance: (ms) => { now += ms; } };
}

test("捕获候选可编辑最终正文再保存，来源为 manual", async () => {
    const h = harness();
    const result = await h.controller.detect();
    assert.equal(result.kind, "offer");
    assert.equal(h.saved.size, 0);
    await h.controller.save("编辑后正文");
    assert.deepEqual(h.events.find((event) => Array.isArray(event) && event[0] === "save"), ["save", "user:1", "编辑后正文", "manual"]);
    assert.equal(h.saved.size, 1);
    assert.equal(h.events.at(-1)[0], "consumed");
});

test("重复摘录保留候选，可继续编辑后重试", async () => {
    const h = harness();
    await h.controller.detect();
    const original = "已存在正文";
    const hash = hashExcerptContent(original);
    h.saved.set(hash, { content: original, contentHash: hash });
    assert.equal((await h.controller.save(original)).duplicated, true);
    assert.ok(h.controller.currentOffer());
    assert.equal((await h.controller.save("改写正文")).duplicated, false);
    assert.equal(h.controller.currentOffer(), null);
});

test("暂存写入后下次检测跳过；关闭未保存不会留下标记", async () => {
    const h = harness();
    await h.controller.detect();
    assert.equal(await h.controller.stash(), "added");
    assert.equal(h.stashed.size, 1);
    assert.equal((await h.controller.detect()).reason, "stashed");
    const k = harness();
    await k.controller.detect();
    k.controller.dispose();
    assert.equal(k.stashed.size, 0);
    assert.equal(k.saved.size, 0);
});

test("重复暂存也消耗当前候选，刷新暂存不再次读取剪贴板", async () => {
    const h = harness();
    await h.controller.detect();
    h.stash.add = async () => "duplicate";
    assert.equal(await h.controller.stash(), "duplicate");
    assert.equal(h.controller.currentOffer(), null);
    await h.controller.listStash();
    assert.equal(h.events.filter((event) => event === "read").length, 1);
});

test("失败保留原候选并复用并发保存 Promise", async () => {
    const h = harness();
    await h.controller.detect();
    const save = h.repository.save;
    h.repository.save = async () => { throw new Error("磁盘写入失败"); };
    await assert.rejects(h.controller.save("编辑后正文"), /磁盘/);
    h.setText("后来复制的新正文");
    let release;
    h.repository.save = async (...args) => { await new Promise((resolve) => { release = resolve; }); return save(...args); };
    const first = h.controller.save("编辑后正文");
    assert.equal(h.controller.save("编辑后正文"), first);
    await new Promise((resolve) => setImmediate(resolve));
    release(); await first;
    assert.equal([...h.saved.values()][0].content, "编辑后正文");
    assert.equal(h.events.filter((event) => event === "read").length, 1);
});

test("会话或账号失效禁止保存和暂存", async () => {
    for (const invalidate of [(h) => h.setOwner("user:2"), (h) => h.repository.generation++, (h) => h.setActive(false), (h) => h.advance(30 * 60_000)]) {
        const h = harness(); await h.controller.detect(); invalidate(h);
        await assert.rejects(h.controller.save("正文"));
        await assert.rejects(h.controller.stash());
        assert.equal(h.saved.size, 0); assert.equal(h.stashed.size, 0);
    }
});

test("已保存、已暂存、本应用写入、空内容和超长均不产生候选", async () => {
    const content = "其他应用复制的正文";
    const hash = hashExcerptContent(content);
    for (const [reason, setup] of [
        ["saved", (h) => h.saved.set(hash, { contentHash: hash })],
        ["stashed", (h) => h.stashed.add(hash)],
        ["self", (h) => { h.ports.clipboard.lastWrittenHash = () => hash; }],
        ["empty", (h) => h.setText("  \n ")],
        ["tooLong", (h) => h.setText("字".repeat(20001))],
        ["noText", (h) => { h.ports.clipboard.hasText = async () => false; }],
    ]) {
        const h = harness(); setup(h);
        const result = await h.controller.detect();
        assert.equal(result.reason, reason);
        await assert.rejects(h.controller.save(), /没有待保存/);
    }
});

test("会话卡携带「保存剪贴板」按钮，与停止共用 HIGH 静默渠道且入口标记只进诊断", () => {
    const notifications = fs.readFileSync(
        path.join(
            root,
            "modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptSessionNotifications.kt",
        ),
        "utf8",
    );
    // 摘录卡通知 ID 迁移到 7004：7001 演示、7002 聚合、7003 前台停机占位（勿双占），旧 7003 残留发卡时清理。
    assert.match(notifications, /const val ID = 7004/);
    assert.match(notifications, /private const val LEGACY_ID = 7003/);
    assert.match(notifications, /manager\.cancel\(LEGACY_ID\)/);
    // 按钮与卡主体同一捕获宿主，独立请求码防止 PendingIntent 合并。
    assert.match(notifications, /"保存剪贴板", savePendingIntent/);
    assert.match(notifications, /CAPTURE_REQUEST_CODE = ID \+ 1/);
    assert.match(
        notifications,
        /PendingIntent\.getActivity\(context, CAPTURE_REQUEST_CODE, saveIntent,\s*PendingIntent\.FLAG_UPDATE_CURRENT or PendingIntent\.FLAG_IMMUTABLE\)/,
    );
    assert.match(notifications, /Intent\(launch\)\.putExtra\(ENTRY_EXTRA, ENTRY_CARD_BUTTON\)/);
    // 停止动作与既有广播链路保持不变。
    assert.match(notifications, /"停止", stopPendingIntent/);
    // 宿主类由 prebuild 生成：发卡前校验可解析性，缺失时主体降级为主应用入口且不提供捕获按钮。
    assert.match(notifications, /captureHostResolvable\(context\)/);
    assert.match(notifications, /getActivityInfo\(ComponentName\(context, CAPTURE_HOST_CLASS\), 0\)/);
    // 宿主声明在模块 Manifest、无条件合并，getActivityInfo 查不出"声明在、dex 缺类"；
    // 守卫必须实际加载类（漏跑 prebuild 的包）才判可解析，否则点按钮 ClassNotFoundException 崩进程。
    assert.match(notifications, /Class\.forName\(CAPTURE_HOST_CLASS, false, context\.classLoader\)/);
    assert.match(notifications, /getLaunchIntentForPackage\(context\.packageName\)/);
    assert.match(notifications, /if \(savePendingIntent != null\)/);
    const activity = fs.readFileSync(
        path.join(
            root,
            "modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptCaptureActivity.kt",
        ),
        "utf8",
    );
    assert.match(activity, /putString\("captureEntry", captureEntry\)/);
    const screen = fs.readFileSync(
        path.join(root, "src/features/excerpts/screens/ExcerptCaptureScreen.tsx"),
        "utf8",
    );
    // 诊断只允许入口枚举值，不接触剪贴板正文、账号或令牌。
    assert.match(screen, /captureEntry\?: string/);
    assert.match(
        screen,
        /recordDiagnostic\("excerpt_capture", "window_opened", \{\s*entry: captureEntry \?\? "card_body",\s*\}\)/,
    );
    const stashHandler = screen.match(/const stash = \(\) => void run\(async \(\) => \{([\s\S]*?)\n    \}\);/)?.[1];
    assert.ok(stashHandler);
    assert.match(stashHandler, /setState\(\{ kind: "result", result: \{ kind: "skip", reason: "stashed"/);
    assert.doesNotMatch(stashHandler, /(?:close|finishExcerptCapture|detect)\(/);
});
