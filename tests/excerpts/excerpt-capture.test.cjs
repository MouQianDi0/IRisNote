const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

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
const root = path.resolve(__dirname, "../..");
const { ExcerptCaptureController } = require(
    path.join(
        root,
        "src/features/excerpts/services/excerpt-capture-controller.ts",
    ),
);
const { hashExcerptContent } = require(
    path.join(root, "src/features/excerpts/domain/excerpt-validation.ts"),
);

function harness(overrides = {}) {
    let now = 1_800_000_000_000;
    let owner = "user:1";
    let active = true;
    let session = {
        sessionId: "session-1",
        ownerKey: owner,
        startedAt: now,
        endsAt: now + 30 * 60_000,
        durationMinutes: 30,
    };
    const events = [];
    const saved = new Map();
    const handled = new Set();
    let text = "其他应用复制的正文";
    const repository = {
        generation: 1,
        assertSession(key, generation) {
            assert.equal(key, owner);
            assert.equal(generation, repository.generation);
        },
        list: () => [...saved.values()],
        save: async (key, id, content, source) => {
            events.push(["save", key, content, source]);
            const hash = hashExcerptContent(content);
            const existing = saved.get(hash);
            const entity = existing ?? {
                content,
                contentHash: hash,
                clientId: id,
            };
            saved.set(hash, entity);
            return { entity, duplicate: !!existing };
        },
    };
    const ports = {
        readOwner: async () => owner,
        readSession: async () => session,
        active: async () => active,
        activate: async (key) => events.push(["activate", key]),
        repository,
        clipboard: {
            hasText: async () => true,
            readText: async () => {
                events.push("read");
                return text;
            },
            isHandled: async (hash) => handled.has(hash),
            lastWrittenHash: () => null,
        },
        markHandled: async (hash) => {
            events.push("mark");
            handled.add(hash);
        },
        consumed: (offer) => events.push(["consumed", offer.hash]),
        now: () => now,
        ...overrides,
    };
    const controller = new ExcerptCaptureController("session-1", ports);
    return {
        controller,
        ports,
        repository,
        events,
        handled,
        saved,
        setOwner: (key) => {
            owner = key;
        },
        setActive: (value) => {
            active = value;
        },
        setSession: (value) => {
            session = value;
        },
        setText: (value) => {
            text = value;
        },
        advance: (ms) => {
            now += ms;
        },
    };
}

test("冷启动检测只激活当前账号，明确保存才写入，并消费相同候选", async () => {
    const h = harness();
    const result = await h.controller.detect();
    assert.equal(result.kind, "offer");
    assert.equal(h.saved.size, 0);
    assert.equal(h.handled.size, 0);
    await h.controller.save();
    assert.deepEqual(h.events[0], ["activate", "user:1"]);
    assert.deepEqual(
        h.events.find((event) => Array.isArray(event) && event[0] === "save"),
        ["save", "user:1", "其他应用复制的正文", "auto"],
    );
    assert.equal(h.saved.size, 1);
    assert.equal(h.handled.size, 1);
    assert.equal(h.events.at(-1)[0], "consumed");
});

test("停止、到期、切账号、旧通知身份在读取剪贴板之前被拒绝", async () => {
    for (const invalidate of [
        (h) => h.setActive(false),
        (h) => h.advance(30 * 60_000),
        (h) => h.setOwner("user:2"),
        (h) => h.setSession(null),
        (h) => h.setSession({ sessionId: "another-session" }),
    ]) {
        const h = harness();
        invalidate(h);
        await assert.rejects(h.controller.detect(), /失效/);
        assert.equal(h.events.includes("read"), false);
        assert.equal(h.saved.size, 0);
    }
});

test("等待 hasText 和读取正文期间失效不呈现候选，也不允许保存", async () => {
    const h = harness();
    h.ports.clipboard.hasText = async () => {
        h.setActive(false);
        return true;
    };
    await assert.rejects(h.controller.detect());
    assert.equal(h.events.includes("read"), false);
    const k = harness();
    k.ports.clipboard.readText = async () => {
        k.setOwner("user:2");
        return "正文";
    };
    await assert.rejects(k.controller.detect());
    await assert.rejects(k.controller.save(), /没有待保存/);
    assert.equal(k.saved.size, 0);
});

test("失败保留原候选供重试，不重新读取后来的剪贴板；双击保存共用一次写入", async () => {
    const h = harness();
    await h.controller.detect();
    const save = h.repository.save;
    h.repository.save = async () => {
        throw new Error("磁盘写入失败");
    };
    await assert.rejects(h.controller.save(), /磁盘/);
    assert.equal(h.handled.size, 0);
    h.setText("随后复制的新正文");
    let release;
    h.repository.save = async (...args) => {
        await new Promise((resolve) => {
            release = resolve;
        });
        return save(...args);
    };
    const first = h.controller.save();
    assert.equal(h.controller.save(), first);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await first;
    assert.equal(
        h.events.filter((event) => Array.isArray(event) && event[0] === "save")
            .length,
        1,
    );
    assert.equal([...h.saved.values()][0].content, "其他应用复制的正文");
    assert.equal(h.events.filter((event) => event === "read").length, 1);
});

test("保存前重新核验账号、仓库代次、停止和到期，不跨账号或过期保存", async () => {
    for (const invalidate of [
        (h) => h.setOwner("user:2"),
        (h) => h.repository.generation++,
        (h) => h.setActive(false),
        (h) => h.advance(30 * 60_000),
    ]) {
        const h = harness();
        await h.controller.detect();
        invalidate(h);
        await assert.rejects(h.controller.save());
        assert.equal(h.saved.size, 0);
        assert.equal(h.handled.size, 0);
    }
});

test("忽略只标记处理，返回/销毁不标记、不保存，关闭期间迟到检测被拒绝", async () => {
    const h = harness();
    await h.controller.detect();
    await h.controller.ignore();
    assert.equal(h.handled.size, 1);
    assert.equal(h.saved.size, 0);
    const k = harness();
    await k.controller.detect();
    k.controller.dispose();
    await assert.rejects(k.controller.save());
    assert.equal(k.handled.size, 0);
    const late = harness();
    late.ports.clipboard.readText = async () => {
        late.controller.dispose();
        return "正文";
    };
    await assert.rejects(late.controller.detect());
    assert.equal(late.handled.size, 0);
});

test("共用去重和长度规则：已保存/处理/本应用写入/空内容/超长都不产生写入", async () => {
    const content = "其他应用复制的正文";
    const hash = hashExcerptContent(content);
    for (const [reason, setup] of [
        ["saved", (h) => h.saved.set(hash, { contentHash: hash })],
        ["handled", (h) => h.handled.add(hash)],
        [
            "self",
            (h) => {
                h.ports.clipboard.lastWrittenHash = () => hash;
            },
        ],
        ["empty", (h) => h.setText("  \n ")],
        ["tooLong", (h) => h.setText("字".repeat(20001))],
        [
            "noText",
            (h) => {
                h.ports.clipboard.hasText = async () => false;
            },
        ],
    ]) {
        const h = harness();
        setup(h);
        const result = await h.controller.detect();
        assert.equal(result.kind, "skip");
        assert.equal(result.reason, reason);
        await assert.rejects(h.controller.save(), /没有待保存/);
        assert.equal(
            h.events.some(
                (event) => Array.isArray(event) && event[0] === "save",
            ),
            false,
        );
    }
});
