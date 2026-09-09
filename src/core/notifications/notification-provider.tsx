import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { OverlayProvider } from "@/shared/ui/Overlay/overlay-context";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { banner, notificationStore } from "./notification.service";
import { NotificationHost } from "./notification-host";
import api from "@/shared/http/client";
import { resetConnectionSession } from "@/shared/http/connection-events";
import { startConnectionCoordinator } from "./server-connection-coordinator";

export function NotificationProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const owner = useRef<number | null | undefined>(undefined);
  const announced = useRef(new Set<string>());
  const welcomed = useRef(new Set<number>());
  useLayoutEffect(() => {
    if (loading) return;
    const next = user?.id ?? null;
    if (owner.current === next) return;
    banner.clearSession();
    resetConnectionSession();
    announced.current.clear();
    owner.current = next;
    if (next === null) welcomed.current.clear();
    if (next !== null && !welcomed.current.has(next)) {
      welcomed.current.add(next);
      banner.show({
        id: "session-welcome",
        type: "special",
        priority: "low",
        title: "欢迎回来",
        lifetime: { mode: "timed", durationMs: 3000 },
        queueTtlMs: 3000,
      });
    }
  }, [user?.id, loading]);
  useEffect(() => {
    if (!user?.id || loading) return;
    const coordinator = startConnectionCoordinator((signal) =>
      api.get("/user/profile", { signal, timeout: 8000 }),
    );
    coordinator.setActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      coordinator.setActive(state === "active"),
    );
    return () => {
      coordinator.stop();
      subscription.remove();
    };
  }, [user?.id, loading]);
  useEffect(() => {
    notificationStore.setActive(AppState.currentState === "active");
    const appState = AppState.addEventListener("change", (state) =>
      notificationStore.setActive(state === "active"),
    );
    const timer = setInterval(() => notificationStore.tick(), 100);
    // Screen-reader mode keeps timed notices available until the user dismisses them.
    const setReader = (enabled: boolean) => {
      for (const item of notificationStore.getSnapshot())
        notificationStore.pause(item.id, "screen-reader", enabled);
    };
    let reader = false;
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (alive) {
        reader = value;
        setReader(value);
      }
    });
    const readerEvent = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      (value) => {
        reader = value;
        setReader(value);
      },
    );
    const unsubscribe = notificationStore.subscribe(() => {
      for (const item of notificationStore.getSnapshot()) {
        notificationStore.pause(item.id, "screen-reader", reader);
        const key = `${item.id}:${item.title}`;
        if (item.displayed && !announced.current.has(key)) {
          announced.current.add(key);
          if (announced.current.size > 200)
            announced.current.delete(announced.current.values().next().value!);
          AccessibilityInfo.announceForAccessibility(
            `${item.title}。${item.message ?? ""}`,
          );
        }
      }
    });
    return () => {
      alive = false;
      clearInterval(timer);
      appState.remove();
      readerEvent.remove();
      unsubscribe();
      notificationStore.setActive(false);
    };
  }, []);
  const render = useCallback(() => <NotificationHost />, []);
  return <OverlayProvider render={render}>{children}</OverlayProvider>;
}
