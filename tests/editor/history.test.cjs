// 阶段 3B：执行真实 SQLite 事务与当前全部迁移，网络由持久上传队列接管。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return originalResolve.call(
        this,
        name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name,
        ...args,
    );
};
require.extensions[".ts"] = (module, filename) =>
    module._compile(
        ts.transpileModule(fs.readFileSync(filename, "utf8"), {
            compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2022,
            },
            fileName: filename,
        }).outputText,
        filename,
    );
const { databaseMigrations } = require("@/core/database/migrations/index.ts");
const history = require("@/features/notes/services/note-history.service.ts");
const notes = require("@/features/notes/data/note-local.repository.ts");
const revisions = require("@/features/notes/data/note-revision.repository.ts");
const drafts = require("@/features/notes/data/note-draft.repository.ts");
const {
    listUploadTasks,
    completeUploadTask,
} = require("@/core/sync/upload-queue.repository.ts");
const { enqueueNoteUpload } = require("@/features/sync/note-upload-queue.ts");
const {
    setCloudStorageSession,
} = require("@/core/cloud-storage/cloud-storage-policy.ts");
const { onNotesChanged } = require("@/features/notes/notes.events.ts");
const { getCachedNoteById } = require("@/features/notes/notes.cache.ts");

async function setup(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    setCloudStorageSession(1, true, false);
    t.after(() => setCloudStorageSession(null, false, false));
    const params = (value) =>
        value === undefined ? [] : Array.isArray(value) ? value : [value];
    const tx = {
        async run(sql, bindings) {
            const result = sqlite.prepare(sql).run(...params(bindings));
            return {
                changes: Number(result.changes),
                lastInsertRowId: Number(result.lastInsertRowid),
            };
        },
        async getFirst(sql, bindings) {
            return sqlite.prepare(sql).get(...params(bindings)) ?? null;
        },
        async getAll(sql, bindings) {
            return sqlite.prepare(sql).all(...params(bindings));
        },
    };
    for (const migration of databaseMigrations)
        await migration.up({
            execAsync: async (sql) => sqlite.exec(sql),
            runAsync: tx.run,
            getFirstAsync: tx.getFirst,
            getAllAsync: tx.getAll,
        });
    let tail = Promise.resolve();
    const port = {
        ...tx,
        transaction(task) {
            const next = tail.then(async () => {
                sqlite.exec("BEGIN IMMEDIATE");
                try {
                    const result = await task(tx);
                    sqlite.exec("COMMIT");
                    return result;
                } catch (error) {
                    sqlite.exec("ROLLBACK");
                    throw error;
                }
            });
            tail = next.catch(() => {});
            return next;
        },
    };
    const { note: first } = await notes.createPendingLocalNote(port, 1, {
        title: "第一版",
        content: "旧正文",
    });
    const { note: current } = await notes.updatePendingLocalNote(
        port,
        1,
        first,
        { title: "第二版", content: "当前正文" },
    );
    const commit = {
        key: `note:${current.id}`,
        sessionId: "历史恢复会话",
        sequence: 0,
    };
    await drafts.openNoteDraft(
        port,
        1,
        commit.key,
        commit.sessionId,
        current.id,
        drafts.noteDraftValue(current),
        current.current_revision_id,
    );
    const restore = (db = port) =>
        history.restoreNoteFromHistory(
            db,
            1,
            current.id,
            first.current_revision_id,
            current.current_revision_id,
            commit,
        );
    return { sqlite, tx, port, first, current, commit, restore };
}

test("历史列表按笔记和账号隔离，不传输正文，不把自动草稿列为版本", async (t) => {
    const { port, current, commit } = await setup(t);
    await notes.createPendingLocalNote(port, 1, {
        title: "另一篇",
        content: "另一篇正文",
    });
    await notes.createPendingLocalNote(port, 2, {
        title: "另一账号",
        content: "私有正文",
    });
    commit.sequence = 1;
    await drafts.writeNoteDraft(port, 1, commit, {
        title: "草稿",
        content: "未提交内容",
        categoryId: null,
    });
    const snapshot = await history.readNoteHistory(port, 1, current.id);
    assert.equal(snapshot.revisions.length, 2);
    assert.equal(
        snapshot.note.current_revision_id,
        current.current_revision_id,
    );
    for (const row of snapshot.revisions) {
        assert.equal(row.owner_user_id, 1);
        assert.equal(row.client_id, current.id);
        assert.equal(Object.hasOwn(row, "content"), false);
        assert.equal(row.content_length, row.title === "第一版" ? 3 : 4);
    }
    await assert.rejects(
        history.readNoteHistory(port, 2, current.id),
        /账号已变化/,
    );
});

test("选中后读取完整快照，跨笔记、跨账号、已清理版本与未知结构均拒绝", async (t) => {
    const { port, first, current } = await setup(t);
    assert.equal(
        (
            await history.readHistoryRevision(
                port,
                1,
                current.id,
                first.current_revision_id,
            )
        ).content,
        "旧正文",
    );
    const { note: other } = await notes.createPendingLocalNote(port, 1, {
        title: "另一篇",
        content: "秘密",
    });
    await assert.rejects(
        history.readHistoryRevision(
            port,
            1,
            current.id,
            other.current_revision_id,
        ),
        /不属于/,
    );
    await assert.rejects(
        history.readHistoryRevision(port, 1, current.id, "不存在"),
        /已被清理/,
    );
    await assert.rejects(
        history.readHistoryRevision(
            port,
            2,
            current.id,
            first.current_revision_id,
        ),
        /账号已变化/,
    );
    await port.run(
        "UPDATE note_revisions SET schema_version=999 WHERE revision_id=?",
        [first.current_revision_id],
    );
    await assert.rejects(
        history.readHistoryRevision(
            port,
            1,
            current.id,
            first.current_revision_id,
        ),
        /更新应用/,
    );
});

test("已登录另一账号仍无法读取或恢复前一账号的版本", async (t) => {
    const { port, first, current, commit } = await setup(t);
    setCloudStorageSession(2, true, false);
    await assert.rejects(
        history.readNoteHistory(port, 2, current.id),
        /不存在/,
    );
    await assert.rejects(
        history.readHistoryRevision(
            port,
            2,
            current.id,
            first.current_revision_id,
        ),
        /不属于/,
    );
    await assert.rejects(
        history.restoreNoteFromHistory(
            port,
            2,
            current.id,
            first.current_revision_id,
            current.current_revision_id,
            commit,
        ),
        /不属于/,
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("有效历史分类仍保留，气泡读取使用本地分类名称", async (t) => {
    const { port, first, current, restore } = await setup(t);
    await port.run(
        "INSERT INTO local_categories(owner_user_id,id,server_id,name,icon) VALUES(1,333,333,'历史分类','Folder')",
    );
    await port.run(
        "UPDATE note_revisions SET category_id=333 WHERE revision_id=?",
        [first.current_revision_id],
    );
    assert.ok(
        (await history.readNoteHistory(port, 1, current.id)).categories.some(
            (item) => item.name === "历史分类",
        ),
    );
    const result = await restore();
    assert.equal(result.category_id, 333);
});

test("离线未授权云存储时仍原子恢复一个新版本、删除旧草稿并写入上传队列", async (t) => {
    const { port, first, current, commit, restore } = await setup(t);
    const result = await restore();
    assert.equal(result.content, "旧正文");
    assert.equal(result.title, "第一版");
    assert.equal(result.sync_status, "pending");
    const rows = await revisions.listNoteRevisions(port, 1, current.id);
    assert.equal(rows.length, 3);
    const restored = rows.find(
        (row) => row.revision_id === result.current_revision_id,
    );
    assert.equal(restored.origin, "restore");
    assert.equal(restored.parent_revision_id, current.current_revision_id);
    assert.equal(
        rows.find((row) => row.revision_id === first.current_revision_id)
            .content,
        "旧正文",
    );
    assert.equal(await drafts.readNoteDraft(port, 1, commit.key), null);
    const tasks = await listUploadTasks(port, 1);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].status, "queued");
    assert.equal(tasks[0].payload.revisionId, result.current_revision_id);
    assert.equal(tasks[0].payload.draft, undefined);
    assert.equal(
        getCachedNoteById(current.id, 1).current_revision_id,
        result.current_revision_id,
    );
});

test("恢复前保留未提交输入为独立版本，恢复节点链接该版本，旧会话不能再补写", async (t) => {
    const { port, first, current, commit, restore } = await setup(t);
    commit.sequence = 1;
    const input = {
        title: "未保存标题",
        content: "未保存正文",
        categoryId: null,
    };
    await drafts.writeNoteDraft(port, 1, commit, input);
    const result = await restore();
    const rows = await revisions.listNoteRevisions(port, 1, current.id);
    assert.equal(rows.length, 4);
    const retained = rows.find((row) => row.content === input.content);
    assert.equal(retained.title, input.title);
    assert.equal(retained.origin, "local-save");
    assert.equal(retained.parent_revision_id, current.current_revision_id);
    assert.equal(
        rows.find((row) => row.revision_id === result.current_revision_id)
            .parent_revision_id,
        retained.revision_id,
    );
    await assert.rejects(
        drafts.writeNoteDraft(port, 1, { ...commit, sequence: 2 }, input),
        /会话|变化/,
    );
    const fresh = await drafts.openNoteDraft(
        port,
        1,
        commit.key,
        "恢复后的新会话",
        current.id,
        drafts.noteDraftValue(result),
        result.current_revision_id,
    );
    assert.equal(fresh.content, first.content);
    assert.equal(fresh.base_revision_id, result.current_revision_id);
    await assert.rejects(
        drafts.writeNoteDraft(port, 1, { ...commit, sequence: 2 }, input),
        /会话|变化/,
    );
});

test("版本指针变化或重复并发恢复只允许一次提交", async (t) => {
    const { port, current, restore } = await setup(t);
    const results = await Promise.allSettled([restore(), restore()]);
    assert.equal(
        results.filter((item) => item.status === "fulfilled").length,
        1,
    );
    assert.match(
        results.find((item) => item.status === "rejected").reason.message,
        /当前版本已变化/,
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        3,
    );
    assert.equal((await listUploadTasks(port, 1)).length, 1);
});

test("当前版本不可恢复，草稿输入与版本数量保持不变", async (t) => {
    const { port, current, commit } = await setup(t);
    await assert.rejects(
        history.restoreNoteFromHistory(
            port,
            1,
            current.id,
            current.current_revision_id,
            current.current_revision_id,
            commit,
        ),
        /已是当前内容/,
    );
    assert.ok(await drafts.readNoteDraft(port, 1, commit.key));
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
    assert.equal((await listUploadTasks(port, 1)).length, 0);
});

test("草稿已被接管时拒绝恢复，不清除新会话", async (t) => {
    const { port, current, commit, restore } = await setup(t);
    await drafts.openNoteDraft(
        port,
        1,
        commit.key,
        "其他会话",
        current.id,
        drafts.noteDraftValue(current),
        current.current_revision_id,
    );
    await assert.rejects(restore(), /其他编辑会话/);
    assert.equal(
        (await drafts.readNoteDraft(port, 1, commit.key)).session_id,
        "其他会话",
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("草稿序号或基础版本过期时拒绝恢复且保留输入", async (t) => {
    const { port, commit, current, restore } = await setup(t);
    await drafts.writeNoteDraft(
        port,
        1,
        { ...commit, sequence: 1 },
        { title: "输入", content: "保留", categoryId: null },
    );
    await assert.rejects(restore(), /其他编辑会话/);
    commit.sequence = 1;
    await port.run(
        "UPDATE note_drafts SET base_revision_id='已过期' WHERE draft_key=?",
        [commit.key],
    );
    await assert.rejects(restore(), /发生变化/);
    assert.equal(
        (await drafts.readNoteDraft(port, 1, commit.key)).content,
        "保留",
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("草稿不属于当前笔记时拒绝恢复", async (t) => {
    const { port, current, commit, restore } = await setup(t);
    await port.run("UPDATE note_drafts SET note_id=NULL WHERE draft_key=?", [
        commit.key,
    ]);
    await assert.rejects(restore(), /不属于这篇笔记/);
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("上传任务写入失败时版本、笔记和草稿全部回滚", async (t) => {
    const { sqlite, port, current, commit, restore } = await setup(t);
    commit.sequence = 1;
    await drafts.writeNoteDraft(port, 1, commit, {
        title: "保留输入",
        content: "尚未提交",
        categoryId: null,
    });
    sqlite.exec(
        "CREATE TRIGGER fail_queue BEFORE INSERT ON upload_queue_tasks BEGIN SELECT RAISE(ABORT,'队列写入故障'); END",
    );
    await assert.rejects(restore(), /队列写入故障/);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, current.id))
            .current_revision_id,
        current.current_revision_id,
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
    assert.equal(
        (await drafts.readNoteDraft(port, 1, commit.key)).content,
        "尚未提交",
    );
    assert.equal((await listUploadTasks(port, 1)).length, 0);
});

test("恢复节点插入失败时不会单独留下草稿保留版本", async (t) => {
    const { sqlite, port, current, commit, restore } = await setup(t);
    commit.sequence = 1;
    await drafts.writeNoteDraft(port, 1, commit, {
        title: "保留输入",
        content: "尚未提交",
        categoryId: null,
    });
    sqlite.exec(
        "CREATE TRIGGER fail_restore BEFORE INSERT ON note_revisions WHEN NEW.origin='restore' BEGIN SELECT RAISE(ABORT,'恢复节点故障'); END",
    );
    await assert.rejects(restore(), /恢复节点故障/);
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
    assert.equal((await drafts.readNoteDraft(port, 1, commit.key)).sequence, 1);
});

test("事务末尾切换账号时回滚，旧账号事件不发布", async (t) => {
    const { port, current, commit, restore } = await setup(t);
    let events = 0;
    t.after(onNotesChanged(() => events++));
    const switched = {
        ...port,
        transaction: (task) =>
            port.transaction((tx) =>
                task({
                    ...tx,
                    run: async (sql, bindings) => {
                        const result = await tx.run(sql, bindings);
                        if (sql.includes("INSERT INTO upload_queue_tasks"))
                            setCloudStorageSession(2, true, false);
                        return result;
                    },
                }),
            ),
    };
    await assert.rejects(restore(switched), /账号已变化/);
    assert.equal(events, 0);
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, current.id))
            .current_revision_id,
        current.current_revision_id,
    );
    assert.ok(await drafts.readNoteDraft(port, 1, commit.key));
    assert.equal((await listUploadTasks(port, 1)).length, 0);
});

test("提交后订阅者抛错不反转本地成功结果", async (t) => {
    const { port, current, restore } = await setup(t);
    t.after(
        onNotesChanged(() => {
            throw new Error("界面订阅故障");
        }),
    );
    const result = await restore();
    assert.equal(result.content, "旧正文");
    assert.equal(
        (await notes.getLocalNoteByClientId(port, 1, current.id))
            .current_revision_id,
        result.current_revision_id,
    );
    assert.equal(
        (await listUploadTasks(port, 1))[0].payload.revisionId,
        result.current_revision_id,
    );
});

test("历史分类已删除时回退默认分类，置顶星标排序与服务器身份保留", async (t) => {
    const { port, first, current, restore } = await setup(t);
    await port.run(
        "UPDATE note_revisions SET category_id=333 WHERE revision_id=?",
        [first.current_revision_id],
    );
    await port.run(
        "UPDATE local_notes SET is_pinned=1,is_starred=1,local_order=7,pinned_order=2,server_id=77,sync_operation=NULL,sync_status='synced' WHERE client_id=?",
        [current.id],
    );
    const result = await restore();
    assert.equal(result.category_id, null);
    assert.equal(result.server_id, 77);
    assert.equal(result.is_pinned, true);
    assert.equal(result.is_starred, true);
    assert.equal(result.local_order, 7);
    assert.equal(result.pinned_order, 2);
    assert.equal(result.sync_operation, "update");
});

test("旧上传回执不能把恢复后的新版本标为已同步或覆盖正文", async (t) => {
    const { port, current, restore } = await setup(t);
    const result = await restore();
    const acknowledged = await notes.acceptServerNote(
        port,
        1,
        current.id,
        { ...current, id: 77, server_id: 77 },
        current.current_revision_id,
    );
    assert.equal(acknowledged.content, "旧正文");
    assert.equal(acknowledged.current_revision_id, result.current_revision_id);
    assert.equal(acknowledged.sync_status, "pending");
    assert.equal(
        (await listUploadTasks(port, 1))[0].payload.revisionId,
        result.current_revision_id,
    );
});

test("云端删除保护不被历史恢复清除，仍保留本地内容", async (t) => {
    const { port, current, restore } = await setup(t);
    await port.run(
        "UPDATE local_notes SET server_id=77,last_sync_error='云端笔记已删除，请核对' WHERE client_id=?",
        [current.id],
    );
    const result = await restore();
    assert.equal(result.content, "旧正文");
    assert.match(result.last_sync_error, /^云端笔记已删除/);
});

test("新建结果未知的防重复保护不被恢复清除", async (t) => {
    const { port, current, restore } = await setup(t);
    await port.run(
        "UPDATE local_notes SET sync_status='unknown',last_sync_error='此前创建结果未知' WHERE client_id=?",
        [current.id],
    );
    const result = await restore();
    assert.equal(result.content, "旧正文");
    assert.equal(result.sync_status, "unknown");
    assert.equal(result.last_sync_error, "此前创建结果未知");
    assert.equal(result.sync_operation, "create");
});

test("旧上传失败不能把恢复后的新版本标为失败", async (t) => {
    const { port, current, restore } = await setup(t);
    const result = await restore();
    const failed = await notes.markLocalNoteSyncFailed(
        port,
        1,
        current.id,
        "rejected",
        "旧请求失败",
        current.current_revision_id,
    );
    assert.equal(failed.current_revision_id, result.current_revision_id);
    assert.equal(failed.sync_status, "pending");
    assert.equal(failed.last_sync_error, null);
});

test("旧任务完成不能删除恢复后替换的上传任务", async (t) => {
    const { port, current, restore } = await setup(t);
    await enqueueNoteUpload(port, 1, current);
    const oldTask = (await listUploadTasks(port, 1))[0];
    const result = await restore();
    const replacement = (await listUploadTasks(port, 1))[0];
    assert.notEqual(replacement.taskId, oldTask.taskId);
    await completeUploadTask(port, oldTask.taskId);
    const remaining = await listUploadTasks(port, 1);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].payload.revisionId, result.current_revision_id);
});

test("正在同步、正文已淘汰、清除标记都阻止恢复", async (t) => {
    const { port, current, restore } = await setup(t);
    await port.run(
        "UPDATE local_notes SET sync_status='syncing' WHERE client_id=?",
        [current.id],
    );
    await assert.rejects(restore(), /正在同步/);
    await port.run(
        "UPDATE local_notes SET sync_status='synced',body_state='evicted' WHERE client_id=?",
        [current.id],
    );
    await assert.rejects(restore(), /正文尚未下载/);
    await port.run(
        "INSERT INTO note_trash_purged(owner_user_id,client_id) VALUES(1,?)",
        [current.id],
    );
    await assert.rejects(restore(), /垃圾桶/);
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("空标题或未知版本结构拒绝恢复，不删除草稿", async (t) => {
    const { port, first, current, commit, restore } = await setup(t);
    commit.sequence = 1;
    await drafts.writeNoteDraft(port, 1, commit, {
        title: "  ",
        content: "保留正文",
        categoryId: null,
    });
    await assert.rejects(restore(), /填写当前笔记标题/);
    await port.run(
        "UPDATE note_revisions SET schema_version=999 WHERE revision_id=?",
        [first.current_revision_id],
    );
    await assert.rejects(restore(), /更新应用/);
    assert.equal(
        (await drafts.readNoteDraft(port, 1, commit.key)).content,
        "保留正文",
    );
    assert.equal(
        (await revisions.listNoteRevisions(port, 1, current.id)).length,
        2,
    );
});

test("恢复事务保留被选中的最旧版本，不在保存未提交草稿时误裁剪", async (t) => {
    const { port, first, current, commit, restore } = await setup(t);
    // 填满保留上限且不移动当前指针，选中的第一版是最旧且未被引用的节点。
    await port.run(
        "UPDATE note_revisions SET created_at='2000-01-01T00:00:00Z' WHERE revision_id=?",
        [first.current_revision_id],
    );
    for (let index = 0; index < 48; index++)
        await port.run(
            `INSERT INTO note_revisions(revision_id,owner_user_id,client_id,parent_revision_id,title,content,category_id,origin,created_at,schema_version)
         VALUES(?,1,?,NULL,'历史','文本',NULL,'local-save',?,1)`,
            [
                `填充-${index}`,
                current.id,
                `2026-01-01T00:00:${String(index).padStart(2, "0")}Z`,
            ],
        );
    commit.sequence = 1;
    await drafts.writeNoteDraft(port, 1, commit, {
        title: "当前输入",
        content: "未保存正文",
        categoryId: null,
    });
    const result = await restore();
    assert.equal(result.content, "旧正文");
    assert.ok(
        await revisions.getNoteRevisionById(port, 1, first.current_revision_id),
    );
    assert.ok(
        (await revisions.listNoteRevisions(port, 1, current.id)).some(
            (row) => row.content === "未保存正文",
        ),
    );
});
