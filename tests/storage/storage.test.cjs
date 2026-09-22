const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require(name) {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw Error(`Unexpected dependency: ${name}`);
  }, console, setTimeout, Date, Map, Set }, { filename: file });
  return exports;
}
const policy = load('src/core/storage/storage-policy.ts');
test('notes remain opt-in on every new selection, including after a previous selection was changed', () => {
  const first = policy.defaultCleanupSelection();
  assert.equal(first.notes, false);
  assert.equal(first.updates, true);
  assert.equal(first.shares, true);
  first.notes = true;
  assert.equal(policy.defaultCleanupSelection().notes, false);
});
test('update whitelist rejects malformed names, future builds, unsafe integers and invalid installed versions', () => {
  for (const name of ['irisnote-release-1.apk', 'irisnote-release-12.hdiff']) assert.equal(policy.installedUpdateFile(name, '12'), true);
  for (const name of ['irisnote-release-13.apk', 'irisnote-release-01.apk', 'irisnote-release-12.apk\n', '../irisnote-release-1.apk', 'photo.apk', 'irisnote-release-9007199254740993.apk']) assert.equal(policy.installedUpdateFile(name, '12'), false);
  for (const version of [null, '', '0', '01', '12\n', '9007199254740993']) assert.equal(policy.installedUpdateFile('irisnote-release-1.apk', version), false);
});
test('share retention requires owned filenames, known dates and a full day since last use', () => {
  const now = Date.now();
  assert.equal(policy.expiredShareFile('share-abc-1.pdf', now - policy.SHARE_RETENTION_MS, now), true);
  for (const time of [null, NaN, 0, now, now + 1, now - policy.SHARE_RETENTION_MS + 1]) assert.equal(policy.expiredShareFile('share-abc-1.pdf', time, now), false);
  assert.equal(policy.expiredShareFile('my-note.pdf', now - 9e8, now), false);
});

function filesHarness({ databaseDirectory = 'file:///doc/SQLite/', failingDirectory = null } = {}) {
  const entries = new Map();
  const active = new Set();
  const failedDeletes = new Set();
  const old = Date.now() - 2 * policy.SHARE_RETENTION_MS;
  const state = { phase: 'idle', fileUri: null };
  function join(parts) {
    const value = parts.map(item => typeof item === 'string' ? item : item.uri).join('/');
    // Match native behavior: joining paths must not invent a missing URI scheme.
    return value.startsWith('file:///') ? 'file:///' + value.replace(/^file:\/+/, '').replace(/\/+/g, '/') : value.replace(/\/+/g, '/');
  }
  class Directory {
    constructor(...parts) { this.path = join(parts).replace(/\/$/, '') + '/'; }
    get uri() {
      if (!this.path.startsWith('file:///')) throw Error('URI is not absolute');
      if (this.path === failingDirectory) throw Error('Directory URI unavailable');
      return this.path;
    }
    get name() { return this.uri.replace(/\/$/, '').split('/').pop(); }
    get parentDirectory() { const trimmed = this.uri.replace(/\/$/, ''); return new Directory(trimmed.slice(0, trimmed.lastIndexOf('/')) + '/'); }
    get exists() { return [...entries.keys()].some(uri => uri.startsWith(this.uri)); }
    list() {
      const children = new Map();
      for (const uri of entries.keys()) {
        if (!uri.startsWith(this.uri)) continue;
        const relative = uri.slice(this.uri.length);
        const slash = relative.indexOf('/');
        if (slash < 0) children.set(uri, new File(uri));
        else { const name = this.uri + relative.slice(0, slash); children.set(name, new Directory(name)); }
      }
      return [...children.values()];
    }
    create() {}
    delete() { assert.equal(this.list().length, 0); }
  }
  class File {
    constructor(...parts) { this.uri = join(parts); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    get extension() { return '.' + this.name.split('.').pop(); }
    get parentDirectory() { return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
    get exists() { return entries.has(this.uri); }
    get size() { return entries.get(this.uri)?.size ?? 0; }
    get modificationTime() { return entries.get(this.uri)?.modified ?? null; }
    textSync() { return entries.get(this.uri).text; }
    write(text) { entries.set(this.uri, { size: text.length, modified: Date.now(), text }); }
    delete() { if (failedDeletes.has(this.uri)) throw Error('locked'); entries.delete(this.uri); }
  }
  const Paths = { document: new Directory('file:///doc/'), cache: new Directory('file:///cache/') };
  const shareDir = new Directory(Paths.cache, 'irisnote-shares');
  const add = (uri, size = 10, modified = old, text = '') => entries.set(new File(uri).uri, { size, modified, text });
  const shareApi = load('src/core/storage/share-cache.ts', { 'expo-file-system': { Directory, File, Paths } });
  const dependencies = {
    'expo-file-system': { Directory, File, Paths },
    'expo-sqlite': { defaultDatabaseDirectory: databaseDirectory },
    'expo-application': { nativeBuildVersion: '12' },
    'react-native': { Platform: { OS: 'android' } },
    '@/features/updates/update-store': { useUpdateStore: { getState: () => state }, updateSupported: () => true },
    './storage-policy': policy,
    './share-cache': { ...shareApi, isShareFileActive: uri => active.has(uri) || shareApi.isShareFileActive(uri) },
  };
  return { ...load('src/core/storage/storage-files.ts', dependencies), entries, active, state, failedDeletes, add, old, dependencies, File, shareDir };
}
test('scan deduplicates overlapping roots, counts protected files, and never clears data or unknown files', async () => {
  const h = filesHarness();
  h.add('file:///doc/SQLite/irisnote.db', 100);
  h.add('file:///doc/drafts/1/new.json', 20);
  h.add('file:///cache/irisnote-release-12.apk', 50);
  h.add('file:///cache/irisnote-release-13.apk', 60);
  h.add('file:///cache/unknown.txt', 30);
  h.add('file:///cache/irisnote-shares/share-old-1.pdf', 40);
  const scan = await h.scanStorageFiles();
  assert.equal(scan.totals.database, 100);
  assert.equal(scan.totals.drafts, 20);
  assert.equal(Object.values(scan.totals).reduce((a,b) => a+b, 0), 300);
  assert.equal(scan.cleanable.updates, 50);
  assert.equal(scan.cleanable.shares, 40);
  const cleared = await h.clearStorageFiles(scan, policy.defaultCleanupSelection(), () => {});
  assert.equal(cleared.released, 90);
  assert.equal(h.entries.size, 4);
  for (const file of ['file:///doc/SQLite/irisnote.db', 'file:///doc/drafts/1/new.json', 'file:///cache/unknown.txt', 'file:///cache/irisnote-release-13.apk']) assert.equal(new h.File(file).exists, true);
});
test('unchecked items, active update/share files, recently used shares and changed files are preserved', async () => {
  const h = filesHarness();
  const apk = 'file:///cache/irisnote-release-12.apk';
  const pdf = 'file:///cache/irisnote-shares/share-old-1.pdf';
  h.add(apk, 50); h.add(pdf, 40);
  const scan = await h.scanStorageFiles();
  assert.equal((await h.clearStorageFiles(scan, { updates:false, shares:false, notes:true }, () => {})).released, 0);
  h.state.phase = 'merging'; h.active.add(new h.File(pdf).uri);
  assert.equal((await h.clearStorageFiles(scan, policy.defaultCleanupSelection(), () => {})).skipped, 2);
  h.state.phase = 'idle'; h.active.clear();
  h.add(pdf + '.used', 13, Date.now(), String(Date.now()));
  h.add(apk, 51);
  assert.equal((await h.clearStorageFiles(scan, policy.defaultCleanupSelection(), () => {})).released, 0);
});
test('partial failures continue safely and cancellation retains the already released byte count', async () => {
  const h = filesHarness();
  h.add('file:///cache/irisnote-release-11.apk', 50);
  h.add('file:///cache/irisnote-release-12.apk', 60);
  h.failedDeletes.add(new h.File('file:///cache/irisnote-release-11.apk').uri);
  const first = await h.clearStorageFiles(await h.scanStorageFiles(), policy.defaultCleanupSelection(), () => {});
  assert.equal(first.failed, 1); assert.equal(first.released, 60);
  h.failedDeletes.clear();
  h.add('file:///cache/irisnote-release-12.apk', 60);
  let checks = 0;
  const second = await h.clearStorageFiles(await h.scanStorageFiles(), policy.defaultCleanupSelection(), () => { if (++checks === 3) throw Error('session'); });
  assert.equal(second.interrupted, true); assert.equal(second.released, 50);
});
test('share panel retains the same URI after closing and records a fresh retention time', async () => {
  const h = filesHarness();
  const shared = load('src/core/storage/share-cache.ts', { 'expo-file-system': h.dependencies['expo-file-system'] });
  const file = shared.createShareCacheFile('pdf'); file.write('content');
  await shared.withSharedFile(file.uri, async () => { assert.equal(shared.isShareFileActive(file.uri), true); });
  assert.equal(file.exists, true);
  assert.equal(shared.isShareFileActive(file.uri), false);
  assert.ok(Number(new h.File(file.parentDirectory, file.name + '.used').textSync()) > 0);
});

function screenHarness() {
  const slots = [], effects = [], filesCalled = [], notesCalled = [];
  let cursor = 0, focusEffect, focusCleanup, tree;
  const db = {};
  const scan = { supported:true, totals:{database:200,drafts:10,updates:100,shares:50,other:1}, cleanable:{updates:100,shares:50}, files:[], errors:0 };
  const element = (type, props) => ({ type, props:props ?? {} });
  const depsEqual = (a,b) => a && b && a.length === b.length && a.every((x,i) => x === b[i]);
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= {current:initial}; },
    useCallback(callback, deps) { const index = cursor++; if (!depsEqual(slots[index]?.deps,deps)) slots[index]={callback,deps}; return slots[index].callback; },
    useLayoutEffect(effect,deps) { const index=cursor++; if (!depsEqual(slots[index],deps)) { slots[index]=deps; effects.push(effect); } },
  };
  const Screen = load('src/features/settings/screens/DataStorageSettingsScreen.tsx', {
    'react':react, 'react/jsx-runtime':{jsx:element,jsxs:element},
    'react-native':Object.fromEntries(['ActivityIndicator','Pressable','ScrollView','Text','View'].map(x=>[x,x])),
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0})},
    'expo-router':{router:{},useFocusEffect(effect) { if (focusEffect !== effect) { focusCleanup?.(); focusEffect=effect; effects.push(()=>{focusCleanup=effect();}); } }},
    'lucide-react-native':{Check:'Check'},
    '@/core/database':{useApplicationDatabase:()=>db},
    '@/core/cloud-storage/cloud-storage-provider':{useCloudStorage:()=>({enabled:true})},
    '@/core/cloud-storage/cloud-storage-policy':{getCloudStorageSnapshot:()=>({generation:1,ownerUserId:1})},
    '@/features/auth/hooks/useAuth':{useAuth:()=>({user:{id:1}})},
    '@/core/storage/storage-policy':policy,
    '@/core/storage/storage-files':{scanStorageFiles:async()=>scan,clearStorageFiles:async(_scan,selection,check)=>{check();filesCalled.push(selection);return {released:150,failed:0,skipped:0,interrupted:false};}},
    '@/features/notes/data/note-cache.repository':{readNoteCacheCandidates:async()=>[{bytes:300}]},
    '@/features/notes/services/note-cache.service':{clearNoteCache:async(_db,owner,check)=>{check();notesCalled.push(owner);return {ids:[1],skipped:0};}},
    '@/shared/theme':{colors:{primary:'green',surface:'white',appBackground:'gray'}},
    '@/shared/ui':{Card:'Card',Screen:'Screen'},
    '@/shared/ui/Overlay/app-modal':{AppModal:'AppModal'},
    '../components/SettingsPageHeader':{SettingsPageHeader:'Header'},
  }).default;
  function render() { cursor=0;tree=Screen();while(effects.length) effects.shift()();return tree; }
  function all(node) { if (!node || typeof node!=='object') return [];if(Array.isArray(node))return node.flatMap(all);return [node,...all(node.props?.children)]; }
  const find = predicate => all(tree).find(predicate);
  const label = text => find(node=>node.props.accessibilityLabel===text);
  const settle = async () => { await new Promise(resolve=>setImmediate(resolve));render(); };
  return {render,settle,label,find,filesCalled,notesCalled,blur:()=>focusCleanup?.(),focus:()=>{focusCleanup=focusEffect();}};
}

test('screen defaults notes to unchecked, sends only selected items, and resets notes after leaving and returning', async () => {
  const h=screenHarness();h.render();await h.settle();
  assert.equal(h.label('笔记缓存').props.accessibilityState.checked,false);
  h.label('清理所选项目').props.onPress();h.render();
  const confirm = () => h.find(node=>node.type==='Pressable' && node.props.children?.props?.children==='清理');
  confirm().props.onPress();await h.settle();
  assert.equal(h.notesCalled.length,0);
  assert.equal(h.filesCalled[0].notes,false);
  h.label('笔记缓存').props.onPress();h.render();
  assert.equal(h.label('笔记缓存').props.accessibilityState.checked,true);
  h.label('清理所选项目').props.onPress();h.render();confirm().props.onPress();await h.settle();
  assert.equal(h.notesCalled.length,1);
  h.blur();h.focus();await h.settle();
  assert.equal(h.label('笔记缓存').props.accessibilityState.checked,false);
});


test('managed share directories preserve friendly filenames and remain cleanable after retention', async () => {
  const h = filesHarness();
  const shared = h.dependencies['./share-cache'];
  const file = shared.createShareCacheFile('txt', '我的笔记.txt');
  file.write('hello');
  assert.equal(file.name, '我的笔记.txt');
  h.add(file.uri, 5, h.old);
  const scan = await h.scanStorageFiles();
  assert.equal(scan.totals.shares, 5);
  assert.equal(scan.cleanable.shares, 5);
  assert.equal((await h.clearStorageFiles(scan, policy.defaultCleanupSelection(), () => {})).released, 5);
});

test('overlapping share panels and persistent active markers protect receiving apps', async () => {
  const h = filesHarness();
  const shared = h.dependencies['./share-cache'];
  const file = shared.createShareCacheFile('pdf');file.write('hello');
  let finishFirst, finishSecond;
  const first = shared.withSharedFile(file.uri, () => new Promise(resolve => { finishFirst=resolve; }));
  const second = shared.withSharedFile(file.uri, () => new Promise(resolve => { finishSecond=resolve; }));
  finishFirst();await first;
  assert.equal(shared.isShareFileActive(file.uri),true);
  const marker = new h.File(file.parentDirectory, file.name + '.used');
  assert.equal(marker.textSync(),'active');
  finishSecond();await second;
  assert.equal(shared.isShareFileActive(file.uri),false);
  h.add(file.uri,5,h.old);marker.write('active');
  assert.equal((await h.scanStorageFiles()).cleanable.shares,0);
});

test('native SQLite absolute paths are adapted before Directory URI access and counted once', async () => {
  const h = filesHarness({ databaseDirectory: '/doc/SQLite' });
  assert.throws(() => new h.dependencies['expo-file-system'].Directory('/doc/SQLite').uri, /URI is not absolute/);
  h.add('file:///doc/SQLite/irisnote.db', 100);
  h.add('file:///doc/drafts/1/new.json', 20);
  const scan = await h.scanStorageFiles();
  assert.equal(scan.errors, 0);
  assert.equal(scan.totals.database, 100);
  assert.equal(scan.totals.drafts, 20);
  assert.equal(scan.files.length, 2);
});

test('database path conversion encodes literal native characters without double-encoding existing URIs', async () => {
  const h = filesHarness({ databaseDirectory: '/db/笔记 % #?/SQLite' });
  const uri = 'file:///db/%E7%AC%94%E8%AE%B0%20%25%20%23%3F/SQLite';
  assert.equal(h.databaseDirectoryUri('/db/笔记 % #?/SQLite'), uri);
  assert.equal(h.databaseDirectoryUri(uri), uri);
  h.add(uri + '/irisnote.db', 100);
  const scan = await h.scanStorageFiles();
  assert.equal(scan.errors, 0); assert.equal(scan.totals.database, 100);
  for (const value of ['relative/SQLite','content://db/SQLite','https://db/SQLite','//host/SQLite','/db/\u0000']) {
    assert.throws(() => h.databaseDirectoryUri(value));
  }
});

test('invalid SQLite roots and throwing directory URI getters do not prevent remaining storage scans', async () => {
  for (const options of [{databaseDirectory:'relative/SQLite'}, {databaseDirectory:'/bad',failingDirectory:'file:///bad/'}]) {
    const h=filesHarness(options);h.add('file:///cache/irisnote-release-12.apk',50);
    const scan=await h.scanStorageFiles();
    assert.equal(scan.errors,1);assert.equal(scan.cleanable.updates,50);
  }
  const h=filesHarness({databaseDirectory:null,failingDirectory:'file:///doc/broken/'});
  h.add('file:///doc/broken/data',100);h.add('file:///cache/irisnote-release-12.apk',50);
  const scan=await h.scanStorageFiles();
  assert.equal(scan.errors,1);assert.equal(scan.cleanable.updates,50);
});
