// 实际执行历史组件和 Hook 的事件代码；只替换 React/原生宿主和读取端口，不验证原生布局。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const tick = () => new Promise((done) => setImmediate(done));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
};

const { host, find, byLabel, panel } = require("./history-test-host.cjs");

function popover(onRestore = async () => {}) {
    const selected = {
        revision_id: "旧版本",
        title: "旧标题",
        content: "旧正文",
        category_id: null,
        origin: "local-save",
        created_at: "2026-09-01T00:00:00Z",
    };
    const history = {
        snapshot: {
            note: { current_revision_id: "当前版本" },
            revisions: [{ ...selected, content_length: 3 }],
            categories: [],
        },
        selected: null,
        loading: false,
        error: "",
        refreshes: 0,
        invalidations: 0,
        refresh() {
            this.refreshes++;
            return Promise.resolve();
        },
        select() {
            this.selected = selected;
            return Promise.resolve();
        },
        invalidate() {
            this.invalidations++;
        },
    };
    const h = host(
        "src/features/notes/components/viewer/note-history-popover.tsx",
        {
            "@/shared/theme": {
                colors: { primary: "blue", textSecondary: "gray" },
                semanticColors: {
                    surfaceListSelected: "blue",
                    surfaceControl: "gray",
                },
            },
            "@/shared/ui": {
                AnchoredPopover: "Popover",
                IconButton: "IconButton",
            },
            "@/shared/ui/Dialog/dialog": { DialogButton: "DialogButton" },
            "lucide-react-native": {
                ChevronLeft: "ChevronLeft",
                ChevronRight: "ChevronRight",
                History: "History",
                X: "X",
            },
            "react-native": {
                ActivityIndicator: "Spinner",
                Pressable: "Pressable",
                ScrollView: "ScrollView",
                Text: "Text",
                View: "View",
            },
            "../../hooks/use-note-history": { useNoteHistory: () => history },
            "./note-history-diff": { default: "HistoryDiff" },
            "./note-history-loading": { default: "HistoryLoading" },
        },
    );
    const props = {
        owner: 1,
        noteId: 11,
        currentValue: {
            title: "当前标题",
            content: "未保存正文",
            categoryId: null,
        },
        onOpen() {},
        onRestore,
    };
    const render = () => h.render((module) => module.default(props));
    const openDetail = () => {
        byLabel(render(), "查看历史版本").props.onPress();
        const row = find(
            render(),
            (node) =>
                node.type === "Pressable" &&
                node.props.accessibilityLabel?.startsWith("旧标题，"),
        );
        row.props.onPress();
        return render();
    };
    return { h, history, props, render, openDetail };
}

test("历史气泡防重复打开、返回与外部关闭，关闭后等待动画再开放入口", () => {
    const { h, history, render } = popover();
    const trigger = byLabel(render(), "查看历史版本");
    trigger.props.onPress();
    trigger.props.onPress();
    assert.equal(history.refreshes, 1);
    assert.equal(panel(render()).props.visible, true);
    panel(render()).props.onClose();
    assert.equal(panel(render()).props.visible, false);
    byLabel(render(), "查看历史版本").props.onPress();
    assert.equal(history.refreshes, 1);
    const timer = [...h.timers.values()][0];
    assert.equal(timer.duration, 300);
    timer.callback();
    byLabel(render(), "查看历史版本").props.onPress();
    assert.equal(history.refreshes, 2);
    h.cleanup();
});

test("详情默认对比实时草稿，历史全文可复制，取消恢复只回详情", () => {
    let restores = 0;
    const { h, render, openDetail } = popover(async () => {
        restores++;
    });
    let view = openDetail();
    assert.equal(
        byLabel(view, "查看与当前对比").props.accessibilityState.selected,
        true,
    );
    assert.equal(byLabel(view, "查看当前编辑内容"), undefined);
    const diff = find(view, (node) => node.type === "HistoryDiff");
    assert.equal(diff.props.currentValue.content, "未保存正文");
    byLabel(view, "查看历史全文").props.onPress();
    assert.ok(
        find(
            render(),
            (node) =>
                node.type === "Text" &&
                node.props.children === "旧正文" &&
                node.props.selectable,
        ),
    );
    byLabel(render(), "恢复此版本").props.onPress();
    view = render();
    byLabel(view, "取消").props.onPress();
    assert.ok(byLabel(render(), "恢复此版本"));
    assert.equal(restores, 0);
    h.cleanup();
});

test("恢复进行中拒绝重复点击和关闭，失败后保留气泡并允许重试", async () => {
    let restores = 0;
    const pending = deferred();
    const { h, render, openDetail } = popover(async (id, current) => {
        restores++;
        assert.equal(id, "旧版本");
        assert.equal(current, "当前版本");
        return pending.promise;
    });
    byLabel(openDetail(), "恢复此版本").props.onPress();
    const button = byLabel(render(), "确认恢复");
    button.props.onPress();
    button.props.onPress();
    assert.equal(restores, 1);
    panel(render()).props.onClose();
    assert.equal(panel(render()).props.visible, true);
    assert.equal(byLabel(render(), "正在恢复").props.disabled, true);
    assert.equal(byLabel(render(), "正在恢复").props.leading.type, "Spinner");
    pending.reject(new Error("磁盘写入失败"));
    await tick();
    assert.equal(panel(render()).props.visible, true);
    assert.ok(
        find(render(), (node) => node.props?.children === "磁盘写入失败"),
    );
    assert.equal(byLabel(render(), "确认恢复").props.disabled, false);
    assert.equal(byLabel(render(), "确认恢复").props.leading, undefined);
    h.cleanup();
});

test("草稿冲突禁用恢复，当前版本也不能重复恢复", () => {
    const { h, history, props, render, openDetail } = popover();
    props.restoreBlockedReason = "请先处理草稿冲突";
    assert.equal(byLabel(openDetail(), "恢复此版本").props.disabled, true);
    props.restoreBlockedReason = undefined;
    history.selected.revision_id = "当前版本";
    assert.equal(byLabel(render(), "已是当前版本").props.disabled, true);
    h.cleanup();
});

test("内容相同的旧版本仍可恢复，当前版本与未保存草稿有差异仍禁用恢复", () => {
    const { h, history, props, render, openDetail } = popover();
    openDetail();
    props.currentValue = {
        title: history.selected.title,
        content: history.selected.content,
        categoryId: history.selected.category_id,
    };
    assert.equal(byLabel(render(), "恢复此版本").props.disabled, false);
    history.selected.revision_id = "当前版本";
    props.currentValue.content = "尚未保存的新内容";
    const view = render();
    assert.equal(byLabel(view, "已是当前版本").props.disabled, true);
    assert.equal(
        find(view, (node) => node.type === "HistoryDiff").props.currentValue
            .content,
        "尚未保存的新内容",
    );
    h.cleanup();
});

test("详情读取中保留两 Tab、禁用恢复，读取失败结束加载并允许刷新", () => {
    const { h, history, render, openDetail } = popover();
    history.select = function () {
        this.loading = true;
        this.selected = null;
        return Promise.resolve();
    };
    let view = openDetail();
    assert.ok(byLabel(view, "查看与当前对比"));
    assert.ok(byLabel(view, "查看历史全文"));
    assert.equal(
        find(view, (node) => node.type === "HistoryLoading").props.label,
        "正在读取版本内容…",
    );
    const restore = byLabel(view, "恢复此版本");
    assert.equal(restore.props.disabled, true);
    restore.props.onPress();
    assert.ok(byLabel(render(), "返回上一级历史"));
    assert.equal(byLabel(render(), "确认恢复"), undefined);
    history.loading = false;
    history.error = "读取失败";
    view = render();
    assert.equal(
        find(view, (node) => node.type === "HistoryLoading"),
        undefined,
    );
    assert.ok(byLabel(view, "刷新历史列表"));
    panel(view).props.onClose();
    assert.equal(panel(render()).props.visible, false);
    h.cleanup();
});

test("全文切换保持对比组件，关闭或返回列表后移除计算组件，再选版本默认对比", () => {
    const { h, render, openDetail } = popover();
    let view = openDetail();
    const diff = find(view, (node) => node.type === "HistoryDiff");
    byLabel(view, "查看历史全文").props.onPress();
    view = render();
    assert.equal(
        find(view, (node) => node.type === "HistoryDiff").key,
        diff.key,
    );
    assert.ok(
        find(
            view,
            (node) =>
                node.props?.importantForAccessibility === "no-hide-descendants",
        ),
    );
    byLabel(view, "返回上一级历史").props.onPress();
    assert.equal(
        find(render(), (node) => node.type === "HistoryDiff"),
        undefined,
    );
    view = openDetail();
    assert.equal(
        byLabel(view, "查看与当前对比").props.accessibilityState.selected,
        true,
    );
    panel(view).props.onClose();
    assert.equal(
        find(render(), (node) => node.type === "HistoryDiff"),
        undefined,
    );
    h.cleanup();
});

test("恢复完成前卸载，迟到结果不写组件状态", async () => {
    const pending = deferred();
    const { h, render, openDetail } = popover(() => pending.promise);
    byLabel(openDetail(), "恢复此版本").props.onPress();
    byLabel(render(), "确认恢复").props.onPress();
    h.cleanup();
    const writes = h.writes;
    pending.resolve();
    await tick();
    assert.equal(h.writes, writes);
});

test("恢复成功关闭气泡并失效旧读取，动画结束后入口可再次打开", async () => {
    const { h, history, render, openDetail } = popover();
    byLabel(openDetail(), "恢复此版本").props.onPress();
    byLabel(render(), "确认恢复").props.onPress();
    await tick();
    assert.equal(panel(render()).props.visible, false);
    assert.equal(history.invalidations, 1);
    [...h.timers.values()][0].callback();
    byLabel(render(), "查看历史版本").props.onPress();
    assert.equal(panel(render()).props.visible, true);
    h.cleanup();
});

function hook() {
    const reads = [],
        selections = [];
    const h = host("src/features/notes/hooks/use-note-history.ts", {
        "@/core/database": { useApplicationDatabase: () => ({}) },
        "../services/note-history.service": {
            readNoteHistory: () => {
                const p = deferred();
                reads.push(p);
                return p.promise;
            },
            readHistoryRevision: () => {
                const p = deferred();
                selections.push(p);
                return p.promise;
            },
        },
    });
    return {
        h,
        reads,
        selections,
        render: () => h.render((module) => module.useNoteHistory(1, 11)),
    };
}

test("关闭气泡后丢弃迟到历史列表，再次打开只接受本次读取", async () => {
    const { h, reads, render } = hook();
    const old = render().refresh();
    render().invalidate();
    const next = render().refresh();
    reads[1].resolve({ note: { current_revision_id: "新" }, revisions: [] });
    await next;
    reads[0].resolve({ note: { current_revision_id: "旧" }, revisions: [] });
    await old;
    assert.equal(render().snapshot.note.current_revision_id, "新");
    assert.equal(render().loading, false);
    h.cleanup();
});

test("快速切换版本只接受最后选择，旧读取失败不覆盖新内容", async () => {
    const { h, selections, render } = hook();
    const old = render().select("旧"),
        next = render().select("新");
    selections[1].resolve({ revision_id: "新" });
    await next;
    selections[0].reject(new Error("旧读取失败"));
    await old;
    assert.equal(render().selected.revision_id, "新");
    assert.equal(render().error, "");
    assert.equal(render().loading, false);
    h.cleanup();
});

test("历史 Hook 卸载后不发布迟到结果和错误", async () => {
    const { h, reads, render } = hook();
    const pending = render().refresh();
    h.cleanup();
    const writes = h.writes;
    reads[0].reject(new Error("读取失败"));
    await pending;
    assert.equal(h.writes, writes);
});
