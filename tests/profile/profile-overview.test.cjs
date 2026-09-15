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
    mergeOverviewNotes,
    selectContinueReading,
} = require("../../src/features/profile/profile-overview.ts");

const note = (id, values = {}) => ({
    id,
    title: `笔记 ${id}`,
    content: "",
    category_id: null,
    created_at: "2026-09-14T00:00:00.000Z",
    ...values,
});

const record = (noteId, percent, updatedAt) => ({
    schema: 2,
    ownerId: 1,
    noteId,
    serverId: noteId > 0 ? noteId : null,
    contentVersion: "1:test",
    line: 1,
    character: 0,
    anchor: null,
    percent,
    updatedAt,
    localVersion: 1,
    serverVersion: null,
    pendingSync: false,
});

test("profile overview keeps pending local notes and prefers local state over duplicate server notes", () => {
    const server = [note(1), note(2, { is_starred: true })];
    const local = [
        note(1, { server_id: 1, title: "本地标题", is_starred: true }),
        note(-3, { is_starred: true }),
    ];

    const merged = mergeOverviewNotes(local, server);

    assert.equal(merged.length, 3);
    assert.equal(merged.find((item) => item.id === 1).title, "本地标题");
    assert.equal(merged.filter((item) => item.is_starred).length, 3);
});

test("continue reading chooses the latest unfinished record for an existing note", () => {
    const notes = [note(1), note(2, { title: "  " })];
    const selected = selectContinueReading(notes, [
        record(1, 40.4, 100),
        record(2, 78.6, 200),
        record(3, 50, 300),
        record(1, 100, 400),
    ]);

    assert.deepEqual(selected, {
        noteId: 2,
        title: "无标题笔记",
        percent: 79,
        updatedAt: 200,
    });
});
