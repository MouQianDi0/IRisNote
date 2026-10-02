import { captureLocalStorageAccess } from "@/core/cloud-storage/cloud-storage-policy";
import type { NoteDraftValue } from "../data/note-draft.repository";

type ComparisonInput = {
    owner: number;
    noteId: number;
    revisionId: string;
    currentValue: NoteDraftValue;
    createdAt: string;
    updatedAt: string | null;
    categories: readonly { id: number; name: string }[];
};
export type NoteHistoryComparisonSession = Readonly<ComparisonInput>;
type Entry = { value: NoteHistoryComparisonSession; checkAccess: () => void };
const sessions = new Map<string, Entry>();
let sequence = 0;

/** 正文只放在内存；路由携带短 ID。编辑页拥有快照，关闭编辑页时释放。 */
export function createNoteHistoryComparison(input: ComparisonInput) {
    const checkAccess = captureLocalStorageAccess(input.owner);
    const token = `history-${Date.now().toString(36)}-${++sequence}`;
    sessions.set(token, {
        checkAccess,
        value: Object.freeze({
            ...input,
            currentValue: Object.freeze({ ...input.currentValue }),
            categories: input.categories.map((category) => ({ ...category })),
        }),
    });
    // 限制导航栈异常累积时的正文保留量；过期入口可返回编辑页重新打开。
    while (sessions.size > 4) sessions.delete(sessions.keys().next().value!);
    return token;
}

export function readNoteHistoryComparison(
    token: string | undefined,
    owner: number | null,
    noteId: number | null,
    revisionId: string | undefined,
) {
    if (!token) return null;
    const entry = sessions.get(token);
    if (
        !entry ||
        entry.value.owner !== owner ||
        entry.value.noteId !== noteId ||
        entry.value.revisionId !== revisionId
    )
        return null;
    try {
        // 检查账号会话，A → B → A 也不能复用 A 的旧快照。
        entry.checkAccess();
        return entry.value;
    } catch {
        sessions.delete(token);
        return null;
    }
}

export function releaseNoteHistoryComparison(token: string | null) {
    if (token) sessions.delete(token);
}
