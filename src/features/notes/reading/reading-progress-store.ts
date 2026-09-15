import type {
  ReadingHistory,
  ReadingPosition,
  ReadingRecord,
} from "./reading-position";
export interface ReadingStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}
const prefix = "irisnote:reading:";
const keyFor = (owner: number, note: number) => `${prefix}${owner}:${note}`;
const validPercent = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
export function decodeReadingRecord(
  raw: string | null,
  owner: number,
  note: number,
): ReadingHistory | null {
  if (raw === null) return null;
  const v: unknown = JSON.parse(raw);
  if (validPercent(v)) return { percent: v };
  if (!v || typeof v !== "object") throw new Error("阅读位置记录格式无效");
  const r = v as ReadingRecord;
  if (
    r.schema !== 2 ||
    r.ownerId !== owner ||
    r.noteId !== note ||
    !validPercent(r.percent) ||
    !Number.isInteger(r.line) ||
    r.line < 1 ||
    !Number.isInteger(r.character) ||
    r.character < 0 ||
    typeof r.contentVersion !== "string" ||
    !Number.isFinite(r.updatedAt) ||
    !Number.isInteger(r.localVersion) ||
    r.localVersion < 1 ||
    (r.serverId !== null &&
      (!Number.isInteger(r.serverId) || r.serverId <= 0)) ||
    (r.serverVersion !== null && typeof r.serverVersion !== "string") ||
    typeof r.pendingSync !== "boolean" ||
    (r.anchor !== null &&
      (!r.anchor ||
        typeof r.anchor.before !== "string" ||
        typeof r.anchor.text !== "string" ||
        typeof r.anchor.after !== "string"))
  )
    throw new Error("阅读位置记录格式无效");
  return r;
}
/** Serialize per key; retain the latest failed write in memory for retry. */
export class ReadingProgressStore {
  private queues = new Map<string, Promise<unknown>>();
  private pending = new Map<string, ReadingRecord>();
  constructor(private storage: ReadingStorage) {}
  async read(owner: number, note: number): Promise<ReadingHistory | null> {
    const key = keyFor(owner, note);
    await this.queues.get(key)?.catch(() => {});
    return this.peek(owner, note);
  }
  private async peek(
    owner: number,
    note: number,
  ): Promise<ReadingHistory | null> {
    const key = keyFor(owner, note);
    return (
      this.pending.get(key) ??
      decodeReadingRecord(await this.storage.getItem(key), owner, note)
    );
  }
  private enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    this.queues.set(key, next);
    void next
      .finally(() => {
        if (this.queues.get(key) === next) this.queues.delete(key);
      })
      .catch(() => {});
    return next;
  }
  save(
    owner: number,
    note: number,
    serverId: number | null,
    position: ReadingPosition,
  ): Promise<ReadingRecord> {
    const key = keyFor(owner, note);
    return this.enqueue(key, async () => {
      const previous = await this.peek(owner, note);
      const record: ReadingRecord = {
        ...position,
        schema: 2,
        ownerId: owner,
        noteId: note,
        serverId:
          serverId !== null && Number.isInteger(serverId) && serverId > 0
            ? serverId
            : null,
        updatedAt: Math.max(
          Date.now(),
          previous && "updatedAt" in previous ? previous.updatedAt + 1 : 0,
        ),
        localVersion:
          previous && "localVersion" in previous
            ? previous.localVersion + 1
            : 1,
        serverVersion:
          previous && "serverVersion" in previous
            ? previous.serverVersion
            : null,
        pendingSync: true,
      };
      this.pending.set(key, record);
      await this.storage.setItem(key, JSON.stringify(record));
      if (this.pending.get(key) === record) this.pending.delete(key);
      return record;
    });
  }
  retry(owner: number, note: number): Promise<void> {
    const key = keyFor(owner, note);
    return this.enqueue(key, async () => {
      const record = this.pending.get(key);
      if (!record) return;
      await this.storage.setItem(key, JSON.stringify(record));
      if (this.pending.get(key) === record) this.pending.delete(key);
    });
  }
  async list(owner: number): Promise<ReadingRecord[]> {
    const ownerPrefix = `${prefix}${owner}:`;
    const keys = [...new Set([
      ...(await this.storage.getAllKeys()),
      ...this.pending.keys(),
    ])].filter((key) => key.startsWith(ownerPrefix));
    const records = await Promise.all(
      keys.map(async (key) => {
        const note = Number(key.slice(ownerPrefix.length));
        if (!Number.isInteger(note)) return null;
        const record = await this.read(owner, note);
        return record && "updatedAt" in record ? record : null;
      }),
    );
    return records.filter((record): record is ReadingRecord => record !== null);
  }
  async listPending(owner: number): Promise<ReadingRecord[]> {
    return (await this.list(owner)).filter((record) => record.pendingSync);
  }
}
