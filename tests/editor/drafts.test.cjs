// Node 24+: node --test tests/editor/drafts.test.cjs
// 只在本测试进程转译源码；SQLite 采用 Node 内置引擎，云端接口使用显式假实现。
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

const { NoteDraftSession } = require('../../src/features/notes/services/note-draft-session.ts');
const drafts = require('../../src/features/notes/data/note-draft.repository.ts');
const notes = require('../../src/features/notes/data/note-local.repository.ts');
const { createLocalNotes } = require('../../src/core/database/migrations/0002-create-local-notes.ts');
const { createNoteDrafts } = require('../../src/core/database/migrations/0003-create-note-drafts.ts');
const { createNoteRevisions } = require('../../src/core/database/migrations/0004-create-note-revisions.ts');
const apiPath = require.resolve('../../src/features/notes/api/notes.api.ts');
const api = { createNote: async () => { throw new Error('test network unavailable'); }, updateNote: async () => { throw new Error('test network unavailable'); } };
require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: api };
const saves = require('../../src/features/notes/services/note-save.service.ts');
const filesPath = require.resolve('../../src/features/notes/data/saved-draft-files.ts');
const fileMemory = new Map();
const savedDraftFiles = {
    async keys(owner) { return [...fileMemory.keys()].filter((key) => key.startsWith(owner + '/')).map((key) => key.slice(String(owner).length + 1)); },
    async read(owner, key) { return fileMemory.get(owner + '/' + key) ?? null; },
    async write(owner, key, text) { fileMemory.set(owner + '/' + key, text); },
    async remove(owner, key) { fileMemory.delete(owner + '/' + key); },
};
require.cache[filesPath] = { id: filesPath, filename: filesPath, loaded: true, exports: { savedDraftFiles } };
const newDrafts = require('../../src/features/notes/data/new-note-draft.repository.ts');
const { NewNoteDraftSession } = require('../../src/features/notes/services/new-note-draft-session.ts');

const value = (content, title = '标题') => ({ title, content, categoryId: 3 });
const payload = (content) => ({ title: '标题', content, category_id: 3 });
const settled = () => new Promise(setImmediate);

const blank = { title: '', content: '', categoryId: null };
function newSession(db, owner = 7) {
    return new NewNoteDraftSession(db, owner, blank, () => {});
}

test('new drafts separate automatic recovery, explicit files and accounts', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); const b = newSession(port);
    a.change(value('A')); b.change(value('B'));
    await a.flush(); await b.flush();
    assert.notEqual(a.key, b.key);
    assert.equal(fileMemory.size, 0);
    assert.equal((await newDrafts.listNewNoteDrafts(port, 7)).length, 2);
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 8), []);
    await a.saveDraft();
    assert.equal(fileMemory.size, 1);
    assert.equal(await drafts.readNoteDraft(port, 7, a.key), null);
    const list = await newDrafts.listNewNoteDrafts(port, 7);
    assert.equal(list.find((entry) => entry.key === a.key).kind, 'saved');
    assert.equal(list.find((entry) => entry.key === b.key).kind, 'recovery');
    await a.close(); await b.close();
});

test('explicit save updates one file; discarded edits preserve its earlier contents', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('first')); await a.saveDraft(); await a.close();
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    b.change(value('second')); await b.saveDraft(); await b.close();
    assert.equal(fileMemory.size, 1);
    const c = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    assert.equal(c.value.content, 'second');
    c.change(value('discard me')); await c.discard(); await c.close();
    assert.equal(await drafts.readNoteDraft(port, 7, a.key), null);
    assert.equal((await newDrafts.listNewNoteDrafts(port, 7))[0].row.content, 'second');
});

test('discard does not need a successful recovery write and cannot resurrect on close', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); await a.ready;
    const run = port.run.bind(port);
    t.mock.method(port, 'run', async (sql, bindings) => {
        if (sql.startsWith('UPDATE note_drafts SET title')) throw new Error('disk full');
        return run(sql, bindings);
    });
    a.change(value('not written'));
    await assert.rejects(a.flush(), /disk full/);
    await a.discard(); await a.close();
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
});

test('discard waits for an in-flight write before deleting', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); await a.ready;
    const run = port.run.bind(port);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let started;
    const writing = new Promise((resolve) => { started = resolve; });
    t.mock.method(port, 'run', async (sql, bindings) => {
        if (sql.startsWith('UPDATE note_drafts SET title')) { started(); await gate; }
        return run(sql, bindings);
    });
    a.change(value('in flight')); const flush = a.flush(); await writing;
    const discard = a.discard();
    assert.notEqual(await drafts.readNoteDraft(port, 7, a.key), null);
    release(); await flush; await discard; await a.close();
    assert.equal(await drafts.readNoteDraft(port, 7, a.key), null);
});

test('explicit file write failure leaves recovery and allows continued editing', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('first'));
    const mocked = t.mock.method(savedDraftFiles, 'write', async () => { throw new Error('file write failed'); });
    await assert.rejects(a.saveDraft(), /file write failed/);
    assert.equal((await drafts.readNoteDraft(port, 7, a.key)).content, 'first');
    mocked.mock.restore();
    a.change(value('still editing')); await a.saveDraft(); await a.close();
    assert.equal((await newDrafts.listNewNoteDrafts(port, 7))[0].row.content, 'still editing');
});

test('blank and whitespace-only new sessions are not recovery candidates', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change({ title: ' \n ', content: '\t ', categoryId: 3 });
    await a.flush();
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
    assert.equal(newDrafts.hasDraftContent({ ...blank, title: 'title only' }), true);
    await a.discard(); await a.close();
});

test('reading candidates does not take ownership; superseded session cannot save or delete', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('first')); await a.flush();
    await newDrafts.listNewNoteDrafts(port, 7);
    assert.equal((await drafts.readNoteDraft(port, 7, a.key)).session_id, a.sessionId);
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    await assert.rejects(a.saveDraft(), /会话已变化/);
    await assert.rejects(a.discard(), /会话已变化/);
    b.change(value('second')); await b.saveDraft(); await b.close(); await a.close();
});

test('formal save clears corresponding explicit file and recovery, preserving another draft', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    t.mock.method(api, 'createNote', async (body) => ({ id: 900, server_id: 900, ...body, user_id: 7, created_at: new Date().toISOString() }));
    const a = newSession(port); a.change(value('saved')); await a.saveDraft(); await a.close();
    const other = newSession(port); other.change(value('other')); await other.saveDraft(); await other.close();
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    const snapshot = await b.beginSave();
    const result = await saves.saveNewNoteLocalFirst(port, 7, payload('saved'), snapshot.commit);
    b.finish(); await b.close();
    assert.equal(result.cloudState, 'accepted');
    const list = await newDrafts.listNewNoteDrafts(port, 7);
    assert.deepEqual(list.map((entry) => entry.key), [other.key]);
});

test('file cleanup failure retains linked recovery and retry does not duplicate a synced note', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    let posts = 0;
    t.mock.method(api, 'createNote', async (body) => ({ id: 901 + posts++, server_id: 901, ...body, user_id: 7, created_at: new Date().toISOString() }));
    const a = newSession(port); a.change(value('saved')); await a.saveDraft(); await a.close();
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    const snap = await b.beginSave();
    const remove = t.mock.method(savedDraftFiles, 'remove', async () => { throw new Error('remove failed'); });
    const result = await saves.saveNewNoteLocalFirst(port, 7, payload('saved'), snap.commit);
    b.finish(); await b.close();
    assert.equal(result.cloudState, 'accepted');
    assert.equal((await drafts.readNoteDraft(port, 7, a.key)).note_id, result.note.id);
    assert.equal(result.draftCleanupPending, true);
    remove.mock.restore();
    const c = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    const retry = await c.beginSave();
    await saves.saveEditedNoteLocalFirst(port, 7, retry.target, payload('saved'), retry.commit);
    c.finish(); await c.close();
    assert.equal(posts, 1);
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
});

test('discard after local-only commit keeps saved file linked to same note', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    let posts = 0;
    t.mock.method(api, 'createNote', async () => { posts++; throw new Error('network lost'); });
    const a = newSession(port); a.change(value('original')); await a.saveDraft(); await a.close();
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    b.change(value('local commit')); const snap = await b.beginSave();
    const result = await saves.saveNewNoteLocalFirst(port, 7, payload('local commit'), snap.commit);
    b.finish(); await b.close();
    assert.equal(result.cloudState, 'unknown');
    const c = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    c.change(value('discarded changes')); await c.discard(); await c.close();
    const d = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    assert.equal(d.value.content, 'original');
    const retry = await d.beginSave();
    assert.equal(retry.target.id, result.note.id);
    await saves.saveEditedNoteLocalFirst(port, 7, retry.target, payload('original'), retry.commit);
    d.finish(); await d.close();
    assert.equal(posts, 1);
    assert.equal((await notes.getLocalNotes(port, 7)).length, 1);
});

test('an interrupted explicit file cannot hide its intact recovery copy', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('recover this')); await a.flush();
    await savedDraftFiles.write(7, a.key, '{partial');
    const list = await newDrafts.listNewNoteDrafts(port, 7);
    assert.equal(list[0].row.content, 'recover this');
    assert.equal(list[0].kind, 'recovery');
    await a.close();
});

async function database(t, filename = ':memory:') {
    const sql = new DatabaseSync(filename);
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
        runAsync: async (source, bindings = []) =>
            sql.prepare(source).run(...(Array.isArray(bindings) ? bindings : [bindings])),
        getAllAsync: async (source, bindings = []) =>
            sql.prepare(source).all(...(Array.isArray(bindings) ? bindings : [bindings])),
    };
    await createLocalNotes.up(migrationPort);
    await createNoteDrafts.up(migrationPort);
    await createNoteRevisions.up(migrationPort);
    return { port, sql, migrationPort };
}

test('draft logs confirm completed writes, classify failures and omit private content', async (t) => {
    const records = [];
    t.mock.method(console, 'info', (_prefix, record) => records.push(record));
    t.mock.method(console, 'warn', (_prefix, record) => records.push(record));
    const { port } = await database(t);
    await drafts.openNoteDraft(port, 7, 'new', 'log-session', null, value(''));
    const commit = { key: 'new', sessionId: 'log-session', sequence: 1 };
    let release;
    const delayed = { ...port, run: (...args) => new Promise((resolve, reject) => {
        release = () => port.run(...args).then(resolve, reject);
    }) };
    const writing = drafts.writeNoteDraft(delayed, 7, commit, value('PRIVATE_BODY', 'PRIVATE_TITLE'));
    assert.deepEqual(records.map(r => r.event), ['write_start']);
    await release(); await writing;
    assert.deepEqual(records.map(r => r.event), ['write_start', 'write_success']);
    assert.equal((await drafts.readNoteDraft(port, 7, 'new')).content, 'PRIVATE_BODY');
    await assert.rejects(drafts.writeNoteDraft(port, 7, commit, value('PRIVATE_BODY')));
    assert.equal(records.at(-1).reason, 'session_or_sequence_mismatch');
    const failure = new Error('PRIVATE_SQL_AND_PARAMETERS');
    await assert.rejects(drafts.writeNoteDraft({ run: async () => { throw failure; } }, 7,
        { ...commit, sequence: 2 }, value('PRIVATE_BODY')), error => error === failure);
    assert.equal(records.at(-1).reason, 'database_write_failed');
    assert.equal(records.filter(r => r.event === 'write_success').length, 1);
    for (const record of records) {
        assert.equal(record.table, 'note_drafts');
        assert.equal(record.sessionId, 'log-session');
        assert.ok(Number.isFinite(Date.parse(record.timestamp)));
        assert.ok(record.durationMs >= 0);
    }
    assert.doesNotMatch(JSON.stringify(records), /PRIVATE_/);
});

test('750ms trailing debounce persists exact whitespace and Unicode', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const writes = [];
    const session = new NoteDraftSession(value(''), 0, async (v, seq) => writes.push([v, seq]), () => {});
    session.change(value('a'));
    t.mock.timers.tick(700);
    session.change(value('  中文🙂\n '));
    t.mock.timers.tick(749);
    await settled(); assert.equal(writes.length, 0);
    t.mock.timers.tick(1); await settled();
    assert.deepEqual(writes, [[value('  中文🙂\n '), 2]]);
    await session.close();
});

test('continuous input flushes by 5 seconds, even without a pause', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const writes = [];
    const session = new NoteDraftSession(value(''), 0, async (v) => writes.push(v.content), () => {});
    for (let i = 0; i < 10; i++) { session.change(value(String(i))); t.mock.timers.tick(500); await settled(); }
    assert.deepEqual(writes, ['9']);
    await session.close();
});

test('in-flight writes serialize and coalesce to the newest input', async () => {
    let release;
    const gate = new Promise((done) => { release = done; });
    const writes = [];
    const session = new NoteDraftSession(value(''), 0, async (v) => {
        writes.push(v.content); if (writes.length === 1) await gate;
    }, () => {});
    session.change(value('first'));
    const flush = session.flush();
    session.change(value('middle'));
    session.change(value('last'));
    assert.deepEqual(writes, ['first']);
    release(); await flush;
    assert.deepEqual(writes, ['first', 'last']);
    assert.equal(session.dirty, false);
    await session.close();
});

test('failed writes retain dirty input and retry automatically', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let attempts = 0;
    const states = [];
    const session = new NoteDraftSession(value(''), 0, async () => {
        if (++attempts === 1) throw new Error('disk busy');
    }, (state) => states.push(state));
    session.change(value('recover me'));
    await assert.rejects(session.flush(), /disk busy/);
    assert.equal(session.dirty, true);
    t.mock.timers.tick(3000); await settled();
    assert.equal(attempts, 2); assert.equal(session.dirty, false);
    assert.ok(states.includes('error')); assert.equal(states.at(-1), 'saved');
    await session.close();
});

test('save flushes before locking snapshot; rapid duplicate save is rejected', async () => {
    const session = new NoteDraftSession(value(''), 0, async () => {}, () => {});
    session.change(value('submitted'));
    const result = await session.beginSave();
    session.change(value('must not sneak in'));
    assert.equal(result.value.content, 'submitted');
    assert.equal(session.value.content, 'submitted');
    await assert.rejects(session.beginSave());
    session.endSave(); session.change(value('new edit'));
    await session.close(); assert.equal(session.persistedSequence, 2);
});

test('leave failure is observable and does not report persisted content', async () => {
    const session = new NoteDraftSession(value(''), 0, async () => { throw new Error('full disk'); }, () => {});
    session.change(value('unsaved'));
    await assert.rejects(session.beginSave(), /full disk/);
    assert.equal(session.dirty, true);
    await assert.rejects(session.close(), /full disk/);
});

test('migration preserves v2 notes and is repeatable', async (t) => {
    const { port, migrationPort } = await database(t);
    const original = (await notes.createPendingLocalNote(port, 1, payload('existing'))).note;
    await createNoteDrafts.up(migrationPort);
    assert.equal((await notes.getLocalNoteByClientId(port, 1, original.id)).content, 'existing');
    assert.equal((await port.getAll('SELECT * FROM note_drafts')).length, 0);
});

test('account isolation, new drafts, title-only input and exact recovery', async (t) => {
    const { port } = await database(t);
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.openNoteDraft(port, 2, 'new', 'b', null, value(''));
    await drafts.writeNoteDraft(port, 1, { key: 'new', sessionId: 'a', sequence: 1 }, value('', '  标题🙂  '));
    const recovered = await drafts.openNoteDraft(port, 1, 'new', 'c', null, value(''));
    assert.equal(recovered.title, '  标题🙂  '); assert.equal(recovered.sequence, 1);
    assert.equal((await drafts.readNoteDraft(port, 2, 'new')).sequence, 0);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
});

test('stale sessions and out-of-order writes cannot overwrite or delete newer drafts', async (t) => {
    const { port } = await database(t);
    await drafts.openNoteDraft(port, 1, 'new', 'old', null, value(''));
    await drafts.writeNoteDraft(port, 1, { key: 'new', sessionId: 'old', sequence: 2 }, value('latest'));
    await assert.rejects(drafts.writeNoteDraft(port, 1, { key: 'new', sessionId: 'old', sequence: 1 }, value('stale')));
    await drafts.openNoteDraft(port, 1, 'new', 'new', null, value(''));
    await assert.rejects(drafts.writeNoteDraft(port, 1, { key: 'new', sessionId: 'old', sequence: 3 }, value('stale')));
    await assert.rejects(drafts.deleteNoteDraft(port, 1, { key: 'new', sessionId: 'old', sequence: 2 }));
    assert.equal((await drafts.readNoteDraft(port, 1, 'new')).content, 'latest');
});

test('create and draft association are atomic; recovery cannot create twice', async (t) => {
    const { port } = await database(t);
    const commit = { key: 'new', sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    const note = (await notes.createPendingLocalNote(port, 1, payload('draft'), commit)).note;
    assert.equal((await drafts.readNoteDraft(port, 1, 'new')).note_id, note.id);
    await assert.rejects(notes.createPendingLocalNote(port, 1, payload('duplicate'), commit));
    assert.equal((await notes.getLocalNotes(port, 1)).length, 1);
    const edited = await notes.updatePendingLocalNote(port, 1, note, payload('edit same note'), commit);
    assert.equal(edited.note.id, note.id);
});

test('association failure rolls back local creation and keeps the draft', async (t) => {
    const { port } = await database(t);
    const commit = { key: 'new', sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    const faulty = { ...port, transaction: (task) => port.transaction((tx) => task({ ...tx,
        run: (sql, params) => { if (sql.includes('SET note_id')) throw new Error('fault injection'); return tx.run(sql, params); },
    })) };
    await assert.rejects(notes.createPendingLocalNote(faulty, 1, payload('draft'), commit), /fault injection/);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 0);
    assert.equal((await drafts.readNoteDraft(port, 1, 'new')).note_id, null);
});

test('changed base content blocks save without deleting the draft', async (t) => {
    const { port } = await database(t);
    const original = (await notes.createPendingLocalNote(port, 1, payload('base'))).note;
    const key = 'note:' + original.id;
    const commit = { key, sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, key, 'a', original.id, drafts.noteDraftValue(original));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    await notes.updatePendingLocalNote(port, 1, original, payload('other edit'));
    await assert.rejects(notes.updatePendingLocalNote(port, 1, original, payload('draft'), commit), /发生变化/);
    assert.equal((await drafts.readNoteDraft(port, 1, key)).content, 'draft');
    assert.equal((await notes.getLocalNoteByClientId(port, 1, original.id)).content, 'other edit');
});

test('cloud unknown retains linked draft and retry does not issue a second POST', async (t) => {
    const { port } = await database(t);
    let posts = 0;
    api.createNote = async () => { posts++; throw new Error('network lost'); };
    const commit = { key: 'new', sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    const saved = await saves.saveNewNoteLocalFirst(port, 1, payload('draft'), commit);
    assert.equal(saved.cloudState, 'unknown');
    assert.equal((await drafts.readNoteDraft(port, 1, 'new')).note_id, saved.note.id);
    const retried = await saves.saveEditedNoteLocalFirst(port, 1, saved.note, payload('retry'), commit);
    assert.equal(retried.cloudState, 'unknown'); assert.equal(posts, 1);
    assert.equal((await notes.getLocalNotes(port, 1)).length, 1);
});

test('accepted cloud save clears only its own submitted draft', async (t) => {
    const { port } = await database(t);
    api.createNote = async (body) => ({ id: 99, server_id: 99, ...body, user_id: 1, created_at: new Date().toISOString() });
    const commit = { key: 'new', sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    const result = await saves.saveNewNoteLocalFirst(port, 1, payload('draft'), commit);
    assert.equal(result.cloudState, 'accepted');
    assert.equal(await drafts.readNoteDraft(port, 1, 'new'), null);
});

test('new session opened during upload survives old save cleanup', async (t) => {
    const { port } = await database(t);
    api.createNote = async (body) => {
        await drafts.openNoteDraft(port, 1, 'new', 'b', null, value(''));
        await drafts.writeNoteDraft(port, 1, { key: 'new', sessionId: 'b', sequence: 2 }, value('newer draft'));
        return { id: 100, server_id: 100, ...body, user_id: 1, created_at: new Date().toISOString() };
    };
    const commit = { key: 'new', sessionId: 'a', sequence: 1 };
    await drafts.openNoteDraft(port, 1, 'new', 'a', null, value(''));
    await drafts.writeNoteDraft(port, 1, commit, value('draft'));
    await saves.saveNewNoteLocalFirst(port, 1, payload('draft'), commit);
    assert.equal((await drafts.readNoteDraft(port, 1, 'new')).content, 'newer draft');
});

test('draft survives a real SQLite close and reopen', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'irisnote-draft-test-'));
    const filename = path.join(directory, 'drafts.db');
    // 每个连接的 close 由子测试钩子完成，然后清理本测试创建的单文件。
    t.after(() => { fs.unlinkSync(filename); fs.rmdirSync(directory); });
    await t.test('write', async (child) => {
        const { port } = await database(child, filename);
        await drafts.openNoteDraft(port, 7, 'new', 'before', null, value(''));
        await drafts.writeNoteDraft(port, 7, { key: 'new', sessionId: 'before', sequence: 1 }, value('重启恢复🙂\n' + '字'.repeat(30000)));
    });
    await t.test('recover', async (child) => {
        const { port } = await database(child, filename);
        const row = await drafts.openNoteDraft(port, 7, 'new', 'after', null, value(''));
        assert.equal(row.content, '重启恢复🙂\n' + '字'.repeat(30000));
        assert.equal(row.sequence, 1);
    });
});


test('draft box deletes saved, recovery and dual copies without resurrecting or crossing accounts', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('saved')); await a.saveDraft(); await a.close();
    const b = newSession(port); b.change(value('recovery')); await b.flush(); await b.close();
    const c = newSession(port); c.change(value('dual')); await c.saveDraft(); await c.close();
    const resumed = await NewNoteDraftSession.resume(port, 7, c.key, () => {});
    await resumed.close();
    const foreign = newSession(port, 8); foreign.change(value('private')); await foreign.saveDraft(); await foreign.close();
    const list = await newDrafts.listNewNoteDrafts(port, 7);
    const result = await newDrafts.deleteNewNoteDrafts(port, 7, [...list, list[0]]);
    assert.equal(result.deleted.length, 3); assert.deepEqual(result.failed, []);
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
    assert.equal((await newDrafts.listNewNoteDrafts(port, 8)).length, 1);
    const foreignEntry = (await newDrafts.listNewNoteDrafts(port, 8))[0];
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, [foreignEntry])).failed.length, 1);
    assert.notEqual(await savedDraftFiles.read(8, foreign.key), null);
});

test('draft box rejects stale recovery and saved snapshots and invalid keys', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('first')); await a.flush();
    const old = await newDrafts.listNewNoteDrafts(port, 7);
    a.change(value('newer')); await a.flush();
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, old)).failed.length, 1);
    await a.saveDraft(); await a.close();
    const saved = await newDrafts.listNewNoteDrafts(port, 7);
    const b = await NewNoteDraftSession.resume(port, 7, a.key, () => {});
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, saved)).failed.length, 1);
    b.change(value('latest')); await b.saveDraft(); await b.close();
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, saved)).failed.length, 1);
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, [{ ...saved[0], key: 'note:1' }])).failed.length, 1);
    assert.equal((await newDrafts.listNewNoteDrafts(port, 7))[0].row.content, 'latest');
});

test('draft box reports partial failure and permits retry after file removal fails', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('fail')); await a.saveDraft(); await a.close();
    const b = newSession(port); b.change(value('ok')); await b.saveDraft(); await b.close();
    const remove = savedDraftFiles.remove.bind(savedDraftFiles);
    const mock = t.mock.method(savedDraftFiles, 'remove', async (owner, key) => {
        if (key === a.key) throw new Error('file denied');
        return remove(owner, key);
    });
    const result = await newDrafts.deleteNewNoteDrafts(port, 7, await newDrafts.listNewNoteDrafts(port, 7));
    assert.deepEqual(result.deleted, [b.key]); assert.equal(result.failed[0].key, a.key);
    assert.equal((await drafts.readNoteDraft(port, 7, a.key)).content, 'fail');
    mock.mock.restore();
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, await newDrafts.listNewNoteDrafts(port, 7))).deleted.length, 1);
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
});

test('draft box retains durable recovery after file deletion followed by database failure', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('survive')); await a.saveDraft(); await a.close();
    const run = port.run.bind(port);
    const mock = t.mock.method(port, 'run', async (sql, bindings) => {
        if (sql.startsWith('DELETE FROM note_drafts')) throw new Error('database failed');
        return run(sql, bindings);
    });
    const result = await newDrafts.deleteNewNoteDrafts(port, 7, await newDrafts.listNewNoteDrafts(port, 7));
    assert.equal(result.failed.length, 1);
    assert.equal(await savedDraftFiles.read(7, a.key), null);
    assert.equal((await newDrafts.listNewNoteDrafts(port, 7))[0].row.content, 'survive');
    mock.mock.restore();
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, await newDrafts.listNewNoteDrafts(port, 7))).deleted.length, 1);
});

test('draft box deletion preserves a linked formal note and rejects later writes', async (t) => {
    fileMemory.clear();
    const { port } = await database(t);
    const a = newSession(port); a.change(value('formal')); const snap = await a.beginSave();
    const saved = await saves.saveNewNoteLocalFirst(port, 7, payload('formal'), snap.commit);
    a.finish(); await a.close();
    assert.equal((await newDrafts.deleteNewNoteDrafts(port, 7, await newDrafts.listNewNoteDrafts(port, 7))).deleted.length, 1);
    assert.equal((await notes.getLocalNotes(port, 7))[0].id, saved.note.id);
    await assert.rejects(drafts.writeNoteDraft(port, 7, { ...snap.commit, sequence: snap.commit.sequence + 1 }, value('late')));
    assert.deepEqual(await newDrafts.listNewNoteDrafts(port, 7), []);
});
