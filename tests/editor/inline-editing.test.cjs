const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const {
  INLINE_EDIT_DOUBLE_PRESS_MS,
  resolveInlineEditPress,
} = require("../../src/core/editor/inline-editing.ts");

test("同一输入区第二次点击在阈值内调起键盘", () => {
  const first = resolveInlineEditPress(null, "content", 1000);
  assert.equal(first.openKeyboard, false);
  assert.deepEqual(first.next, { field: "content", at: 1000 });

  const second = resolveInlineEditPress(first.next, "content", 1000 + INLINE_EDIT_DOUBLE_PRESS_MS);
  assert.equal(second.openKeyboard, true);
  assert.equal(second.next, null);
});

test("跨输入区或超时点击重新开始判定", () => {
  assert.equal(resolveInlineEditPress({ field: "title", at: 1000 }, "content", 1100).openKeyboard, false);
  assert.equal(resolveInlineEditPress({ field: "content", at: 1000 }, "content", 1301).openKeyboard, false);
  assert.equal(resolveInlineEditPress({ field: "content", at: 1000 }, "content", 999).openKeyboard, false);
});
