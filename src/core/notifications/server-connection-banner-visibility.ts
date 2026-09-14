import { notificationStore } from "./notification.service";

export const SERVER_CONNECTION_BANNER_ID = "server-connection";

type Listener = (suppressed: boolean) => void;

let suppressionCount = 0;
const listeners = new Set<Listener>();

export function isServerConnectionBannerSuppressed() {
  return suppressionCount > 0;
}

export function onServerConnectionBannerSuppressionChanged(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Temporarily withdraws the unresolved server banner while a detail screen owns
 * the same status. Releasing the lease lets coordinators publish it again.
 */
export function suppressServerConnectionBanner() {
  let released = false;
  suppressionCount += 1;
  notificationStore.withdraw(SERVER_CONNECTION_BANNER_ID);
  if (suppressionCount === 1) {
    listeners.forEach((listener) => listener(true));
  }

  return () => {
    if (released) return;
    released = true;
    suppressionCount = Math.max(0, suppressionCount - 1);
    if (suppressionCount === 0) {
      listeners.forEach((listener) => listener(false));
    }
  };
}
