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

test("改动处数按连续增删计数，替换计一处，共有字符分隔两处", () => {
    for (const [before, after, changes] of [
        [null, "", 0],
        ["相同", "相同", 0],
        ["", "甲乙", 1],
        ["甲乙", "", 1],
        ["上午", "下午", 1],
        ["甲乙", "丙丁", 1],
        ["明天上午去北京", "明天下午去上海", 2],
        ["甲\n乙", "甲乙", 1],
        ["甲\n", "甲\n\n", 1],
        ["首\n甲\n中\n乙\n尾", "首\n丙\n中\n丁\n尾", 2],
        ["甲\r\n乙", "甲\n乙", 0],
        ["🙂甲中乙", "👀甲中丙", 2],
    ]) {
        const result = characterDiff(before, after);
        assert.equal(result.status, "complete");
        assert.equal(result.changes, changes, JSON.stringify([before, after]));
        for (const [type, source] of [
            ["insert", before],
            ["delete", after],
        ])
            assert.equal(
                result.spans
                    .filter((span) => span.type !== type)
                    .map((span) => span.text)
                    .join(""),
                (source ?? "").replace(/\r\n/g, "\n"),
            );
    }
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
    Switch: "Switch",
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
function bodyText(view) {
    return view.props.data
        .map((row) => row.spans.map((span) => span.text).join(""))
        .join("");
}
function annotated(view, predicate = () => true) {
    const element = find(
        view,
        (node) =>
            typeof node.type === "function" &&
            node.props.spans &&
            predicate(node.props.spans),
    );
    assert.ok(element, "应存在全文内的标注组件");
    return element.type(element.props);
}
test("标题和分类变化不计正文处数，标题和正文单独缓存", () => {
    const calls = [];
    const { h, props, render, finish, text } = component({
        ...utility,
        diffTextWithCharacters: function* (before, after) {
            calls.push([before, after]);
            return yield* utility.diffTextWithCharacters(before, after);
        },
    });
    let view = render();
    assert.equal(view.type, "FlatList");
    assert.equal(bodyText(view), "正文");
    assert.equal(
        find(view, (node) => node.type === "HistoryLoading").props.compact,
        true,
    );
    assert.ok(text(finish(), "与当前内容一致"));
    calls.length = 0;
    props.currentValue.title = "新标题";
    render();
    view = finish();
    assert.ok(text(view, "正文无变化"));
    assert.ok(text(view, "正文变化：0 处，新增 0 字符，删除 0 字符"));
    assert.deepEqual(calls, [["标题", "新标题"]]);
    assert.equal(
        contents(
            annotated(view, (spans) =>
                spans.some((span) => span.type === "insert"),
            ),
        ),
        "新标题",
    );
    props.currentValue.categoryId = 2;
    view = render();
    assert.ok(text(view, "分类：默认分类 → 分类2"));
    assert.equal(h.timers.size, 0);
    h.cleanup();
});
test("批次计算时显示历史全文，输入更新隐藏旧统计，卸载取消迟到批次", () => {
    const { h, props, render, finish } = component();
    render();
    finish();
    props.currentValue.content = Array.from(
        { length: 3000 },
        (_, i) => "新" + i,
    ).join("\n");
    let view = render();
    assert.equal(bodyText(view), "正文");
    assert.ok(find(view, (node) => node.type === "HistoryLoading"));
    assert.equal(
        find(
            view,
            (node) =>
                node.type === "Text" &&
                String(node.props.children).startsWith("正文变化："),
        ),
        undefined,
    );
    h.fire([...h.timers.keys()][0]);
    assert.equal(bodyText(render()), "正文");
    const late = [...h.timers.values()][0].callback;
    h.cleanup();
    const writes = h.writes;
    late();
    assert.equal(h.writes, writes);
    assert.equal(h.timers.size, 0);
});
test("快速切换版本只接受最新任务，并将差异标注恢复为默认开启", () => {
    const { h, props, render, finish, text } = component();
    render();
    const oldBatch = [...h.timers.values()][0].callback;
    byLabel(render(), "差异标注").props.onValueChange(false);
    props.selected = {
        ...props.selected,
        revision_id: "另一版",
        content: "旧正文",
    };
    render();
    oldBatch();
    const view = finish();
    assert.equal(byLabel(view, "差异标注").props.value, true);
    assert.ok(text(view, "正文变化：1 处，新增 0 字符，删除 1 字符"));
    const writes = h.writes;
    render();
    render();
    assert.equal(h.writes, writes);
    assert.equal(h.timers.size, 0);
    h.cleanup();
});
test("默认直接显示全部未变化正文，取消行号、历史当前标签和折叠入口", () => {
    const { h, props, render, finish } = component();
    props.selected.content = Array.from(
        { length: 100 },
        (_, i) => "行" + i,
    ).join("\n");
    props.currentValue.content = props.selected.content + "\n新增";
    render();
    const view = finish();
    assert.equal(view.props.data.length, 101);
    assert.equal(bodyText(view), props.currentValue.content);
    assert.equal(byLabel(view, "差异标注").props.value, true);
    assert.equal(
        find(view, (node) =>
            node.props?.accessibilityLabel?.includes("未改动"),
        ),
        undefined,
    );
    assert.equal(
        find(
            view,
            (node) =>
                node.props?.children === "历史" ||
                node.props?.children === "当前",
        ),
        undefined,
    );
    assert.ok(
        view.props.data.every(
            (row) =>
                !("oldLine" in row) && !("newLine" in row) && !("kind" in row),
        ),
    );
    h.cleanup();
});
test("关闭标注立即显示原始历史全文，再开启复用结果并保留完整上下文", () => {
    const { h, props, render, finish, text } = component();
    props.selected.content = "明天上午去北京\n不变";
    props.currentValue.content = "明天下午去上海\n不变";
    render();
    let view = finish();
    assert.ok(text(view, "正文变化：2 处，新增 3 字符，删除 3 字符"));
    byLabel(view, "差异标注").props.onValueChange(false);
    view = render();
    assert.equal(bodyText(view), props.selected.content);
    assert.ok(
        view.props.data.every((row) =>
            row.spans.every((span) => span.type === "equal"),
        ),
    );
    assert.equal(h.timers.size, 0);
    byLabel(view, "差异标注").props.onValueChange(true);
    view = render();
    assert.equal(bodyText(view), "明天上下午去北京上海\n不变");
    assert.equal(h.timers.size, 0);
    h.cleanup();
});
test("长正文保持全部2000行数据并使用虚拟列表，修改段共有文字不复制", () => {
    const { h, props, render, finish } = component();
    props.selected.content = Array.from(
        { length: 2000 },
        (_, i) => "旧" + i,
    ).join("\n");
    props.currentValue.content = props.selected.content.replace(
        "旧1000",
        "新1000",
    );
    render();
    const view = finish();
    assert.equal(view.type, "FlatList");
    assert.equal(view.props.data.length, 2000);
    assert.equal(
        bodyText(view),
        props.selected.content.replace("旧1000", "旧新1000"),
    );
    assert.ok(view.props.initialNumToRender < view.props.data.length);
    h.cleanup();
});
test("计算失败或超预算继续显示历史全文，不展示局部统计，并可重试", () => {
    let fail = true;
    const { h, render, finish, text } = component({
        ...utility,
        diffTextWithCharacters: function* () {
            if (fail) throw new Error("计算故障");
            return { status: "too-large" };
        },
    });
    render();
    let view = finish();
    assert.equal(bodyText(view), "正文");
    assert.ok(text(view, "生成对比失败，历史全文已保留，请重试"));
    fail = false;
    byLabel(view, "重新生成对比").props.onPress();
    assert.equal(bodyText(render()), "正文");
    view = finish();
    assert.ok(text(view, "正文差异较大，已显示历史全文，暂无法统计和标注"));
    assert.equal(bodyText(view), "正文");
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
test("正文只标注变化的字，共有文字只出现一次，无增删前缀，全文可选择", () => {
    const { h, props, render, finish } = component();
    props.selected.content = "明天上午开会";
    props.currentValue.content = "明天下午开会";
    render();
    const rendered = annotated(finish(), (spans) =>
        spans.some((span) => span.text === "上"),
    );
    assert.equal(rendered.props.selectable, true);
    assert.equal(contents(rendered), "明天上下午开会");
    const colored = nodes(
        rendered,
        (node) => node.props?.style?.backgroundColor,
    );
    assert.deepEqual(colored.map(contents), ["上", "下"]);
    assert.deepEqual(
        colored.map((node) => node.props.accessibilityLabel),
        ["删除：上", "新增：下"],
    );
    assert.deepEqual(
        colored.map((node) => node.props.style.textDecorationLine),
        ["line-through", "underline"],
    );
    assert.deepEqual(
        colored.map((node) => node.props.style.color),
        [theme.semanticColors.destructive, theme.semanticColors.success],
    );
    assert.equal(rendered.props.style.color, undefined);
    h.cleanup();
});
test("仅新增或仅删除字符时，共有文字保持普通样式且不带历史当前标签", () => {
    for (const [before, after, type, changed] of [
        ["甲乙", "甲新乙", "insert", "新"],
        ["甲旧乙", "甲乙", "delete", "旧"],
    ]) {
        const { h, props, render, finish } = component();
        props.selected.content = before;
        props.currentValue.content = after;
        render();
        const displayed = annotated(finish(), (spans) =>
            spans.some((span) => span.type === type),
        );
        const colored = nodes(
            displayed,
            (node) => node.props?.style?.backgroundColor,
        );
        assert.deepEqual(colored.map(contents), [changed]);
        assert.equal(
            colored[0].props.accessibilityLabel,
            (type === "insert" ? "新增" : "删除") + "：" + changed,
        );
        const common = nodes(
            displayed,
            (node) =>
                node.type === "Text" &&
                typeof node.props.children === "string" &&
                !node.props.style,
        );
        assert.equal(common.map(contents).join(""), "甲乙");
        assert.ok(
            common.every((node) => node.props.accessibilityLabel === undefined),
        );
        h.cleanup();
    }
});
test("空格、制表符和换行有精确的可见标记及朗读说明", () => {
    for (const [before, after, marker, label] of [
        ["ab", "a b", "·", "新增： 空格 "],
        ["ab", "a\tb", "⇥", "新增： 制表符 "],
        ["ab", "a\nb", "↵", "新增： 换行 "],
    ]) {
        const { h, props, render, finish } = component();
        props.selected.content = before;
        props.currentValue.content = after;
        render();
        const displayed = annotated(finish(), (spans) =>
            spans.some((span) => span.type === "insert"),
        );
        const inserted = nodes(
            displayed,
            (node) => node.props?.style?.backgroundColor,
        );
        assert.deepEqual(inserted.map(contents), [marker]);
        assert.equal(inserted[0].props.accessibilityLabel, label);
        h.cleanup();
    }
});
test("NULL历史正文显示空正文，默认标注可显示当前新增全文", () => {
    const { h, props, render, finish, text } = component();
    props.selected.content = null;
    props.currentValue.content = "新增";
    let view = render();
    assert.ok(text(view, "（空正文）"));
    view = finish();
    assert.equal(bodyText(view), "新增");
    byLabel(view, "差异标注").props.onValueChange(false);
    view = render();
    assert.ok(text(view, "（空正文）"));
    assert.equal(view.props.data.length, 0);
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
