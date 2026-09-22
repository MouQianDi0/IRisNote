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
const { addServerUpdatedAt } = require('../../src/core/database/migrations/0006-add-server-updated-at.ts');
const apiPath = require.resolve('../../src/features/notes/api/notes.api.ts');
let createCalls = 0;
let updateCalls = 0;
const api = {
    createNote: async () => { createCalls++; throw new Error('test network unavailable'); },
    updateNote: async () => { updateCalls++; throw new Error('test network unavailable'); },
    normalizeConflictNote: (value, id) => {
        assert.equal(value.id, id);
        return { ...value, server_id: id };
    },
};
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: api };
const saves = require('../../src/features/notes/services/note-save.service.ts');
const cloudPolicy = require('../../src/core/cloud-storage/cloud-storage-policy.ts');
function authorizeCloud(t, owner = 1) {
    cloudPolicy.setCloudStorageSession(owner, true, true);
    t.after(() => cloudPolicy.setCloudStorageSession(null, false, false));
}
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

const timedServerNote = (id, content, time) => ({ ...serverNote(id, content), updated_at: time });
const time1 = '2099-01-01T00:00:00.000Z';
const time2 = '2099-01-01T00:00:01.000Z';
const time3 = '2099-01-01T00:00:02.000Z';

test('edit time increases despite clock rollback; unchanged save and flags preserve it', async t => {
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [timedServerNote(101, 'V1', time1)]);
    const { note: edited } = await notes.updatePendingLocalNote(port, 1, original, payload('V2'));
    assert.ok(Date.parse(edited.updated_at) > Date.parse(time1));
    const { note: same } = await notes.updatePendingLocalNote(port, 1, edited, payload('V2'));
    assert.equal(same.updated_at, edited.updated_at);
    const { note: starred } = await notes.updatePendingLocalNote(port, 1, same, { is_starred: true });
    assert.equal(starred.updated_at, edited.updated_at);
    assert.equal(starred.server_updated_at, time1);
});

test('newer local edit survives old server data and upload retry uses the original edit time', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [timedServerNote(102, 'V1', time1)]);
    const { note: edited } = await notes.updatePendingLocalNote(port, 1, original, payload('V2'));
    await notes.reconcileServerNotes(port, 1, [timedServerNote(102, 'V1', time1)]);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 102)).content, 'V2');
    const uploads = [];
    t.mock.method(api, 'updateNote', async (id, body) => {
        uploads.push(body.updated_at);
        if (uploads.length === 1) throw new Error('offline');
        return timedServerNote(id, body.content, body.updated_at);
    });
    await saves.uploadNoteNow(port, 1, 102);
    await saves.uploadNoteNow(port, 1, 102);
    assert.deepEqual(uploads, [edited.updated_at, edited.updated_at]);
    const accepted = await notes.getLocalNoteByClientId(port, 1, 102);
    assert.equal(accepted.updated_at, edited.updated_at);
    assert.equal(accepted.local_updated_at, edited.updated_at);
    assert.equal(accepted.server_updated_at, edited.updated_at);
});

test('server-newer reconciliation preserves local revision history and remote edit time', async t => {
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [timedServerNote(103, 'V1', time1)]);
    await notes.updatePendingLocalNote(port, 1, original, payload('V2 local'));
    await notes.reconcileServerNotes(port, 1, [timedServerNote(103, 'V3 remote', time2)]);
    const current = await notes.getLocalNoteByClientId(port, 1, 103);
    assert.equal(current.content, 'V3 remote');
    assert.equal(current.updated_at, time2);
    assert.equal(current.local_updated_at, time2);
    assert.equal(current.sync_status, 'synced');
    assert.ok((await revisions.listNoteRevisions(port, 1, 103)).some(row => row.content === 'V2 local'));
    await notes.reconcileServerNotes(port, 1, [timedServerNote(103, 'V1', time1)]);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 103)).content, 'V3 remote');
    assert.equal((await listUploadTasks(port, 1)).length, 1);
});

test('equal timestamps with different text block overwrite; NULL remote cannot replace pending text', async t => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [timedServerNote(104, 'local', time1)]);
    await notes.reconcileServerNotes(port, 1, [timedServerNote(104, 'different', time1)]);
    let current = await notes.getLocalNoteByClientId(port, 1, 104);
    assert.equal(current.content, 'local');
    assert.equal(current.sync_status, 'rejected');
    await notes.reconcileServerNotes(port, 1, [serverNote(104, 'unknown-time')]);
    current = await notes.getLocalNoteByClientId(port, 1, 104);
    assert.equal(current.content, 'local');
    assert.equal(current.updated_at, time1);
});

test('legacy synced NULL time is unknown and first server timestamp establishes the baseline', async t => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [serverNote(105, 'old')]);
    await port.run("UPDATE local_notes SET local_updated_at = ? WHERE client_id = 105", [time3]);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 105)).updated_at, null);
    await notes.reconcileServerNotes(port, 1, [timedServerNote(105, 'remote', time1)]);
    const current = await notes.getLocalNoteByClientId(port, 1, 105);
    assert.equal(current.content, 'remote');
    assert.equal(current.updated_at, time1);
});

test('old success response preserves newer local edit timestamp and requests another upload', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [timedServerNote(106, 'V1', time1)]);
    const { note: uploading } = await notes.updatePendingLocalNote(port, 1, original, payload('V2'));
    let newer;
    t.mock.method(api, 'updateNote', async (id, body) => {
        newer = (await notes.updatePendingLocalNote(port, 1, uploading, payload('V3'))).note;
        return timedServerNote(id, body.content, body.updated_at);
    });
    const result = await saves.uploadNoteNow(port, 1, 106);
    assert.equal(result.cloudState, 'queued');
    assert.equal(result.retryable, true);
    assert.equal(result.note.content, 'V3');
    assert.equal(result.note.updated_at, newer.updated_at);
    assert.equal(result.note.server_updated_at, time1);
});

test('409 newer snapshot reconciles only its note, preserving unrelated notes', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [
        timedServerNote(107, 'V1', time1), timedServerNote(108, 'other', time1),
    ]);
    await notes.updatePendingLocalNote(port, 1, original, payload('local'));
    t.mock.method(api, 'updateNote', async () => {
        throw { isAxiosError: true, response: { status: 409, data: {
            code: 'NOTE_EDIT_CONFLICT', note: timedServerNote(107, 'newest remote', time2),
        } } };
    });
    const result = await saves.uploadNoteNow(port, 1, 107);
    assert.equal(result.cloudState, 'accepted');
    assert.equal(result.note.content, 'newest remote');
    assert.equal(result.note.updated_at, time2);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 108)).content, 'other');
});

test('409 response cannot overwrite an edit committed while the request was in flight', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const [original] = await notes.reconcileServerNotes(port, 1, [timedServerNote(109, 'V1', time1)]);
    const { note: uploading } = await notes.updatePendingLocalNote(port, 1, original, payload('V2'));
    t.mock.method(api, 'updateNote', async () => {
        await notes.updatePendingLocalNote(port, 1, uploading, payload('V3 local'));
        throw { isAxiosError: true, response: { status: 409, data: {
            code: 'NOTE_EDIT_CONFLICT', note: timedServerNote(109, 'V4 remote', time3),
        } } };
    });
    const result = await saves.uploadNoteNow(port, 1, 109);
    assert.equal(result.cloudState, 'queued');
    assert.equal(result.note.content, 'V3 local');
    assert.equal(result.note.sync_status, 'pending');
});

test('timestamp-only and flag-only remote updates do not create content revisions', async t => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [timedServerNote(110, 'V1', time1)]);
    await notes.reconcileServerNotes(port, 1, [{ ...timedServerNote(110, 'V1', time1), is_starred: true }]);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 110)).updated_at, time1);
    await notes.reconcileServerNotes(port, 1, [{ ...timedServerNote(110, 'V1', time2), is_starred: true }]);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, 110)).updated_at, time2);
    assert.equal((await revisions.listNoteRevisions(port, 1, 110)).length, 1);
});

test('new upload carries the saved creation time and legacy manual upload explicitly sends unknown time', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const { note: created } = await notes.createPendingLocalNote(port, 1, payload('created'));
    t.mock.method(api, 'createNote', async body => {
        assert.equal(body.updated_at, created.updated_at);
        return timedServerNote(111, body.content, body.updated_at);
    });
    const uploaded = await saves.uploadNoteNow(port, 1, created.id);
    assert.equal(uploaded.note.updated_at, created.updated_at);
    await notes.reconcileServerNotes(port, 1, [
        timedServerNote(111, 'created', created.updated_at), serverNote(112, 'legacy'),
    ]);
    t.mock.method(api, 'updateNote', async (id, body) => {
        assert.equal(body.updated_at, null);
        return serverNote(id, body.content);
    });
    const legacy = await saves.uploadNoteNow(port, 1, 112);
    assert.equal(legacy.note.updated_at, null);
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
    await addServerUpdatedAt.up(migrationPort);
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
    authorizeCloud(t);
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

test('reconcile without ordering fields preserves local order and timestamp', async (t) => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [serverNote(51, '正文')]);
    // 本地置顶排序与编辑时间（服务端接口不下发这三个值的现状）。
    await port.run(
        `UPDATE local_notes SET is_pinned = 1, pinned_order = 7, local_order = 2,
            local_updated_at = '2026-09-16T10:00:00.000Z'
         WHERE server_id = 51`);

    await notes.reconcileServerNotes(port, 1, [
        { ...serverNote(51, '正文'), is_pinned: true },
    ]);

    const row = await port.getFirst(
        `SELECT pinned_order, local_order, local_updated_at FROM local_notes WHERE server_id = 51`);
    assert.equal(row.pinned_order, 7);
    assert.equal(row.local_order, 2);
    assert.equal(row.local_updated_at, '2026-09-16T10:00:00.000Z');
});

test('reconcile applies flag changes without changing edit time', async (t) => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [serverNote(52, '正文')]);
    await port.run(
        `UPDATE local_notes SET local_updated_at = '2026-09-16T10:00:00.000Z' WHERE server_id = 52`);

    await notes.reconcileServerNotes(port, 1, [
        { ...serverNote(52, '正文'), is_starred: true },
    ]);

    const row = await port.getFirst(
        `SELECT is_starred, local_updated_at FROM local_notes WHERE server_id = 52`);
    assert.equal(row.is_starred, 1);
    assert.equal(row.local_updated_at, '2026-09-16T10:00:00.000Z');
});

test('reconcile adopts server ordering fields when provided', async (t) => {
    const { port } = await database(t);
    await notes.reconcileServerNotes(port, 1, [serverNote(53, '正文')]);

    await notes.reconcileServerNotes(port, 1, [
        { ...serverNote(53, '正文'), local_order: 9, pinned_order: 4 },
    ]);

    const row = await port.getFirst(
        `SELECT local_order, pinned_order FROM local_notes WHERE server_id = 53`);
    assert.equal(row.local_order, 9);
    assert.equal(row.pinned_order, 4);
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
    authorizeCloud(t);
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
    await assert.rejects(saves.uploadNoteNow(port, 2, result.note.id), /需要开启云存储/);
    cloudPolicy.setCloudStorageSession(2, true, true);
    await assert.rejects(saves.uploadNoteNow(port, 2, result.note.id), /不存在/);
    assert.equal(createCalls, before);
});

test('manual upload sends synced notes without creating a revision', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const [note] = await notes.reconcileServerNotes(port, 1, [serverNote(91, 'latest')]);
    const before = updateCalls;
    const result = await saves.uploadNoteNow(port, 1, note.id);
    assert.equal(updateCalls, before + 1);
    assert.equal(result.note.current_revision_id, note.current_revision_id);
    assert.equal(result.cloudState, 'unknown');
    assert.equal(result.note.content, 'latest');
});

test('consent is not required to retain a local save and its queue, but manual upload is denied', async t => {
    cloudPolicy.setCloudStorageSession(1, true, false);
    t.after(() => cloudPolicy.setCloudStorageSession(null, false, false));
    const { port } = await database(t);
    let requests = 0;
    t.mock.method(api, 'createNote', async () => { requests++; throw new Error('must not send'); });
    const saved = await saves.saveNewNoteLocalFirst(port, 1, payload('local without consent'));
    assert.equal(saved.localOnly, true);
    assert.equal(saved.cloudState, 'queued');
    assert.equal(saved.note.sync_status, 'pending');
    assert.equal((await listUploadTasks(port, 1)).length, 1);
    const edited = await saves.saveEditedNoteLocalFirst(port, 1, saved.note, { title: 'renamed locally' });
    assert.equal(edited.localOnly, true);
    assert.equal(edited.note.title, 'renamed locally');
    await assert.rejects(saves.queueNoteUploadNow(port, 1, saved.note.id), cloudPolicy.isCloudStoragePermissionError);
    await assert.rejects(saves.uploadNoteNow(port, 1, saved.note.id), cloudPolicy.isCloudStoragePermissionError);
    assert.equal(requests, 0);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, saved.note.id)).sync_status, 'pending');
});

test('permission rejected before dispatch leaves a pending create that can be uploaded after consent', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, payload('not dispatched'));
    let sent = 0;
    t.mock.method(api, 'createNote', async () => {
        cloudPolicy.setCloudStorageSession(1, true, false);
        throw new cloudPolicy.CloudStoragePermissionError('permission closed', false);
    });
    const paused = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(paused.cloudState, 'queued');
    assert.equal(paused.localOnly, true);
    assert.equal(paused.note.sync_status, 'pending');
    assert.equal(paused.note.last_sync_error, null);
    cloudPolicy.setCloudStorageSession(1, true, true);
    t.mock.method(api, 'createNote', async body => { sent++; return serverNote(901, body.content); });
    const accepted = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(accepted.cloudState, 'accepted');
    assert.equal(sent, 1);
});

test('consent revoked after request dispatch preserves uncertain create protection', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, payload('sent before revoke'));
    let requests = 0;
    t.mock.method(api, 'createNote', async () => {
        requests++;
        cloudPolicy.setCloudStorageSession(1, true, false);
        throw new cloudPolicy.CloudStoragePermissionError('permission closed after dispatch', true);
    });
    const uncertain = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(uncertain.cloudState, 'unknown');
    assert.equal(uncertain.note.content, 'sent before revoke');
    assert.equal(uncertain.note.sync_status, 'unknown');
    cloudPolicy.setCloudStorageSession(1, true, true);
    await assert.rejects(saves.uploadNoteNow(port, 1, saved.note.id), /结果未知/);
    assert.equal(requests, 1);
});

test('a successful response from a revoked session cannot mark a create synced', async t => {
    authorizeCloud(t);
    const { port } = await database(t);
    const saved = await saves.saveNewNoteLocalFirst(port, 1, payload('late response'));
    t.mock.method(api, 'createNote', async body => {
        cloudPolicy.setCloudStorageSession(1, true, false);
        return serverNote(902, body.content);
    });
    const result = await saves.uploadNoteNow(port, 1, saved.note.id);
    assert.equal(result.cloudState, 'unknown');
    assert.equal(result.note.server_id, null);
    assert.equal(result.note.content, 'late response');
    assert.equal((await listUploadTasks(port, 1)).length, 1);
});
