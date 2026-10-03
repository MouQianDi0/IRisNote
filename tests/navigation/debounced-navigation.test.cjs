const assert = require("node:assert/strict");
const test = require("node:test");
const { host } = require("../editor/history-test-host.cjs");

// 执行真实 Hook，以可控路由端口和计时器模拟连点、重渲染、返回和卸载。
function navigationHost(initialPath = "/pages/user/settings", onPush) {
    const pushes = [];
    const router = {
        push: (route) => {
            onPush?.(route);
            pushes.push(route);
        },
    };
    let pathname = initialPath;
    const runtime = host(
        "src/core/navigation/hooks/useDebouncedNavigation.ts",
        {
            "expo-router": {
                usePathname: () => pathname,
                useRouter: () => router,
            },
        },
    );
    return {
        ...runtime,
        pushes,
        renderAt(nextPath = pathname) {
            pathname = nextPath;
            return runtime.render(({ useDebouncedNavigation }) =>
                useDebouncedNavigation(),
            );
        },
    };
}

test("首次点击立即入栈，锁定期间连续点击只打开一次", () => {
    const runtime = navigationHost();
    const navigate = runtime.renderAt();
    const target = "/pages/user/profile";
    navigate(target);
    assert.deepEqual(runtime.pushes, [target]);

    for (let index = 0; index < 10; index++) navigate(target);
    assert.deepEqual(runtime.pushes, [target]);
    runtime.cleanup();
});

test("同一页面快速交替点击多个选项只接受第一次选择", () => {
    const runtime = navigationHost();
    const navigate = runtime.renderAt();
    navigate("/pages/user/permissions");
    navigate("/pages/user/cloud-storage");
    navigate("/pages/user/about");
    assert.deepEqual(runtime.pushes, ["/pages/user/permissions"]);
    runtime.cleanup();
});

test("带参数导航完整保留首次选择的路由参数", () => {
    const runtime = navigationHost("/user");
    const navigate = runtime.renderAt();
    const target = {
        pathname: "/pages/note/[id]",
        params: { id: "42", resume: "1" },
    };
    navigate(target);
    navigate({ ...target, params: { id: "43", resume: "1" } });
    assert.deepEqual(runtime.pushes, [target]);
    runtime.cleanup();
});

test("来源页面重渲染仍保持锁定，解锁并返回后可再次打开", () => {
    const origin = "/pages/user/settings";
    const target = "/pages/user/profile";
    const runtime = navigationHost(origin);
    runtime.renderAt()(target);
    runtime.renderAt()(target);
    runtime.renderAt(target)(target);
    assert.deepEqual(runtime.pushes, [target]);

    runtime.flush(500);
    runtime.renderAt(origin)(target);
    assert.deepEqual(runtime.pushes, [target, target]);
    runtime.cleanup();
});

test("请求当前路径不重复入栈，也不会锁死后续选项", () => {
    const current = "/pages/user/settings";
    const runtime = navigationHost(current);
    const navigate = runtime.renderAt();
    navigate(current);
    assert.deepEqual(runtime.pushes, []);
    navigate("/pages/user/about");
    assert.deepEqual(runtime.pushes, ["/pages/user/about"]);
    runtime.cleanup();
});

test("导航同步抛错时释放锁，保留错误并允许重试", () => {
    const failure = new Error("navigation failed");
    let shouldFail = true;
    const runtime = navigationHost("/pages/user/settings", () => {
        if (shouldFail) throw failure;
    });
    const navigate = runtime.renderAt();
    assert.throws(() => navigate("/pages/user/about"), (error) => error === failure);
    assert.equal(runtime.timers.size, 0);
    shouldFail = false;
    navigate("/pages/user/about");
    assert.deepEqual(runtime.pushes, ["/pages/user/about"]);
    runtime.cleanup();
});

test("页面跳转后卸载会清理剩余解锁计时器", () => {
    const runtime = navigationHost();
    runtime.renderAt()("/pages/user/about");
    runtime.cleanup();
    assert.deepEqual(runtime.pushes, ["/pages/user/about"]);
    assert.equal(runtime.timers.size, 0);
});
