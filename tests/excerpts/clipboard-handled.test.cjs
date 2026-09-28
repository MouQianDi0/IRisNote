// 已处理的剪贴板内容只以 HMAC 落盘，密钥在 SecureStore；取不到密钥时只记内存。
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (name, ...args) {
    if (name.startsWith("@/")) name = path.join(root, "src", name.slice(2));
    return originalResolve.call(this, name, ...args);
};
require.extensions[".ts"] = (module, filename) => {
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: filename,
    });
    module._compile(compiled.outputText, filename);
};

const {
    createClipboardHandledStore,
} = require("@/features/excerpts/services/clipboard-handled.ts");
const {
    hashExcerptContent,
} = require("@/features/excerpts/domain/excerpt-validation.ts");
const { randomBytes } = require("node:crypto");

const code = hashExcerptContent("482913");
const other = hashExcerptContent("另一段内容");

function secureMap(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        async getItemAsync(key) {
            return map.get(key) ?? null;
        },
        async setItemAsync(key, value) {
            map.set(key, value);
        },
        async deleteItemAsync(key) {
            map.delete(key);
        },
    };
}

function markStorage() {
    const state = { value: null, writes: 0 };
    return {
        state,
        read: async () => state.value,
        write: async (mark) => {
            state.writes += 1;
            state.value = mark;
        },
    };
}

const random = async (length) => new Uint8Array(randomBytes(length));

test("落盘的是带密钥的摘要，不等于内容哈希，也无法用内容哈希直接比对", async () => {
    const marks = markStorage();
    const store = createClipboardHandledStore(marks, secureMap(), random);
    await store.markHandled(code);
    assert.match(marks.state.value, /^[0-9a-f]{64}$/);
    assert.notEqual(marks.state.value, code);
    assert.equal(await store.isHandled(code), true);
    assert.equal(await store.isHandled(other), false);
});

test("重启后（新实例、同一密钥）仍能识别已处理内容", async () => {
    const secure = secureMap();
    const marks = markStorage();
    await createClipboardHandledStore(marks, secure, random).markHandled(code);
    const restarted = createClipboardHandledStore(marks, secure, random);
    assert.equal(await restarted.isHandled(code), true);
    assert.equal(await restarted.isHandled(other), false);
});

test("不同设备（不同密钥）对同一内容得到不同标记", async () => {
    const first = markStorage();
    const second = markStorage();
    await createClipboardHandledStore(first, secureMap(), random).markHandled(code);
    await createClipboardHandledStore(second, secureMap(), random).markHandled(code);
    assert.notEqual(first.state.value, second.state.value);
});

test("没有 SecureStore 时只记内存，不落盘，重启后会再提示", async () => {
    const marks = markStorage();
    const store = createClipboardHandledStore(marks, null, random);
    await store.markHandled(code);
    assert.equal(await store.isHandled(code), true);
    assert.equal(marks.state.writes, 0);
    assert.equal(await createClipboardHandledStore(marks, null, random).isHandled(code), false);
});

test("随机数或密钥库异常时退回内存；密钥损坏时重新生成，旧标记不再匹配", async () => {
    const marks = markStorage();
    const failing = createClipboardHandledStore(marks, secureMap(), async () => {
        throw new Error("no entropy");
    });
    await failing.markHandled(code);
    assert.equal(marks.state.writes, 0);
    assert.equal(await failing.isHandled(code), true);

    const secure = secureMap();
    await createClipboardHandledStore(marks, secure, random).markHandled(code);
    const [[name]] = [...secure.map.entries()];
    secure.map.set(name, "损坏的密钥");
    const regenerated = createClipboardHandledStore(marks, secure, random);
    assert.equal(await regenerated.isHandled(code), false);
    assert.match(secure.map.get(name), /^[0-9a-f]{64}$/);
});
