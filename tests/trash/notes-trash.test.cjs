const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(name, ...args) {
    return originalResolve.call(this, name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
}).outputText, filename);
const api = {};
const apiPath = require.resolve('../../src/features/notes/api/notes-trash.api.ts');
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: { notesTrashApi: api } };
const files = new Map();
const filesPath = require.resolve('../../src/features/notes/data/saved-draft-files.ts');
require.cache[filesPath] = { id: filesPath, filename: filesPath, loaded: true, exports: { savedDraftFiles: {
    keys: async () => [...files.keys()], read: async (_owner, key) => files.get(key) ?? null,
    remove: async (_owner, key) => files.delete(key), write: async (_owner, key, value) => files.set(key, value),
} } };
const notes = require('../../src/features/notes/data/note-local.repository.ts');
const trash = require('../../src/features/notes/data/note-trash.repository.ts');
const service = require('../../src/features/notes/services/note-trash.service.ts');
const protocol = require('../../src/features/notes/api/notes-trash.types.ts');
const syncProtocol = require('../../src/features/notes/api/notes-sync.types.ts');
const drafts = require('../../src/features/notes/data/note-draft.repository.ts');
const newDrafts = require('../../src/features/notes/data/new-note-draft.repository.ts');
const sync = require('../../src/features/notes/data/note-sync.repository.ts');
const queue = require('../../src/features/sync/note-upload-queue.ts');
const policy = require('../../src/core/cloud-storage/cloud-storage-policy.ts');
const baseline = '2026-09-22T01:00:00.000Z';
const cloud = (id = 1, version = 1, owner = 1) => ({ id, user_id: owner, client_id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    version, title: 'cloud title', content: 'cloud body', category_id: null, created_at: baseline, updated_at: baseline,
    sync_updated_at: baseline, deleted_at: null, is_pinned: true, is_starred: true });
const deleted = (note = cloud(), at = new Date().toISOString()) => ({ ...note, version: note.version + 1,
    deleted_at: at, expires_at: new Date(Date.parse(at) + protocol.NOTE_TRASH_MS).toISOString() });
const page = (data = [], expired = []) => ({ data, expired, server_now: new Date().toISOString() });
const noop = () => {};
async function fixture(t) {
    const sql = new DatabaseSync(':memory:');
    t.after(() => { sql.close(); files.clear(); policy.setCloudStorageSession(null, false, false); });
    policy.setCloudStorageSession(1, true, true);
    const bindings = p => Array.isArray(p) ? p : [p];
    const db = {
        run: async (s, p = []) => { const r = sql.prepare(s).run(...bindings(p)); return { changes: r.changes, lastInsertRowId: r.lastInsertRowid }; },
        getFirst: async (s, p = []) => sql.prepare(s).get(...bindings(p)) ?? null,
        getAll: async (s, p = []) => sql.prepare(s).all(...bindings(p)),
    };
    let tail = Promise.resolve();
    db.transaction = work => {
        const next = tail.then(async () => { sql.exec('BEGIN IMMEDIATE'); try { const result = await work(db); sql.exec('COMMIT'); return result; }
            catch (error) { sql.exec('ROLLBACK'); throw error; } });
        tail = next.catch(noop); return next;
    };
    const migration = { execAsync: async s => sql.exec(s), runAsync: db.run, getAllAsync: db.getAll };
    for (const file of ['0002-create-local-notes','0003-create-note-drafts','0004-create-note-revisions','0005-create-upload-queue',
        '0006-add-server-updated-at','0010-add-note-sync-state','0011-create-system-preferences','0012-create-note-trash']) {
        await Object.values(require(`../../src/core/database/migrations/${file}.ts`))[0].up(migration);
    }
    for (const key of ['status','remove','restore','purge']) api[key] = async () => { throw Error(`unexpected API ${key}`); };
    api.list = async () => page();
    const seed = async (note = cloud()) => {
        await notes.reconcileServerNotes(db, note.user_id, [syncProtocol.cloudNoteToLocal(note)]);
        return (await notes.getLocalNotes(db, note.user_id))[0];
    };
    return { db, sql, seed };
}

test('local deletion archives content/history/drafts, hides file drafts, blocks stale editors, and restores the same identity', async t => {
    const { db, sql } = await fixture(t);
    const { note } = await notes.createPendingLocalNote(db, 1, { title: 'local', content: 'keep me' });
    await queue.enqueueNoteUpload(db, 1, note);
    const draft = await drafts.openNoteDraft(db, 1, 'new:test', 'session', note.id, { title: 'draft', content: 'unsaved', categoryId: null }, note.current_revision_id);
    files.set('new:test', JSON.stringify(draft));
    const beforeHistory = sql.prepare('SELECT * FROM note_revisions').all();
    await service.trashNote(db, 1, note.id);
    assert.equal((await notes.getLocalNotes(db, 1)).length, 0);
    assert.deepEqual(sql.prepare('SELECT * FROM note_revisions').all(), beforeHistory);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM upload_queue_tasks').get().n, 0);
    assert.equal((await newDrafts.listNewNoteDrafts(db, 1)).length, 0);
    await assert.rejects(newDrafts.resumeNewNoteDraft(db, 1, 'new:test', 'other'), /垃圾桶/);
    await assert.rejects(notes.updatePendingLocalNote(db, 1, note, { content: 'stale edit' }), /垃圾桶/);
    await assert.rejects(drafts.openNoteDraft(db, 1, 'note:old', 'old', note.id, { title:'x', content:'x', categoryId:null }), /垃圾桶/);
    await service.restoreTrashedNote(db, 1, note.id);
    const restored = await notes.getLocalNoteByClientId(db, 1, note.id);
    assert.equal(restored.content, 'keep me'); assert.equal(restored.id, note.id);
    assert.equal((await trash.listNoteTrash(db, 1)).length, 0);
    assert.equal((await drafts.readNoteDraft(db, 1, 'new:test')).content, 'unsaved');
    assert.equal(sql.prepare('SELECT count(*) AS n FROM upload_queue_tasks').get().n, 1);
});

test('server deletion and restoration preserve content, ordering, flags and stable local ID', async t => {
    const { db, seed } = await fixture(t); const note = await seed(); const receipt = deleted();
    api.status = async () => ({ state:'active', note:cloud() }); api.remove = async () => receipt;
    await service.trashNote(db, 1, note.id);
    assert.equal((await trash.listNoteTrash(db, 1))[0].version, 2);
    api.status = async () => ({ state:'deleted', note:receipt }); api.restore = async () => cloud(1, 3);
    await service.restoreTrashedNote(db, 1, note.id);
    const restored = await notes.getLocalNoteByClientId(db, 1, note.id);
    assert.equal(restored.id, note.id); assert.equal(restored.content, note.content);
    assert.equal(restored.is_pinned, true); assert.equal(restored.is_starred, true);
    assert.equal(restored.current_revision_id, note.current_revision_id);
});

test('cloud-only trash is available on another device and can restore without a previous local row', async t => {
    const { db } = await fixture(t); const receipt = deleted();
    api.list = async () => page([receipt]);
    await service.synchronizeNoteTrash(db, 1);
    assert.equal(trash.trashPreview((await trash.listNoteTrash(db, 1))[0]).content, 'cloud body');
    api.status = async () => ({ state:'deleted', note:receipt }); api.restore = async () => cloud(1, 3);
    await service.restoreTrashedNote(db, 1, 1);
    assert.equal((await notes.getLocalNotes(db, 1))[0].content, 'cloud body');
});

test('pending delete survives timeout and restore fences the still-in-flight request through a newer server version', async t => {
    const { db, seed } = await fixture(t); const note = await seed();
    api.status = async () => ({ state:'active', note:cloud() }); api.remove = async () => { throw Error('timeout'); };
    await assert.rejects(service.trashNote(db, 1, note.id), /timeout/);
    assert.equal((await trash.readTrash(db, 1, note.id)).state, 'deleting');
    const calls = [];
    api.remove = async (_owner, _id, _cloudId, version) => { calls.push(['delete',version]); return deleted(); };
    api.restore = async (_owner, receipt) => { calls.push(['restore',receipt.version]); return cloud(1, 3); };
    await service.restoreTrashedNote(db, 1, note.id);
    assert.deepEqual(calls, [['delete',1],['restore',2]]);
    assert.equal((await notes.getLocalNotes(db, 1)).length, 1);
});

test('15-day local expiry purges related content and files only, even without cloud consent', async t => {
    const { db, sql } = await fixture(t);
    const { note } = await notes.createPendingLocalNote(db, 1, { title:'local', content:'secret' });
    await notes.createPendingLocalNote(db, 2, { title:'other', content:'keep' });
    files.set('new:mine', JSON.stringify({ owner_user_id:1, note_id:note.id, content:'secret' }));
    files.set('new:other', JSON.stringify({ owner_user_id:2, note_id:note.id, content:'keep' }));
    await service.trashNote(db, 1, note.id);
    sql.prepare("UPDATE note_trash SET deleted_at=?,expires_at=? WHERE owner_user_id=1").run('2020-01-01T00:00:00.000Z','2020-01-16T00:00:00.000Z');
    policy.setCloudStorageSession(1, false, true);
    await assert.rejects(service.restoreTrashedNote(db, 1, note.id), /15 天/);
    await service.synchronizeNoteTrash(db, 1);
    assert.equal((await trash.listNoteTrash(db, 1)).length, 0);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM note_revisions WHERE owner_user_id=1').get().n, 0);
    assert.equal(files.has('new:mine'), false); assert.equal(files.has('new:other'), true);
    assert.equal((await notes.getLocalNotes(db, 2))[0].content, 'keep');
});

test('failed cloud purge retains a durable task and full content; acknowledgment clears it and invalidates all staged pages', async t => {
    const { db, sql, seed } = await fixture(t); const note = await seed();
    const receipt = deleted(cloud(), '2020-01-01T00:00:00.000Z');
    api.status = async () => ({ state:'active', note:cloud() }); api.remove = async () => receipt;
    await service.trashNote(db, 1, note.id);
    api.list = async () => page([], [protocol.parseDeletion(receipt)]); api.purge = async () => { throw Error('offline'); };
    await service.synchronizeNoteTrash(db, 1);
    assert.equal(trash.trashPreview(await trash.readTrash(db, 1, note.id)).content, note.content);
    sql.prepare('INSERT INTO note_sync_snapshot VALUES(?,?,?,?,?)').run(1, 50, cloud(50).client_id, 1, JSON.stringify(cloud(50)));
    api.purge = async r => r;
    await service.synchronizeNoteTrash(db, 1);
    assert.equal((await trash.listNoteTrash(db, 1)).length, 0);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM note_sync_snapshot WHERE owner_user_id=1').get().n, 0);
});

test('remote deletion preserves newer local edits and drafts; a higher-version restore queues the preserved edit', async t => {
    const { db, sql, seed } = await fixture(t); const note = await seed();
    await notes.updatePendingLocalNote(db, 1, note, { content:'new local body' });
    await drafts.openNoteDraft(db, 1, 'note:1', 's', 1, {title:'draft', content:'unsaved', categoryId:null});
    sql.prepare('INSERT INTO note_sync_state(owner_user_id,changes_cursor) VALUES(1,?)').run('a');
    const dead = deleted();
    await sync.applyChanges(db, 1, 'a', { data:[{...dead, operation:'delete', change_seq:'2'}], page:{next_cursor:'b',has_more:false} }, noop);
    await sync.projectMirror(db, 1, noop);
    assert.equal((await notes.getLocalNotes(db, 1)).length, 0);
    assert.equal(trash.trashPreview(await trash.readTrash(db,1,1)).content, 'new local body');
    await sync.applyChanges(db, 1, 'b', {data:[{operation:'upsert',change_seq:'3',data:cloud(1,3)}],page:{next_cursor:'c',has_more:false}}, noop);
    await sync.projectMirror(db, 1, noop);
    assert.equal((await notes.getLocalNotes(db,1))[0].content, 'new local body');
    assert.equal((await notes.getLocalNotes(db,1))[0].sync_status, 'pending');
    assert.equal((await drafts.readNoteDraft(db,1,'note:1')).content, 'unsaved');
    assert.equal(sql.prepare('SELECT count(*) AS n FROM upload_queue_tasks').get().n,1);
});

test('a late response after account switch cannot archive or restore either account', async t => {
    const { db, seed } = await fixture(t); const note = await seed();
    api.status = async () => { policy.setCloudStorageSession(2,true,true); return {state:'active',note:cloud()}; };
    await assert.rejects(service.trashNote(db,1,note.id));
    assert.equal((await notes.getLocalNotes(db,1)).length,1); assert.equal((await trash.listNoteTrash(db,1)).length,0);
});

test('running uploads cannot be trashed and archive failure rolls back note/draft removal', async t => {
    const {db,sql} = await fixture(t); const {note} = await notes.createPendingLocalNote(db,1,{title:'x',content:'keep'});
    sql.prepare("UPDATE local_notes SET sync_status='syncing'").run();
    await assert.rejects(service.trashNote(db,1,note.id),/上传/);
    sql.prepare("UPDATE local_notes SET sync_status='pending'").run();
    sql.exec("CREATE TRIGGER fail_archive BEFORE DELETE ON local_notes BEGIN SELECT RAISE(ABORT,'archive failure'); END");
    await assert.rejects(service.trashNote(db,1,note.id),/archive failure/);
    assert.equal((await notes.getLocalNotes(db,1))[0].content,'keep'); assert.equal((await trash.listNoteTrash(db,1)).length,0);
});

test('trash parser rejects ownership, duplicate IDs and inconsistent expiry; countdown covers the exact deadline', () => {
    const note=deleted(); assert.equal(protocol.parseTrashPage(page([note]),1).data[0].id,1);
    assert.throws(()=>protocol.parseTrashPage(page([note,note]),1));
    assert.throws(()=>protocol.parseTrashPage(page([{...note,user_id:2}]),1));
    assert.throws(()=>protocol.parseDeletion({...note,expires_at:note.deleted_at}));
    const end=Date.parse(note.expires_at);
    assert.equal(protocol.remainingTrashTime(note.expires_at,end),'已到期，等待清理');
    assert.equal(protocol.remainingTrashTime(note.expires_at,end-1),'剩余 1 分钟');
});
