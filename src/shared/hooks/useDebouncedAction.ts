import { useCallback, useEffect, useRef } from "react";

/** Prevents a keyed UI action from running repeatedly within a short interval. */

const DEFAULT_LOCK_MS = 500;

export function useDebouncedAction(lockMs = DEFAULT_LOCK_MS) {
  const locksRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = timersRef.current;
    const locks = locksRef.current;

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      locks.clear();
    };
  }, []);

  return useCallback(
    (actionKey: string, action: () => void) => {
      if (locksRef.current.has(actionKey)) {
        return;
      }

      locksRef.current.add(actionKey);
      action();

      const existingTimer = timersRef.current.get(actionKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        locksRef.current.delete(actionKey);
        timersRef.current.delete(actionKey);
      }, lockMs);

      timersRef.current.set(actionKey, timer);
    },
    [lockMs],
  );
}
