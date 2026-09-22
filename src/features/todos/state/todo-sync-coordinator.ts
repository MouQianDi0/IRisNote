import { TodoApiError } from "../sync.types";
import type { TodoSyncResult } from "../services/todo-sync.service";

/** Single drain, coalesced wakeups; no concurrent requests across network/foreground events. */
export function startTodoSyncCoordinator(options: {
    run: (signal: AbortSignal) => Promise<TodoSyncResult>;
    onError: (error: unknown) => void;
    onSuccess: (result: TodoSyncResult) => void;
}) {
    let stopped = false;
    let active = false;
    let online = false;
    let running = false;
    let authPaused = false;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let waiters: {
        resolve: (result: TodoSyncResult) => void;
        reject: (cause: Error) => void;
    }[] = [];
    const rejectWaiters = (cause: Error) => {
        const current = waiters;
        waiters = [];
        current.forEach(({ reject }) => reject(cause));
    };
    const resolveWaiters = (result: TodoSyncResult) => {
        const current = waiters;
        waiters = [];
        current.forEach(({ resolve }) => resolve(result));
    };
    const schedule = (delay = 1000) => {
        if (stopped || !active || !online || authPaused) return;
        requested = true;
        if (!running && !timer)
            timer = setTimeout(() => {
                timer = null;
                void drain();
            }, delay);
    };
    const drain = async () => {
        if (stopped || !active || !online || authPaused || running) return;
        running = true;
        requested = false;
        const request = new AbortController();
        controller = request;
        let failed = false;
        try {
            const result = await options.run(request.signal);
            if (!stopped && !request.signal.aborted) {
                options.onSuccess(result);
                resolveWaiters(result);
            }
        } catch (error) {
            failed = true;
            if (!stopped && !request.signal.aborted) {
                if (error instanceof TodoApiError && error.status === 401)
                    authPaused = true;
                options.onError(error);
            }
            rejectWaiters(
                error instanceof Error ? error : new Error("待办同步失败"),
            );
        } finally {
            running = false;
            controller = null;
            if (!stopped) schedule(requested && !failed ? 1000 : 30000);
        }
    };
    const wake = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        schedule();
    };
    return {
        wake,
        refresh() {
            if (stopped)
                return Promise.reject(new Error("待办同步协调器已停止"));
            if (!active || !online || authPaused)
                return Promise.reject(new Error("待办云同步当前不可用"));
            return new Promise<TodoSyncResult>((resolve, reject) => {
                waiters.push({ resolve, reject });
                // A user-triggered refresh joins the in-flight drain rather than
                // scheduling a second network pass after it completes.
                if (running) return;
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
                schedule(0);
            });
        },
        setActive(value: boolean) {
            active = value;
            if (!value) {
                controller?.abort();
                rejectWaiters(new Error("待办同步已暂停"));
            } else wake();
        },
        setOnline(value: boolean) {
            online = value;
            if (!value) {
                controller?.abort();
                rejectWaiters(new Error("待办云同步当前离线"));
            } else wake();
        },
        stop() {
            stopped = true;
            controller?.abort();
            if (timer) clearTimeout(timer);
            rejectWaiters(new Error("待办同步协调器已停止"));
        },
    };
}
