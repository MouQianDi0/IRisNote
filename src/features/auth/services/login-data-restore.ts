type Domain = "categories" | "notes" | "todos";
type Phase = "pending" | "running" | "done" | "failed";
export type LoginRestoreState = {
    id: number;
    owner: number;
    token: string;
    phase: Phase;
};
type Tasks = Record<Domain, (signal: AbortSignal) => Promise<void>>;

/** Memory-only: startup/session refresh never creates a login recovery request. */
export function createLoginDataRestoreController() {
    let state: LoginRestoreState | null = null;
    let sequence = 0;
    let active: AbortController | undefined;
    let completed = new Set<Domain>();
    let running: Promise<void> | undefined;
    const listeners = new Set<() => void>();
    const publish = () => listeners.forEach((listener) => listener());
    return {
        getState: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        request(owner: number, token: string) {
            active?.abort();
            running = undefined;
            completed = new Set();
            state = { id: ++sequence, owner, token, phase: "pending" };
            publish();
        },
        cancel() {
            active?.abort();
            state = null;
            completed = new Set();
            running = undefined;
            publish();
        },
        retry(id: number) {
            if (state?.id !== id || state.phase !== "failed") return;
            state = { ...state, phase: "pending" };
            publish();
        },
        start(id: number, tasks: Tasks): Promise<void> {
            if (state?.id !== id) return Promise.resolve();
            if (running) return running;
            if (state.phase !== "pending") return Promise.resolve();
            const controller = new AbortController();
            active = controller;
            const finished = completed;
            const current = () =>
                state?.id === id && !controller.signal.aborted;
            state = { ...state, phase: "running" };
            const run = async (domain: Domain) => {
                if (!current()) throw new Error("登录数据读取已取消");
                if (finished.has(domain)) return;
                await tasks[domain](controller.signal);
                if (!current()) throw new Error("登录数据读取已取消");
                finished.add(domain);
            };
            // Categories must precede notes so server category IDs can be mapped locally.
            // Todo failure must not discard a successful notes/categories recovery (or vice versa).
            running = Promise.allSettled([
                run("categories").then(() => run("notes")),
                run("todos"),
            ]).then((results) => {
                if (!current() || !state) return;
                state = {
                    ...state,
                    phase: results.every((r) => r.status === "fulfilled")
                        ? "done"
                        : "failed",
                };
                running = undefined;
                publish();
            });
            publish();
            return running;
        },
    };
}

export const loginDataRestore = createLoginDataRestoreController();
