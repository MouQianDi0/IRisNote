/** 与待办同步协调器的尾部防抖保持一致。 */
export const NOTE_STATUS_DEBOUNCE_MS = 1000;

export type NoteStatusRequest = {
    /** 仅用于区分键；账号与会话变化由 checkAccess / isCurrentSession 拦截。 */
    owner?: number;
    noteId: number;
    serverId: number;
    /** 本次切换前界面显示的值；该笔记没有待发送状态时视为服务端已确认的值。 */
    confirmed: boolean;
    desired: boolean;
    checkAccess: () => void;
    isCurrentSession: () => boolean;
    /** 仅在失败请求之后没有更新的切换时调用，参数是应回滚到的服务端确认值。 */
    onFailed: (confirmed: boolean, error: unknown) => void;
};

type Entry = Omit<NoteStatusRequest, "owner" | "noteId"> & {
    generation: number;
    sending: boolean;
    timer?: ReturnType<typeof setTimeout>;
};

/**
 * 按笔记合并布尔状态写入：尾部防抖只发送最后一次的值，同一笔记串行发送，
 * 最终值与服务端确认值相同时不发请求；旧请求失败不覆盖更新的切换。
 */
export function createNoteStatusWriter(options: {
    send: (serverId: number, value: boolean) => Promise<unknown>;
    delayMs?: number;
}) {
    const delayMs = options.delayMs ?? NOTE_STATUS_DEBOUNCE_MS;
    const entries = new Map<string, Entry>();

    const flush = async (key: string, entry: Entry) => {
        if (entry.sending || entries.get(key) !== entry) return;
        if (entry.desired === entry.confirmed) {
            entries.delete(key);
            return;
        }
        const value = entry.desired;
        const generation = entry.generation;
        entry.sending = true;
        try {
            entry.checkAccess();
            await options.send(entry.serverId, value);
            entry.confirmed = value;
        } catch (error) {
            if (entry.generation === generation) {
                entry.sending = false;
                entries.delete(key);
                if (entry.isCurrentSession())
                    entry.onFailed(entry.confirmed, error);
                return;
            }
            // 较新的切换会带着最新值重新发送，本次失败不回滚界面。
        }
        entry.sending = false;
        // 请求期间到期的计时器已放弃发送，由这里接着处理最新值。
        if (!entry.timer) void flush(key, entry);
    };

    return {
        request(input: NoteStatusRequest) {
            const key = `${input.owner ?? "current"}:${input.noteId}`;
            let entry = entries.get(key);
            if (!entry) {
                entry = {
                    serverId: input.serverId,
                    confirmed: input.confirmed,
                    desired: input.desired,
                    checkAccess: input.checkAccess,
                    isCurrentSession: input.isCurrentSession,
                    onFailed: input.onFailed,
                    generation: 0,
                    sending: false,
                };
                entries.set(key, entry);
            }
            entry.serverId = input.serverId;
            entry.desired = input.desired;
            entry.checkAccess = input.checkAccess;
            entry.isCurrentSession = input.isCurrentSession;
            entry.onFailed = input.onFailed;
            entry.generation++;
            clearTimeout(entry.timer);
            const current = entry;
            entry.timer = setTimeout(() => {
                current.timer = undefined;
                void flush(key, current);
            }, delayMs);
        },
    };
}
