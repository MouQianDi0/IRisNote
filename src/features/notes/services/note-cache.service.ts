import type { ApplicationDatabase } from "@/core/database";
import { captureCloudStorageAccess } from "@/core/cloud-storage/cloud-storage-policy";
import { notesSyncTransport } from "../api/notes-sync.api";
import { parseCloudNote, type CloudNote } from "../api/notes-sync.types";
import {
  evictNoteCache,
  readNoteCacheCandidates,
} from "../data/note-cache.repository";
import { savedDraftFiles } from "../data/saved-draft-files";
import { removeCachedNoteById } from "../notes.cache";
import { noteCloudWriteStamp, notifyNotesChanged } from "../notes.events";
import { flushActiveDrafts } from "./active-draft-flush";
import { withNoteCacheMaintenance } from "./note-sync-coordinator";

export async function clearNoteCache(
  db: ApplicationDatabase,
  owner: number,
  assertSession: () => void,
) {
  const permission = captureCloudStorageAccess(owner);
  return withNoteCacheMaintenance(db, owner, async () => {
    await flushActiveDrafts();
    const stamp = noteCloudWriteStamp();
    const check = () => {
      assertSession();
      permission();
      const current = noteCloudWriteStamp();
      if (stamp.busy || current.busy || current.version !== stamp.version)
        throw new Error("笔记正在变更，已保留缓存，请稍后重试");
    };
    check();
    const before = await readNoteCacheCandidates(db, owner);
    if (!before.length) return { ids: [], skipped: 0 };
    const savedIds = new Set<number>();
    for (const key of await savedDraftFiles.keys(owner)) {
      const text = await savedDraftFiles.read(owner, key);
      if (text === null) continue;
      const draft: unknown = JSON.parse(text);
      if (!draft || typeof draft !== "object" || !("note_id" in draft))
        throw new Error("草稿无法核实，已保留笔记缓存");
      if (typeof draft.note_id === "number") savedIds.add(draft.note_id);
    }
    const cloud = new Map<number, CloudNote>();
    const controller = new AbortController();
    let cursor: string | undefined, token: string | undefined;
    const seen = new Set<string>();
    try {
      for (;;) {
        check();
        const page = await notesSyncTransport.snapshot(
          owner,
          {
            limit: 50,
            ...(cursor && token ? { cursor, snapshot_token: token } : {}),
          },
          controller.signal,
        );
        check();
        if (token && page.page.snapshot_token !== token)
          throw new Error("云端快照已变化，请重试");
        token = page.page.snapshot_token;
        for (const note of page.data) {
          if (cloud.has(note.id))
            throw new Error("云端快照重复，已保留笔记缓存");
          cloud.set(note.id, note);
        }
        if (!page.page.has_more) break;
        const next = page.page.next_cursor;
        if (!next || seen.has(next) || !page.data.length)
          throw new Error("云端快照分页异常，已保留笔记缓存");
        seen.add(next);
        cursor = next;
      }
      const confirmed = before.filter((row) => {
        if (savedIds.has(row.client_id)) return false;
        const remote = cloud.get(row.server_id);
        const cached = parseCloudNote(JSON.parse(row.payload), owner);
        return (
          remote &&
          remote.client_id === cached.client_id &&
          remote.version === cached.version &&
          remote.title === row.title &&
          remote.content === row.content &&
          remote.category_id === row.category_id &&
          remote.updated_at === row.server_updated_at &&
          Boolean(remote.is_pinned) === Boolean(row.is_pinned) &&
          Boolean(remote.is_starred) === Boolean(row.is_starred)
        );
      });
      const result = await evictNoteCache(db, owner, confirmed, check);
      for (const id of result.ids) {
        removeCachedNoteById(id, owner);
        notifyNotesChanged({ type: "remove", noteId: id, ownerUserId: owner });
      }
      return { ids: result.ids, skipped: before.length - result.ids.length };
    } finally {
      controller.abort();
    }
  });
}
