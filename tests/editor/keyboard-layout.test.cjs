const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const filename = require.resolve('../../src/core/editor/keyboard-layout.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsForTest = {};
new Function('exports', compiled)(exportsForTest);
const { remainingKeyboardOverlap: overlap } = exportsForTest;

test('全面屏未缩小：抬升完整键盘高度', () => {
    assert.equal(overlap(300, 800, 800, 760), 300);
});
test('系统已缩小：不重复避让；部分缩小只补差额', () => {
    assert.equal(overlap(300, 800, 500, 460), 0);
    assert.equal(overlap(300, 800, 620, 580), 120);
});
test('窗口坐标原点偏移不影响结果', () => {
    assert.equal(overlap(300, 776, 676, 600), overlap(300, 800, 700, 600));
});
test('键盘高度变化重新计算；收起后恢复', () => {
    assert.equal(overlap(400, 800, 800, 760), 400);
    assert.equal(overlap(0, 800, 800, 760), 0);
});
test('避让限制在容器内，已避让过多时不产生负值', () => {
    assert.equal(overlap(900, 800, 800, 760), 760);
    assert.equal(overlap(300, 800, 450, 410), 0);
});
