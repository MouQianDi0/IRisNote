import path from 'node:path';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { run, fileSha256 } from './lib.mjs';

const version = '1.12.1';
const archiveSha = 'f550fec705b6d6ff58f2db3c374c2277a37691678d6aba463adcbb129108467a';
const binarySha = '68865c3276d449d746cea5065fdec2baf755d7813e161ab04205b0907b2629b8';

export function validateNinjaVersion(output) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\S*)?$/.exec(output.trim());
  if (!match || Number(match[1]) < 1 || (Number(match[1]) === 1 && Number(match[2]) < 12)) {
    throw new Error('Windows 发布构建需要 Ninja 1.12.0 或更新版本');
  }
}

export async function releaseNinja(root, environment = process.env, platform = process.platform) {
  if (platform !== 'win32') return null;
  const configured = environment.IRIS_NINJA_PATH;
  const executable = configured || path.join(root, '.expo', `ninja-${version}`, 'ninja.exe');
  if (!path.isAbsolute(executable)) throw new Error('IRIS_NINJA_PATH 必须是绝对路径');
  if (!configured) {
    try {
      if (await fileSha256(executable) !== binarySha) throw new Error('checksum');
    } catch {
      throw new Error('项目 Ninja 未安装或校验失败，请先执行 npm run release -- setup-ninja');
    }
  }
  validateNinjaVersion(run(executable, ['--version'], { capture: true }));
  console.log(`发布构建 Ninja：${executable}`);
  return executable;
}

export async function setupNinja(root) {
  if (process.platform !== 'win32' || !['x64', 'arm64'].includes(process.arch)) {
    throw new Error('setup-ninja 仅支持 Windows x64/ARM64（使用 Windows x64 工具）');
  }
  const directory = path.join(root, '.expo', `ninja-${version}`);
  await mkdir(directory, { recursive: true });
  const response = await fetch(`https://github.com/ninja-build/ninja/releases/download/v${version}/ninja-win.zip`, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`下载 Ninja 失败：HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== archiveSha) throw new Error('Ninja 下载摘要校验失败');
  const archive = path.join(directory, 'ninja-win.zip');
  await writeFile(archive, data);
  run('tar', ['-xf', archive, '-C', directory]);
  await releaseNinja(root, {});
}
