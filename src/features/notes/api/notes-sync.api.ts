import api from "@/shared/http/client";
import type { AxiosRequestConfig } from "axios";
import { beginNoteCloudWrite } from "../notes.events";
import { ensureNotesServerV2 } from "./notes-capability";
import { probeNotesServer } from "./notes.api";
import {
    parseBatch,
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

export function createNotesSyncTransport(
    config: AxiosRequestConfig = {},
): NotesSyncTransport {
    return {
        async snapshot(owner, query, signal) {
            const response = await api.get<unknown>("/notes/snapshot", {
                ...config,
                params: query,
                signal,
            });
            return withSyncResponseContext(
                "/api/notes/snapshot",
                response.status,
                () => parseSnapshot(response.data, owner),
            );
        },
        async changes(owner, cursor, limit, signal, fields) {
            const response = await api.get<unknown>("/notes/changes", {
                ...config,
                params: { cursor, limit, ...(fields ? { fields } : {}) },
                signal,
            });
            return withSyncResponseContext(
                "/api/notes/changes",
                response.status,
                () => parseChanges(response.data, owner),
            );
        },
        // A login read restores full bodies; the capability probe is not part of its read lease.
        supportsMeta:
            config.loginRestoreId === undefined
                ? () => ensureNotesServerV2(probeNotesServer)
                : async () => false,
        async batch(owner, ids, signal) {
            const response = await api.get<unknown>("/notes/batch", {
                ...config,
                params: { ids: ids.join(",") },
                signal,
            });
            return withSyncResponseContext(
                "/api/notes/batch",
                response.status,
                () => parseBatch(response.data, owner),
            );
        },
    };
}

export const notesSyncTransport = createNotesSyncTransport();
