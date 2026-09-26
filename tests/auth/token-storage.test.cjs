// 登录令牌存储：原生端迁入 SecureStore，失败时退回 AsyncStorage；Web/测试环境行为不变。
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
const originalLoad = Module._load;
Module._load = function (name, ...args) {
    if (name === "@react-native-async-storage/async-storage")
        return { __esModule: true, default: {} };
    return originalLoad.call(this, name, ...args);
};

const {
    createTokenStorage,
} = require("@/shared/storage/token-storage.ts");

const SECURE = "irisnote.auth.token";
const LEGACY = "token";

function stores({ legacyToken = null, secureToken = null } = {}) {
    const legacy = new Map(legacyToken === null ? [] : [[LEGACY, legacyToken]]);
    const secure = new Map(secureToken === null ? [] : [[SECURE, secureToken]]);
    const calls = { legacyGet: 0 };
    const failures = new Set();
    const fail = (name) => {
        if (failures.has(name)) throw new Error(name);
    };
    return {
        legacy,
        secure,
        calls,
        failures,
        legacyStore: {
            async getItem(key) {
                calls.legacyGet += 1;
                return legacy.get(key) ?? null;
            },
            async setItem(key, value) {
                fail("legacySet");
                legacy.set(key, value);
            },
            async removeItem(key) {
                fail("legacyRemove");
                legacy.delete(key);
            },
        },
        secureStore: {
            async getItemAsync(key) {
                fail("secureGet");
                return failures.has("secureCorrupt") ? "garbled" : (secure.get(key) ?? null);
            },
            async setItemAsync(key, value) {
                fail("secureSet");
                secure.set(key, value);
            },
            async deleteItemAsync(key) {
                fail("secureDelete");
                secure.delete(key);
            },
        },
    };
}

test("Web 与测试环境只用 AsyncStorage，行为与旧版一致", async () => {
    const s = stores({ legacyToken: "old" });
    const tokens = createTokenStorage(null, s.legacyStore);
    assert.equal(await tokens.read(), "old");
    await tokens.write("new");
    assert.equal(s.legacy.get(LEGACY), "new");
    await tokens.clear();
    assert.equal(await tokens.read(), null);
});

test("旧版明文令牌首次读取时迁入 SecureStore，之后不再读旧存储", async () => {
    const s = stores({ legacyToken: "old" });
    const tokens = createTokenStorage(s.secureStore, s.legacyStore);
    assert.equal(await tokens.read(), "old");
    assert.equal(s.secure.get(SECURE), "old");
    assert.equal(s.legacy.has(LEGACY), false);
    const before = s.calls.legacyGet;
    assert.equal(await tokens.read(), "old");
    assert.equal(s.calls.legacyGet, before);
});

test("迁移后读回不一致时保留旧存储，继续使用旧令牌并记录", async () => {
    const s = stores({ legacyToken: "old" });
    const events = [];
    s.failures.add("secureCorrupt");
    const tokens = createTokenStorage(s.secureStore, s.legacyStore, (event) => events.push(event));
    assert.equal(await tokens.read(), "old");
    assert.equal(s.legacy.get(LEGACY), "old");
    assert.deepEqual(events, ["migration_failed"]);
});

test("SecureStore 写入失败时退回旧存储，读取得到新令牌而不是 SecureStore 里的旧值", async () => {
    const s = stores({ secureToken: "stale" });
    const events = [];
    const tokens = createTokenStorage(s.secureStore, s.legacyStore, (event) => events.push(event));
    assert.equal(await tokens.read(), "stale");
    s.failures.add("secureSet");
    await tokens.write("fresh");
    assert.equal(s.legacy.get(LEGACY), "fresh");
    assert.equal(await tokens.read(), "fresh");
    assert.ok(events.includes("secure_write_failed"));
    // SecureStore 恢复后，下次读取把旧存储里的新令牌迁回去。
    s.failures.delete("secureSet");
    assert.equal(await tokens.read(), "fresh");
    assert.equal(s.secure.get(SECURE), "fresh");
    assert.equal(s.legacy.has(LEGACY), false);
});

test("两种存储都写不进时抛出，调用方能判断新令牌没有保存", async () => {
    const s = stores();
    s.failures.add("secureSet");
    s.failures.add("legacySet");
    const tokens = createTokenStorage(s.secureStore, s.legacyStore);
    await assert.rejects(tokens.write("fresh"), /legacySet/);
});

test("SecureStore 读取失败（如密钥库失效）按未登录处理", async () => {
    const s = stores({ secureToken: "t" });
    const events = [];
    s.failures.add("secureGet");
    const tokens = createTokenStorage(s.secureStore, s.legacyStore, (event) => events.push(event));
    assert.equal(await tokens.read(), null);
    assert.deepEqual(events, ["secure_read_failed"]);
});

test("退出登录清除两处存储；删除失败时抛出，磁盘上的令牌照常读到", async () => {
    const s = stores({ secureToken: "t" });
    const tokens = createTokenStorage(s.secureStore, s.legacyStore);
    s.failures.add("secureDelete");
    await assert.rejects(tokens.clear(), /secureDelete/);
    assert.equal(await tokens.read(), "t");
    s.failures.delete("secureDelete");
    await tokens.clear();
    assert.equal(await tokens.read(), null);
});

test("操作串行执行：写入后立即读取得到新令牌", async () => {
    const s = stores({ legacyToken: "old" });
    const tokens = createTokenStorage(s.secureStore, s.legacyStore);
    const reads = [tokens.read(), tokens.write("new"), tokens.read()];
    const [first, , last] = await Promise.all(reads);
    assert.equal(first, "old");
    assert.equal(last, "new");
    assert.equal(s.secure.get(SECURE), "new");
    assert.equal(s.legacy.has(LEGACY), false);
});
