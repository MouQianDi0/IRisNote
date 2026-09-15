import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradleEnvironment } from './gradle-env.mjs';
import { run } from '../release/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [mode, ...args] = process.argv.slice(2);
try {
  const env = await gradleEnvironment(root);
  if (mode === 'gradle') {
    const tasks = args.length ? args : ['help'];
    const daemonArgs = tasks.includes('--daemon') || tasks.includes('--no-daemon') ? [] : ['--no-daemon'];
    run(path.join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), [...daemonArgs, ...tasks], { cwd: path.join(root, 'android'), env });
  } else if (mode === 'expo') {
    run(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'run:android', ...args], { cwd: root, env });
  } else {
    throw new Error('使用 npm run android -- <Expo 参数> 或 npm run gradle -- <Gradle 任务>');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
