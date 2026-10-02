const { test } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { load, host, find, byLabel } = require("./history-test-host.cjs");
const utility = load("src/shared/utils/text-diff.ts");
const rowUtility = load("src/features/notes/utils/note-history-diff-rows.ts", {
    "@/shared/utils/text-diff": utility,
});
const { diffTextLines, diffTextWithCharacters, textDiffSections } = utility;
function complete(task) {
    let step;
    do {
        step = task.next();
    } while (!step.done);
    return step.value;
}
const diff = (before, after, options) =>
    complete(diffTextLines(before, after, options));
const characterDiff = (before, after, options) =>
    complete(diffTextWithCharacters(before, after, options));
const lines = (text) => (!text ? [] : text.replace(/\r\n/g, "\n").split("\n"));
function reconstruct(result, side) {
    return result.chunks
        .filter(
            (chunk) => chunk.type !== (side === "old" ? "insert" : "delete"),
        )
        .flatMap((chunk) => chunk.lines);
}

test("无变化、NULL/空串、仅插入、仅删除和完全重写的行数正确", () => {
    for (const [before, after, added, removed] of [
        ["一\n二", "一\n二", 0, 0],
        [null, "", 0, 0],
        ["", "一\n二", 2, 0],
        ["一\n二", null, 0, 2],
        ["一\n二", "甲\n乙\n丙", 3, 2],
        ["一\n二", "一\n新\n二", 1, 0],
        ["一\n旧\n二", "一\n二", 0, 1],
    ]) {
        const result = diff(before, after);
        assert.equal(result.status, "complete");
        assert.equal(result.added, added);
        assert.equal(result.removed, removed);
        assert.deepEqual(reconstruct(result, "old"), lines(before));
        assert.deepEqual(reconstruct(result, "new"), lines(after));
    }
});
test("空白、空行、末尾换行和中文保留，仅忽略 CRLF/LF 格式", () => {
    assert.equal(diff("一\r\n\r\n二\r\n", "一\n\n二\n").added, 0);
    assert.equal(diff("一", "一\n").added, 1);
    assert.equal(diff("一\n", "一").removed, 1);
    assert.equal(diff("一 ", "一").removed, 1);
    assert.equal(diff("", "\n").added, 2);
    assert.equal(diff("中文🙂", "中文👀").added, 1);
});
test("公共前后缀与中间重复行保持稳定、产生最小编辑结果", () => {
    const before = "前\n甲\n乙\n甲\n后";
    const after = "前\n乙\n甲\n乙\n后";
    const result = diff(before, after);
    assert.deepEqual(result, diff(before, after));
    assert.equal(result.added, 1);
    assert.equal(result.removed, 1);
    assert.deepEqual(reconstruct(result, "old"), lines(before));
    assert.deepEqual(reconstruct(result, "new"), lines(after));
});
test("穷举重复行短序列，与独立 LCS 结果及双向重建核对", () => {
    const inputs = [[]];
    for (let length = 1; length <= 4; length++) {
        for (let bits = 0; bits < 2 ** length; bits++)
            inputs.push(
                Array.from({ length }, (_, index) =>
                    (bits >> index) & 1 ? "甲" : "乙",
                ),
            );
    }
    for (const before of inputs)
        for (const after of inputs) {
            const dp = Array.from({ length: before.length + 1 }, () =>
                Array(after.length + 1).fill(0),
            );
            for (let i = 1; i <= before.length; i++)
                for (let j = 1; j <= after.length; j++)
                    dp[i][j] =
                        before[i - 1] === after[j - 1]
                            ? dp[i - 1][j - 1] + 1
                            : Math.max(dp[i - 1][j], dp[i][j - 1]);
            const result = diff(before.join("\n"), after.join("\n"));
            assert.equal(result.status, "complete");
            assert.deepEqual(reconstruct(result, "old"), before);
            assert.deepEqual(reconstruct(result, "new"), after);
            assert.equal(
                result.added + result.removed,
                before.length +
                    after.length -
                    2 * dp[before.length][after.length],
            );
        }
});
test("长未改动段折叠、两端各保留两行，短上下文合并且可完整重建", () => {
    const before = Array.from({ length: 30 }, (_, i) => `第${i}行`);
    const after = [...before];
    after[5] = "新一";
    after[20] = "新二";
    const result = diff(before.join("\n"), after.join("\n"));
    const sections = textDiffSections(result.chunks);
    assert.deepEqual(
        sections
            .filter((section) => section.type === "fold")
            .map((section) => section.lines.length),
        [3, 10, 7],
    );
    assert.deepEqual(
        sections
            .filter((section) => section.type !== "delete")
            .flatMap((section) => section.lines),
        after,
    );
    assert.equal(
        textDiffSections([
            { type: "delete", lines: ["旧"] },
            { type: "equal", lines: ["一", "二", "三"] },
            { type: "insert", lines: ["新"] },
        ]).some((section) => section.type === "fold"),
        false,
    );
});
test("预算和输入上限降级不返回局部统计，任务可在批次间取消", () => {
    const before = "甲\n乙\n丙\n丁";
    const after = "戊\n乙\n己\n丁";
    assert.deepEqual(diff(before, after, { maxWork: 1 }), {
        status: "too-large",
    });
    assert.deepEqual(diff("一".repeat(400_001), ""), { status: "too-large" });
    assert.deepEqual(diff("\n".repeat(12_000), ""), { status: "too-large" });
    const task = diffTextLines(before, after, { batchSize: 1 });
    assert.equal(task.next().done, false);
    task.return({ status: "too-large" });
    assert.equal(task.next().done, true);
    const old = Array.from({ length: 1_000 }, (_, i) => `旧${i}`);
    const next = Array.from({ length: 1_000 }, (_, i) => `新${i}`);
    next[500] = old[500];
    assert.deepEqual(diff(old.join("\n"), next.join("\n")), {
        status: "too-large",
    });
});
test("完全重写长笔记直接分组，大文本测量并核对结果", (t) => {
    for (const mode of ["少量改动", "完全重写", "重复行重排"]) {
        const old = Array.from({ length: 2_000 }, (_, i) =>
            mode === "重复行重排" ? (i % 2 ? "乙" : "甲") : `原文${i}`,
        );
        const next =
            mode === "完全重写" ? old.map((_, i) => `新文${i}`) : [...old];
        if (mode === "少量改动") next[900] = "修改一行";
        if (mode === "重复行重排") next.reverse();
        const started = performance.now();
        const result = diff(old.join("\n"), next.join("\n"));
        t.diagnostic(
            `${mode} 2000 行：${(performance.now() - started).toFixed(2)}ms，${result.status}`,
        );
        assert.equal(result.status, "complete");
        assert.deepEqual(reconstruct(result, "new"), next);
    }
});

test("字符统计覆盖单字替换、空串、全变、emoji、空格及换行", () => {
    for (const [before, after, added, removed] of [
        [null, "", 0, 0],
        ["相同", "相同", 0, 0],
        ["", "中文🙂", 3, 0],
        ["中文🙂", null, 0, 3],
        ["明天上午开会", "明天下午开会", 1, 1],
        ["中文🙂", "中文👀", 1, 1],
        ["𠮷野", "吉野", 1, 1],
        ["甲乙", "丙丁戊", 3, 2],
        ["a ", "a", 0, 1],
        ["a\nb", "a\n\nb", 1, 0],
        ["a\n\nb", "a\nb", 0, 1],
        ["a", "a\n", 1, 0],
        ["a\n", "a", 0, 1],
        ["", "\n", 1, 0],
        ["a\nb", "a\n新\nb", 2, 0],
        ["a\r\n\r\nb\r\n", "a\n\nb\n", 0, 0],
    ]) {
        const result = characterDiff(before, after);
        assert.equal(result.status, "complete");
        assert.equal(result.added, added, JSON.stringify([before, after]));
        assert.equal(result.removed, removed, JSON.stringify([before, after]));
        assert.deepEqual(reconstruct(result, "old"), lines(before));
        assert.deepEqual(reconstruct(result, "new"), lines(after));
        for (const type of ["insert", "delete"])
            assert.equal(
                result.chunks
                    .flatMap((chunk) => chunk.spans ?? [])
                    .filter((span) => span.type === type)
                    .reduce(
                        (sum, span) => sum + Array.from(span.text).length,
                        0,
                    ),
                type === "insert" ? added : removed,
            );
    }
});

test("同一行多处变化分别精化，中间共有字符不染色", () => {
    const result = characterDiff("前甲中🙂乙后", "前丙中🙂丁后");
    assert.equal(result.added, 2);
    assert.equal(result.removed, 2);
    assert.deepEqual(result.chunks[0].spans, [
        { type: "equal", text: "前" },
        { type: "delete", text: "甲" },
        { type: "equal", text: "中🙂" },
        { type: "delete", text: "乙" },
        { type: "equal", text: "后" },
    ]);
    assert.deepEqual(
        result.chunks[1].spans
            .filter((span) => span.type === "insert")
            .map((span) => span.text),
        ["丙", "丁"],
    );
});

test("跨行合并与拆分比较整个变更段，避免把共有正文标作增删", () => {
    for (const [before, after] of [
        ["头\n今天工作\n明天休息\n尾", "头\n今天工作，明天休息\n尾"],
        ["头\n今天工作，明天休息\n尾", "头\n今天工作\n明天休息\n尾"],
    ]) {
        const result = characterDiff(before, after);
        assert.equal(result.added, 1);
        assert.equal(result.removed, 1);
        const changed = result.chunks
            .flatMap((chunk) => chunk.spans ?? [])
            .filter((span) => span.type !== "equal")
            .map((span) => span.text);
        assert.deepEqual(new Set(changed), new Set(["，", "\n"]));
        assert.deepEqual(reconstruct(result, "old"), lines(before));
        assert.deepEqual(reconstruct(result, "new"), lines(after));
    }
});

test("字符级穷举 961 组短序列，与独立 LCS 和两侧精化原文核对", () => {
    const inputs = [""];
    for (let length = 1; length <= 4; length++)
        for (let bits = 0; bits < 2 ** length; bits++)
            inputs.push(
                Array.from({ length }, (_, i) =>
                    (bits >> i) & 1 ? "甲" : "🙂",
                ).join(""),
            );
    for (const before of inputs)
        for (const after of inputs) {
            const a = Array.from(before),
                b = Array.from(after);
            const dp = Array.from({ length: a.length + 1 }, () =>
                Array(b.length + 1).fill(0),
            );
            for (let i = 1; i <= a.length; i++)
                for (let j = 1; j <= b.length; j++)
                    dp[i][j] =
                        a[i - 1] === b[j - 1]
                            ? dp[i - 1][j - 1] + 1
                            : Math.max(dp[i - 1][j], dp[i][j - 1]);
            const result = characterDiff(before, after);
            assert.equal(result.status, "complete");
            assert.equal(
                result.added + result.removed,
                a.length + b.length - 2 * dp[a.length][b.length],
            );
            for (const side of ["old", "new"]) {
                const projected = result.chunks
                    .filter(
                        (chunk) =>
                            chunk.type !==
                            (side === "old" ? "insert" : "delete"),
                    )
                    .map((chunk) =>
                        chunk.spans
                            ? chunk.spans.map((span) => span.text).join("")
                            : chunk.lines.join("\n"),
                    )
                    .join("");
                assert.equal(projected, side === "old" ? before : after);
            }
        }
});

test("精化字符与行定位共用预算，超限不返回统计，字符阶段可取消", () => {
    const a = "共".repeat(6_000) + "甲";
    const b = "共".repeat(6_000) + "乙";
    assert.equal(characterDiff(a, b).added, 1);
    assert.deepEqual(characterDiff(a, b, { maxWork: 100 }), {
        status: "too-large",
    });
    assert.deepEqual(characterDiff("字".repeat(400_001), ""), {
        status: "too-large",
    });
    assert.deepEqual(characterDiff("\n".repeat(12_000), ""), {
        status: "too-large",
    });
    const task = diffTextWithCharacters(a, b, { batchSize: 50 });
    assert.equal(task.next().done, false);
    task.return({ status: "too-large" });
    assert.equal(task.next().done, true);
});

function contents(node) {
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(contents).join("");
    return node && typeof node === "object"
        ? contents(node.props?.children)
        : "";
}
function nodes(node, predicate) {
    if (Array.isArray(node))
        return node.flatMap((item) => nodes(item, predicate));
    if (!node || typeof node !== "object") return [];
    return [
        ...(predicate(node) ? [node] : []),
        ...nodes(node.props?.children, predicate),
    ];
}

const native = {
    FlatList: "FlatList",
    Pressable: "Pressable",
    Text: "Text",
    View: "View",
    ActivityIndicator: "Spinner",
};
const theme = {
    semanticColors: {
        brandPrimary: "#007aff",
        destructive: "#e94634",
        success: "#4caf50",
    },
};
function component(diffOverride) {
    const props = {
        selected: {
            revision_id: "旧",
            title: "标题",
            content: "正文",
            category_id: null,
        },
        currentValue: { title: "标题", content: "正文", categoryId: null },
        categoryName: (id) => (id === null ? "默认分类" : `分类${id}`),
    };
    const h = host(
        "src/features/notes/components/viewer/note-history-diff.tsx",
        {
            "react-native": native,
            "@/shared/theme": theme,
            "@/shared/utils/text-diff": diffOverride ?? utility,
            "../../utils/note-history-diff-rows": rowUtility,
            "./note-history-loading": { default: "HistoryLoading" },
        },
    );
    const render = () => {
        const view = h.render((module) => module.default(props));
        // 原生 FlatList 的按需渲染由宿主完成；测试只展开行数据以检查实际行组件。
        if (view.type === "FlatList")
            view.props.children = [
                view.props.ListHeaderComponent,
                view.props.data.map((item) => view.props.renderItem({ item })),
            ];
        return view;
    };
    const finish = () => {
        h.flush();
        return render();
    };
    const text = (view, value) =>
        find(
            view,
            (node) => node.type === "Text" && node.props.children === value,
        );
    return { h, props, render, finish, text };
}
test("标题和分类单独变化不计正文字数，全部一致与正文一致分别提示", () => {
    const { h, props, render, finish, text } = component();
    assert.equal(render().type, "HistoryLoading");
    assert.ok(text(finish(), "与当前内容一致"));
    props.currentValue.title = "新标题";
    render();
    let view = finish();
    assert.ok(text(view, "正文无变化"));
    assert.ok(text(view, "标题"));
    assert.ok(text(view, "正文变化：新增 0 字符，删除 0 字符"));
    props.currentValue.title = "标题";
    props.currentValue.categoryId = 2;
    render();
    assert.ok(text(finish(), "分类"));
    assert.equal(h.timers.size, 0, "仅元数据变化不重新计算正文");
    h.cleanup();
});
test("输入更新即隐藏旧结果，分批计算期间关闭可取消、迟到批次不回写", () => {
    const { h, props, render, finish } = component();
    render();
    finish();
    props.currentValue.content = Array.from(
        { length: 3_000 },
        (_, i) => `新${i}`,
    ).join("\n");
    assert.equal(render().type, "HistoryLoading");
    h.fire([...h.timers.keys()][0]);
    assert.equal(render().type, "HistoryLoading");
    const late = [...h.timers.values()][0].callback;
    h.cleanup();
    const writes = h.writes;
    late();
    assert.equal(h.writes, writes);
    assert.equal(h.timers.size, 0);
});
test("快速切换版本只接受最新任务，结果缓存不会重复计算", () => {
    const { h, props, render, finish, text } = component();
    render();
    const oldBatch = [...h.timers.values()][0].callback;
    props.selected = {
        ...props.selected,
        revision_id: "另一版",
        content: "旧正文",
    };
    render();
    oldBatch();
    assert.ok(text(finish(), "正文变化：新增 0 字符，删除 1 字符"));
    const writes = h.writes;
    render();
    render();
    assert.equal(h.writes, writes);
    assert.equal(h.timers.size, 0);
    h.cleanup();
});
test("折叠内容可展开收起，输入变化后不会沿用旧展开状态", () => {
    const { h, props, render, finish } = component();
    props.selected.content = Array.from(
        { length: 12 },
        (_, i) => `行${i}`,
    ).join("\n");
    props.currentValue.content = `${props.selected.content}\n新增`;
    render();
    const view = finish();
    byLabel(view, "展开未改动 10 行").props.onPress();
    assert.equal(
        byLabel(render(), "收起未改动 10 行").props.accessibilityState.expanded,
        true,
    );
    byLabel(render(), "收起未改动 10 行").props.onPress();
    assert.ok(byLabel(render(), "展开未改动 10 行"));
    byLabel(render(), "展开未改动 10 行").props.onPress();
    props.currentValue.content += "二";
    render();
    assert.ok(byLabel(finish(), "展开未改动 10 行"));
    h.cleanup();
});
test("折叠条从上下各展开20行，接近末尾只展开剩余行，全局可重新折叠", () => {
    const { h, props, render, finish } = component();
    props.selected.content = Array.from(
        { length: 50 },
        (_, i) => `行${i}`,
    ).join("\n");
    props.currentValue.content = `${props.selected.content}\n新增`;
    render();
    let view = finish();
    const folded = () => render().props.data.find((row) => row.kind === "fold");
    assert.equal(folded().hidden, 48);
    byLabel(view, "从上方展开未改动行").props.onPress();
    view = render();
    assert.equal(folded().hidden, 28);
    assert.equal(folded().oldLine, 21);
    byLabel(view, "从下方展开未改动行").props.onPress();
    view = render();
    assert.equal(folded().hidden, 8);
    byLabel(view, "从上方展开未改动行").props.onPress();
    view = render();
    assert.equal(folded().hidden, 0);
    assert.ok(byLabel(view, "收起未改动 48 行"));
    byLabel(view, "重新折叠未改动行").props.onPress();
    assert.equal(folded().hidden, 48);
    assert.equal(
        render().props.data.filter((row) => row.kind === "line").length,
        3,
    );
    h.cleanup();
});

test("长正文展开全部后使用虚拟列表行数据，两侧末行号保持准确", () => {
    const { h, props, render, finish } = component();
    props.selected.content = Array.from(
        { length: 2000 },
        (_, i) => `旧${i}`,
    ).join("\n");
    props.currentValue.content = props.selected.content.replace(
        "旧1000",
        "新1000",
    );
    render();
    let view = finish();
    for (const fold of view.props.data.filter((row) => row.kind === "fold")) {
        byLabel(render(), `展开未改动 ${fold.hidden} 行`).props.onPress();
    }
    view = render();
    assert.equal(view.type, "FlatList");
    assert.equal(
        view.props.data.filter((row) => row.kind === "line").length,
        2001,
    );
    assert.equal(
        view.props.data
            .filter((row) => row.kind === "line" && row.oldLine != null)
            .at(-1).oldLine,
        2000,
    );
    assert.equal(
        view.props.data
            .filter((row) => row.kind === "line" && row.newLine != null)
            .at(-1).newLine,
        2000,
    );
    assert.ok(view.props.initialNumToRender < view.props.data.length);
    h.cleanup();
});

test("超预算显示全文入口提示且无错误统计，计算失败可重试", () => {
    let fail = true;
    const override = {
        ...utility,
        diffTextWithCharacters: function* () {
            if (fail) throw new Error("计算故障");
            return { status: "too-large" };
        },
    };
    const { h, render, finish, text } = component(override);
    render();
    assert.ok(text(finish(), "生成对比失败，请重试或查看历史全文"));
    fail = false;
    byLabel(render(), "重新生成对比").props.onPress();
    assert.equal(render().type, "HistoryLoading");
    const view = finish();
    assert.ok(text(view, "正文差异较大，请切换历史全文查看"));
    assert.equal(
        find(
            view,
            (node) =>
                node.type === "Text" &&
                String(node.props.children).startsWith("正文变化："),
        ),
        undefined,
    );
    h.cleanup();
});
test("变化块朗读实际增删字符，换行有可选择的可见标记", () => {
    const { h, props, render, finish } = component();
    props.currentValue.content = "\n";
    render();
    const view = finish();
    const element = find(view, (node) => node.props?.type === "insert");
    const rendered = element.type(element.props);
    assert.equal(rendered.props.accessibilityLabel, "新增： 换行 ");
    assert.equal(rendered.props.selectable, true);
    assert.equal(contents(rendered), "+ ↵");
    h.cleanup();
});
test("正文只高亮替换的字，未改字符保持普通样式，可选择完整上下文", () => {
    const { h, props, render, finish, text } = component();
    props.selected.content = "明天上午开会";
    props.currentValue.content = "明天下午开会";
    render();
    const view = finish();
    assert.ok(text(view, "正文变化：新增 1 字符，删除 1 字符"));
    for (const [type, changed, label] of [
        ["delete", "上", "删除：上"],
        ["insert", "下", "新增：下"],
    ]) {
        const row = find(view, (node) => node.props?.type === type);
        const rendered = row.type(row.props);
        assert.equal(rendered.props.selectable, true);
        assert.equal(rendered.props.accessibilityLabel, label);
        assert.equal(rendered.props.style.color, undefined);
        assert.equal(rendered.props.style.backgroundColor, undefined);
        const colored = nodes(
            rendered,
            (node) => node.props?.style?.backgroundColor,
        );
        assert.deepEqual(colored.map(contents), [changed]);
        assert.ok(
            contents(rendered).includes(
                type === "delete" ? "明天上午开会" : "明天下午开会",
            ),
        );
    }
    h.cleanup();
});

test("仅插入或仅删除字符时，共有一侧不显示增删颜色或空朗读标签", () => {
    for (const [
        before,
        after,
        plainType,
        changedType,
        plainLabel,
        changedLabel,
    ] of [
        ["甲乙", "甲新乙", "delete", "insert", "历史：甲乙", "新增：新"],
        ["甲旧乙", "甲乙", "insert", "delete", "当前：甲乙", "删除：旧"],
    ]) {
        const { h, props, render, finish } = component();
        props.selected.content = before;
        props.currentValue.content = after;
        render();
        const view = finish();
        const plain = find(view, (node) => node.props?.type === plainType);
        const displayed = plain.type(plain.props);
        assert.equal(displayed.props.style, undefined);
        assert.equal(displayed.props.accessibilityLabel, plainLabel);
        assert.equal(
            nodes(displayed, (node) => node.props?.style?.backgroundColor)
                .length,
            0,
        );
        const changed = find(view, (node) => node.props?.type === changedType);
        assert.equal(
            changed.type(changed.props).props.accessibilityLabel,
            changedLabel,
        );
        h.cleanup();
    }
});

test("标题字符精化单独缓存，改标题不重算正文，分类变化不触发任务", () => {
    const calls = [];
    const { h, props, render, finish, text } = component({
        ...utility,
        diffTextWithCharacters: function* (before, after) {
            calls.push([before, after]);
            return yield* utility.diffTextWithCharacters(before, after);
        },
    });
    props.selected.title = "工作记录";
    props.currentValue.title = "工作记录";
    render();
    finish();
    calls.length = 0;
    props.currentValue.title = "工作笔录";
    assert.equal(render().type, "HistoryLoading");
    const view = finish();
    assert.deepEqual(calls, [["工作记录", "工作笔录"]]);
    assert.ok(text(view, "正文变化：新增 0 字符，删除 0 字符"));
    const old = find(view, (node) => node.props?.type === "delete");
    assert.equal(old.type(old.props).props.accessibilityLabel, "删除：记");
    const next = find(view, (node) => node.props?.type === "insert");
    assert.equal(next.type(next.props).props.accessibilityLabel, "新增：笔");
    props.currentValue.categoryId = 2;
    render();
    assert.equal(h.timers.size, 0);
    assert.equal(calls.length, 1);
    h.cleanup();
});

test("空格和制表符增删有字符高亮和朗读说明", () => {
    const { h, props, render, finish, text } = component();
    props.selected.content = "a b";
    props.currentValue.content = "a\tb";
    render();
    const view = finish();
    assert.ok(text(view, "正文变化：新增 1 字符，删除 1 字符"));
    for (const [type, marker, label] of [
        ["delete", "·", "删除： 空格 "],
        ["insert", "⇥", "新增： 制表符 "],
    ]) {
        const row = find(view, (node) => node.props?.type === type);
        const rendered = row.type(row.props);
        assert.equal(rendered.props.accessibilityLabel, label);
        assert.deepEqual(
            nodes(rendered, (node) => node.props?.style?.backgroundColor).map(
                contents,
            ),
            [marker],
        );
    }
    h.cleanup();
});

test("加载动画延迟 150ms，快速完成取消计时、卸载后不更新", () => {
    const h = host(
        "src/features/notes/components/viewer/note-history-loading.tsx",
        {
            "react-native": native,
            "@/shared/theme": theme,
        },
    );
    const render = () =>
        h.render((module) => module.default({ label: "正在读取版本内容…" }));
    let view = render();
    assert.equal(
        find(view, (node) => node.type === "Spinner"),
        undefined,
    );
    assert.equal(view.props.style.minHeight, 160);
    assert.equal(view.props.accessibilityState.busy, true);
    const [timerId, timer] = [...h.timers][0];
    assert.equal(timer.duration, 150);
    h.fire(timerId);
    view = render();
    assert.ok(find(view, (node) => node.type === "Spinner"));
    h.cleanup();
    const fast = host(
        "src/features/notes/components/viewer/note-history-loading.tsx",
        {
            "react-native": native,
            "@/shared/theme": theme,
        },
    );
    fast.render((module) => module.default({ label: "正在生成对比…" }));
    const late = [...fast.timers.values()][0].callback;
    fast.cleanup();
    late();
    assert.equal(fast.timers.size, 0);
    assert.equal(fast.writes, 0);
});
