import type {
  BannerContent,
  BannerOptions,
  BannerRecord,
} from "./notification.types";

const ranks = { low: 0, normal: 1, high: 2, critical: 3 };
export function selectBanners(items: readonly BannerRecord[]) {
  const pinned = items.filter(
    (item) => item.lifetime.mode === "until-resolved",
  );
  const slots = 3 - (pinned.length > 2 ? 1 : pinned.length);
  const ordinary = items
    .filter((item) => item.lifetime.mode !== "until-resolved")
    .sort(
      (a, b) =>
        ranks[b.priority] - ranks[a.priority] || a.createdAt - b.createdAt,
    )
    .slice(0, slots);
  return { pinned, ordinary };
}

/** Pure state machine; a single provider drives the clock, including Modal hosts. */
export class NotificationStore {
  private items: BannerRecord[] = [];
  private listeners = new Set<() => void>();
  private paused = new Map<string, Set<string>>();
  private visible = new Set<string>();
  private active = true;
  private serial = 0;
  private generation = 0;
  constructor(private now = () => performance.now()) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.items;
  captureSession = () => {
    const generation = this.generation;
    return () => generation === this.generation;
  };
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private remaining(item: BannerRecord) {
    return Math.max(
      0,
      item.remainingMs -
        (item.runningSince === null ? 0 : this.now() - item.runningSince),
    );
  }
  private normalize(content: BannerContent) {
    const lifetime =
      content.lifetime ??
      (content.type === "important"
        ? { mode: "persistent" as const }
        : { mode: "timed" as const, durationMs: 5000 });
    if (
      lifetime.mode === "timed" &&
      (!Number.isFinite(lifetime.durationMs ?? 5000) ||
        (lifetime.durationMs ?? 5000) <= 0)
    )
      throw new Error("durationMs must be positive");
    const critical =
      content.priority === "critical" || lifetime.mode === "until-resolved";
    return {
      ...content,
      lifetime: critical ? { mode: "until-resolved" as const } : lifetime,
      priority: critical
        ? ("critical" as const)
        : (content.priority ??
          (content.type === "important"
            ? ("high" as const)
            : ("normal" as const))),
    };
  }
  private restartClocks() {
    this.items = this.items.map((item) => ({
      ...item,
      remainingMs: this.remaining(item),
      runningSince:
        this.active &&
        this.visible.has(item.id) &&
        !this.paused.get(item.id)?.size &&
        !item.busy &&
        item.lifetime.mode === "timed"
          ? this.now()
          : null,
      displayed: item.displayed || this.visible.has(item.id),
    }));
  }
  show = (options: BannerOptions) => {
    const id = options.id ?? `banner:${++this.serial}`;
    if (this.items.some((item) => item.id === id)) return id;
    const content = this.normalize(options);
    this.items = [
      ...this.items,
      {
        ...content,
        id,
        scope: options.scope ?? "session",
        queueTtlMs: options.queueTtlMs ?? 30000,
        createdAt: this.now(),
        displayed: false,
        remainingMs:
          content.lifetime.mode === "timed"
            ? (content.lifetime.durationMs ?? 5000)
            : 0,
        runningSince: null,
        version: ++this.serial,
        instance: this.serial,
        busy: false,
      },
    ];
    const waiting = this.items
      .filter(
        (item) =>
          !this.visible.has(item.id) && item.lifetime.mode !== "until-resolved",
      )
      .sort(
        (a, b) =>
          ranks[a.priority] - ranks[b.priority] || a.createdAt - b.createdAt,
      );
    const dropped = new Set(
      waiting.slice(0, Math.max(0, waiting.length - 20)).map((item) => item.id),
    );
    this.items = this.items.filter((item) => !dropped.has(item.id));
    for (const droppedId of dropped) this.paused.delete(droppedId);
    this.restartClocks();
    this.emit();
    return id;
  };
  update = (id: string, patch: Partial<BannerContent>) => {
    const item = this.items.find((item) => item.id === id);
    if (!item) return false;
    const content = this.normalize({ ...item, ...patch });
    const next = {
      ...item,
      ...content,
      version: ++this.serial,
      remainingMs: patch.lifetime
        ? content.lifetime.mode === "timed"
          ? (content.lifetime.durationMs ?? 5000)
          : 0
        : this.remaining(item),
      runningSince: null,
    };
    this.items = this.items.map((item) => (item.id === id ? next : item));
    this.restartClocks();
    this.emit();
    return true;
  };
  resolve = (id: string, result: BannerContent) => {
    if (
      result.lifetime?.mode === "until-resolved" ||
      result.priority === "critical"
    )
      throw new Error("Resolved banners cannot be critical");
    return this.update(id, {
      message: undefined,
      icon: undefined,
      action: undefined,
      bodyAction: undefined,
      progress: undefined,
      priority: "normal",
      ...result,
      lifetime: result.lifetime ?? { mode: "timed", durationMs: 5000 },
    });
  };
  dismiss = (id: string) => {
    if (
      !this.items.some(
        (item) => item.id === id && item.lifetime.mode !== "until-resolved",
      )
    )
      return false;
    this.items = this.items.filter((item) => item.id !== id);
    this.paused.delete(id);
    this.emit();
    return true;
  };
  clearSession = () => {
    this.generation++;
    this.items = this.items.filter((item) => item.scope === "app");
    for (const id of this.paused.keys())
      if (!this.items.some((item) => item.id === id)) this.paused.delete(id);
    this.emit();
  };
  setVisible(ids: string[]) {
    const next = new Set(ids);
    if (
      next.size === this.visible.size &&
      [...next].every((id) => this.visible.has(id))
    )
      return;
    this.visible = next;
    this.restartClocks();
    this.emit();
  }
  setActive(active: boolean) {
    if (this.active !== active) {
      this.active = active;
      this.restartClocks();
      this.emit();
    }
  }
  pause(id: string, reason: string, paused: boolean) {
    const reasons = this.paused.get(id) ?? new Set<string>();
    if (reasons.has(reason) === paused) return;
    if (paused) reasons.add(reason);
    else reasons.delete(reason);
    if (reasons.size) this.paused.set(id, reasons);
    else this.paused.delete(id);
    this.restartClocks();
    this.emit();
  }
  tick() {
    const before = this.items.length;
    const next = this.items.filter((item) => {
      const expired =
        item.displayed &&
        item.lifetime.mode === "timed" &&
        this.remaining(item) <= 0;
      const stale =
        !item.displayed &&
        item.lifetime.mode !== "until-resolved" &&
        this.now() - item.createdAt >= item.queueTtlMs;
      if (expired || stale) {
        this.paused.delete(item.id);
        return false;
      }
      return true;
    });
    if (before !== next.length) {
      this.items = next;
      this.emit();
    }
  }
  async invoke(id: string, target: "action" | "bodyAction") {
    const item = this.items.find((item) => item.id === id);
    const action = item?.[target];
    if (!item || !action || item.busy) return;
    const version = item.version;
    const current =
      item.scope === "session" ? this.captureSession() : () => true;
    this.items = this.items.map((entry) =>
      entry.id === id ? { ...entry, busy: true } : entry,
    );
    this.restartClocks();
    this.emit();
    try {
      await action.onPress();
      if (
        current() &&
        action.dismissOnSuccess &&
        this.items.find((entry) => entry.id === id)?.version === version
      )
        this.dismiss(id);
    } catch {
      if (
        current() &&
        this.items.find((entry) => entry.id === id)?.version === version
      )
        this.update(id, { message: "操作未完成，请重试" });
    } finally {
      if (
        current() &&
        this.items.find((entry) => entry.id === id)?.instance === item.instance
      ) {
        this.items = this.items.map((entry) =>
          entry.id === id ? { ...entry, busy: false } : entry,
        );
        this.restartClocks();
        this.emit();
      }
    }
  }
}
