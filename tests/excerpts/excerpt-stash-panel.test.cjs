const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const feature = path.resolve(__dirname, "../../src/features/excerpts/components");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/** 执行真实组件状态与回调；宿主布局、Input 本体和原生手势留给真机验证。 */
function harness(file, initialProps) {
    const slots = [];
    let cursor = 0;
    let effects = [];
    let props = initialProps;
    let dismissals = 0;
    const memo = (factory, deps) => {
        const index = cursor++;
        if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { deps, value: factory() };
        return slots[index].value;
    };
    const shared = (value) => ({ get: () => value, set: (next) => { value = next; } });
    const imports = {
        react: {
            useState: (initial) => {
                const index = cursor++;
                if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
                return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
            },
            useRef: (value) => memo(() => ({ current: value }), []),
            useMemo: memo,
            useCallback: (value, deps) => memo(() => value, deps),
            useEffect: (callback, deps) => {
                const index = cursor++;
                if (!slots[index] || !same(slots[index].deps, deps)) {
                    const previous = slots[index];
                    effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
                }
            },
        },
        "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" },
        "react-native": { View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Keyboard: { dismiss: () => dismissals++ } },
        "lucide-react-native": Object.fromEntries(["Check", "Trash2", "X", "Inbox", "Timer", "ClipboardPaste", "Search"].map((name) => [name, name])),
        "react-native-gesture-handler": { Gesture: {}, GestureDetector: "GestureDetector" },
        "react-native-reanimated": { __esModule: true, default: { View: "AnimatedView" }, useSharedValue: (value) => memo(() => shared(value), []) },
        "react-native-worklets": {},
        "@/shared/theme": { semanticColors: {} },
        "@/shared/ui": { AppButton: "AppButton", IconButton: "IconButton", Input: "Input" },
        "../domain/excerpt-stash-drag": {},
    };
    const filename = path.join(feature, file);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
    }).outputText;
    const module = { exports: {} };
    new Function("require", "module", "exports", compiled)((name) => {
        assert.ok(name in imports, `unmocked import: ${name}`);
        return imports[name];
    }, module, module.exports);
    const component = module.exports[path.basename(file, ".tsx")];
    const render = (next) => {
        if (next) props = { ...props, ...next };
        cursor = 0; effects = [];
        const tree = component(props);
        for (const effect of effects) effect();
        return tree;
    };
    return { render, dismissals: () => dismissals, unmount: () => slots.forEach((slot) => slot?.cleanup?.()) };
}
function nodes(tree, predicate) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate), ...nodes(tree.props?.editor, predicate), ...nodes(tree.props?.trailing, predicate)];
}
const find = (tree, predicate) => {
    const result = nodes(tree, predicate)[0];
    assert.ok(result, "expected component missing");
    return result;
};
const rows = (tree) => nodes(tree, (node) => typeof node.type === "function" && node.type.name === "StashRow");
const input = (tree) => find(tree, (node) => node.type === "Input");
const action = (tree, label) => find(tree, (node) => node.props?.accessibilityLabel === label || node.props?.label === label);
const items = ["甲\n第二行", "乙"].map((content, index) => ({ clientId: `s${index}`, content, localOrder: index }));
function panel(onUpdate) {
    return harness("ExcerptStashPanel.tsx", { items, busy: false, onUpdate, onReorder: async () => true, onRemove() {}, onClear() {}, onMerge() {}, onPaste() {} });
}
function edit(h, text) {
    rows(h.render())[0].props.onEdit(items[0]);
    const field = input(h.render());
    assert.equal(field.props.value, items[0].content);
    assert.equal(field.props.multiline, true);
    field.props.onChangeText(text);
    return h.render();
}

test("暂存数不触发图标选中，工具栏顺序与会话/搜索高亮保持", () => {
    const h = harness("ExcerptToolbar.tsx", { count: 0, stashCount: 0, sessionSupported: true, sessionActive: true, searchOpen: true });
    for (const count of [0, 3]) {
        const icons = nodes(h.render({ stashCount: count }), (node) => node.type === "IconButton");
        assert.deepEqual(icons.map((node) => node.props.icon), ["Inbox", "Timer", "ClipboardPaste", "X"]);
        assert.equal(!!icons[0].props.selected, false);
        assert.equal(icons[0].props.accessibilityLabel, `查看暂存区，${count} 条`);
        assert.equal(icons[1].props.selected, true);
        assert.equal(icons[3].props.selected, true);
    }
});

test("列表位于粘贴按钮上方；相邻条目中心按实际高度连续计算", () => {
    const h = panel(async () => "saved");
    const tree = h.render();
    const all = nodes(tree, () => true);
    assert.ok(all.findIndex((node) => node.type === "ScrollView") < all.indexOf(action(tree, "粘贴到暂存区")));
    assert.equal(find(tree, (node) => node.type === "ScrollView").props.style.maxHeight, 320);
    const row = rows(tree)[0];
    row.props.onHeight("s0", 56); row.props.onHeight("s1", 80);
    assert.deepEqual(row.props.centers.get(), [28, 96]);
});

test("编辑只在显式保存时提交完整多行正文，取消不写入", () => {
    let writes = 0;
    const h = panel(async () => { writes++; return "saved"; });
    const tree = edit(h, "改动\n完整正文");
    assert.equal(writes, 0);
    assert.equal(rows(tree).every((row) => !row.props.canDrag && row.props.disabled), true);
    for (const label of ["粘贴到暂存区", "清空", "合并保存"]) assert.equal(action(tree, label).props.disabled, true);
    assert.equal(find(tree, (node) => node.type === "ScrollView").props.scrollEnabled, true);
    action(tree, "取消编辑暂存内容").props.onPress();
    assert.equal(nodes(h.render(), (node) => node.type === "Input").length, 0);
    assert.equal(rows(h.render())[0].props.item.content, items[0].content);
    assert.equal(writes, 0);
    assert.equal(h.dismissals(), 1);
});

test("保存期间禁止重复提交与取消，完成后恢复最新预览及列表操作", async () => {
    let resolve;
    const writes = [];
    const h = panel((id, text) => { writes.push([id, text]); return new Promise((done) => { resolve = done; }); });
    const tree = edit(h, "改动\n完整正文");
    const save = action(tree, "保存暂存内容").props.onPress;
    save(); save();
    action(tree, "取消编辑暂存内容").props.onPress();
    assert.deepEqual(writes, [["s0", "改动\n完整正文"]]);
    assert.equal(input(h.render()).props.disabled, true);
    const updated = items.map((item, index) => index === 0 ? { ...item, content: "改动\n完整正文" } : item);
    h.render({ items: updated });
    resolve("saved"); await tick();
    const result = h.render();
    assert.equal(nodes(result, (node) => node.type === "Input").length, 0);
    assert.equal(rows(result)[0].props.item.content, "改动\n完整正文");
    assert.equal(action(result, "合并保存").props.disabled, false);
});

test("重复和写入失败均保留输入，修改后清提示并允许重试", async () => {
    let outcome = "duplicate";
    const h = panel(async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
    });
    action(edit(h, "乙"), "保存暂存内容").props.onPress(); await tick();
    assert.equal(input(h.render()).props.value, "乙");
    assert.equal(input(h.render()).props.invalid, true);
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /已在暂存中/);
    input(h.render()).props.onChangeText("\n");
    assert.equal(input(h.render()).props.invalid, false);
    outcome = new Error("摘录内容不能为空");
    action(h.render(), "保存暂存内容").props.onPress(); await tick();
    assert.equal(input(h.render()).props.value, "\n");
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /不能为空/);
    outcome = new Error("磁盘写入失败");
    input(h.render()).props.onChangeText("仍需保存\n正文");
    action(h.render(), "保存暂存内容").props.onPress(); await tick();
    assert.equal(input(h.render()).props.value, "仍需保存\n正文");
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /磁盘写入失败/);
    outcome = "saved";
    action(h.render(), "保存暂存内容").props.onPress(); await tick();
    assert.equal(nodes(h.render(), (node) => node.type === "Input").length, 0);
});

test("账号切换/关闭导致卸载后，迟到保存结果不关闭新输入或键盘", async () => {
    let resolve;
    const h = panel(() => new Promise((done) => { resolve = done; }));
    action(edit(h, "旧账号正文"), "保存暂存内容").props.onPress();
    h.unmount();
    resolve("saved"); await tick();
    assert.equal(h.dismissals(), 0);
});


test("拖拽交换期间锁滚动，松手一次提交，失败恢复原顺序", async () => {
    let resolve;
    const writes = [];
    const h = harness("ExcerptStashPanel.tsx", {
        items, busy: false, onUpdate: async () => "saved", onRemove() {}, onClear() {}, onMerge() {}, onPaste() {},
        onReorder: (ids) => { writes.push(ids); return new Promise((done) => { resolve = done; }); },
    });
    const row = rows(h.render())[0];
    row.props.onBegin("s0");
    row.props.onTarget("s0", 1);
    const dragging = h.render();
    assert.deepEqual(rows(dragging).map((node) => node.props.item.clientId), ["s1", "s0"]);
    assert.equal(find(dragging, (node) => node.type === "ScrollView").props.scrollEnabled, false);
    assert.equal(writes.length, 0);
    rows(dragging)[1].props.onDrop("s0", 1, true);
    assert.deepEqual(writes, [["s1", "s0"]]);
    assert.equal(action(h.render(), "合并保存").props.disabled, true);
    resolve(false); await tick();
    const rolledBack = h.render();
    assert.deepEqual(rows(rolledBack).map((node) => node.props.item.clientId), ["s0", "s1"]);
    assert.equal(find(rolledBack, (node) => node.type === "ScrollView").props.scrollEnabled, true);
});
