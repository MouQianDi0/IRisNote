const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const icons = require("lucide");
const { load } = require("../editor/history-test-host.cjs");

// Run the installed RN adapter and real morph engine. Mock only React scheduling,
// native SVG and the frame clock, including React's last committed Path props.
async function nativeIconHost(t) {
    const filename = require.resolve("morphicons/react-native");
    const source = fs.readFileSync(filename, "utf8");
    const imports = {};
    for (const match of source.matchAll(/from "(\.\/[^\"]+)"/g)) {
        imports[match[1]] = await import(
            pathToFileURL(path.resolve(path.dirname(filename), match[1])).href
        );
    }
    const slots = [];
    const frames = new Map();
    const writes = [];
    const ref = { current: null };
    let cursor = 0;
    let effects = [];
    let props;
    let tree;
    let nativeD;
    let statePending = false;
    let stateWrites = 0;
    let now = 0;
    let nextId = 0;
    let mounted = true;
    const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const effect = (fn, deps) => {
        const index = cursor++;
        const previous = slots[index];
        if (same(previous?.deps, deps)) return;
        effects.push(() => {
            previous?.cleanup?.();
            slots[index] = { deps, cleanup: fn(), effect: true };
        });
    };
    const react = {
        forwardRef: (fn) => fn,
        useRef: (initial) => {
            const index = cursor++;
            return slots[index] ??= { current: initial };
        },
        useState: (initial) => {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
            return [slots[index], (next) => {
                assert.ok(mounted, "must not update state after unmount");
                const value = typeof next === "function" ? next(slots[index]) : next;
                if (Object.is(value, slots[index])) return;
                slots[index] = value;
                stateWrites++;
                statePending = true;
            }];
        },
        useCallback: (fn, deps) => {
            const index = cursor++;
            if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps };
            return slots[index].fn;
        },
        useEffect: effect,
        useLayoutEffect: effect,
        useImperativeHandle: (target, factory, deps) => effect(() => {
            target.current = factory();
            return () => { target.current = null; };
        }, deps),
    };
    const { MorphIcon } = load("node_modules/morphicons/dist/react-native.js", {
        ...imports,
        react,
        "react-native": { AccessibilityInfo: {
            isReduceMotionEnabled: () => Promise.resolve(false),
            addEventListener: () => ({ remove() {} }),
        } },
        "react-native-svg": { default: "Svg", Path: "Path" },
    });
    const previousRaf = globalThis.requestAnimationFrame;
    const previousCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { frames.set(++nextId, fn); return nextId; };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    const nativePath = { setNativeProps: ({ d }) => { nativeD = d; writes.push(d); } };
    const render = (nextProps) => {
        assert.ok(mounted);
        props = nextProps;
        statePending = false;
        cursor = 0;
        effects = [];
        const previousD = tree?.props.children.props.d;
        tree = MorphIcon(props, ref);
        const pathProps = tree.props.children.props;
        pathProps.ref.current = nativePath;
        if (previousD !== pathProps.d) nativeD = pathProps.d;
        effects.forEach((fn) => fn());
    };
    const flushState = () => {
        let count = 0;
        while (statePending) {
            assert.ok(++count < 20, "state update must not loop");
            render(props);
        }
    };
    const frame = (delay = 16, flush = true) => {
        now += delay;
        const batch = [...frames.values()];
        frames.clear();
        batch.forEach((fn) => fn(now));
        assert.doesNotMatch(nativeD, /NaN|Infinity/);
        if (flush) flushState();
    };
    const settle = (flush = true) => {
        for (let i = 0; frames.size && i < 300; i++) frame(16, flush);
        assert.equal(frames.size, 0, "spring must settle");
        if (flush) flushState();
    };
    const unmount = () => {
        if (!mounted) return;
        for (const slot of slots) if (slot?.effect) slot.cleanup?.();
        if (tree) tree.props.children.props.ref.current = null;
        mounted = false;
    };
    t.after(() => {
        unmount();
        assert.equal(frames.size, 0, "unmount must cancel frames");
        if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
        else globalThis.requestAnimationFrame = previousRaf;
        if (previousCancel === undefined) delete globalThis.cancelAnimationFrame;
        else globalThis.cancelAnimationFrame = previousCancel;
    });
    return {
        render, frame, settle, flushState, unmount, ref, writes, frames,
        canonicalD: imports["./dom.js"].canonicalD,
        replayCommittedProps() { nativeD = tree.props.children.props.d; },
        get nativeD() { return nativeD; },
        get declaredD() { return tree.props.children.props.d; },
        get stateWrites() { return stateWrites; },
    };
}

const iconProps = (icon) => ({ icon, spring: "snappy", reducedMotion: "never" });
function assertFinal(runtime, icon) {
    const expected = runtime.canonicalD(icon);
    assert.equal(runtime.nativeD, expected, "native path must reach target");
    assert.equal(runtime.declaredD, expected, "React props must also commit target");
    runtime.replayCommittedProps();
    assert.equal(runtime.nativeD, expected, "later native redraw must not restore old icon");
}

test("笔记变形成待办后提交最终 React 路径，后续重绘不恢复铅笔", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render(iconProps(icons.PencilLine));
    runtime.render(iconProps(icons.SquareCheckBig));
    runtime.frame();
    runtime.frame();
    assert.notEqual(runtime.nativeD, runtime.canonicalD(icons.PencilLine));
    assert.notEqual(runtime.nativeD, runtime.canonicalD(icons.SquareCheckBig));
    assert.equal(runtime.stateWrites, 0, "intermediate frames must not update React state");
    runtime.settle();
    assertFinal(runtime, icons.SquareCheckBig);
    assert.equal(runtime.stateWrites, 1, "commit only the settled path");
});

test("首帧前连续切页及动画被打断后，只保留最终页面的完整图形", async (t) => {
    const runtime = await nativeIconHost(t);
    for (const icon of [icons.PencilLine, icons.SquareCheckBig, icons.Settings]) {
        runtime.render(iconProps(icon));
    }
    runtime.frame(1500);
    runtime.frame(1200);
    runtime.render(iconProps(icons.ClipboardPenLine));
    runtime.settle();
    assertFinal(runtime, icons.ClipboardPenLine);
    runtime.render(iconProps(icons.PencilLine));
    runtime.settle();
    assertFinal(runtime, icons.PencilLine);
});

test("上一动画结束的 React 提交延迟到下一次切页时，不覆盖新目标", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render(iconProps(icons.PencilLine));
    runtime.render(iconProps(icons.SquareCheckBig));
    runtime.settle(false);
    runtime.render(iconProps(icons.Settings));
    runtime.frame();
    runtime.frame();
    runtime.render({ ...iconProps(icons.Settings), color: "blue" });
    runtime.settle();
    assertFinal(runtime, icons.Settings);
});

test("首次变形未结束就返回笔记，仍提交终点而不残留中间图形", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render(iconProps(icons.PencilLine));
    runtime.render(iconProps(icons.SquareCheckBig));
    runtime.frame();
    runtime.frame();
    runtime.render(iconProps(icons.PencilLine));
    runtime.settle();
    assertFinal(runtime, icons.PencilLine);
});

test("减少动态效果与命令式 set 都同步提交最终路径", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render(iconProps(icons.PencilLine));
    runtime.render({ ...iconProps(icons.SquareCheckBig), reducedMotion: "always" });
    runtime.flushState();
    assert.equal(runtime.frames.size, 0);
    assertFinal(runtime, icons.SquareCheckBig);
    runtime.ref.current.set(icons.Settings);
    runtime.flushState();
    assertFinal(runtime, icons.Settings);
});

test("受控动画端点和无初始图标的延迟创建也保持 React 路径一致", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render({});
    runtime.ref.current.set(icons.PencilLine);
    runtime.flushState();
    assertFinal(runtime, icons.PencilLine);
    const pair = { from: icons.PencilLine, to: icons.SquareCheckBig };
    runtime.render({ ...pair, progress: 0.5 });
    runtime.render({ ...pair, progress: 1 });
    runtime.flushState();
    assertFinal(runtime, icons.SquareCheckBig);
    runtime.render({ ...pair, progress: 0 });
    runtime.flushState();
    assertFinal(runtime, icons.PencilLine);
});

test("动画中卸载会取消帧回调，不写入卸载后的 React 状态", async (t) => {
    const runtime = await nativeIconHost(t);
    runtime.render(iconProps(icons.PencilLine));
    runtime.render(iconProps(icons.SquareCheckBig));
    runtime.frame();
    const count = runtime.writes.length;
    runtime.unmount();
    runtime.frame(1000);
    assert.equal(runtime.frames.size, 0);
    assert.equal(runtime.writes.length, count);
});
