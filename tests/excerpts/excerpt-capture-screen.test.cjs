const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../../src/features/excerpts/screens/ExcerptCaptureScreen.tsx");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
}).outputText;
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

/** 只模拟宿主边界，实际执行 Screen 的 Effect 与资源/退出逻辑，不依赖 Android 布局。 */
function harness() {
    const database = deferred();
    const saving = deferred();
    const timers = new Map();
    const values = [];
    const events = [];
    let nextTimer = 0;
    let effect;
    let back;
    const capture = {
        capture: () => { events.push("capture"); return saving.promise; },
        dispose: () => events.push("dispose"),
    };
    const imports = {
        react: {
            useEffect: (callback) => { effect = callback; },
            useRef: (value) => ({ current: value }),
            useState: (value) => [value, (next) => values.push(next)],
        },
        "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
        "react-native": { Pressable: "Pressable", BackHandler: { addEventListener: (_, callback) => {
            back = callback; return { remove: () => events.push("removeBack") };
        } } },
        "@modules/irisnote-system": { __esModule: true, default: { finishExcerptCapture: async (...args) => events.push(["close", ...args]) } },
        "@/core/database/application-database-resource": { applicationDatabaseResource: { acquire: () => {
            events.push("acquire");
            return { ready: database.promise, release: async () => events.push("release") };
        } } },
        "@/core/diagnostics/diagnostic-log": { recordDiagnostic: async () => events.push("diagnostic") },
        "@/shared/theme": { defaultThemePreset: { motion: { fastDuration: 160 } } },
        "../components/ExcerptCaptureFeedback": { ExcerptCaptureFeedback: "Feedback" },
        "../domain/excerpt-capture-feedback": { captureFeedback: (result) => ({ tone: result.duplicated ? "neutral" : "success", duration: 1000, message: "完成" }) },
        "../services/excerpt-capture": { createExcerptCapture: () => { events.push("create"); return capture; } },
        "../../../../global.css": {},
    };
    const output = { exports: {} };
    const load = (name) => {
        assert.ok(name in imports, `unmocked import: ${name}`);
        return imports[name];
    };
    new Function("require", "module", "exports", "setTimeout", "clearTimeout", compiled)(
        load, output, output.exports,
        (callback, duration) => { const id = ++nextTimer; timers.set(id, { callback, duration }); return id; },
        (id) => timers.delete(id),
    );
    const view = output.exports.ExcerptCaptureScreen({ sessionId: "s1", captureId: "c1", captureEntry: "card_button" });
    return { database, saving, values, events, timers, view, mount: () => effect(), back: () => back() };
}

test("Effect StrictMode 重挂共享一次任务、写入前不显示成功、完成后仅退出一次", async () => {
    const h = harness();
    const firstCleanup = h.mount();
    assert.equal(h.back(), true);
    assert.equal(h.events.some((e) => Array.isArray(e) && e[0] === "close"), false);
    firstCleanup();
    const cleanup = h.mount();
    h.database.resolve({ database: {} });
    await tick();
    assert.equal(h.events.filter((e) => e === "acquire").length, 1);
    assert.equal(h.events.filter((e) => e === "create").length, 1);
    assert.equal(h.events.filter((e) => e === "capture").length, 1);
    assert.deepEqual(h.values, []);
    assert.equal(h.events.includes("release"), false);
    assert.equal(h.events.includes("dispose"), false);
    h.saving.resolve({ kind: "saved", duplicated: false });
    await tick();
    assert.equal(h.values.filter((value) => value?.tone === "success").length, 1);
    assert.equal(h.events.filter((e) => e === "release").length, 1);
    assert.equal(h.timers.size, 1);
    const hold = [...h.timers.values()][0]; h.timers.clear();
    assert.equal(hold.duration, 1000); hold.callback();
    const fade = [...h.timers.values()][0]; h.timers.clear();
    assert.equal(fade.duration, 160); fade.callback();
    await tick();
    assert.deepEqual(h.events.filter((e) => Array.isArray(e)), [["close", "c1", false]]);
    cleanup(); await tick();
});

test("保存进行中卸载保留租约至完成，不发布迟到成功、不关闭其他窗口", async () => {
    const h = harness();
    const cleanup = h.mount();
    h.database.resolve({ database: {} }); await tick();
    cleanup(); await tick();
    assert.equal(h.events.includes("dispose"), true);
    assert.equal(h.events.includes("release"), false);
    h.saving.resolve({ kind: "saved", duplicated: false }); await tick();
    assert.equal(h.events.filter((e) => e === "release").length, 1);
    assert.deepEqual(h.values, []);
    assert.equal(h.timers.size, 0);
    assert.equal(h.events.some((e) => Array.isArray(e) && e[0] === "close"), false);
});

test("数据库未就绪前卸载不创建捕获控制器，最终释放资源", async () => {
    const h = harness();
    const cleanup = h.mount(); cleanup(); await tick();
    h.database.resolve({ database: {} }); await tick();
    assert.equal(h.events.includes("create"), false);
    assert.equal(h.events.filter((e) => e === "release").length, 1);
    assert.deepEqual(h.values, []);
});


test("保存失败释放租约，只给错误反馈并保持约 2 秒，关窗清理全部反馈计时器", async () => {
    const h = harness();
    const cleanup = h.mount();
    h.database.resolve({ database: {} }); await tick();
    h.saving.reject(new Error("磁盘写入失败")); await tick();
    assert.deepEqual(h.values, [{ tone: "error", duration: 2000, message: "磁盘写入失败" }]);
    assert.equal(h.events.filter((e) => e === "release").length, 1);
    assert.equal([...h.timers.values()][0].duration, 2000);
    h.back(); await tick();
    assert.deepEqual(h.events.filter((e) => Array.isArray(e)), [["close", "c1", false]]);
    cleanup(); await tick();
    assert.equal(h.timers.size, 0);
});
