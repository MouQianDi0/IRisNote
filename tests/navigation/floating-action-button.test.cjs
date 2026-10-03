const assert = require("node:assert/strict");
const test = require("node:test");
const icons = require("lucide");
const { load, host, find } = require("../editor/history-test-host.cjs");

const constants = load("src/core/navigation/navigation.constants.ts", {
    "lucide-react-native": icons,
});
const expected = {
    note: [icons.PencilLine, "新建笔记", "/pages/note/create"],
    excerpt: [icons.ClipboardPenLine, "新建摘录", "/pages/excerpt/create"],
    todo: [icons.SquareCheckBig, "新建待办", "/pages/todo/create"],
    user: [icons.Settings, "打开设置", "/pages/user/settings"],
};

function buttonHost() {
    const pushes = [];
    let pathname = "/note";
    let longPressRoute;
    const { default: Button } = load(
        "src/core/navigation/components/FloatingActionButton.tsx",
        {
            // Simulate the global route store lagging behind the committed tab.
            "expo-router": { usePathname: () => pathname },
            lucide: icons,
            "morphicons/react-native": { MorphIcon: "MorphIcon" },
            "react-native": { Pressable: "Pressable" },
            "react-native-gesture-handler": { GestureDetector: "GestureDetector" },
            "react-native-reanimated": { default: { View: "AnimatedView" } },
            "../navigation.constants": constants,
            "../hooks/useDebouncedNavigation": {
                useDebouncedNavigation: () => (route) => pushes.push(route),
            },
            "../hooks/useLongPressNavigation": {
                useLongPressNavigation: (route) => {
                    longPressRoute = route;
                    return { gesture: {}, animatedStyle: {} };
                },
            },
            "@/shared/theme": { colors: {} },
            "@/shared/theme/motion": { shake: {} },
        },
    );
    return {
        pushes,
        setPath(value) { pathname = value; },
        render(props) {
            const view = Button(props);
            return {
                button: find(view, (node) => node.type === "Pressable"),
                icon: find(view, (node) => node.type === "MorphIcon"),
                longPressRoute,
            };
        },
    };
}

function assertAction(rendered, key) {
    const [icon, label, route] = expected[key];
    assert.equal(rendered.icon.props.icon, icon, `${key}: icon`);
    assert.equal(rendered.button.props.accessibilityLabel, label);
    assert.equal(rendered.longPressRoute, route);
    // Preserve the existing morph transition and reduced-motion setting.
    assert.equal(rendered.icon.props.spring, "snappy");
    assert.equal(rendered.icon.props.reducedMotion, "user");
}

test("启动后路径仍为笔记时，按钮图标、点击与长按跟随当前 Tab", () => {
    const runtime = buttonHost();
    for (const activeTab of ["note", "excerpt", "todo", "user"]) {
        const rendered = runtime.render({ activeTab });
        assertAction(rendered, activeTab);
        rendered.button.props.onPress();
        assert.equal(runtime.pushes.at(-1), expected[activeTab][2]);
    }
});

test("连续切换及旧路径迟到时，按钮始终对应最终停留页面", () => {
    const runtime = buttonHost();
    for (const activeTab of ["note", "todo", "user", "excerpt", "note", "todo"]) {
        assertAction(runtime.render({ activeTab }), activeTab);
    }
    for (const latePath of ["/user", "/excerpt", "/note", "/todo"]) {
        runtime.setPath(latePath);
        const rendered = runtime.render({ activeTab: "todo" });
        assertAction(rendered, "todo");
        rendered.button.props.onPress();
    }
    assert.deepEqual(runtime.pushes, Array(4).fill("/pages/todo/create"));
});

test("菜单将已提交的导航状态传给按钮，点击请求提交前不提前改变操作", () => {
    const navigations = [];
    const chain = {};
    for (const name of ["activeOffsetX", "onStart", "onUpdate", "onEnd", "onFinalize"]) {
        chain[name] = () => chain;
    }
    const runtime = host("src/core/navigation/components/FloatingMenu.tsx", {
        "@/shared/theme": { colors: {} },
        "@react-native-masked-view/masked-view": { default: "MaskedView" },
        "expo-blur": { BlurView: "BlurView" },
        "expo-linear-gradient": { LinearGradient: "LinearGradient" },
        "react-native": {
            Pressable: "Pressable", View: "View",
            StyleSheet: { create: (value) => value, absoluteFill: {} },
        },
        "react-native-gesture-handler": {
            Gesture: { Pan: () => chain }, GestureDetector: "GestureDetector",
        },
        "react-native-reanimated": {
            default: { View: "AnimatedView" },
            useSharedValue: (initial) => {
                let value = initial;
                return { get: () => value, set: (next) => { value = next; } };
            },
            useAnimatedStyle: (factory) => factory(),
            withTiming: (value) => value,
        },
        "react-native-worklets": { scheduleOnRN: (fn, ...args) => fn(...args) },
        "../floating-menu-visibility": {
            getFloatingMenuHidden: () => false,
            onFloatingMenuVisibilityChanged: () => () => {},
        },
        "../navigation.constants": constants,
        "./FloatingActionButton": { default: "FloatingActionButton" },
    });
    const button = buttonHost();
    // Deliberately reorder routes to catch accidental fixed-index mappings.
    const routes = ["user", "note", "todo", "excerpt"].map((name) => ({ key: name, name }));
    const renderAt = (index) => runtime.render(({ default: Menu }) => Menu({
        state: { index, routes },
        blurTarget: { current: null },
        navigation: { navigate: (key) => navigations.push(key) },
    }));
    const actionIn = (view) => find(view, (node) => node.type === "FloatingActionButton");
    try {
        const initial = renderAt(1);
        const todoTab = find(initial, (node) => node.props?.accessibilityLabel === "待办");
        todoTab.props.onPress();
        assert.deepEqual(navigations, ["todo"]);
        assertAction(button.render(actionIn(initial).props), "note");
        for (const index of [2, 0, 3, 1, 2]) {
            const view = renderAt(index);
            const action = actionIn(view);
            assert.equal(action.props.activeTab, routes[index].name);
            assertAction(button.render(action.props), routes[index].name);
        }
    } finally {
        runtime.cleanup();
    }
});

test("原有路径入口仍保留各页面的操作映射", () => {
    for (const key of Object.keys(expected)) {
        for (const path of [`/${key}`, `/(tabs)/${key}`, `/${key}/nested`]) {
            assert.deepEqual(constants.getMainAction(path), constants.getMainActionForTab(key));
        }
    }
    assert.deepEqual(constants.getMainAction("/"), constants.getMainActionForTab("note"));
});

test("真实变形引擎在首帧前多次切换及帧延迟后收敛到最终图标", async () => {
    const { createMorph, canonicalD } = await import("morphicons/dom");
    const frames = new Map();
    let nextId = 0;
    let timestamp = 0;
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => {
        frames.set(++nextId, callback);
        return nextId;
    };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    let drawn;
    let morph;
    const frame = (delay) => {
        timestamp += delay;
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(timestamp);
        assert.doesNotMatch(drawn, /NaN|Infinity/);
    };
    try {
        morph = createMorph({ setAttribute: (_, d) => { drawn = d; } }, icons.PencilLine);
        assert.equal(drawn, canonicalD(icons.PencilLine));
        for (const key of ["excerpt", "todo", "user"]) {
            morph.morphTo(expected[key][0], "snappy");
        }
        frame(1500);
        frame(1200);
        morph.morphTo(icons.ClipboardPenLine, "snappy");
        frame(16);
        morph.morphTo(icons.SquareCheckBig, "snappy");
        for (let i = 0; frames.size && i < 300; i++) frame(16);
        assert.equal(frames.size, 0, "animation must settle");
        assert.equal(drawn, canonicalD(icons.SquareCheckBig));
        morph.morphTo(icons.PencilLine, "snappy");
        morph.destroy();
        assert.equal(frames.size, 0, "unmount cancels animation frames");
    } finally {
        morph?.destroy();
        if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = previousRaf;
        if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
        else globalThis.cancelAnimationFrame = previousCancel;
    }
});
