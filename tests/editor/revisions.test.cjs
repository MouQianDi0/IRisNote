// Node 24+: node --test tests/editor/revisions.test.cjs
// 阶段 3A 保存版本边界的 Node SQLite 回归；云端接口使用显式假实现。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    return resolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => {
    const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    });
    module._compile(result.outputText, filename);
};

const notes = require('../../src/features/notes/data/note-local.repository.ts');
const revisions = require('../../src/features/notes/data/note-revision.repository.ts');
const drafts = require('../../src/features/notes/data/note-draft.repository.ts');
const { createLocalNotes } = require('../../src/core/database/migrations/0002-create-local-notes.ts');
const { createNoteDrafts } = require('../../src/core/database/migrations/0003-create-note-drafts.ts');
const { createNoteRevisions } = require('../../src/core/database/migrations/0004-create-note-revisions.ts');
const { createUploadQueue } = require('../../src/core/database/migrations/0005-create-upload-queue.ts');
const apiPath = require.resolve('../../src/features/notes/api/notes.api.ts');
let createCalls = 0;
let updateCalls = 0;
const api = {
    createNote: async () => { createCalls++; throw new Error('test network unavailable'); },
    updateNote: async () => { updateCalls++; throw new Error('test network unavailable'); },
};
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: api };
const saves = require('../../src/features/notes/services/note-save.service.ts');
const { listUploadTasks } = require('../../src/core/sync/upload-queue.repository.ts');

test('reconcile reports actual inserted notes even when deletion keeps total unchanged', async t => {
    const { port: db } = await database(t);
    let stats;
    await notes.reconcileServerNotes(db, 1, [serverNote(41, 'old')], value => { stats = value; });
    assert.equal(stats.addedCount, 1);
    await notes.reconcileServerNotes(db, 1, [serverNote(42, 'new'), serverNote(42, 'new')], value => { stats = value; });
    assert.equal(stats.addedCount, 1);
    const rows = await notes.reconcileServerNotes(db, 1, [serverNote(42, 'changed')], value => { stats = value; });
    assert.equal(stats.addedCount, 0);
    assert.equal(rows.length, 1);
});

test('notification callback failure cannot interrupt committed note save', async t => {
    const { port } = await database(t);
    let notified = false;
    const result = await saves.saveNewNoteLocalFirst(port, 1, payload('retained'), undefined, () => {
        notified = true; throw new Error('notification failed');
    });
    assert.equal(notified, true);
    assert.equal(result.cloudState, 'queued');
    assert.equal((await listUploadTasks(port, 1))[0].payload.clientId, result.note.id);
    const saved = await notes.getLocalNotes(port, 1);
    assert.equal(saved[0].content, 'retained');
});

const payload = (content, title = '标题') => ({ title, content, category_id: 3 });
const serverNote = (id, content, title = '标题') => ({
    id, server_id: id, user_id: 1, title, content, category_id: 3,
    created_at: '2026-09-09T00:00:00.000Z', is_pinned: false, is_starred: false,
    sync_status: 'synced', sync_operation: null, last_sync_error: null, current_revision_id: null,
});

async function database(t, { withRevisions = true } = {}) {
    const sql = new DatabaseSync(':memory:');
    t.after(() => sql.close());
    const params = (bindings) => Array.isArray(bindings) ? bindings : [bindings];
    const port = {
        async run(source, bindings = []) {
            const result = sql.prepare(source).run(...params(bindings));
            return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
        },
        async getFirst(source, bindings = []) { return sql.prepare(source).get(...params(bindings)) ?? null; },
        async getAll(source, bindings = []) { return sql.prepare(source).all(...params(bindings)); },
    };
    let tail = Promise.resolve();
    port.transaction = (task) => {
        const next = tail.then(async () => {
            sql.exec('BEGIN IMMEDIATE');
            try { const result = await task(port); sql.exec('COMMIT'); return result; }
            catch (error) { sql.exec('ROLLBACK'); throw error; }
        });
        tail = next.catch(() => {});
        return next;
    };
    const migrationPort = {
        execAsync: async (source) => sql.exec(source),
        runAsync: async (source, bindings = []) => sql.prepare(source).run(...params(bindings)),
        getAllAsync: async (source, bindings = []) => sql.prepare(source).all(...params(bindings)),
    };
    await createLocalNotes.up(migrationPort);
    await createNoteDrafts.up(migrationPort);
    if (withRevisions) await createNoteRevisions.up(migrationPort);
    await createUploadQueue.up(migrationPort);
    return { port, sql, migrationPort };
}

test('migration backfills V1 and draft base revision from v3 data', async (t) => {
    // 直接以 v3 结构造数：一篇笔记 + 一份已关联草稿，不经过 v4 代码路径。
    const { port, migrationPort } = await database(t, { withRevisions: false });
    await port.run(
        `INSERT INTO local_notes (owner_user_id, client_id, server_id, title, content,
            category_id, created_at, local_order, sync_status, sync_operation, local_updated_at)
         VALUES (1, -11, 11, '旧标题', '旧正文', 3, '2026-08-01T00:00:00.000Z', 0, 'synced', NULL, '2026-08-01T00:00:00.000Z')`);
    await port.run(
        `INSERT INTO note_drafts (owner_user_id, draft_key, session_id, note_id, base_snapshot,
            title, content, category_id, sequence, updated_at)
         VALUES (1, 'note:-11', 'old-session', -11, '["旧标题","旧正文",3]', '旧标题', '草稿正文', 3, 2, '2026-08-01T01:00:00.000Z')`);

    await createNoteRevisions.up(migrationPort);

    const row = await port.getFirst(`SELECT current_revision_id FROM local_notes WHERE client_id = -11`);
    assert.ok(row.current_revision_id);
    const revision = await revisions.getNoteRevisionById(port, 1, row.current_revision_id);
    assert.equal(revision.origin, 'migrate');
    assert.equal(revision.title, '旧标题');
    assert.equal(revision.content, '旧正文');
    assert.equal(revision.parent_revision_id, null);
    const draft = await drafts.readNoteDraft(port, 1, 'note:-11');
    assert.equal(draft.base_revision_id, row.current_revision_id);
    assert.equal(draft.content, '草稿正文');
});

test('first save creates exactly one V1 revision', async (t) => {
    const { port } = await database(t);
    const { note } = await notes.createPendingLocalNote(port, 1, payload('V1 正文'));
    const list = await revisions.listNoteRevisions(port, 1, note.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].origin, 'local-save');
    assert.equal(list[0].parent_revision_id, null);
    assert.equal(list[0].content, 'V1 正文');
    assert.equal(note.current_revision_id, list[0].revision_id);
});

test('changed edit creates V2 chained to V1', async (t) => {
    const { port } = await database(t);
    const created = await notes.createPendingLocalNote(port, 1, payload('V1 正文'));
    const v1 = created.note.current_revision_id;
    const { note: edited, revisionCreated } = await notes.updatePendingLocalNote(
        port, 1, created.note, payload('V2 正文'));
    assert.equal(revisionCreated, true);
    const list = await revisions.listNoteRevisions(port, 1, edited.id);
    assert.equal(list.length, 2);
    assert.equal(list[0].origin, 'local-save');
    assert.equal(list[0].parent_revision_id, v1);
    assert.equal(edited.current_revision_id, list[0].revision_id);
});

test('unchanged pending edit keeps one revision and one durable upload task without immediate requests', async (t) => {
    const { port } = await database(t);
    createCalls = 0; updateCalls = 0;
    const { note } = await notes.createPendingLocalNote(port, 1, payload('同一正文'));
    const result = await saves.saveEditedNoteLocalFirst(
        port, 1, note, payload('同一正文'));
    assert.equal(result.unchanged, true);
    assert.equal(result.cloudState, 'queued');
    assert.equal(createCalls + updateCalls, 0);
    await saves.saveEditedNoteLocalFirst(port, 1, result.note, payload('同一正文'));
    const tasks = await listUploadTasks(port, 1);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].payload.clientId, note.id);
    assert.equal((await revisions.listNoteRevisions(port, 1, note.id)).length, 1);
});

test('unchanged edit on a synced note skips upload and stays synced', async (t) => {
    const { port } = await database(t);
    createCalls = 0; updateCalls = 0;
    const { note } = await notes.createPendingLocalNote(port, 1, payload('已同步正文'));
    await port.run(
        `UPDATE local_notes SET server_id = 21, sync_status = 'synced', sync_operation = NULL
         WHERE client_id = $clientId`, { $clientId: note.id });
    const synced = await notes.getLocalNoteByClientId(port, 1, note.id);
    const result = await saves.saveEditedNoteLocalFirst(
        port, 1, synced, payload('已同步正文'));
    assert.equal(result.cloudState, 'accepted');
    assert.equal(result.unchanged, true);
    assert.equal(createCalls + updateCalls, 0);
    assert.equal((await revisions.listNoteRevisions(port, 1, note.id)).length, 1);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, note.id)).sync_status, 'synced');
});

test('exit staging commits the draft locally without starting cloud upload', async (t) => {
    const { port } = await database(t);
    createCalls = 0; updateCalls = 0;
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(22, '稳定正文')]);
    const key = `note:${note.id}`;
    const commit = { key, sessionId: 'exit-session', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, commit.sessionId, note.id,
        drafts.noteDraftValue(note), note.current_revision_id);
    await drafts.writeNoteDraft(port, 1, commit,
        { title: '标题', content: '退出正文', categoryId: 3 });

    const staged = await saves.stageEditedNoteForSync(
        port, 1, note, payload('退出正文'), commit);

    assert.equal(staged.shouldUpload, true);
    assert.equal(staged.note.content, '退出正文');
    assert.equal(staged.note.sync_status, 'pending');
    assert.equal(createCalls + updateCalls, 0);
    assert.equal((await drafts.readNoteDraft(port, 1, key)).base_revision_id,
        staged.note.current_revision_id);
});

test('exit upload deletes only the staged draft after cloud acceptance', async (t) => {
    const { port } = await database(t);
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(24, '稳定正文')]);
    const key = `note:${note.id}`;
    const commit = { key, sessionId: 'accepted-exit', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, commit.sessionId, note.id,
        drafts.noteDraftValue(note), note.current_revision_id);
    await drafts.writeNoteDraft(port, 1, commit,
        { title: '标题', content: '退出上传正文', categoryId: 3 });
    const staged = await saves.stageEditedNoteForSync(
        port, 1, note, payload('退出上传正文'), commit);
    t.mock.method(api, 'updateNote', async (id, body) => serverNote(id, body.content));

    const result = await saves.uploadStagedNoteAfterExit(
        port, 1, staged.note.id, commit);

    assert.equal(result.cloudState, 'accepted');
    assert.equal(await drafts.readNoteDraft(port, 1, key), null);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, note.id)).sync_status, 'synced');
});

test('an old cloud response cannot mark a newer local revision synced', async (t) => {
    const { port } = await database(t);
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(23, 'V1')]);
    const uploadingRevision = note.current_revision_id;
    await notes.markLocalNoteSyncing(port, 1, note.id);
    const { note: newer } = await notes.updatePendingLocalNote(
        port, 1, note, payload('V2'));

    const accepted = await notes.acceptServerNote(
        port, 1, note.id, serverNote(23, 'V1'), uploadingRevision);

    assert.equal(accepted.content, 'V2');
    assert.equal(accepted.current_revision_id, newer.current_revision_id);
    assert.equal(accepted.sync_status, 'pending');
    assert.equal(accepted.sync_operation, 'update');
});

test('an old cloud failure cannot mark a newer local revision failed', async (t) => {
    const { port } = await database(t);
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(25, 'V1')]);
    const uploadingRevision = note.current_revision_id;
    await notes.markLocalNoteSyncing(port, 1, note.id);
    const { note: newer } = await notes.updatePendingLocalNote(
        port, 1, note, payload('V2'));

    const failed = await notes.markLocalNoteSyncFailed(
        port, 1, note.id, 'rejected', '旧版本上传失败', uploadingRevision);

    assert.equal(failed.content, 'V2');
    assert.equal(failed.current_revision_id, newer.current_revision_id);
    assert.equal(failed.sync_status, 'pending');
    assert.equal(failed.sync_operation, 'update');
    assert.equal(failed.last_sync_error, null);
});

test('revision insert failure rolls back note and keeps draft', async (t) => {
    const { port } = await database(t);
    const created = await notes.createPendingLocalNote(port, 1, payload('基线'));
    const key = 'note:' + created.note.id;
    const commit = { key, sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, 'a', created.note.id,
        drafts.noteDraftValue(created.note), created.note.current_revision_id);
    await drafts.writeNoteDraft(port, 1, commit, { title: '标题', content: '新正文', categoryId: 3 });

    const faulty = { ...port, transaction: (task) => port.transaction((tx) => task({ ...tx,
        run: (source, params) => {
            if (source.includes('INSERT INTO note_revisions')) throw new Error('fault injection');
            return tx.run(source, params);
        },
    })) };
    await assert.rejects(notes.updatePendingLocalNote(
        faulty, 1, created.note, payload('新正文'), commit), /fault injection/);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, created.note.id)).content, '基线');
    assert.equal((await revisions.listNoteRevisions(port, 1, created.note.id)).length, 1);
    assert.equal((await drafts.readNoteDraft(port, 1, key)).content, '新正文');
});

test('reconcile appends, skips or seeds revisions per branch', async (t) => {
    const { port } = await database(t);
    const { note: local } = await notes.createPendingLocalNote(port, 1, payload('本地正文'));
    await port.run(
        `UPDATE local_notes SET server_id = 31, sync_status = 'synced', sync_operation = NULL
         WHERE client_id = $clientId`, { $clientId: local.id });

    await notes.reconcileServerNotes(port, 1, [
        serverNote(31, '服务器新正文'),
        serverNote(77, '远端新笔记'),
    ]);

    const changedList = await revisions.listNoteRevisions(port, 1, local.id);
    assert.equal(changedList.length, 2);
    assert.equal(changedList[0].origin, 'server-reconcile');
    assert.equal(changedList[0].content, '服务器新正文');
    assert.equal((await notes.getLocalNoteByClientId(port, 1, local.id)).content, '服务器新正文');

    const newList = await revisions.listNoteRevisions(port, 1, 77);
    assert.equal(newList.length, 1);
    assert.equal(newList[0].origin, 'server-reconcile');

    // 内容相同再对账：不新增版本。
    await notes.reconcileServerNotes(port, 1, [serverNote(31, '服务器新正文'), serverNote(77, '远端新笔记')]);
    assert.equal((await revisions.listNoteRevisions(port, 1, local.id)).length, 2);

    // 服务器删除传播：笔记与版本一并清理。
    await notes.reconcileServerNotes(port, 1, [serverNote(77, '远端新笔记')]);
    assert.equal(await notes.getLocalNoteByClientId(port, 1, local.id), null);
    assert.equal((await revisions.listNoteRevisions(port, 1, local.id)).length, 0);
    assert.ok(await notes.getLocalNoteByClientId(port, 1, 77));
});

test('restore creates a new revision and never mutates the old node', async (t) => {
    const { port } = await database(t);
    const created = await notes.createPendingLocalNote(port, 1, payload('V1 正文'));
    const { note: edited } = await notes.updatePendingLocalNote(port, 1, created.note, payload('V2 正文'));
    const list = await revisions.listNoteRevisions(port, 1, edited.id);
    const v1 = list.find((row) => row.content === 'V1 正文');

    const restored = await notes.restoreLocalNoteToRevision(port, 1, edited.id, v1.revision_id);
    assert.equal(restored.content, 'V1 正文');
    assert.equal(restored.sync_status, 'pending');
    assert.equal(restored.sync_operation, 'create');

    const after = await revisions.listNoteRevisions(port, 1, edited.id);
    assert.equal(after.length, 3);
    assert.equal(after[0].origin, 'restore');
    assert.equal(after[0].parent_revision_id, edited.current_revision_id);
    const v1After = after.find((row) => row.revision_id === v1.revision_id);
    assert.equal(v1After.content, 'V1 正文');
    assert.equal(v1After.origin, 'local-save');
    assert.equal(restored.current_revision_id, after[0].revision_id);

    await assert.rejects(notes.restoreLocalNoteToRevision(port, 1, edited.id, after[0].revision_id),
        /已是当前内容/);
});

test('stale base revision blocks draft save without deleting the draft', async (t) => {
    const { port } = await database(t);
    const created = await notes.createPendingLocalNote(port, 1, payload('基线'));
    const key = 'note:' + created.note.id;
    const commit = { key, sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, 'a', created.note.id,
        drafts.noteDraftValue(created.note), created.note.current_revision_id);
    await drafts.writeNoteDraft(port, 1, commit, { title: '标题', content: '草稿正文', categoryId: 3 });

    // 另一通道先保存出 V2，草稿基础版本过期。
    await notes.updatePendingLocalNote(port, 1, created.note, payload('他处改动'));
    await assert.rejects(notes.updatePendingLocalNote(
        port, 1, created.note, payload('草稿正文'), commit), /发生变化/);
    assert.equal((await drafts.readNoteDraft(port, 1, key)).content, '草稿正文');
    assert.equal((await revisions.listNoteRevisions(port, 1, created.note.id)).length, 2);
});

test('explicit conflict confirmation rebases only the active draft before saving', async (t) => {
    const { port } = await database(t);
    const created = await notes.createPendingLocalNote(port, 1, payload('基线'));
    const key = 'note:' + created.note.id;
    const commit = { key, sessionId: 'active', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, 'active', created.note.id,
        drafts.noteDraftValue(created.note), created.note.current_revision_id);
    await drafts.writeNoteDraft(port, 1, commit, { title: '标题', content: '本地草稿', categoryId: 3 });

    const elsewhere = await notes.updatePendingLocalNote(port, 1, created.note, payload('他处改动'));
    await drafts.rebaseNoteDraft(port, 1, commit, elsewhere.note);
    const saved = await notes.updatePendingLocalNote(
        port, 1, elsewhere.note, payload('本地草稿'), commit);

    assert.equal(saved.note.content, '本地草稿');
    assert.equal((await revisions.listNoteRevisions(port, 1, created.note.id)).length, 3);
    assert.equal((await drafts.readNoteDraft(port, 1, key)).base_revision_id,
        saved.note.current_revision_id);
});

test('removing a note deletes its revisions', async (t) => {
    const { port } = await database(t);
    const { note } = await notes.createPendingLocalNote(port, 1, payload('待删除'));
    await notes.updatePendingLocalNote(port, 1, note, payload('第二版'));
    assert.ok((await revisions.listNoteRevisions(port, 1, note.id)).length === 2);
    await notes.removeLocalNote(port, 1, note.id);
    assert.equal(await notes.getLocalNoteByClientId(port, 1, note.id), null);
    assert.equal((await revisions.listNoteRevisions(port, 1, note.id)).length, 0);
});

test('revisions are isolated per account', async (t) => {
    const { port } = await database(t);
    const first = await notes.createPendingLocalNote(port, 1, payload('账户一'));
    const second = await notes.createPendingLocalNote(port, 2, payload('账户二'));
    assert.equal((await revisions.listNoteRevisions(port, 1, first.note.id)).length, 1);
    assert.equal((await revisions.listNoteRevisions(port, 2, second.note.id)).length, 1);
    assert.equal((await revisions.listNoteRevisions(port, 2, first.note.id)).length, 0);
    assert.equal(
        await revisions.getNoteRevisionById(port, 2, first.note.current_revision_id),
        null,
    );
});


test('manual upload blocks uncertain creates and in-flight notes', async t => {
    const { port } = await database(t);
    const result = await saves.saveNewNoteLocalFirst(port, 1, payload('keep'));
    assert.equal(result.cloudState, 'queued');
    const attempted = await saves.uploadNoteNow(port, 1, result.note.id);
    assert.equal(attempted.cloudState, 'unknown');
    const before = createCalls;
    await assert.rejects(saves.uploadNoteNow(port, 1, result.note.id), /结果未知/);
    assert.equal(createCalls, before);
    await notes.markLocalNoteSyncing(port, 1, result.note.id);
    await assert.rejects(saves.uploadNoteNow(port, 1, result.note.id), /正在同步/);
    await assert.rejects(saves.uploadNoteNow(port, 2, result.note.id), /不存在/);
    assert.equal(createCalls, before);
});

test('manual upload sends synced notes without creating a revision', async t => {
    const { port } = await database(t);
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(91, 'latest')]);
    const before = updateCalls;
    const result = await saves.uploadNoteNow(port, 1, note.id);
    assert.equal(updateCalls, before + 1);
    assert.equal(result.note.current_revision_id, note.current_revision_id);
    assert.equal(result.cloudState, 'unknown');
    assert.equal(result.note.content, 'latest');
});
