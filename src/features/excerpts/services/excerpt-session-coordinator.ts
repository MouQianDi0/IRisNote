import {
    isSessionDuration,
    sessionIsActive,
    type ExcerptSession,
    type ExcerptSessionDuration,
} from "../domain/excerpt-session";

type StopReason = "manual" | "notification" | "expired" | "owner";
export type ExcerptSessionSnapshot = {
    ready: boolean;
    pending: boolean;
    session: ExcerptSession | null;
    lastDuration: ExcerptSessionDuration;
};
export type ExcerptSessionPorts = {
    read(): Promise<{
        session: ExcerptSession | null;
        lastDuration: ExcerptSessionDuration;
    }>;
    save(session: ExcerptSession): Promise<void>;
    clear(): Promise<void>;
    permission(request: boolean): Promise<boolean>;
    post(session: ExcerptSession): Promise<void>;
    cancel(sessionId?: string): Promise<void>;
    stopped(): Promise<string | null>;
    acknowledgeStopped(id: string): Promise<void>;
    publish(snapshot: ExcerptSessionSnapshot): void;
    ended(reason: StopReason): void;
    started(notificationVisible: boolean): void;
    now(): number;
    newId(): string;
};

/** 开启、恢复、停止共用队列；账号门控同步更新，异步旧操作无法激活新账号会话。 */
export class ExcerptSessionCoordinator {
    private ownerKey: string | null = null;
    private revision = 0;
    private loaded = false;
    private queue: Promise<unknown> = Promise.resolve();
    private snapshot: ExcerptSessionSnapshot = {
        ready: false,
        pending: false,
        session: null,
        lastDuration: 30,
    };
    constructor(private readonly ports: ExcerptSessionPorts) {}

    setOwner(ownerKey: string | null) {
        if (ownerKey === this.ownerKey) return;
        this.ownerKey = ownerKey;
        this.revision++;
        this.snapshot.ready = false;
        // 先隐藏并禁用旧状态；持久清理由 reconcile 串行完成。
        this.ports.publish({ ...this.snapshot, ready: false, session: null });
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const pending = this.queue.then(task, task);
        this.queue = pending.catch(() => undefined);
        return pending;
    }

    private publish() {
        this.ports.publish({ ...this.snapshot });
    }

    private async clear(reason?: StopReason) {
        const sessionId = this.snapshot.session?.sessionId;
        // 即使 SQLite 删除失败也立即禁用检测并撤卡，下次对账继续清理。
        this.snapshot.session = null;
        this.publish();
        try {
            await this.ports.cancel(sessionId);
        } finally {
            await this.ports.clear();
        }
        if (reason) this.ports.ended(reason);
    }

    reconcile() {
        return this.enqueue(async () => {
            if (!this.ownerKey) return;
            const revision = this.revision;
            const stored = await this.ports.read();
            const stoppedId = await this.ports.stopped();
            if (revision !== this.revision) return;
            if (
                stored.session?.sessionId !==
                    this.snapshot.session?.sessionId ||
                stored.session?.endsAt !== this.snapshot.session?.endsAt ||
                stored.session?.ownerKey !== this.snapshot.session?.ownerKey
            )
                this.snapshot.session = stored.session;
            this.snapshot.lastDuration = stored.lastDuration;
            const session = stored.session;
            if (
                !session ||
                !sessionIsActive(session, this.ownerKey, this.ports.now()) ||
                session.sessionId === stoppedId
            ) {
                const reason = session
                    ? session.ownerKey !== this.ownerKey
                        ? "owner"
                        : session.sessionId === stoppedId
                          ? "notification"
                          : "expired"
                    : undefined;
                await this.clear(reason);
            } else if (await this.ports.permission(false)) {
                if (
                    revision === this.revision &&
                    sessionIsActive(session, this.ownerKey, this.ports.now())
                ) {
                    // 原生再次检查停止标记；不能在停止事件与 JS 对账之间复活通知。
                    await this.ports.post(session).catch(() => undefined);
                }
            } else {
                await this.ports.cancel();
            }
            // Receiver 可能在上述异步权限查询/发卡期间收到停止动作。
            const latestStopped = await this.ports.stopped();
            if (this.snapshot.session?.sessionId === latestStopped) {
                await this.clear("notification");
            }
            if (latestStopped)
                await this.ports.acknowledgeStopped(latestStopped);
            if (stoppedId) await this.ports.acknowledgeStopped(stoppedId);
            if (revision !== this.revision) return;
            this.loaded = true;
            this.snapshot.ready = true;
            this.publish();
        });
    }

    start(duration: ExcerptSessionDuration) {
        const revision = this.revision;
        return this.enqueue(async () => {
            if (
                !this.loaded ||
                !this.snapshot.ready ||
                !this.ownerKey ||
                revision !== this.revision ||
                !isSessionDuration(duration)
            )
                throw new Error("会话尚未就绪，请稍后重试");
            if (
                sessionIsActive(
                    this.snapshot.session,
                    this.ownerKey,
                    this.ports.now(),
                )
            )
                return;
            this.snapshot.pending = true;
            this.publish();
            try {
                const permitted = await this.ports
                    .permission(true)
                    .catch(() => false);
                if (revision !== this.revision)
                    throw new Error("账号已变化，请重新开启");
                const startedAt = this.ports.now();
                const session: ExcerptSession = {
                    sessionId: this.ports.newId(),
                    ownerKey: this.ownerKey,
                    startedAt,
                    endsAt: startedAt + duration * 60_000,
                    durationMinutes: duration,
                };
                await this.ports.save(session);
                if (revision !== this.revision) {
                    await this.clear();
                    return;
                }
                this.snapshot.session = session;
                this.snapshot.lastDuration = duration;
                let visible = false;
                if (permitted) {
                    try {
                        await this.ports.post(session);
                        visible = true;
                    } catch {
                        /* 会话已经持久化，发卡失败降级为应用内。 */
                    }
                }
                if (revision === this.revision) this.ports.started(visible);
            } finally {
                this.snapshot.pending = false;
                if (revision === this.revision) this.publish();
            }
        });
    }

    stop() {
        const revision = this.revision;
        return this.enqueue(async () => {
            if (revision !== this.revision) return;
            this.snapshot.pending = true;
            this.publish();
            try {
                await this.clear(this.snapshot.session ? "manual" : undefined);
            } finally {
                this.snapshot.pending = false;
                this.publish();
            }
        });
    }
}
