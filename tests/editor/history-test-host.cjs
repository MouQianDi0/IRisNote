const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// 实际运行 TS/TSX，替换宿主端口；effect 在渲染后执行，模拟依赖更新和卸载。
function load(relativePath, imports = {}, globals = {}) {
    const filename = path.resolve(__dirname, "../..", relativePath);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
            esModuleInterop: false,
        },
        fileName: filename,
    }).outputText;
    const output = { exports: {} };
    const modules = {
        "react/jsx-runtime": {
            jsx: (type, props, key) => ({ type, props, key }),
            jsxs: (type, props, key) => ({ type, props, key }),
        },
        ...imports,
    };
    new Function(
        "require",
        "module",
        "exports",
        ...Object.keys(globals),
        compiled,
    )(
        (name) => {
            assert.ok(name in modules, `未注入的宿主端口：${name}`);
            return modules[name];
        },
        output,
        output.exports,
        ...Object.values(globals),
    );
    return output.exports;
}
function host(relativePath, imports) {
    const slots = [];
    const effects = [];
    const timers = new Map();
    let cursor = 0,
        writes = 0,
        timerId = 0;
    const same = (before, after) =>
        before &&
        after &&
        before.length === after.length &&
        before.every((value, index) => Object.is(value, after[index]));
    const react = {
        useState(initial) {
            const index = cursor++;
            if (!(index in slots))
                slots[index] =
                    typeof initial === "function" ? initial() : initial;
            return [
                slots[index],
                (value) => {
                    writes++;
                    slots[index] =
                        typeof value === "function"
                            ? value(slots[index])
                            : value;
                },
            ];
        },
        useRef(initial) {
            const index = cursor++;
            return (slots[index] ??= { current: initial });
        },
        useMemo(callback, dependencies) {
            const index = cursor++;
            if (!same(slots[index]?.dependencies, dependencies))
                slots[index] = { value: callback(), dependencies };
            return slots[index].value;
        },
        useCallback(callback, dependencies) {
            return react.useMemo(() => callback, dependencies);
        },
        useEffect(callback, dependencies) {
            const index = cursor++;
            const previous = slots[index];
            if (same(previous?.dependencies, dependencies)) return;
            effects.push(() => {
                previous?.cleanup?.();
                slots[index] = {
                    dependencies,
                    cleanup: callback(),
                    effect: true,
                };
            });
        },
    };
    const exports = load(
        relativePath,
        { react, ...imports },
        {
            setTimeout: (callback, duration) => {
                const id = ++timerId;
                timers.set(id, { callback, duration });
                return id;
            },
            clearTimeout: (id) => timers.delete(id),
        },
    );
    const fire = (id) => {
        const timer = timers.get(id);
        timers.delete(id);
        timer.callback();
    };
    return {
        exports,
        render(callback) {
            cursor = 0;
            const view = callback(exports);
            while (effects.length) effects.shift()();
            return view;
        },
        cleanup() {
            for (const slot of slots) if (slot?.effect) slot.cleanup?.();
        },
        fire,
        flush(duration = 0) {
            let count = 0;
            while (
                [...timers.values()].some(
                    (timer) => timer.duration === duration,
                )
            ) {
                assert.ok(++count < 10_000, "任务未在预算内终止");
                fire(
                    [...timers].find(
                        ([, timer]) => timer.duration === duration,
                    )[0],
                );
            }
        },
        timers,
        get writes() {
            return writes;
        },
    };
}
function find(node, predicate) {
    if (Array.isArray(node))
        return node.map((item) => find(item, predicate)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
}
const byLabel = (view, label) =>
    find(
        view,
        (node) =>
            node.props?.accessibilityLabel === label ||
            node.props?.label === label,
    );
const panel = (view) => find(view, (node) => node.type === "Popover");
module.exports = { load, host, find, byLabel, panel };
