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

const versionRow = (view) =>
    find(
        view,
        (node) =>
            node.type === "Pressable" &&
            node.props.accessibilityLabel?.startsWith("旧标题，"),
    );
test("点击版本直接进入详情页，不读取中间详情，导航只携带短ID和实时草稿快照", () => {
    const onRestore = async () => {};
    const { h, history, props, pushes, render } = popover(onRestore);
    history.select = () => {
        throw new Error("不能经过旧的气泡详情");
    };
    trigger(render()).props.onPress();
    const row = versionRow(render());
    row.props.onPress();
    row.props.onPress();
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
    assert.equal(snapshot.expectedRevisionId, "当前版本");
    assert.equal(snapshot.onRestore, onRestore);
    props.currentValue.content = "返回后继续输入";
    assert.equal(snapshot.currentValue.content, "未保存正文");
    assert.equal(byLabel(render(), "查看正文对比"), undefined);
    assert.equal(byLabel(render(), "恢复此版本"), undefined);
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
test("详情导航失败保留版本列表和当前输入，点击原版本可重试", () => {
    const { h, props, router, render, pushes } = popover();
    trigger(render()).props.onPress();
    router.push = () => {
        throw new Error("路由失败");
    };
    versionRow(render()).props.onPress();
    assert.equal(panel(render()).props.visible, true);
    assert.ok(
        find(
            render(),
            (node) =>
                node.props?.children ===
                "打开版本详情失败，当前编辑已保留，请重试",
        ),
    );
    assert.equal(props.currentValue.content, "未保存正文");
    router.push = (route) => pushes.push(route);
    versionRow(render()).props.onPress();
    assert.equal(pushes.length, 1);
    assert.equal(panel(render()).props.visible, false);
    h.cleanup();
});
test("保存或列表读取期间禁用导航，读取失败可刷新，关闭取消迟到读取", () => {
    const { h, props, history, render, pushes } = popover();
    props.disabled = true;
    trigger(render()).props.onPress();
    assert.equal(history.refreshes, 0);
    props.disabled = false;
    trigger(render()).props.onPress();
    history.loading = true;
    assert.equal(versionRow(render()).props.disabled, true);
    versionRow(render()).props.onPress();
    assert.equal(pushes.length, 0);
    assert.equal(
        find(render(), (node) => node.type === "HistoryLoading").props.label,
        "正在读取历史版本…",
    );
    history.loading = false;
    history.error = "读取失败";
    byLabel(render(), "刷新历史列表").props.onPress();
    assert.equal(history.refreshes, 2);
    panel(render()).props.onClose();
    assert.equal(history.invalidations, 1);
    assert.equal(panel(render()).props.visible, false);
    h.cleanup();
});
test("恢复冲突原因随原编辑页回调传入详情，仍允许打开全文", () => {
    const { h, props, render, pushes, openDetail } = popover();
    props.restoreBlockedReason = "请先处理草稿冲突";
    openDetail();
    const snapshot = comparison.readNoteHistoryComparison(
        pushes[0].params.token,
        1,
        11,
        "旧版本",
    );
    assert.equal(snapshot.restoreBlockedReason, "请先处理草稿冲突");
    assert.equal(panel(render()).props.visible, false);
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
