const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
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
};
const {
  ReadingText,
  nativeTextRows,
  readingPercent,
} = require("../../src/features/notes/reading/reading-position.ts");
const {
  ReadingProgressStore,
  decodeReadingRecord,
} = require("../../src/features/notes/reading/reading-progress-store.ts");
const {
  ReadingSession,
} = require("../../src/features/notes/reading/reading-session.ts");
const {
  currentNavigation,
  orderNavigation,
} = require("../../src/features/notes/reading/reading-navigation.ts");
const {
  BAR_HIDE_MS,
  BUBBLE_HIDE_MS,
  shouldHideReadingControls,
  dragReadingOffset,
} = require("../../src/features/notes/reading/reading-interaction.ts");
const {
  bubblePosition,
} = require("../../src/shared/ui/ProgressBubble/progress-bubble-position.ts");
const {
  canUploadReadingRecord,
  canApplyCloudRestore,
} = require("../../src/features/notes/reading/reading-sync-contract.ts");
const {
  measureReadingText,
} = require("../../src/features/notes/reading/measure-reading-text.web.ts");

const content = Array.from(
  { length: 100 },
  (_, i) => `第 ${i + 1} 行内容`,
).join("\n");
function geometry(text = new ReadingText(content), viewport = 100) {
  return {
    bodyTop: 80,
    bodyHeight: text.starts.length * 28,
    viewport,
    contentHeight: 80 + text.starts.length * 28 + 100,
    rows: text.starts.map((start, i) => ({
      start,
      end: text.starts[i + 1] ?? text.text.length,
      y: i * 28,
      height: 28,
    })),
  };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
function memory() {
  const map = new Map();
  return {
    map,
    getItem: async (key) => map.get(key) ?? null,
    setItem: async (key, value) => {
      map.set(key, value);
    },
    getAllKeys: async () => [...map.keys()],
  };
}
function fixture(read = async () => null, save = async () => {}) {
  const restored = [],
    saved = [],
    positions = [],
    failures = [];
  const session = new ReadingSession(content, {
    read,
    save: async (p) => {
      saved.push(p);
      return save(p);
    },
    restore: (y) => restored.push(y),
    position: (p) => positions.push(p),
    failed: (x) => failures.push(x),
    saved: () => {},
  });
  return { session, restored, saved, positions, failures };
}

test("logical lines preserve leading/trailing blanks and CRLF without counting visual wraps", () => {
  const text = new ReadingText("\r\n长长长\r\n\r\n结尾\n");
  assert.equal(text.text, "\n长长长\n\n结尾\n");
  assert.deepEqual(text.starts, [0, 1, 5, 6, 9]);
  assert.equal(text.position(3, 10).line, 2);
  assert.equal(text.position(3, 10).character, 2);
  assert.equal(text.index(99, 0), null);
});
test("long logical line restores the measured visual row for its character", () => {
  const text = new ReadingText("x".repeat(2000));
  const g = {
    bodyTop: 80,
    bodyHeight: 2800,
    viewport: 400,
    contentHeight: 2980,
    rows: Array.from({ length: 100 }, (_, i) => ({
      start: i * 20,
      end: (i + 1) * 20,
      y: i * 28,
      height: 28,
    })),
  };
  const p = text.atOffset(80 + 28 * 50, g);
  assert.equal(p.line, 1);
  assert.equal(p.character, 1000);
  assert.equal(text.restore(p, g), 1480);
});
test("text anchor survives content inserted before the saved line", () => {
  const old = new ReadingText(content);
  const p = old.position(old.index(50, 2), 50);
  const next = new ReadingText("新的一段\n" + content);
  assert.equal(next.resolveIndex(p), old.index(50, 2) + "新的一段\n".length);
});
test("ambiguous repeated anchor uses logical line rather than guessing a nearby match", () => {
  const text = new ReadingText("abcdefgh\nabcdefgh\nabcdefgh");
  const p = {
    contentVersion: "old",
    line: 2,
    character: 3,
    anchor: { before: "", text: "abcdefgh", after: "" },
    percent: 50,
  };
  assert.equal(text.resolveIndex(p), 12);
});
test("invalid historical line uses percent fallback, clamped to scroll range", () => {
  const text = new ReadingText(content),
    g = geometry(text);
  const p = {
    ...text.position(0, 40),
    contentVersion: "old",
    line: 1000,
    anchor: null,
  };
  assert.equal(text.restore(p, g), 80 + 0.4 * 2800);
  assert.equal(text.restore({ percent: 200 }, g), 2880);
});
test("short note displays 100 and empty text saves the start with no placeholder anchor", () => {
  const text = new ReadingText(""),
    g = geometry(text, 500);
  assert.equal(readingPercent(0, g), 100);
  assert.deepEqual(text.position(0, 100), {
    contentVersion: "0:811c9dc5",
    line: 1,
    character: 0,
    anchor: null,
    percent: 0,
  });
  assert.equal(text.restore({ percent: 100 }, g), 0);
});
test("native visual rows retain blank lines and wrapped offsets", () => {
  const text = "\nabcdef\n\n尾\n";
  const rows = nativeTextRows(
    text,
    ["", "abc", "def", "", "尾", ""].map((text, i) => ({
      text,
      y: i * 28,
      height: 28,
    })),
  );
  assert.deepEqual(
    rows.map((r) => [r.start, r.end]),
    [
      [0, 1],
      [1, 4],
      [4, 8],
      [8, 9],
      [9, 11],
      [11, 11],
    ],
  );
});
test("toolbar and metadata are excluded from body reading percentages", () => {
  const g = geometry();
  assert.equal(readingPercent(0, g), 0);
  assert.equal(readingPercent(80, g), 0);
  assert.equal(readingPercent(1480, g), 50);
  assert.equal(readingPercent(2880, g), 100);
});
test("drag preserves the grab offset and clamps at both ends", () => {
  assert.equal(dragReadingOffset(25, 0, 100, 80, 1080), 330);
  assert.equal(dragReadingOffset(25, -1000, 100, 80, 1080), 80);
  assert.equal(dragReadingOffset(25, 1000, 100, 80, 1080), 1080);
});
test("scrollbar hides after five seconds and bubble after one, pausing while dragging or held", () => {
  assert.equal(
    shouldHideReadingControls(5999, 1000, false, false, BAR_HIDE_MS),
    false,
  );
  assert.equal(
    shouldHideReadingControls(6000, 1000, false, false, BAR_HIDE_MS),
    true,
  );
  assert.equal(
    shouldHideReadingControls(1999, 1000, false, false, BUBBLE_HIDE_MS),
    false,
  );
  assert.equal(
    shouldHideReadingControls(2000, 1000, false, false, BUBBLE_HIDE_MS),
    true,
  );
  assert.equal(
    shouldHideReadingControls(9000, 1000, true, false, BUBBLE_HIDE_MS),
    false,
  );
  assert.equal(
    shouldHideReadingControls(9000, 1000, false, true, BUBBLE_HIDE_MS),
    false,
  );
  assert.equal(
    shouldHideReadingControls(9000, 8999, false, false, BUBBLE_HIDE_MS),
    false,
  );
});
test("bubble keeps its anchor offset and clamps at every screen edge", () => {
  const b = { left: 0, top: 0, right: 400, bottom: 600 };
  assert.deepEqual(bubblePosition(350, 450, 100, 44, b), {
    left: 200,
    top: 306,
  });
  assert.deepEqual(bubblePosition(0, 0, 100, 44, b), { left: 8, top: 8 });
  assert.deepEqual(bubblePosition(999, 999, 100, 44, b), {
    left: 292,
    top: 548,
  });
});
test("navigation has explicit ordering, section headings and exact bookmark matching", () => {
  const entries = orderNavigation([
    { id: "b", kind: "bookmark", title: "b", line: 20, character: 4 },
    { id: "h", kind: "heading", title: "h", line: 10 },
    { id: "bad", kind: "heading", line: 0 },
  ]);
  assert.deepEqual(
    entries.map((e) => e.id),
    ["h", "b"],
  );
  assert.equal(
    currentNavigation(entries, { line: 20, character: 3 }).bookmarks.length,
    0,
  );
  assert.equal(
    currentNavigation(entries, { line: 20, character: 4 }).bookmarks.length,
    1,
  );
  assert.equal(
    currentNavigation(entries, { line: 21, character: 0 }).heading.id,
    "h",
  );
  assert.deepEqual(orderNavigation([]), []);
});
test("legacy numeric storage is readable and upgrades only when a full position is saved", async () => {
  const storage = memory();
  storage.map.set("irisnote:reading:1:2", "43");
  const store = new ReadingProgressStore(storage);
  assert.deepEqual(await store.read(1, 2), { percent: 43 });
  const p = new ReadingText(content).position(12, 43.1234);
  const result = await store.save(1, 2, 2, p);
  assert.equal(result.percent, 43.1234);
  assert.equal(result.schema, 2);
  assert.equal(result.pendingSync, true);
  assert.equal(result.localVersion, 1);
});
test("account separation and positive server ID enforcement", async () => {
  const store = new ReadingProgressStore(memory());
  const p = new ReadingText(content).position(10, 10);
  const r = await store.save(1, -7, -7, p);
  assert.equal(r.serverId, null);
  assert.equal(canUploadReadingRecord(r), false);
  assert.equal(await store.read(2, -7), null);
  const bound = await store.save(1, -7, 55, p);
  assert.equal(canUploadReadingRecord(bound), true);
  assert.equal((await store.listPending(1)).length, 1);
  assert.equal((await store.listPending(2)).length, 0);
});
test("reading record listing returns structured records for one account only", async () => {
  const storage = memory();
  storage.map.set("irisnote:reading:1:9", "35");
  const store = new ReadingProgressStore(storage);
  const text = new ReadingText(content);
  await store.save(1, 2, 2, text.position(10, 20));
  await store.save(1, -3, null, text.position(20, 40));
  await store.save(2, 4, 4, text.position(30, 60));

  assert.deepEqual(
    (await store.list(1)).map((item) => item.noteId).sort((a, b) => a - b),
    [-3, 2],
  );
});
test("malformed or mismatched record is preserved rather than overwritten", async () => {
  const storage = memory();
  storage.map.set("irisnote:reading:1:2", "{bad");
  const store = new ReadingProgressStore(storage);
  await assert.rejects(store.read(1, 2));
  await assert.rejects(
    store.save(1, 2, 2, new ReadingText(content).position(0, 0)),
  );
  assert.equal(storage.map.get("irisnote:reading:1:2"), "{bad");
  const r = await new ReadingProgressStore(memory()).save(
    1,
    2,
    2,
    new ReadingText(content).position(0, 0),
  );
  assert.throws(() => decodeReadingRecord(JSON.stringify(r), 2, 2));
});
test("failed writes retain the latest snapshot and can retry without losing precision", async () => {
  const storage = memory();
  let fail = true;
  const write = storage.setItem;
  storage.setItem = async (...args) => {
    if (fail) throw Error("disk");
    return write(...args);
  };
  const store = new ReadingProgressStore(storage),
    text = new ReadingText(content);
  await assert.rejects(store.save(1, 2, 2, text.position(10, 10.01)));
  await assert.rejects(store.save(1, 2, 2, text.position(20, 20.02)));
  assert.equal((await store.read(1, 2)).percent, 20.02);
  fail = false;
  await store.retry(1, 2);
  assert.equal(
    JSON.parse(storage.map.get("irisnote:reading:1:2")).percent,
    20.02,
  );
});
test("slow storage writes cannot finish out of order and local versions increase", async () => {
  const storage = memory(),
    gate = deferred();
  let count = 0;
  const write = storage.setItem;
  storage.setItem = async (...args) => {
    if (++count === 1) await gate.promise;
    return write(...args);
  };
  const store = new ReadingProgressStore(storage),
    text = new ReadingText(content);
  const first = store.save(1, 2, 2, text.position(10, 80));
  const second = store.save(1, 2, 2, text.position(20, 10));
  await tick();
  assert.equal(count, 1);
  gate.resolve();
  await Promise.all([first, second]);
  const r = await store.read(1, 2);
  assert.equal(r.percent, 10);
  assert.equal(r.localVersion, 2);
});
test("restore waits for both storage and layout and never saves initial zero over history", async () => {
  const gate = deferred(),
    f = fixture(() => gate.promise);
  const start = f.session.start();
  f.session.setGeometry(geometry());
  await f.session.flush();
  assert.equal(f.saved.length, 0);
  gate.resolve({ percent: 50 });
  await start;
  assert.deepEqual(f.restored, [1480]);
  await f.session.flush();
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].percent, 50);
});
test("user scroll before delayed read wins and is saved after reading completes", async () => {
  const gate = deferred(),
    f = fixture(() => gate.promise);
  const start = f.session.start();
  f.session.setGeometry(geometry());
  f.session.interact();
  f.session.sample(920);
  gate.resolve({ percent: 90 });
  await start;
  await f.session.flush();
  assert.deepEqual(f.restored, []);
  assert.equal(f.saved[0].percent, 30);
});
test("late read of a stopped account cannot restore or save into a new session", async () => {
  const gate = deferred(),
    f = fixture(() => gate.promise);
  const start = f.session.start();
  f.session.setGeometry(geometry());
  f.session.stop();
  gate.resolve({ percent: 70 });
  await start;
  await f.session.flush();
  assert.equal(f.restored.length, 0);
  assert.equal(f.saved.length, 0);
});
test("read failure disables writes and explicit retry can recover", async () => {
  let fail = true;
  const f = fixture(async () => {
    if (fail) throw Error("read");
    return { percent: 60 };
  });
  f.session.setGeometry(geometry());
  await f.session.start();
  await f.session.flush();
  assert.deepEqual(f.failures, ["read"]);
  assert.equal(f.saved.length, 0);
  fail = false;
  await f.session.retry();
  assert.equal(f.restored[0], 1760);
});
test("ordinary samples are coalesced and save failure retains newest position for retry", async () => {
  let fail = true;
  const f = fixture(
    async () => null,
    async () => {
      if (fail) throw Error("disk");
    },
  );
  f.session.setGeometry(geometry());
  await f.session.start();
  f.session.interact();
  for (let y = 80; y <= 920; y += 28) f.session.sample(y);
  assert.equal(f.saved.length, 0);
  await f.session.flush();
  assert.equal(f.saved.length, 1);
  f.session.sample(1480);
  fail = false;
  await f.session.retry();
  assert.equal(f.saved.at(-1).percent, 50);
});
test("navigation jumps flush immediately and reject invalid lines", async () => {
  const f = fixture();
  f.session.setGeometry(geometry());
  await f.session.start();
  f.session.jump(40, 0);
  await tick();
  assert.equal(f.restored[0], 80 + 39 * 28);
  assert.equal(f.saved.at(-1).line, 40);
  f.session.jump(1000);
  assert.equal(f.restored.length, 1);
});
test("layout changes restore the logical anchor after font or metadata height changes", async () => {
  const f = fixture();
  f.session.setGeometry(geometry());
  await f.session.start();
  f.session.interact();
  f.session.sample(920);
  const g = geometry();
  g.bodyTop += 100;
  g.bodyHeight *= 2;
  g.contentHeight += 2900;
  g.rows = g.rows.map((r) => ({ ...r, y: r.y * 2, height: 56 }));
  f.session.setGeometry(g);
  assert.equal(f.restored.at(-1), 180 + 30 * 56);
});
test("cloud restore is blocked by pending local writes or any user interaction", () => {
  assert.equal(canApplyCloudRestore(null, false), true);
  assert.equal(canApplyCloudRestore(null, true), false);
  assert.equal(canApplyCloudRestore({ pendingSync: true }, false), false);
});

test("the final in-flight snapshot is read before a newly mounted session restores", async () => {
  const storage = memory(),
    gate = deferred(),
    store = new ReadingProgressStore(storage);
  const write = storage.setItem;
  let writes = 0;
  storage.setItem = async (...args) => {
    if (++writes === 1) await gate.promise;
    return write(...args);
  };
  const first = fixture(
    () => store.read(1, 2),
    (p) => store.save(1, 2, 2, p),
  );
  first.session.setGeometry(geometry());
  await first.session.start();
  first.session.interact();
  first.session.sample(640);
  const saving = first.session.flush();
  await tick();
  first.session.sample(1480);
  first.session.stop();
  const next = fixture(
    () => store.read(1, 2),
    (p) => store.save(1, 2, 2, p),
  );
  next.session.setGeometry(geometry());
  const starting = next.session.start();
  gate.resolve();
  await saving;
  await starting;
  assert.equal(next.restored.at(-1), 1480);
  next.session.interact();
  next.session.sample(360);
  await next.session.flush();
  assert.equal((await store.read(1, 2)).percent, 10);
});
test("a delayed old account write never targets the newly opened account", async () => {
  const storage = memory(),
    gate = deferred(),
    store = new ReadingProgressStore(storage);
  const write = storage.setItem;
  storage.setItem = async (key, value) => {
    if (key.includes(":1:")) await gate.promise;
    return write(key, value);
  };
  const a = fixture(
    () => store.read(1, 2),
    (p) => store.save(1, 2, 2, p),
  );
  a.session.setGeometry(geometry());
  await a.session.start();
  a.session.interact();
  a.session.sample(1480);
  const saving = a.session.flush();
  a.session.stop();
  const b = fixture(
    () => store.read(2, 2),
    (p) => store.save(2, 2, 2, p),
  );
  b.session.setGeometry(geometry());
  await b.session.start();
  b.session.interact();
  b.session.sample(360);
  await b.session.flush();
  gate.resolve();
  await saving;
  await tick();
  assert.equal((await store.read(2, 2)).percent, 10);
  assert.equal((await store.read(1, 2)).percent, 50);
});
test("new structured history is not rewritten just by opening or closing the note", async () => {
  const store = new ReadingProgressStore(memory()),
    text = new ReadingText(content);
  const history = await store.save(
    1,
    2,
    2,
    text.position(text.index(40, 0), 39),
  );
  const f = fixture(async () => history);
  f.session.setGeometry(geometry());
  await f.session.start();
  f.session.sample(0);
  f.session.stop();
  await tick();
  assert.equal(f.saved.length, 0);
});

test("restoration waits for body geometry and does not skip a new note title on relayout", async () => {
  const f = fixture();
  await f.session.start();
  f.session.setGeometry({ ...geometry(), bodyTop: 0, bodyHeight: 0 });
  await f.session.flush();
  assert.equal(f.saved.length, 0);
  f.session.setGeometry(geometry());
  f.session.setGeometry({
    ...geometry(),
    bodyTop: 160,
    contentHeight: geometry().contentHeight + 80,
  });
  assert.equal(f.restored.length, 0);
});
test("bookmark jumps preserve exact character while the scroll offset stays unchanged", async () => {
  const f = fixture();
  f.session.setGeometry(geometry());
  await f.session.start();
  f.session.jump(40, 3);
  f.session.sample(f.restored.at(-1));
  await tick();
  assert.equal(f.positions.at(-1).character, 3);
  assert.equal(f.saved.at(-1).character, 3);
  const entry = {
    id: "paragraph",
    kind: "bookmark",
    title: "段落书签",
    line: 40,
  };
  assert.equal(
    currentNavigation([entry], { line: 40, character: 3 }).bookmarks.length,
    1,
  );
});

test("web range measurement maps a very long logical line with bounded binary probes", () => {
  const original = {
    document: global.document,
    NodeFilter: global.NodeFilter,
    getComputedStyle: global.getComputedStyle,
  };
  const text = "x".repeat(10000),
    node = { textContent: text };
  let offset = 0,
    probes = 0;
  try {
    global.getComputedStyle = () => ({ lineHeight: "28px" });
    global.NodeFilter = { SHOW_TEXT: 4 };
    global.document = {
      createTreeWalker: () => {
        let visited = false;
        return {
          nextNode: () => {
            if (visited) return null;
            visited = true;
            return node;
          },
        };
      },
      createRange: () => ({
        setStart: (_, start) => {
          offset = start;
        },
        setEnd: () => {},
        getBoundingClientRect: () => {
          probes++;
          return { top: 100 + Math.floor(offset / 100) * 28 };
        },
      }),
    };
    const rows = measureReadingText({}, text);
    assert.equal(rows.length, 100);
    assert.deepEqual(rows[50], { start: 5000, end: 5100, y: 1400, height: 28 });
    assert.ok(probes < 1600, `unexpectedly many layout reads: ${probes}`);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete global[key];
      else global[key] = value;
    }
  }
});
