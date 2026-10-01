const { test } = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const { load, host, find, byLabel } = require("./history-test-host.cjs");
const utility = load("src/shared/utils/text-diff.ts");
const { diffTextLines, textDiffSections } = utility;
function diff(before, after, options) {
    const task = diffTextLines(before, after, options);
    let step;
    do {
        step = task.next();
    } while (!step.done);
    return step.value;
}
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

const native = {
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
            "./note-history-loading": { default: "HistoryLoading" },
        },
    );
    const render = () => h.render((module) => module.default(props));
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
test("标题和分类单独变化不计正文行数，全部一致与正文一致分别提示", () => {
    const { h, props, render, finish, text } = component();
    assert.equal(render().type, "HistoryLoading");
    assert.ok(text(finish(), "与当前内容一致"));
    props.currentValue.title = "新标题";
    let view = render();
    assert.ok(text(view, "正文无变化"));
    assert.ok(text(view, "标题"));
    assert.ok(text(view, "正文变化：新增 0 行，删除 0 行"));
    props.currentValue.title = "标题";
    props.currentValue.categoryId = 2;
    assert.ok(text(render(), "分类"));
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
    assert.ok(text(finish(), "正文变化：新增 1 行，删除 1 行"));
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
test("超预算显示全文入口提示且无错误统计，计算失败可重试", () => {
    let fail = true;
    const override = {
        ...utility,
        diffTextLines: function* () {
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
test("变化块包含新增/删除朗读标签和可选择的空行提示", () => {
    const { h, props, render, finish } = component();
    props.currentValue.content = "\n";
    render();
    const view = finish();
    const element = find(view, (node) => node.props?.type === "insert");
    const rendered = element.type(element.props);
    assert.equal(rendered.props.accessibilityLabel, "新增：空行\n空行");
    assert.equal(rendered.props.selectable, true);
    assert.equal(rendered.props.children, "+ （空行）\n+ （空行）");
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
