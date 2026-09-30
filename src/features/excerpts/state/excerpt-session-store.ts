import { create } from "zustand";
import type { ExcerptSessionDuration } from "../domain/excerpt-session";
import type { ExcerptSessionSnapshot } from "../services/excerpt-session-coordinator";

export const useExcerptSessionStore = create<
    ExcerptSessionSnapshot & {
        start: (duration: ExcerptSessionDuration) => Promise<void>;
        stop: () => Promise<void>;
    }
>(() => ({
    ready: false,
    pending: false,
    session: null,
    lastDuration: 30,
    start: async () => {
        throw new Error("会话尚未就绪");
    },
    stop: async () => undefined,
}));
