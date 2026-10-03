const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const privacy = "/pages/user/privacy-security";
const profile = "/pages/user/profile";
const password = "/pages/user/profile/password";
const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname,
        "../../src/features/profile/hooks/useUnsavedLeaveGuard.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

// Execute the real hook with persistent hook slots and a navigation port.
// The port models dismissTo's documented pop-or-replace semantics; it is not a native UI test.
function harness(initialStack, returnRoute) {
    let stack = [...initialStack];
    let cursor = 0;
    const slots = [];
    let prevent = false;
    let onPrevent;
    let exiting = false;
    function dispatch(action) {
        if (action.type === "BACK") stack.pop();
        else if (action.type === "REPLACE") stack[stack.length - 1] = action.route;
        else {
            const index = stack.lastIndexOf(action.route);
            if (index >= 0) stack = stack.slice(0, index + 1);
            else stack[stack.length - 1] = action.route;
        }
    }
    function request(action) {
        if (prevent) onPrevent({ data: { action } });
        else dispatch(action);
    }
    const mocks = {
        "@/shared/http/session-events": { isSessionExiting: () => exiting },
        "expo-router": { router: {
            canGoBack: () => stack.length > 1,
            back: () => request({ type: "BACK" }),
            replace: (route) => request({ type: "REPLACE", route }),
            dismissTo: (route) => request({ type: "DISMISS_TO", route }),
        } },
        "expo-router/react-navigation": {
            useNavigation: () => ({ dispatch }),
            usePreventRemove: (enabled, callback) => {
                prevent = enabled;
                onPrevent = callback;
            },
        },
        react: {
            useRef: (value) => {
                const index = cursor++;
                return slots[index] ??= { current: value };
            },
            useState: (value) => {
                const index = cursor++;
                if (!(index in slots)) slots[index] = value;
                return [slots[index], (next) => { slots[index] = next; }];
            },
        },
    };
    const module = { exports: {} };
    new Function("require", "exports", "module", code)((name) => {
        assert.ok(name in mocks, `Unexpected import: ${name}`);
        return mocks[name];
    }, module.exports, module);
    return {
        render(dirty = false, saving = false) {
            cursor = 0;
            return module.exports.useUnsavedLeaveGuard(dirty, saving, returnRoute);
        },
        stack: () => [...stack],
        systemBack: () => request({ type: "BACK" }),
        expireSession: () => {
            exiting = true;
            request({ type: "REPLACE", route: "/auth/welcome" });
        },
    };
}

test("账户页返回已有隐私与安全页面，不新增重复页面", () => {
    const h = harness(["/pages/user/settings", privacy, password], privacy);
    h.render().goBack();
    assert.deepEqual(h.stack(), ["/pages/user/settings", privacy]);
});

test("旧链接直接进入时，保存成功替换为隐私与安全", () => {
    const h = harness([password], privacy);
    h.render(true, true).leaveAfterSave();
    assert.deepEqual(h.stack(), [privacy]);
});

test("账户页未保存返回先确认，继续编辑保留页面，放弃后返回目标", () => {
    const h = harness([privacy, password], privacy);
    h.render(true).goBack();
    assert.deepEqual(h.stack(), [privacy, password]);
    let guard = h.render(true);
    assert.equal(guard.confirmVisible, true);
    guard.continueEditing();
    guard = h.render(true);
    assert.equal(guard.confirmVisible, false);
    guard.goBack();
    h.render(true).discardAndLeave();
    assert.deepEqual(h.stack(), [privacy]);
});

test("提交中按钮返回与系统返回均被拦截，成功后才放行", () => {
    const h = harness([privacy, password], privacy);
    h.render(true, true).goBack();
    h.systemBack();
    assert.deepEqual(h.stack(), [privacy, password]);
    const guard = h.render(true, true);
    assert.equal(guard.confirmVisible, false);
    guard.leaveAfterSave();
    assert.deepEqual(h.stack(), [privacy]);
});

test("未保存时系统返回仍需确认，登录失效可跳转欢迎页", () => {
    const h = harness([privacy, password], privacy);
    h.render(true);
    h.systemBack();
    assert.equal(h.render(true).confirmVisible, true);
    assert.deepEqual(h.stack(), [privacy, password]);
    h.expireSession();
    assert.deepEqual(h.stack(), [privacy, "/auth/welcome"]);
});

test("其他资料页继续使用历史返回和个人资料兜底", () => {
    const withHistory = harness([profile, "nickname"]);
    withHistory.render().goBack();
    assert.deepEqual(withHistory.stack(), [profile]);
    const direct = harness(["nickname"]);
    direct.render(true).leaveAfterSave();
    assert.deepEqual(direct.stack(), [profile]);
});
