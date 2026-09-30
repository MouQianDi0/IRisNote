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

test("一次通知捕获直接保存原正文，来源为 paste，并发与重复调用只读写一次", async () => {
    const h = harness();
    const first = h.controller.capture();
    assert.equal(h.controller.capture(), first);
    const result = await first;
    assert.deepEqual(result, { kind: "saved", duplicated: false });
    assert.equal(h.saved.size, 1);
    assert.deepEqual(h.events.find((e) => Array.isArray(e) && e[0] === "save"), ["save", "user:1", "其他应用复制的正文", "paste"]);
    assert.equal(h.events.at(-1)[0], "consumed");
    h.setText("后来复制的正文");
    assert.equal(h.controller.capture(), first);
    await h.controller.capture();
    assert.equal(h.events.filter((e) => e === "read").length, 1);
    assert.equal(h.events.filter((e) => Array.isArray(e) && e[0] === "save").length, 1);
});

test("实际写入结束前不报告成功；受理后关窗仍完成固定账号的保存", async () => {
    const h = harness();
    const save = h.repository.save;
    let release;
    h.repository.save = async (...args) => {
        await new Promise((resolve) => { release = resolve; });
        return save(...args);
    };
    let finished = false;
    const pending = h.controller.capture().then((result) => { finished = true; return result; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    assert.equal(h.saved.size, 0);
    h.controller.dispose();
    release();
    assert.equal((await pending).kind, "saved");
    assert.equal(h.saved.size, 1);
});

test("保存失败不消费候选、不写已处理标记，同一窗口不重新读取；新窗口可重试", async () => {
    const h = harness();
    const save = h.repository.save;
    h.repository.save = async () => { throw new Error("磁盘写入失败"); };
    const pending = h.controller.capture();
    await assert.rejects(pending, /磁盘/);
    assert.equal(h.saved.size, 0);
    assert.equal(h.events.some((e) => Array.isArray(e) && e[0] === "consumed"), false);
    h.repository.save = save;
    assert.equal(h.controller.capture(), pending);
    await assert.rejects(h.controller.capture(), /磁盘/);
    const next = new ExcerptCaptureController("session-1", h.ports);
    assert.equal((await next.capture()).kind, "saved");
    assert.equal(h.events.filter((e) => e === "read").length, 2);
});

test("读取后至保存受理前会话、账号、窗口或仓库代次变化禁止写入", async () => {
    for (const invalidate of [(h) => h.setOwner("user:2"), (h) => h.repository.generation++, (h) => h.setActive(false), (h) => h.advance(30 * 60_000), (h) => h.controller.dispose()]) {
        const h = harness();
        const hashes = h.stash.hashes;
        h.stash.hashes = async () => { const result = await hashes(); invalidate(h); return result; };
        await assert.rejects(h.controller.capture());
        assert.equal(h.saved.size, 0);
        assert.equal(h.stashed.size, 0);
    }
});

test("失效会话在读取前终止", async () => {
    const h = harness();
    h.setActive(false);
    await assert.rejects(h.controller.capture(), /失效/);
    assert.equal(h.events.includes("read"), false);
});

test("已保存、已暂存、本应用写入、空内容、非文字和超长均不保存", async () => {
    const hash = hashExcerptContent("其他应用复制的正文");
    for (const [reason, setup] of [
        ["saved", (h) => h.saved.set(hash, { contentHash: hash })],
        ["stashed", (h) => h.stashed.add(hash)],
        ["self", (h) => { h.ports.clipboard.lastWrittenHash = () => hash; }],
        ["empty", (h) => h.setText("  \n ")],
        ["tooLong", (h) => h.setText("字".repeat(20001))],
        ["noText", (h) => { h.ports.clipboard.hasText = async () => false; }],
    ]) {
        const h = harness(); setup(h);
        assert.equal((await h.controller.capture()).reason, reason);
        assert.equal(h.events.some((e) => Array.isArray(e) && e[0] === "save"), false);
        assert.equal(h.events.filter((e) => e === "read").length, reason === "noText" ? 0 : 1);
    }
});

test("读后新增重复摘录交给保存仓库去重，结果为中性且消费相同候选", async () => {
    const h = harness();
    const save = h.repository.save;
    h.repository.save = (...args) => {
        h.saved.set(hashExcerptContent(args[2]), { contentHash: hashExcerptContent(args[2]) });
        return save(...args);
    };
    assert.deepEqual(await h.controller.capture(), { kind: "saved", duplicated: true });
    assert.equal(h.saved.size, 1);
    assert.equal(h.events.at(-1)[0], "consumed");
});

test("反馈区分真正成功、重复、暂存与超限，错误有更长显示时间", () => {
    const { captureFeedback } = require(path.join(root, "src/features/excerpts/domain/excerpt-capture-feedback.ts"));
    assert.deepEqual(captureFeedback({ kind: "saved", duplicated: false }), { tone: "success", message: "已将剪贴板摘录完成", duration: 1000 });
    for (const result of [{ kind: "saved", duplicated: true }, { kind: "skip", reason: "saved" }]) {
        assert.equal(captureFeedback(result).message, "该内容已在摘录中");
        assert.equal(captureFeedback(result).tone, "neutral");
    }
    assert.equal(captureFeedback({ kind: "skip", reason: "stashed" }).message, "该内容已在暂存区");
    assert.equal(captureFeedback({ kind: "skip", reason: "tooLong" }).duration, 2000);
    assert.equal(captureFeedback({ kind: "skip", reason: "empty" }).tone, "neutral");
});

test("会话卡携带「摘录剪贴板」按钮，与停止共用 HIGH 静默渠道且入口标记只进诊断", () => {
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
    assert.match(notifications, /"摘录剪贴板", savePendingIntent/);
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
        screen.replace(/\s+/g, " "),
        /recordDiagnostic\("excerpt_capture", "window_opened", \{\s*entry: captureEntry === "card_button" \? "card_button" : "card_body",\s*\}\)/,
    );
    assert.match(screen, /await capture.capture\(\)/);
    assert.match(screen, /finishExcerptCapture\(captureId, false\)/);
    assert.doesNotMatch(screen, /DraftDialog|ExcerptFormDialog|ExcerptStashPanel|listStash/);
});
