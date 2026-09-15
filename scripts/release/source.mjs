import path from 'node:path';
import { run } from './lib.mjs';

// Only exclude audited, top-level material. Keep unclassified inputs and all
// nested module files (including licenses), build scripts and check fixtures.
const excludedRoots = new Set([
  'docs', 'releases', '.claude', '.codegraph', '.vscode',
  'AGENTS.md', 'CLAUDE.md', 'CHANGELOG.md', 'README.md', 'TODO.md',
  'design-qa.md', '待办事项.md', 'debug.log', 'tmpwebapp-node-modulesprepare.log',
]);

export function includeBuildRoot(name) {
  return !excludedRoots.has(name);
}

export function exportBuildSource(root, commit, workspace, checkout) {
  const entries = run('git', ['ls-tree', '--name-only', '-z', commit], { cwd: root, capture: true })
    .split('\0').filter(Boolean);
  const included = entries.filter(includeBuildRoot);
  if (!included.includes('package.json') || !included.includes('package-lock.json')) {
    throw new Error('预留提交缺少 package.json 或 package-lock.json');
  }
  const archive = path.join(workspace, 'source.tar');
  run('git', ['--literal-pathspecs', 'archive', '--format=tar', `--output=${archive}`, commit, '--', ...included], { cwd: root });
  const options = process.platform === 'win32' ? ['--options', 'hdrcharset=UTF-8'] : [];
  run('tar', ['-xf', archive, '-C', checkout, ...options]);
  return { included, excluded: entries.filter(name => !includeBuildRoot(name)) };
}
