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
function screen() {
    const { policy, sessions, input } = storage();
    const token = sessions.createNoteHistoryComparison(input);
    const params = { id: "11", token, revisionId: "r1" };
    const auth = { user: { id: 1 } };
    const database = {};
    const reads = [],
        navigation = [];
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
            "@/core/database": { useApplicationDatabase: () => database },
            "@/features/auth/hooks/useAuth": { useAuth: () => auth },
            "@/shared/ui": { PageHeader: "PageHeader", Screen: "Screen" },
            "expo-router": { router, useLocalSearchParams: () => params },
            "react-native": {
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
        router,
        revision,
        render: () => h.render((module) => module.default()),
    };
}
test("独立页只读取指定本地版本，默认对比未保存草稿，切全文不重读或重建对比", async () => {
    const { h, render, reads, revision, input, navigation } = screen();
    assert.ok(find(render(), (node) => node.type === "HistoryLoading"));
    assert.deepEqual(reads[0].args.slice(1), [1, 11, "r1"]);
    reads[0].resolve(revision);
    await tick();
    let view = render();
    assert.equal(
        byLabel(view, "查看与当前对比").props.accessibilityState.selected,
        true,
    );
    const diff = find(view, (node) => node.type === "HistoryDiff");
    assert.equal(diff.props.currentValue.content, "尚未保存的正文");
    byLabel(view, "查看历史全文").props.onPress();
    view = render();
    assert.ok(
        find(
            view,
            (node) =>
                node.props?.children === "旧正文" && node.props.selectable,
        ),
    );
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
test("字符片段拆成源行后保留高亮和换行统计，两侧行号连续且能完整重建", () => {
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
    ];
    for (const before of values)
        for (const after of values) {
            const result = compare(before, after);
            const folded = historyDiffRows(result.chunks);
            const reveals = Object.fromEntries(
                folded
                    .filter((row) => row.kind === "fold")
                    .map((row) => [row.id, { before: row.total, after: 0 }]),
            );
            const rows = historyDiffRows(result.chunks, reveals).filter(
                (row) => row.kind === "line",
            );
            for (const [side, source] of [
                ["oldLine", before],
                ["newLine", after],
            ]) {
                const projected = rows.filter((row) => row[side] !== null);
                assert.deepEqual(
                    projected.map((row) => row[side]),
                    Array.from({ length: projected.length }, (_, i) => i + 1),
                );
                assert.deepEqual(
                    projected.flatMap((row) => row.chunk.lines),
                    source ? source.split("\n") : [],
                );
            }
            for (const [type, count] of [
                ["insert", result.added],
                ["delete", result.removed],
            ]) {
                assert.equal(
                    rows
                        .flatMap((row) => row.chunk.spans ?? [])
                        .filter((span) => span.type === type)
                        .reduce(
                            (total, span) => total + [...span.text].length,
                            0,
                        ),
                    count,
                );
            }
        }
});
test("上下分段展开保留正确源行号，完全展开和重新折叠不重复或遗漏行", () => {
    const before = Array.from({ length: 100 }, (_, i) => `行${i}`).join("\n");
    const result = compare(before, `${before}\n新增`);
    const fold = historyDiffRows(result.chunks).find(
        (row) => row.kind === "fold",
    );
    assert.equal(fold.total, 98);
    const partial = historyDiffRows(result.chunks, {
        [fold.id]: { before: 20, after: 20 },
    });
    const remainder = partial.find((row) => row.kind === "fold");
    assert.equal(remainder.hidden, 58);
    assert.equal(remainder.oldLine, 21);
    assert.deepEqual(
        partial
            .filter((row) => row.kind === "line" && row.oldLine !== null)
            .map((row) => row.oldLine),
        [
            ...Array.from({ length: 20 }, (_, i) => i + 1),
            ...Array.from({ length: 22 }, (_, i) => i + 79),
        ],
    );
    const expanded = historyDiffRows(result.chunks, {
        [fold.id]: { before: 1000, after: 1000 },
    });
    assert.equal(expanded.find((row) => row.kind === "fold").hidden, 0);
    assert.deepEqual(
        expanded
            .filter((row) => row.kind === "line" && row.oldLine !== null)
            .map((row) => row.oldLine),
        Array.from({ length: 100 }, (_, i) => i + 1),
    );
    assert.deepEqual(
        historyDiffRows(result.chunks),
        historyDiffRows(result.chunks, {}),
    );
});
