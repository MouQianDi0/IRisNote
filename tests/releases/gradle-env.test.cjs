const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('Windows fix preserves caller variables and reaches child JVM through JAVA_TOOL_OPTIONS', async () => {
  const { gradleEnvironment } = await import('../../scripts/android/gradle-env.mjs');
  const original = { JAVA_HOME: 'unchanged-jdk', TEMP: 'unchanged-temp', JAVA_OPTS: '-Xms64m', JAVA_TOOL_OPTIONS: '-Dexisting=yes' };
  const env = await gradleEnvironment(path.resolve(__dirname, '../..'), original, 'win32');
  assert.equal(original.JAVA_TOOL_OPTIONS, '-Dexisting=yes');
  assert.equal(env.TEMP, original.TEMP); assert.equal(env.JAVA_HOME, original.JAVA_HOME); assert.equal(env.JAVA_OPTS, original.JAVA_OPTS);
  assert.match(env.JAVA_TOOL_OPTIONS, /^-Dexisting=yes "-Djdk.net.unixdomain.tmpdir=.*\/\.expo"$/);
  assert.equal((await gradleEnvironment(path.resolve(__dirname, '../..'), env, 'win32')).JAVA_TOOL_OPTIONS, env.JAVA_TOOL_OPTIONS);
});
test('other platforms are unaffected and overlong paths fail clearly', async () => {
  const { gradleEnvironment } = await import('../../scripts/android/gradle-env.mjs');
  const original = { JAVA_TOOL_OPTIONS: '-Dexisting=yes' };
  assert.deepEqual(await gradleEnvironment('/tmp/project', original, 'linux'), original);
  await assert.rejects(gradleEnvironment(path.resolve('x'.repeat(110)), original, 'win32'), /路径过长/);
});
test('real installed JDK can create a Selector with the scoped environment', { skip: process.platform !== 'win32' }, async () => {
  const { gradleEnvironment } = await import('../../scripts/android/gradle-env.mjs');
  const { run } = await import('../../scripts/release/lib.mjs');
  const env = await gradleEnvironment(path.resolve(__dirname, '../..'));
  const shell = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/jshell.exe') : 'jshell.exe';
  const output = run(shell, ['--execution', 'local', '--feedback', 'concise'], {
    env, capture: true,
    input: 'try(var s = java.nio.channels.Selector.open()){System.out.println("IRIS_SELECTOR_OK");}catch(Exception e){System.out.println("IRIS_SELECTOR_FAILED: "+e);}\n/exit\n',
  });
  assert.match(output, /IRIS_SELECTOR_OK/);
  assert.doesNotMatch(output, /IRIS_SELECTOR_FAILED/);
});
