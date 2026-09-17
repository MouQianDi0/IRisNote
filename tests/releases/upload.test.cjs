const test = require('node:test');
const { Buffer } = require('node:buffer');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const modulePromise = import('../../scripts/release/upload.mjs');
const bytes = Buffer.from('APK');
const info = { size: 3, sha256: createHash('sha256').update(bytes).digest('hex'), certificate: 'a'.repeat(64) };
const reserved = { version: '0.2.0', build_code: 7, status: 'reserved' };
const draft = { ...reserved, status: 'draft', sha256: info.sha256, size_bytes: '3', certificate_sha256: info.certificate };
function fixture(release = reserved) {
    const calls = [];
    let current = release;
    return {
        calls,
        options: {
            release, apk: 'D:\\release\\note.apk', info,
            cos: {
                preflight: async () => { calls.push('preflight'); },
                upload: async () => { calls.push('cos'); return { key: 'key', url: 'https://cdn/key' }; },
            },
            putServer: async () => { calls.push('put'); current = draft; },
            getRelease: async () => current,
            verifyServer: async () => { calls.push('verify'); },
            patches: async () => { calls.push('patches'); },
            log: () => {},
        },
    };
}
test('dual upload verifies the server before COS and prepares patches last', async () => {
    const { uploadBoth } = await modulePromise;
    const f = fixture();
    await uploadBoth(f.options);
    assert.deepEqual(f.calls, ['preflight', 'put', 'verify', 'cos', 'patches']);
});
test('COS failure after server success is recoverable with the same draft, without another server PUT', async () => {
    const { uploadBoth } = await modulePromise;
    const f = fixture();
    const upload = f.options.cos.upload;
    f.options.cos.upload = async () => { throw new Error('offline'); };
    await assert.rejects(uploadBoth(f.options), /COS APK.*offline[\s\S]*upload --build 7/);
    assert.deepEqual(f.calls, ['preflight', 'put', 'verify']);
    f.options.release = draft;
    f.options.cos.upload = upload;
    await uploadBoth(f.options);
    assert.equal(f.calls.filter(x => x === 'put').length, 1);
    assert.equal(f.calls.at(-1), 'patches');
});
test('server failure or bad persisted metadata prevents COS writes', async () => {
    const { uploadBoth } = await modulePromise;
    for (const failure of ['put', 'metadata', 'verify']) {
        const f = fixture();
        if (failure === 'put') f.options.putServer = async () => { throw new Error('HTTP 500'); };
        if (failure === 'metadata') f.options.getRelease = async () => ({ ...draft, sha256: 'bad' });
        if (failure === 'verify') f.options.verifyServer = async () => { throw new Error('corrupt'); };
        await assert.rejects(uploadBoth(f.options));
        assert.ok(!f.calls.includes('cos'));
    }
});
test('mismatched draft and published or withdrawn versions cannot be modified', async () => {
    const { uploadBoth } = await modulePromise;
    for (const release of [{ ...draft, certificate_sha256: 'wrong' }, { ...draft, status: 'published' }, { ...draft, status: 'withdrawn' }]) {
        const f = fixture(release);
        await assert.rejects(uploadBoth(f.options));
        assert.deepEqual(f.calls, []);
    }
});
test('patch failure retains both APK copies and retry resumes the workflow', async () => {
    const { uploadBoth } = await modulePromise;
    const f = fixture(draft);
    f.options.patches = async () => { throw new Error('patch failed'); };
    await assert.rejects(uploadBoth(f.options), /差量包.*patch failed/);
    assert.deepEqual(f.calls, ['preflight', 'verify', 'cos']);
});
test('server stream verification detects corruption, truncation and oversize', async () => {
    const { verifyArtifactStream } = await modulePromise;
    await verifyArtifactStream(Readable.from([bytes.subarray(0, 1), bytes.subarray(1)]), info);
    for (const value of [Buffer.from('BAD'), Buffer.from('AP'), Buffer.from('APK!')])
        await assert.rejects(verifyArtifactStream(Readable.from([value]), info));
});
