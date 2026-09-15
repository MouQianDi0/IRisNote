// Real hdiffz/hpatchz round trip on independently signed test APKs.
// These fixtures contain synthetic assets; they are not released IRisNote builds.
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import assert from 'node:assert/strict';
import { run, fileSha256, parseApkInfo } from '../../scripts/release/lib.mjs';
import { generatePatch, deltaTools, verifyNativeUpdater } from '../../scripts/release/delta.mjs';

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Configure ANDROID_HOME for the APK round-trip test');
const pick = async (directory) => (await readdir(directory)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true})).at(-1);
const toolDir = path.join(sdk, 'build-tools', await pick(path.join(sdk, 'build-tools')));
const platform = path.join(sdk, 'platforms', await pick(path.join(sdk, 'platforms')), 'android.jar');
const executable = (name) => path.join(toolDir, process.platform === 'win32' ? `${name}${name === 'apksigner' ? '.bat' : '.exe'}` : name);
await mkdir('.expo/delta-tests', { recursive: true });
const work = path.resolve(await mkdtemp('.expo/delta-tests/signed-apk-'));
const key = path.join(work, 'fixture.jks');
run('keytool', ['-genkeypair','-keystore',key,'-storepass','delta-fixture-only','-keypass','delta-fixture-only','-alias','fixture','-keyalg','RSA','-keysize','2048','-validity','365','-dname','CN=IRisNote Delta Fixture','-noprompt']);
const asset = Buffer.alloc(1024 * 1024);
for (let i = 0; i < asset.length; i += 32) createHash('sha256').update(String(i)).digest().copy(asset,i);
async function apk(code, version) {
  const dir = path.join(work,String(code)); await mkdir(path.join(dir,'assets'),{recursive:true});
  const bytes = Buffer.from(asset); if(code === 2) Buffer.from('PATCHED FEATURE').copy(bytes,501000);
  await writeFile(path.join(dir,'assets','payload.bin'),bytes);
  const manifest=path.join(dir,'AndroidManifest.xml');
  await writeFile(manifest,`<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.irisnote.deltafixture" android:versionCode="${code}" android:versionName="${version}"><uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/><application android:label="Delta Fixture" android:hasCode="false"/></manifest>`);
  const unsigned=path.join(dir,'unsigned.apk'), aligned=path.join(dir,'aligned.apk'), signed=path.join(dir,'signed.apk');
  run(executable('aapt'),['package','-f','-M',manifest,'-A',path.join(dir,'assets'),'-I',platform,'-F',unsigned]);
  run(executable('zipalign'),['-f','4',unsigned,aligned]);
  run(executable('apksigner'),['sign','--ks',key,'--ks-pass','pass:delta-fixture-only','--key-pass','pass:delta-fixture-only','--out',signed,aligned]);
  run(executable('apksigner'),['verify','--print-certs',signed],{capture:true});
  return signed;
}
const oldApk=await apk(1,'1.0.0'), targetApk=await apk(2,'1.0.1');
const patch=path.join(work,'update.hdiff');
const oldHash=await fileSha256(oldApk), targetHash=await fileSha256(targetApk);
const metadata=await generatePatch(oldApk,targetApk,patch,oldHash,targetHash);
const reconstructed=path.join(work,'reconstructed.apk');
run(deltaTools().patch,[oldApk,patch,reconstructed]);
assert.equal(await fileSha256(reconstructed),targetHash);
run(executable('apksigner'),['verify','--print-certs',reconstructed],{capture:true});
assert.equal(parseApkInfo(run(executable('aapt'),['dump','badging',reconstructed],{capture:true})).buildCode,2);
await assert.rejects(generatePatch(oldApk,targetApk,path.join(work,'wrong-base.hdiff'),'0'.repeat(64),targetHash),/摘要/);
const corrupt=path.join(work,'corrupt.hdiff'); const damaged=await readFile(patch); damaged.fill(0,0,16); await writeFile(corrupt,damaged);
assert.throws(()=>run(deltaTools().patch,[oldApk,corrupt,path.join(work,'bad.apk')],{capture:true}));
await verifyNativeUpdater();
const result={fixture:'signed synthetic APK',oldHash,targetHash,...metadata,output:work};
await writeFile(path.join(work,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
