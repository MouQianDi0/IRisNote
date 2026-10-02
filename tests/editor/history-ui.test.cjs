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

const { load, host, find, byLabel, panel } = require("./history-test-host.cjs");
const time = load("src/features/notes/utils/note-history-time.ts");
const comparison = load(
    "src/features/notes/services/note-history-comparison-session.ts",
    {
        "@/core/cloud-storage/cloud-storage-policy": {
            captureLocalStorageAccess: () => () => {},
        },
    },
);
const trigger = (view) =>
    find(view, (node) =>
        node.props?.accessibilityLabel?.endsWith("，查看历史版本"),
    );

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
            note: {
                current_revision_id: "当前版本",
                created_at: "2026-08-29T00:00:00Z",
            },
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
    const pushes = [];
    const router = { push: (route) => pushes.push(route) };
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
                ChevronDown: "ChevronDown",
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
            "expo-router": { router },
            "../../services/note-history-comparison-session": comparison,
            "../../utils/note-history-time": time,
            "./note-history-loading": { default: "HistoryLoading" },
        },
    );
    const props = {
        owner: 1,
        noteId: 11,
        updatedAt: "2026-10-02T09:30:00Z",
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
        trigger(render()).props.onPress();
        const row = find(
            render(),
            (node) =>
                node.type === "Pressable" &&
                node.props.accessibilityLabel?.startsWith("旧标题，"),
        );
        row.props.onPress();
        return render();
    };
    return { h, history, props, render, openDetail, pushes, router };
}

test("历史气泡防重复打开、返回与外部关闭，关闭后等待动画再开放入口", () => {
    const { h, history, render } = popover();
    const button = trigger(render());
    button.props.onPress();
    button.props.onPress();
    assert.equal(history.refreshes, 1);
    assert.equal(panel(render()).props.visible, true);
    panel(render()).props.onClose();
    assert.equal(panel(render()).props.visible, false);
    trigger(render()).props.onPress();
    assert.equal(history.refreshes, 1);
    const timer = [...h.timers.values()][0];
    assert.equal(timer.duration, 300);
    timer.callback();
    trigger(render()).props.onPress();
    assert.equal(history.refreshes, 2);
    h.cleanup();
});

test("详情保留可复制全文和恢复，正文对比关闭气泡并 push 草稿快照", () => {
    let restores = 0;
    const { h, props, pushes, render, openDetail } = popover(async () => {
        restores++;
    });
    let view = openDetail();
    assert.ok(
        find(
            view,
            (node) =>
                node.props?.children === "旧正文" && node.props.selectable,
        ),
    );
    byLabel(view, "恢复此版本").props.onPress();
    byLabel(render(), "取消").props.onPress();
    assert.ok(byLabel(render(), "恢复此版本"));
    const button = byLabel(render(), "查看正文对比");
    button.props.onPress();
    button.props.onPress();
    assert.equal(pushes.length, 1);
    assert.equal(panel(render()).props.visible, false);
    assert.equal(pushes[0].pathname, "/pages/note/history/[id]");
    assert.deepEqual(Object.keys(pushes[0].params).sort(), [
        "id",
        "revisionId",
        "token",
    ]);
    const snapshot = comparison.readNoteHistoryComparison(
        pushes[0].params.token,
        1,
        11,
        "旧版本",
    );
    assert.equal(snapshot.currentValue.content, "未保存正文");
    assert.equal(snapshot.updatedAt, props.updatedAt);
    props.currentValue.content = "返回后继续输入";
    assert.equal(snapshot.currentValue.content, "未保存正文");
    assert.equal(restores, 0);
    h.cleanup();
    assert.equal(
        comparison.readNoteHistoryComparison(
            pushes[0].params.token,
            1,
            11,
            "旧版本",
        ),
        null,
    );
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
    assert.equal(byLabel(view, "查看正文对比").props.disabled, false);
    h.cleanup();
});

test("详情读取中禁用对比和恢复，读取失败结束加载并允许刷新", () => {
    const { h, history, render, openDetail } = popover();
    history.select = function () {
        this.loading = true;
        this.selected = null;
        return Promise.resolve();
    };
    let view = openDetail();
    assert.equal(byLabel(view, "查看正文对比").props.disabled, true);
    byLabel(view, "查看正文对比").props.onPress();
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

test("对比导航失败保留全文和当前输入，允许重试", () => {
    const { h, props, router, render, openDetail, pushes } = popover();
    openDetail();
    router.push = () => {
        throw new Error("路由失败");
    };
    byLabel(render(), "查看正文对比").props.onPress();
    assert.equal(panel(render()).props.visible, true);
    assert.ok(
        find(
            render(),
            (node) =>
                node.props?.children === "打开对比失败，当前编辑已保留，请重试",
        ),
    );
    assert.equal(props.currentValue.content, "未保存正文");
    router.push = (route) => pushes.push(route);
    byLabel(render(), "查看正文对比").props.onPress();
    assert.equal(pushes.length, 1);
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
    trigger(render()).props.onPress();
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

test("历史入口显示最后编辑时间，创建时间单独放在历史列表，未知时间不回退", () => {
    const { h, props, render } = popover();
    assert.equal(
        trigger(render()).props.accessibilityLabel,
        `${time.noteEditTimeLabel(props.updatedAt)}，查看历史版本`,
    );
    trigger(render()).props.onPress();
    assert.ok(
        find(
            render(),
            (node) =>
                node.type === "Text" &&
                Array.isArray(node.props.children) &&
                node.props.children[0] === "笔记创建于：" &&
                node.props.children[1] ===
                    time.formatNoteHistoryTime("2026-08-29T00:00:00Z"),
        ),
    );
    props.updatedAt = null;
    assert.equal(
        trigger(render()).props.accessibilityLabel,
        "编辑时间未知，查看历史版本",
    );
    props.updatedAt = "invalid";
    assert.equal(
        trigger(render()).props.accessibilityLabel,
        "编辑时间未知，查看历史版本",
    );
    assert.equal(time.formatNoteHistoryTime(""), null);
    h.cleanup();
});
