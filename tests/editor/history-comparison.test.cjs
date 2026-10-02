const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, host, find, byLabel } = require("./history-test-host.cjs");
const tick = () => new Promise((done) => setImmediate(done));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function storage() {
    const policy = load(
        "src/core/cloud-storage/cloud-storage-policy.ts",
        {},
        { process },
    );
    policy.setCloudStorageSession(1, true, false);
    const sessions = load(
        "src/features/notes/services/note-history-comparison-session.ts",
        {
            "@/core/cloud-storage/cloud-storage-policy": policy,
        },
    );
    const input = {
        owner: 1,
        noteId: 11,
        revisionId: "r1",
        expectedRevisionId: "current",
        onRestore: async () => {},
        currentValue: {
            title: "当前标题",
            content: "尚未保存的正文",
            categoryId: null,
        },
        createdAt: "2026-09-01T08:00:00Z",
        updatedAt: "2026-10-02T09:30:00Z",
        categories: [{ id: 2, name: "工作" }],
    };
    return { policy, sessions, input };
}
test("草稿快照独立于后续输入，笔记/版本/账号必须匹配，离线及未授权云存储可用", () => {
    const { policy, sessions, input } = storage();
    const token = sessions.createNoteHistoryComparison(input);
    const read = (owner = 1, id = 11, revision = "r1") =>
        sessions.readNoteHistoryComparison(token, owner, id, revision);
    assert.equal(policy.getCloudStorageSnapshot().enabled, false);
    input.currentValue.content = "后来输入";
    input.categories[0].name = "已改名";
    assert.equal(read().currentValue.content, "尚未保存的正文");
    assert.equal(read().categories[0].name, "工作");
    assert.equal(read(2), null);
    assert.equal(read(1, 12), null);
    assert.equal(read(1, 11, "r2"), null);
    assert.ok(read());
    policy.setCloudStorageSession(2, true, false);
    policy.setCloudStorageSession(1, true, false);
    assert.equal(read(), null, "A → B → A 不能取回旧快照");
});
test("编辑页释放和内存容量上限使旧入口过期，释放旧入口不会删除新入口", () => {
    const { sessions, input } = storage();
    const tokens = Array.from({ length: 5 }, () =>
        sessions.createNoteHistoryComparison(input),
    );
    const read = (token) =>
        sessions.readNoteHistoryComparison(token, 1, 11, "r1");
    assert.equal(read(tokens[0]), null);
    assert.ok(read(tokens[4]));
    sessions.releaseNoteHistoryComparison(tokens[3]);
    assert.equal(read(tokens[3]), null);
    assert.ok(read(tokens[4]));
});
function screen(configure = () => {}) {
    const { policy, sessions, input } = storage();
    configure(input, sessions, policy);
    const token = sessions.createNoteHistoryComparison(input);
    const params = { id: "11", token, revisionId: "r1" };
    const auth = { user: { id: 1 } };
    const database = {};
    const reads = [],
        navigation = [];
    const protection = {};
    const router = {
        canGoBack: () => true,
        back: () => navigation.push("back"),
        replace: (route) => navigation.push(route),
    };
    const h = host(
        "src/features/notes/screens/NoteHistoryComparisonScreen.tsx",
        {
            "@/core/cloud-storage/cloud-storage-provider": {
                useCloudStorage: policy.getCloudStorageSnapshot,
            },
            "@/core/cloud-storage/cloud-storage-policy": policy,
            "@/shared/theme": { semanticColors: { onBrandPrimary: "white" } },
            "@/shared/ui/Dialog/dialog": {
                DraftDialog: "Dialog",
                DialogButton: "DialogButton",
            },
            "expo-router/react-navigation": {
                useNavigation: () => ({
                    dispatch: (action) => navigation.push(action),
                }),
                usePreventRemove: (enabled, handler) =>
                    Object.assign(protection, { enabled, handler }),
            },
            "@/core/database": { useApplicationDatabase: () => database },
            "@/features/auth/hooks/useAuth": { useAuth: () => auth },
            "@/shared/ui": { PageHeader: "PageHeader", Screen: "Screen" },
            "expo-router": { router, useLocalSearchParams: () => params },
            "react-native": {
                ActivityIndicator: "Spinner",
                Pressable: "Pressable",
                Text: "Text",
                View: "View",
                ScrollView: "ScrollView",
            },
            "../components/viewer/note-history-diff": {
                default: "HistoryDiff",
            },
            "../components/viewer/note-history-loading": {
                default: "HistoryLoading",
            },
            "../services/note-history-comparison-session": sessions,
            "../utils/note-history-time": load(
                "src/features/notes/utils/note-history-time.ts",
            ),
            "../services/note-history.service": {
                readHistoryRevision: (...args) => {
                    const pending = deferred();
                    reads.push({ args, ...pending });
                    return pending.promise;
                },
            },
        },
    );
    const revision = {
        revision_id: "r1",
        title: "旧标题",
        content: "旧正文",
        category_id: 2,
        created_at: "2026-09-15T00:00:00Z",
    };
    return {
        h,
        input,
        policy,
        sessions,
        params,
        auth,
        reads,
        navigation,
        protection,
        router,
        revision,
        render: () => h.render((module) => module.default()),
    };
}
test("列表直达的详情页只读本地指定版本，直接显示全文差异组件及恢复入口", async () => {
    const { h, render, reads, revision, input, navigation } = screen();
    assert.ok(find(render(), (node) => node.type === "HistoryLoading"));
    assert.deepEqual(reads[0].args.slice(1), [1, 11, "r1"]);
    reads[0].resolve(revision);
    await tick();
    const view = render();
    const diff = find(view, (node) => node.type === "HistoryDiff");
    assert.equal(diff.props.currentValue.content, "尚未保存的正文");
    assert.equal(diff.props.selected.content, "旧正文");
    assert.equal(
        find(view, (node) => node.type === "PageHeader").props.title,
        "版本详情",
    );
    assert.equal(byLabel(view, "查看与当前对比"), undefined);
    assert.equal(byLabel(view, "查看历史全文"), undefined);
    assert.equal(byLabel(view, "恢复此版本").props.disabled, false);
    assert.equal(reads.length, 1);
    find(view, (node) => node.type === "PageHeader").props.onBack();
    assert.deepEqual(navigation, ["back"]);
    assert.equal(input.currentValue.content, "尚未保存的正文");
    h.cleanup();
});
test("独立页读取失败可重试，重试时隐藏旧错误并保留草稿快照", async () => {
    const { h, render, reads, revision } = screen();
    render();
    reads[0].reject(new Error("版本暂不可读"));
    await tick();
    assert.ok(
        find(render(), (node) => node.props?.children === "版本暂不可读"),
    );
    byLabel(render(), "重新读取历史版本").props.onPress();
    assert.ok(find(render(), (node) => node.type === "HistoryLoading"));
    reads[1].resolve(revision);
    await tick();
    assert.equal(
        find(render(), (node) => node.type === "HistoryDiff").props.currentValue
            .content,
        "尚未保存的正文",
    );
    h.cleanup();
});
test("缺少快照或伪造笔记/版本/账号的深链接不读取正文，返回有明确回退", () => {
    for (const overrides of [
        { token: undefined },
        { token: "伪造" },
        { id: "12" },
        { id: "0" },
        { id: "invalid" },
        { revisionId: "r2" },
    ]) {
        const { h, render, params, reads, router, navigation } = screen();
        Object.assign(params, overrides);
        const view = render();
        assert.equal(reads.length, 0);
        assert.ok(
            find(
                view,
                (node) =>
                    node.props?.children ===
                    "对比内容已过期，请返回笔记编辑页重新打开",
            ),
        );
        router.canGoBack = () => false;
        find(view, (node) => node.type === "PageHeader").props.onBack();
        assert.deepEqual(navigation, ["/note"]);
        h.cleanup();
    }
});
test("路由接受数组参数，换账号后隐藏结果，迟到读取和卸载结果不回写", async () => {
    const { h, render, params, reads, auth, policy, revision } = screen();
    params.id = [params.id];
    params.token = [params.token];
    params.revisionId = [params.revisionId];
    render();
    policy.setCloudStorageSession(2, true, false);
    auth.user = { id: 2 };
    assert.equal(
        find(render(), (node) => node.type === "HistoryDiff"),
        undefined,
    );
    const writes = h.writes;
    reads[0].resolve(revision);
    await tick();
    assert.equal(h.writes, writes);
    policy.setCloudStorageSession(1, true, false);
    auth.user = { id: 1 };
    render();
    assert.equal(reads.length, 1, "原账号旧会话仍然过期");
    h.cleanup();
    const second = screen();
    second.render();
    second.h.cleanup();
    const previous = second.h.writes;
    second.reads[0].reject(new Error("迟到错误"));
    await tick();
    assert.equal(second.h.writes, previous);
});

async function readyScreen(configure) {
    const fixture = screen(configure);
    fixture.render();
    fixture.reads[0].resolve(fixture.revision);
    await tick();
    fixture.render();
    return fixture;
}
const dialog = (view) => find(view, (node) => node.type === "Dialog");
test("恢复须二次确认，取消和普通返回不调用恢复、不改当前草稿", async () => {
    let restores = 0;
    const f = await readyScreen((input) => {
        input.onRestore = async () => {
            restores++;
        };
    });
    byLabel(f.render(), "恢复此版本").props.onPress();
    assert.equal(dialog(f.render()).props.visible, true);
    byLabel(f.render(), "取消").props.onPress();
    assert.equal(dialog(f.render()).props.visible, false);
    assert.equal(restores, 0);
    assert.equal(f.input.currentValue.content, "尚未保存的正文");
    f.h.cleanup();
});
test("恢复期间拒绝重复点击和关闭，系统返回受保护，失败保留草稿并可重试", async () => {
    let restores = 0;
    const pending = deferred();
    const f = await readyScreen((input) => {
        input.onRestore = async (id, expected) => {
            restores++;
            assert.equal(id, "r1");
            assert.equal(expected, "current");
            return pending.promise;
        };
    });
    byLabel(f.render(), "恢复此版本").props.onPress();
    const button = byLabel(f.render(), "确认恢复");
    button.props.onPress();
    button.props.onPress();
    let view = f.render();
    assert.equal(restores, 1);
    assert.equal(byLabel(view, "正在恢复").props.disabled, true);
    assert.equal(byLabel(view, "正在恢复").props.leading.type, "Spinner");
    assert.equal(dialog(view).props.closeOnScrimTap, false);
    assert.equal(f.protection.enabled, true);
    f.protection.handler({ data: { action: "hardware-back" } });
    find(view, (node) => node.type === "PageHeader").props.onBack();
    dialog(view).props.onClose();
    byLabel(view, "取消").props.onPress();
    assert.deepEqual(f.navigation, []);
    assert.equal(dialog(f.render()).props.visible, true);
    pending.reject(new Error("磁盘写入失败"));
    await tick();
    view = f.render();
    assert.equal(f.protection.enabled, false);
    assert.ok(find(view, (node) => node.props?.children === "磁盘写入失败"));
    assert.equal(byLabel(view, "确认恢复").props.disabled, false);
    assert.equal(byLabel(view, "确认恢复").props.leading, undefined);
    assert.equal(f.input.currentValue.content, "尚未保存的正文");
    byLabel(view, "确认恢复").props.onPress();
    await tick();
    assert.equal(restores, 2);
    assert.deepEqual(f.navigation, []);
    f.h.cleanup();
});
test("恢复成功即使原编辑器重建已释放快照也会返回，确认提示当前草稿先保留版本", async () => {
    let restores = 0;
    const f = await readyScreen((input, sessions) => {
        input.onRestore = async (id, expected) => {
            restores++;
            assert.equal(id, "r1");
            assert.equal(expected, "current");
            sessions.releaseNoteHistoryComparison(f.params.token);
        };
    });
    byLabel(f.render(), "恢复此版本").props.onPress();
    assert.ok(
        find(
            dialog(f.render()),
            (node) =>
                node.props?.children ===
                "当前未保存的改动会先保留为一个版本，再恢复所选内容。",
        ),
    );
    byLabel(f.render(), "确认恢复").props.onPress();
    await tick();
    assert.equal(restores, 1);
    assert.deepEqual(f.navigation, ["back"]);
    assert.equal(dialog(f.render()).props.visible, false);
    f.h.cleanup();
});
test("当前版本按指针禁用恢复，即使未保存草稿不同；冲突原因也禁用恢复但可读全文", async () => {
    for (const configure of [
        (input) => {
            input.expectedRevisionId = "r1";
        },
        (input) => {
            input.restoreBlockedReason = "请先处理草稿冲突";
        },
    ]) {
        let restores = 0;
        const f = await readyScreen((input) => {
            configure(input);
            input.onRestore = async () => {
                restores++;
            };
        });
        const view = f.render();
        assert.ok(find(view, (node) => node.type === "HistoryDiff"));
        const button = byLabel(
            view,
            f.input.expectedRevisionId === "r1" ? "已是当前版本" : "恢复此版本",
        );
        assert.equal(button.props.disabled, true);
        button.props.onPress();
        assert.equal(dialog(f.render()).props.visible, false);
        assert.equal(restores, 0);
        f.h.cleanup();
    }
});
test("旧版本内容与草稿相同仍允许恢复，不用正文差异代替版本指针判断", async () => {
    const f = await readyScreen((input) => {
        input.currentValue.content = "旧正文";
        input.currentValue.title = "旧标题";
        input.currentValue.categoryId = 2;
    });
    assert.equal(byLabel(f.render(), "恢复此版本").props.disabled, false);
    f.h.cleanup();
});
test("恢复未结束就卸载，迟到成功和失败不改页面状态也不触发导航", async () => {
    for (const failed of [false, true]) {
        const pending = deferred();
        const f = await readyScreen((input) => {
            input.onRestore = () => pending.promise;
        });
        byLabel(f.render(), "恢复此版本").props.onPress();
        byLabel(f.render(), "确认恢复").props.onPress();
        f.h.cleanup();
        const writes = f.h.writes;
        if (failed) pending.reject(new Error("迟到错误"));
        else pending.resolve();
        await tick();
        assert.equal(f.h.writes, writes);
        assert.deepEqual(f.navigation, []);
    }
});
test("确认后切账号及A→B→A不能启动旧恢复，事务中的账号变化不回到新账号笔记", async () => {
    let restores = 0;
    const f = await readyScreen((input) => {
        input.onRestore = async () => {
            restores++;
        };
    });
    byLabel(f.render(), "恢复此版本").props.onPress();
    const oldConfirm = byLabel(f.render(), "确认恢复");
    f.policy.setCloudStorageSession(2, true, false);
    f.policy.setCloudStorageSession(1, true, false);
    oldConfirm.props.onPress();
    await tick();
    assert.equal(restores, 0);
    assert.equal(dialog(f.render()).props.visible, false);
    f.h.cleanup();
    const pending = deferred();
    const next = await readyScreen((input) => {
        input.onRestore = () => pending.promise;
    });
    byLabel(next.render(), "恢复此版本").props.onPress();
    byLabel(next.render(), "确认恢复").props.onPress();
    next.policy.setCloudStorageSession(2, true, false);
    next.auth.user = { id: 2 };
    next.render();
    pending.resolve();
    await tick();
    assert.deepEqual(next.navigation, []);
    assert.equal(
        find(next.render(), (node) => node.type === "HistoryDiff"),
        undefined,
    );
    next.h.cleanup();
});
test("确认关联原快照，路由改换新快照后不能沿用旧确认恢复新版本", async () => {
    let restores = 0;
    const f = await readyScreen((input) => {
        input.onRestore = async () => {
            restores++;
        };
    });
    byLabel(f.render(), "恢复此版本").props.onPress();
    f.params.token = f.sessions.createNoteHistoryComparison({ ...f.input });
    f.render();
    f.reads[1].resolve(f.revision);
    await tick();
    assert.equal(dialog(f.render()).props.visible, false);
    byLabel(f.render(), "确认恢复").props.onPress();
    await tick();
    assert.equal(restores, 0);
    f.h.cleanup();
});

const diff = load("src/shared/utils/text-diff.ts");
const { historyDiffRows } = load(
    "src/features/notes/utils/note-history-diff-rows.ts",
    { "@/shared/utils/text-diff": diff },
);
function compare(before, after) {
    const task = diff.diffTextWithCharacters(before, after);
    let step;
    do {
        step = task.next();
    } while (!step.done);
    assert.equal(step.value.status, "complete");
    return step.value;
}
test("全文片段按段落虚拟化后仍能分别还原历史和当前，增删字符与统计一致", () => {
    const values = [
        "",
        "\n",
        "甲",
        "甲\n",
        "\n甲",
        "甲\n乙",
        "甲乙",
        "甲\n\n乙",
        "\n\n",
        "首\n甲\n尾",
        "首\n甲乙\n尾",
        "首\n甲\n中\n乙\n尾",
        "首\n丙\n中\n丁\n尾",
        "甲\r\n乙",
    ];
    for (const before of values)
        for (const after of values) {
            const result = compare(before, after);
            const rows = historyDiffRows(result.spans);
            const spans = rows.flatMap((row) => row.spans);
            assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
            for (const [excluded, source] of [
                ["insert", before],
                ["delete", after],
            ]) {
                assert.equal(
                    spans
                        .filter((span) => span.type !== excluded)
                        .map((span) => span.text)
                        .join(""),
                    source.replace(/\r\n/g, "\n"),
                    JSON.stringify([before, after]),
                );
            }
            for (const [type, count] of [
                ["insert", result.added],
                ["delete", result.removed],
            ]) {
                assert.equal(
                    spans
                        .filter((span) => span.type === type)
                        .reduce((sum, span) => sum + [...span.text].length, 0),
                    count,
                );
            }
        }
});
test("保留全部未变化段落和末尾空行，共有上下文只出现一次", () => {
    const before =
        Array.from({ length: 100 }, (_, i) => "行" + i).join("\n") + "\n";
    const result = compare(before, before.replace("行50", "新行50"));
    const rows = historyDiffRows(result.spans);
    assert.equal(rows.length, 101);
    assert.equal(
        rows
            .flatMap((row) => row.spans)
            .map((span) => span.text)
            .join(""),
        before.replace("行50", "新行50"),
    );
    assert.ok(
        rows.every((row) => Object.keys(row).sort().join(",") === "key,spans"),
    );
});
