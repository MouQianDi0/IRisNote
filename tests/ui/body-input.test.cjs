const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Render BodyInput with a minimal JSX runtime: elements are plain { type, props } trees.
function loadBodyInput() {
  const file = path.resolve(__dirname, '../../src/shared/ui/BodyInput/BodyInput.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: { forwardRef: (render) => ({ render }) },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '@/shared/theme': { semanticColors: { destructive: 'destructive', textSecondary: 'secondary' } },
    '../Input': { Input: 'Input' },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency: ${name}`); } }, { filename: file });
  return exports.BodyInput;
}
const BodyInput = loadBodyInput();
const find = (node, type) => {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat()) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
};
function render(props) {
  const changes = [];
  const tree = BodyInput.render({ onChangeText: (text) => changes.push(text), ...props }, null);
  return { input: find(tree, 'Input'), counter: find(tree, 'Text'), changes };
}

test('default BodyInput still truncates at maxLength and counts code points', () => {
  const { input, counter, changes } = render({ value: '😀ab', maxLength: 3 });
  assert.equal(counter.props.children.join(''), '3/3');
  assert.equal(counter.props.style.color, 'secondary');
  input.props.onChangeText('😀abcd\r\n');
  assert.deepEqual(changes, ['😀ab']);
});

test('truncate={false} keeps over-limit text and marks the counter with the measured length', () => {
  const measure = (value) => value.trim().length;
  const raw = `\n\n\n${'字'.repeat(4)}`;
  const { input, counter, changes } = render({ value: raw, maxLength: 3, truncate: false, measure });
  assert.equal(counter.props.children.join(''), '4/3');
  assert.equal(counter.props.style.color, 'destructive');
  assert.match(counter.props.accessibilityLabel, /已超出/);
  input.props.onChangeText(`${raw}\r\n`);
  assert.deepEqual(changes, [`${raw}\n`]);
  const within = render({ value: `\n\n${'字'.repeat(3)}`, maxLength: 3, truncate: false, measure }).counter;
  assert.equal(within.props.children.join(''), '3/3');
  assert.equal(within.props.style.color, 'secondary');
});
