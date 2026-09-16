import type { ApplicationDatabase } from "@/core/database";
import { enqueueUploadTask } from "@/core/sync/upload-queue.repository";
import { estimateJsonBytes } from "@/core/sync/upload-queue.utils";
import type { DraftCommit } from "@/features/notes/data/note-draft.repository";
import type { Note } from "@/features/notes/notes.types";

export function enqueueNoteUpload(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    draft?: DraftCommit,
) {
    const payload = {
        clientId: note.id,
        revisionId: note.current_revision_id ?? null,
        ...(draft
            ? {
                draft: {
                    key: draft.key,
                    sessionId: draft.sessionId,
                    sequence: draft.sequence,
                    removeExplicitFile: draft.removeExplicitFile === true,
                },
            }
            : {}),
    };
    return enqueueUploadTask(database, {
        ownerUserId,
        kind: "note-sync",
        dedupeKey: `note:${note.id}`,
        title: note.title || "未命名笔记",
        operationLabel: note.sync_operation === "create" ? "新建笔记" : "修改笔记",
        payload,
        estimatedBytes: estimateJsonBytes({
            title: note.title,
            content: note.content ?? "",
            category_id: note.category_id,
        }),
    });
}
