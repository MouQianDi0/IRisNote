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
const { ExcerptSessionCoordinator } = require(
    path.join(
        root,
        "src/features/excerpts/services/excerpt-session-coordinator.ts",
    ),
);
const { parseExcerptSession, sessionIsActive } = require(
    path.join(root, "src/features/excerpts/domain/excerpt-session.ts"),
);
const { ExcerptSessionRepository } = require(
    path.join(root, "src/features/excerpts/data/excerpt-session.repository.ts"),
);
const { DatabaseSync } = require("node:sqlite");

function harness(overrides = {}) {
    let now = 1_800_000_000_000;
    let stored = null;
    let stopped = null;
    let snapshot;
    const events = [];
    let serial = 0;
    const ports = {
        read: async () => ({ session: stored, lastDuration: 30 }),
        save: async (session) => {
            stored = session;
            events.push("persist");
        },
        clear: async () => {
            stored = null;
            events.push("clear");
        },
        permission: async () => true,
        post: async (session) => {
            events.push(["post", session.sessionId]);
        },
        cancel: async (id) => {
            if (id) stopped = id;
            events.push("cancel");
        },
        stopped: async () => stopped,
        acknowledgeStopped: async (id) => {
            if (stopped === id) stopped = null;
            events.push("ack");
        },
        publish: (state) => {
            snapshot = state;
        },
        ended: (reason) => events.push(["ended", reason]),
        started: (visible) => events.push(["started", visible]),
        now: () => now,
        newId: () => `session-${++serial}`,
        ...overrides,
    };
    const coordinator = new ExcerptSessionCoordinator(ports);
    return {
        coordinator,
        ports,
        events,
        get snapshot() {
            return snapshot;
        },
        get stored() {
            return stored;
        },
        setStored(value) {
            stored = value;
        },
        setStopped(value) {
            stopped = value;
        },
        advance(ms) {
            now += ms;
        },
        async ready() {
            coordinator.setOwner("user:1");
            await coordinator.reconcile();
            events.length = 0;
        },
    };
}

test("四档均持久化后发卡，权限拒绝仍可开启，重复开启不延长会话", async () => {
    for (const duration of [15, 30, 60, 120]) {
        const h = harness({ permission: async () => false });
        await h.ready();
        await h.coordinator.start(duration);
        assert.equal(h.stored.endsAt - h.stored.startedAt, duration * 60_000);
        assert.equal(h.snapshot.lastDuration, duration);
        assert.deepEqual(h.events, ["persist", ["started", false]]);
        const original = h.stored;
        await h.coordinator.start(120);
        assert.equal(h.stored, original);
    }
    const h = harness();
    await h.ready();
    await h.coordinator.start(30);
    assert.equal(h.events[0], "persist");
    assert.deepEqual(h.events.at(-1), ["started", true]);
});

test("落库失败不激活、不发卡，发卡失败保留应用内会话", async () => {
    const h = harness({
        save: async () => {
            throw new Error("disk");
        },
    });
    await h.ready();
    await assert.rejects(h.coordinator.start(30), /disk/);
    assert.equal(h.snapshot.session, null);
    assert.equal(h.snapshot.pending, false);
    assert.ok(
        !h.events.some((event) => Array.isArray(event) && event[0] === "post"),
    );
    const degraded = harness({
        post: async () => {
            throw new Error("native");
        },
    });
    await degraded.ready();
    await degraded.coordinator.start(15);
    assert.ok(degraded.snapshot.session);
    assert.deepEqual(degraded.events.at(-1), ["started", false]);
});

test("到期/手动停止幂等，最近时长仍保留", async () => {
    const h = harness();
    await h.ready();
    await h.coordinator.start(15);
    h.advance(15 * 60_000);
    await h.coordinator.reconcile();
    await h.coordinator.reconcile();
    assert.equal(h.stored, null);
    assert.equal(h.snapshot.session, null);
    assert.equal(
        h.events.filter((event) => Array.isArray(event) && event[0] === "ended")
            .length,
        1,
    );
    await h.coordinator.start(60);
    await h.coordinator.stop();
    await h.coordinator.stop();
    assert.equal(h.snapshot.lastDuration, 60);
    assert.equal(h.stored, null);
});

test("冷启动消费停止标记前先清库，旧会话停止标记不终止新会话", async () => {
    const h = harness();
    await h.ready();
    await h.coordinator.start(30);
    h.events.length = 0;
    h.setStopped(h.stored.sessionId);
    await h.coordinator.reconcile();
    assert.equal(h.snapshot.session, null);
    assert.ok(h.events.indexOf("clear") < h.events.indexOf("ack"));
    await h.coordinator.start(15);
    h.setStopped("session-1");
    await h.coordinator.reconcile();
    assert.equal(h.snapshot.session.sessionId, "session-2");
});

test("权限查询期间收到原生停止，禁止回流检测或恢复会话", async () => {
    const h = harness();
    await h.ready();
    await h.coordinator.start(15);
    h.ports.permission = async () => {
        h.setStopped(h.stored.sessionId);
        return true;
    };
    h.ports.post = async () => {
        throw new Error("stopped");
    };
    await h.coordinator.reconcile();
    assert.equal(h.snapshot.session, null);
    assert.ok(
        h.events.some(
            (event) => Array.isArray(event) && event[1] === "notification",
        ),
    );
});

test("切账号立即隐藏会话，旧异步授权返回不得开启新账号会话", async () => {
    let release;
    const h = harness();
    await h.ready();
    h.ports.permission = async () =>
        new Promise((resolve) => {
            release = resolve;
        });
    const starting = h.coordinator.start(30);
    await Promise.resolve();
    h.coordinator.setOwner("user:2");
    assert.equal(h.snapshot.ready, false);
    assert.equal(h.snapshot.session, null);
    release(true);
    await assert.rejects(starting, /账号已变化/);
    assert.equal(h.stored, null);
});

test("账号不匹配清理持久会话，过期和损坏状态不能恢复", async () => {
    const h = harness();
    await h.ready();
    await h.coordinator.start(30);
    h.coordinator.setOwner("user:2");
    await h.coordinator.reconcile();
    assert.equal(h.stored, null);
    assert.ok(
        h.events.some((event) => Array.isArray(event) && event[1] === "owner"),
    );
    assert.equal(parseExcerptSession("invalid"), null);
    const valid = {
        sessionId: "x",
        ownerKey: "user:1",
        startedAt: 1000,
        endsAt: 901000,
        durationMinutes: 15,
    };
    assert.deepEqual(parseExcerptSession(JSON.stringify(valid)), valid);
    for (const invalid of [
        { ...valid, endsAt: Infinity },
        { ...valid, durationMinutes: 0 },
        { ...valid, endsAt: 902000 },
    ])
        assert.equal(parseExcerptSession(JSON.stringify(invalid)), null);
    assert.equal(sessionIsActive(valid, "user:2", 2000), false);
    assert.equal(sessionIsActive(valid, "user:1", valid.endsAt), false);
});

test("清库失败保留停止标记，下次对账不可复活已停止会话", async () => {
    const h = harness();
    await h.ready();
    await h.coordinator.start(15);
    const clear = h.ports.clear;
    h.ports.clear = async () => {
        throw new Error("disk");
    };
    await assert.rejects(h.coordinator.stop(), /disk/);
    assert.equal(h.snapshot.session, null);
    h.ports.clear = clear;
    await h.coordinator.reconcile();
    assert.equal(h.stored, null);
    assert.equal(h.snapshot.session, null);
});

test("会话记录和记忆时长共用已有 KV 表，停止仅删除会话", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(
        "CREATE TABLE system_preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    const transaction = {
        run: async (sql, params = []) => db.prepare(sql).run(...params),
        getAll: async (sql, params = []) => db.prepare(sql).all(...params),
    };
    const port = {
        ...transaction,
        transaction: async (task) => {
            db.exec("BEGIN");
            try {
                const value = await task(transaction);
                db.exec("COMMIT");
                return value;
            } catch (error) {
                db.exec("ROLLBACK");
                throw error;
            }
        },
    };
    const repository = new ExcerptSessionRepository(port);
    const session = {
        sessionId: "test",
        ownerKey: "guest",
        startedAt: 1000,
        endsAt: 7_201_000,
        durationMinutes: 120,
    };
    await repository.save(session);
    assert.deepEqual((await repository.read()).session, session);
    await repository.clear();
    assert.equal((await repository.read()).session, null);
    assert.equal((await repository.read()).lastDuration, 120);
    db.close();
});

test("安全入口在 Web/iOS/Expo Go/旧 API 或旧安装包中不加载通知服务", async () => {
    const filename = path.join(
        root,
        "src/features/excerpts/services/excerpt-session-notifications.ts",
    );
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const native = { getStoppedExcerptSession() {}, stopExcerptSession() {} };
    for (const [os, version, expoGo, moduleNative, supported] of [
        ["web", 0, false, null, false],
        ["ios", 26, false, native, false],
        ["android", 25, false, native, false],
        ["android", 26, true, native, false],
        ["android", 26, false, null, false],
        ["android", 26, false, {}, false],
        ["android", 26, false, native, true],
    ]) {
        const module = { exports: {} };
        new Function("require", "module", "exports", compiled)(
            (name) => {
                if (name === "expo") return { isRunningInExpoGo: () => expoGo };
                if (name === "react-native")
                    return { Platform: { OS: os, Version: version } };
                if (name === "@modules/irisnote-system") return moduleNative;
                if (name.endsWith("system-notification.types")) return {};
                throw new Error(
                    "Unsupported environment loaded notification service",
                );
            },
            module,
            module.exports,
        );
        assert.equal(module.exports.excerptSessionSupported(), supported);
        if (!supported) {
            assert.equal(
                await module.exports.excerptSessionNotificationPermission(true),
                false,
            );
            await assert.rejects(
                module.exports.postExcerptSessionNotification({}),
                /不支持/,
            );
        }
    }
});
