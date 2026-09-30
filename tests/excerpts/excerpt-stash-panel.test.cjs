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
    let focusCalls = 0;
    const handle = { current: null };
    props = { ...props, ref: handle };
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
            useImperativeHandle: (ref, factory, deps) => {
                const value = memo(factory, deps);
                if (ref) ref.current = value;
            },
            useEffect: (callback, deps) => {
                const index = cursor++;
                if (!slots[index] || !same(slots[index].deps, deps)) {
                    const previous = slots[index];
                    effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; });
                }
            },
        },
        "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" },
        "react-native": { View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView" },
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
        for (const field of nodes(tree, (node) => node.type === "Input")) {
            if (field.props.ref) field.props.ref.current = { focus: () => focusCalls++ };
        }
        for (const effect of effects) effect();
        return tree;
    };
    return { render, handle, focusCalls: () => focusCalls, unmount: () => { slots.forEach((slot) => slot?.cleanup?.()); handle.current = null; } };
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
async function edit(h, text) {
    rows(h.render())[0].props.onEdit(items[0]);
    await tick();
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

test("编辑与列表同宽且无保存/取消按钮，未改内容离开不写库", async () => {
    let writes = 0;
    const h = panel(async () => { writes++; return "saved"; });
    const tree = await edit(h, items[0].content);
    assert.equal(input(tree).props.containerClassName, "w-full");
    assert.equal(input(tree).props.trailing, undefined);
    assert.equal(nodes(tree, (node) => node.props?.accessibilityLabel === "保存暂存内容" || node.props?.accessibilityLabel === "取消编辑暂存内容").length, 0);
    assert.equal(rows(tree).every((row) => !row.props.canDrag), true);
    for (const label of ["粘贴到暂存区", "清空", "合并保存"]) assert.equal(action(tree, label).props.disabled, false);
    let closed = 0;
    assert.equal(await h.handle.current.leave(() => closed++), true);
    assert.equal(writes, 0);
    assert.equal(closed, 1);
    assert.equal(nodes(h.render(), (node) => node.type === "Input").length, 0);
});

test("输入变化仅更新本地，失焦自动保存完整多行正文", async () => {
    const writes = [];
    const h = panel(async (id, text) => { writes.push([id, text]); return "saved"; });
    const tree = await edit(h, "改动\n完整正文");
    assert.deepEqual(writes, []);
    input(tree).props.onBlur(); await tick();
    assert.deepEqual(writes, [["s0", "改动\n完整正文"]]);
    assert.equal(nodes(h.render(), (node) => node.type === "Input").length, 0);
});

test("失焦与关闭共用一次保存，完成前不离开且只执行首个出口", async () => {
    let resolve;
    const writes = [];
    const events = [];
    const h = panel((id, text) => { writes.push([id, text]); return new Promise((done) => { resolve = done; }); });
    const tree = await edit(h, "改动\n完整正文");
    input(tree).props.onBlur(); input(tree).props.onBlur();
    const closed = h.handle.current.leave(() => events.push("closed"));
    const anotherExit = h.handle.current.leave(() => events.push("other"));
    assert.equal(closed, anotherExit);
    await tick();
    assert.deepEqual(writes, [["s0", "改动\n完整正文"]]);
    assert.deepEqual(events, []);
    assert.equal(input(h.render({ busy: true })).props.readOnly, true);
    input(h.render()).props.onChangeText("保存中不应覆盖提交快照");
    assert.equal(input(h.render()).props.value, "改动\n完整正文");
    const updated = items.map((item, index) => index === 0 ? { ...item, content: "改动\n完整正文" } : item);
    h.render({ items: updated, busy: false });
    resolve("saved");
    assert.equal(await closed, true);
    const result = h.render();
    assert.deepEqual(events, ["closed"]);
    assert.equal(nodes(result, (node) => node.type === "Input").length, 0);
    assert.equal(rows(result)[0].props.item.content, "改动\n完整正文");
});

test("自动保存进行中仍可请求关闭，关闭等待正在进行的写入", async () => {
    let resolve;
    let writes = 0;
    let closed = false;
    const h = panel(() => { writes++; return new Promise((done) => { resolve = done; }); });
    input(await edit(h, "新正文")).props.onBlur(); await tick();
    const pending = h.render({ busy: true });
    assert.equal(action(pending, "合并保存").props.disabled, false);
    const exiting = h.handle.current.leave(() => { closed = true; });
    assert.equal(closed, false);
    h.render({ busy: false }); resolve("saved");
    assert.equal(await exiting, true);
    assert.equal(writes, 1);
    assert.equal(closed, true);
});

test("切换条目先保存当前正文，成功后再打开目标 Input", async () => {
    const writes = [];
    const h = panel(async (id, text) => { writes.push([id, text]); return "saved"; });
    const tree = await edit(h, "编辑后的甲");
    rows(tree)[1].props.onEdit(items[1]); await tick();
    assert.deepEqual(writes, [["s0", "编辑后的甲"]]);
    assert.equal(input(h.render()).props.value, "乙");
    assert.equal(input(h.render()).props.accessibilityLabel, "编辑第 2 条暂存内容");
});

test("旧 Input 的迟到输入/失焦不能提交或关闭刚切换的新条目", async () => {
    const writes = [];
    const h = panel(async (id, text) => { writes.push([id, text]); return "saved"; });
    const tree = await edit(h, "已编辑的甲");
    const oldInput = input(tree);
    rows(tree)[1].props.onEdit(items[1]); await tick();
    oldInput.props.onChangeText("旧字段迟到输入");
    oldInput.props.onBlur(); await tick();
    assert.deepEqual(writes, [["s0", "已编辑的甲"]]);
    assert.equal(input(h.render()).props.value, "乙");
    assert.equal(input(h.render()).props.accessibilityLabel, "编辑第 2 条暂存内容");
});

test("列表操作等待自动保存完成，合并可获得最新正文", async () => {
    let resolve;
    const events = [];
    let databaseContent = items[0].content;
    const h = harness("ExcerptStashPanel.tsx", {
        items, busy: false, onRemove() {}, onClear() {}, onPaste() {}, onReorder: async () => true,
        onUpdate: async (_id, text) => {
            events.push("saving");
            await new Promise((done) => { resolve = done; });
            databaseContent = text;
            return "saved";
        },
        onMerge: () => events.push(["merge", databaseContent]),
    });
    const tree = await edit(h, "已编辑的正文");
    input(tree).props.onBlur(); action(tree, "合并保存").props.onPress(); await tick();
    assert.deepEqual(events, ["saving"]);
    resolve(); await tick();
    assert.deepEqual(events, ["saving", ["merge", "已编辑的正文"]]);
});

test("重复、空内容及写入失败保留输入并聚焦，失败不关闭且允许修改后重试", async () => {
    let outcome = "duplicate";
    const h = panel(async () => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
    });
    input(await edit(h, "乙")).props.onBlur(); await tick();
    assert.equal(input(h.render()).props.value, "乙");
    assert.equal(input(h.render()).props.invalid, true);
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /已在暂存中/);
    assert.ok(h.focusCalls() > 0);
    let closed = 0;
    assert.equal(await h.handle.current.leave(() => closed++), false);
    assert.equal(closed, 0);
    input(h.render()).props.onChangeText("\n");
    assert.equal(input(h.render()).props.invalid, false);
    outcome = new Error("摘录内容不能为空");
    input(h.render()).props.onBlur(); await tick();
    assert.equal(input(h.render()).props.value, "\n");
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /不能为空/);
    outcome = new Error("磁盘写入失败");
    input(h.render()).props.onChangeText("仍需保存\n正文");
    assert.equal(await h.handle.current.leave(() => closed++), false);
    assert.equal(closed, 0);
    assert.equal(input(h.render()).props.value, "仍需保存\n正文");
    assert.match(find(h.render(), (node) => node.props?.accessibilityRole === "alert").props.children, /磁盘写入失败/);
    outcome = "saved";
    assert.equal(await h.handle.current.leave(() => closed++), true);
    assert.equal(closed, 1);
    assert.equal(nodes(h.render(), (node) => node.type === "Input").length, 0);
});

test("账号切换导致卸载后，迟到保存结果不执行退出或重新聚焦", async () => {
    let resolve;
    const h = panel(() => new Promise((done) => { resolve = done; }));
    let exits = 0;
    await edit(h, "旧账号正文");
    const exiting = h.handle.current.leave(() => exits++); await tick();
    h.unmount(); resolve("saved");
    assert.equal(await exiting, false);
    assert.equal(exits, 0);
    assert.equal(h.focusCalls(), 0);
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
