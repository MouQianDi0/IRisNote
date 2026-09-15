import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

/** Only child processes receive this environment; process.env is never modified. */
export async function gradleEnvironment(projectRoot, environment = process.env, platform = process.platform) {
  const result = { ...environment };
  if (platform !== 'win32') return result;
  const socketDirectory = path.resolve(environment.IRIS_GRADLE_SOCKET_DIR || path.join(projectRoot, '.expo'));
  if (/["\r\n]/.test(socketDirectory)) throw new Error('Gradle socket 路径不能包含引号或换行');
  // Unix-domain sockaddr paths are limited; leave room for socket_<random>.
  if (new TextEncoder().encode(path.join(socketDirectory, 'socket_2147483647')).length > 100) {
    throw new Error('Gradle socket 路径过长，请通过 IRIS_GRADLE_SOCKET_DIR 指定可写的短路径');
  }
  await mkdir(socketDirectory, { recursive: true });
  await access(socketDirectory, constants.W_OK);
  const property = `"-Djdk.net.unixdomain.tmpdir=${socketDirectory.replaceAll('\\', '/')}"`;
  const original = environment.JAVA_TOOL_OPTIONS?.trim() || '';
  // JVM startup reads JAVA_TOOL_OPTIONS in both the wrapper and newly spawned
  // daemons/workers. JAVA_OPTS alone only configures gradlew's launcher JVM.
  result.JAVA_TOOL_OPTIONS = original.includes(property) ? original : [original, property].filter(Boolean).join(' ');
  return result;
}
