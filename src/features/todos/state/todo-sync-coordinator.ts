import { TodoApiError } from "../sync.types";

/** Single drain, coalesced wakeups; no concurrent requests across network/foreground events. */
export function startTodoSyncCoordinator(options: {
  run: (signal: AbortSignal) => Promise<number>;
  onError: (error: unknown) => void;
  onSuccess: (pending: number) => void;
}) {
  let stopped = false;
  let active = false;
  let online = false;
  let running = false;
  let authPaused = false;
  let requested = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
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
      const pending = await options.run(request.signal);
      if (!stopped && !request.signal.aborted) options.onSuccess(pending);
    } catch (error) {
      failed = true;
      if (!stopped && !request.signal.aborted) {
        if (error instanceof TodoApiError && error.status === 401)
          authPaused = true;
        options.onError(error);
      }
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
    setActive(value: boolean) {
      active = value;
      if (!value) controller?.abort();
      else wake();
    },
    setOnline(value: boolean) {
      online = value;
      if (!value) controller?.abort();
      else wake();
    },
    stop() {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    },
  };
}
