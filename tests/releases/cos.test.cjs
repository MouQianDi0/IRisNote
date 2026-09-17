const test = require('node:test');
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

const modulePromise = import('../../scripts/release/cos.mjs');
const env = { IRIS_COS_SECRET_ID: 'test-id', IRIS_COS_SECRET_KEY: 'test-secret' };
const release = { version: '0.2.0', build_code: 7 };
const bytes = Buffer.from('test apk bytes');
const info = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };

async function fixture(t, initial) {
    const { cosConfig, createCosUploader } = await modulePromise;
    const dir = await mkdtemp(path.join(tmpdir(), 'iris-cos-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const apk = path.join(dir, 'note.apk');
    await writeFile(apk, bytes);
    const state = { bytes: initial, puts: 0, gets: 0, status: undefined, versionId: undefined };
    const client = {
        async getBucketVersioning() { return { VersioningConfiguration: { Status: state.status } }; },
        async headObject() {
            if (!state.bytes) throw { statusCode: 404, code: 'NotFound' };
            return { headers: { 'content-length': String(state.bytes.length) }, ETag: 'object-etag', VersionId: state.versionId };
        },
        async getObject() { throw new Error('APK must not use the default COS GET endpoint'); },
        async putObject(params) {
            state.puts++;
            assert.equal(params.Key, 'IRisNote-0.2.0-7.apk');
            assert.equal(params.Bucket, 'irisnote-1334342309');
            assert.equal(params.Region, 'ap-guangzhou');
            assert.equal(params.Headers['x-cos-forbid-overwrite'], 'true');
            assert.equal(params.ContentLength, bytes.length);
            const chunks = [];
            for await (const chunk of params.Body) chunks.push(chunk);
            state.bytes = Buffer.concat(chunks);
            if (state.status === 'Enabled') state.versionId = 'created-version';
            return { ETag: 'object-etag', VersionId: state.versionId };
        },
    };
    const transport = {
        async fetch(url, options) {
            state.gets++;
            assert.equal(url, 'https://download.tech-mou.top/IRisNote-0.2.0-7.apk');
            assert.equal(options.headers['If-Match'], 'object-etag');
            assert.equal(options.headers.Authorization, undefined);
            assert.equal(options.redirect, 'error');
            return new Response(state.bytes, { headers: { 'content-length': String(state.bytes.length), etag: 'object-etag' } });
        },
    };
    return { apk, state, client, transport, uploader: createCosUploader(cosConfig(env), client, (...args) => transport.fetch(...args)) };
}

test('COS defaults match the confirmed root object and reject incomplete/unsafe configuration', async () => {
    const { cosConfig, cosObjectKey, withoutCosCredentials } = await modulePromise;
    const config = cosConfig(env);
    assert.equal(config.cdn, 'https://download.tech-mou.top');
    assert.equal(cosObjectKey(config, release), 'IRisNote-0.2.0-7.apk');
    const nested = cosConfig({ ...env, IRIS_COS_PREFIX: 'releases', IRIS_COS_CDN_BASE_URL: 'https://cdn.example/releases' });
    assert.equal(cosObjectKey(nested, release), 'releases/IRisNote-0.2.0-7.apk');
    assert.throws(() => cosConfig({}), /IRIS_COS_SECRET_ID/);
    assert.throws(() => cosConfig({ ...env, IRIS_COS_PREFIX: '../bad' }), /目录前缀/);
    assert.throws(() => cosConfig({ ...env, IRIS_COS_PREFIX: 'releases' }), /目录必须/);
    assert.throws(() => cosConfig({ ...env, IRIS_COS_CDN_BASE_URL: 'https://user:secret@example.com' }), /无凭据/);
    assert.throws(() => cosObjectKey(config, { version: '../x', build_code: 7 }), /无效/);
    const source = { ...env, COS_SECRET_KEY: 'secret', TENCENTCLOUD_SECRET_ID: 'id', PATH: 'keep', IRIS_KEYSTORE_PASSWORD: 'signing' };
    assert.deepEqual(withoutCosCredentials(source), { PATH: 'keep', IRIS_KEYSTORE_PASSWORD: 'signing' });
    assert.equal(source.IRIS_COS_SECRET_KEY, 'test-secret');
});

test('COS uploads the original bytes, reads them back, and retries without another PUT', async t => {
    const f = await fixture(t);
    await f.uploader.preflight();
    const uploaded = await f.uploader.upload(f.apk, release, info);
    assert.equal(uploaded.skipped, false);
    assert.equal(uploaded.url, 'https://download.tech-mou.top/IRisNote-0.2.0-7.apk');
    assert.deepEqual(f.state.bytes, bytes);
    assert.equal((await f.uploader.upload(f.apk, release, info)).skipped, true);
    assert.equal(f.state.puts, 1);
    assert.equal(f.state.gets, 2);
});

test('existing same-size corrupt COS object is rejected without overwriting', async t => {
    const f = await fixture(t, Buffer.alloc(bytes.length));
    await assert.rejects(f.uploader.upload(f.apk, release, info), /SHA-256/);
    assert.equal(f.state.puts, 0);
});

test('wrong-size COS object and suspended or unknown versioning fail closed', async t => {
    const f = await fixture(t, Buffer.from('wrong'));
    await assert.rejects(f.uploader.upload(f.apk, release, info), /大小/);
    for (const status of ['Unknown', 'Suspended']) {
        f.state.status = status;
        await assert.rejects(f.uploader.preflight(), /版本控制/);
    }
    assert.equal(f.state.puts, 0);
});

test('COS access errors are not treated as absent files and do not leak SDK secrets', async t => {
    const f = await fixture(t);
    f.client.headObject = async () => { throw { statusCode: 403, code: 'AccessDenied', message: 'test-secret' }; };
    await assert.rejects(f.uploader.upload(f.apk, release, info), error => {
        assert.match(error.message, /403.*AccessDenied/);
        assert.doesNotMatch(error.message, /test-secret/);
        return true;
    });
    assert.equal(f.state.puts, 0);
});

test('COS concurrent create conflict is resolved by checking actual bytes', async t => {
    const f = await fixture(t);
    f.client.putObject = async () => {
        f.state.bytes = bytes;
        throw { statusCode: 409, code: 'ObjectAlreadyExists' };
    };
    await f.uploader.upload(f.apk, release, info);
    assert.equal(f.state.gets, 1);
});

test('COS post-upload corruption fails verification', async t => {
    const f = await fixture(t);
    f.client.putObject = async params => {
        for await (const chunk of params.Body) assert.ok(chunk);
        f.state.bytes = Buffer.alloc(bytes.length);
        return { ETag: 'object-etag' };
    };
    await assert.rejects(f.uploader.upload(f.apk, release, info), /SHA-256/);
});

test('installed COS SDK sends forbid-overwrite and streams verified bytes over HTTP', async t => {
    const { createServer } = require('node:http');
    const { once } = require('node:events');
    const COS = require('cos-nodejs-sdk-v5');
    const { cosConfig, createCosUploader } = await modulePromise;
    const f = await fixture(t);
    let stored;
    let puts = 0;
    const server = createServer(async (req, res) => {
        if (req.url.includes('versioning')) {
            res.setHeader('Content-Type', 'application/xml');
            res.end('<VersioningConfiguration/>');
        } else if (req.method === 'PUT') {
            puts++;
            if (req.headers['x-cos-forbid-overwrite'] !== 'true') {
                res.writeHead(400); res.end(); return;
            }
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            stored = Buffer.concat(chunks);
            res.setHeader('ETag', '"fixture"');
            res.end();
        } else if (!stored) {
            res.writeHead(404); res.end();
        } else {
            res.setHeader('Content-Length', stored.length);
            res.setHeader('ETag', '"fixture"');
            res.end(req.method === 'HEAD' ? undefined : stored);
        }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const client = new COS({ SecretId: 'fixture', SecretKey: 'fixture', Protocol: 'http:', Domain: `127.0.0.1:${server.address().port}`, Timeout: 2000 });
    const uploader = createCosUploader(cosConfig(env), client, (_url, options) => fetch(`http://127.0.0.1:${server.address().port}/IRisNote-0.2.0-7.apk`, options));
    await uploader.preflight();
    await uploader.upload(f.apk, release, info);
    assert.equal((await uploader.upload(f.apk, release, info)).skipped, true);
    assert.deepEqual(stored, bytes);
    assert.equal(puts, 1);
});

test('enabled versioning permits new objects and checks the uploaded version ID', async t => {
    const f = await fixture(t);
    f.state.status = 'Enabled';
    assert.equal(await f.uploader.preflight(), 'Enabled');
    await f.uploader.upload(f.apk, release, info);
    await f.uploader.upload(f.apk, release, info);
    assert.equal(f.state.puts, 1);
    assert.equal(f.state.versionId, 'created-version');
});

test('a concurrent version replacing this PUT is reported without deleting history', async t => {
    const f = await fixture(t);
    f.state.status = 'Enabled';
    const put = f.client.putObject;
    f.client.putObject = async params => {
        const result = await put(params);
        f.state.versionId = 'other-writer';
        return result;
    };
    await assert.rejects(f.uploader.upload(f.apk, release, info), /版本 ID/);
    assert.equal(f.state.gets, 0);
});

test('CDN stale ETag, incorrect sizes, redirects and HTTP failures never pass verification', async t => {
    const f = await fixture(t, bytes);
    for (const response of [
        new Response(bytes, { headers: { 'content-length': String(bytes.length), etag: 'old-etag' } }),
        new Response(bytes, { headers: { 'content-length': '1', etag: 'object-etag' } }),
        new Response(null, { status: 404 }),
        new Response(null, { status: 302 }),
    ]) {
        f.transport.fetch = async () => response;
        await assert.rejects(f.uploader.upload(f.apk, release, info), /CDN 回读不匹配/);
    }
    f.transport.fetch = async () => { throw new Error('network failed'); };
    await assert.rejects(f.uploader.upload(f.apk, release, info), /请求失败/);
    assert.equal(f.state.puts, 0);
});

test('COS changes during CDN verification are detected, even with unchanged ETag', async t => {
    const f = await fixture(t, bytes);
    f.state.versionId = 'before';
    const fetcher = f.transport.fetch;
    f.transport.fetch = async (...args) => {
        const response = await fetcher(...args);
        f.state.versionId = 'after';
        return response;
    };
    await assert.rejects(f.uploader.verifyExisting(release, info), /校验期间发生变化/);
    assert.equal(f.state.puts, 0);
});

test('CDN corruption with matching ETag cannot bypass SHA-256 verification', async t => {
    const f = await fixture(t, bytes);
    f.transport.fetch = async () => new Response(Buffer.alloc(bytes.length), {
        headers: { 'content-length': String(bytes.length), etag: 'object-etag' },
    });
    await assert.rejects(f.uploader.verifyExisting(release, info), /SHA-256/);
    assert.equal(f.state.puts, 0);
});
