import api from "@/shared/http/client";
import { beginNoteCloudWrite } from "../notes.events";
import {
    parseChanges,
    withSyncResponseContext,
    parseSnapshot,
    type NotesSyncTransport,
} from "./notes-sync.types";

// Observe existing mutation routes without changing their wire protocol or Axios setup.
const writes = new WeakMap<object, () => void>();
api.interceptors.request.use((config) => {
    if (
        config.method !== "get" &&
        /^\/(notes|categories)(\/|$)/.test(config.url ?? "")
    ) {
        writes.set(config, beginNoteCloudWrite());
    }
    return config;
});
function finished(config: object | undefined) {
    if (!config) return;
    writes.get(config)?.();
    writes.delete(config);
}
api.interceptors.response.use(
    (response) => {
        finished(response.config);
        return response;
    },
    (error: unknown) => {
        finished((error as { config?: object })?.config);
        return Promise.reject(error);
    },
);

export const notesSyncTransport: NotesSyncTransport = {
    async snapshot(owner, query, signal) {
        const response = await api.get<unknown>("/notes/snapshot", {
            params: query,
            signal,
        });
        return withSyncResponseContext(
            "/api/notes/snapshot",
            response.status,
            () => parseSnapshot(response.data, owner),
        );
    },
    async changes(owner, cursor, limit, signal) {
        const response = await api.get<unknown>("/notes/changes", {
            params: { cursor, limit },
            signal,
        });
        return withSyncResponseContext(
            "/api/notes/changes",
            response.status,
            () => parseChanges(response.data, owner),
        );
    },
};
