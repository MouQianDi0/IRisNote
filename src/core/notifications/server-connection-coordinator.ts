import {
  onConnectionEvent,
  onConnectionReset,
} from "@/shared/http/connection-events";
import { banner, captureNotificationSession, notificationStore } from "./notification.service";

const id = "server-connection";
export function isServerConnectionUnavailable() {
  return notificationStore.getSnapshot().some(item => item.id === id && item.lifetime.mode === "until-resolved");
}
/** A single read-only probe, exponential retry, and no automatic write replay. */
export function startConnectionCoordinator(
  probe: (signal: AbortSignal) => Promise<unknown>,
) {
  let latest = 0;
  let failures = 0;
  let fault = false;
  let active = true;
  let stopped = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    request?.abort();
    request = undefined;
  };
  const schedule = () => {
    if (stopped || !active || timer || request || !failures) return;
    timer = setTimeout(
      () => {
        timer = undefined;
        void retry();
      },
      Math.min(30000, 2000 * 2 ** Math.min(attempt++, 4)),
    );
  };
  const retry = async () => {
    if (!active || request || stopped) return;
    clearTimeout(timer);
    timer = undefined;
    const controller = new AbortController();
    request = controller;
    const current = captureNotificationSession();
    try {
      await probe(controller.signal);
    } catch {
      /* HTTP events classify the outcome. */
    } finally {
      if (current() && request === controller) {
        request = undefined;
        schedule();
      }
    }
  };
  const remove = onConnectionEvent((event) => {
    if (event.sequence < latest || stopped) return;
    latest = event.sequence;
    if (event.outcome === "success") {
      failures = 0;
      attempt = 0;
      clearTimeout(timer);
      timer = undefined;
      if (fault)
        banner.resolve(id, { type: "success", title: "服务器连接已恢复" });
      fault = false;
      return;
    }
    if (event.outcome === "reachable") {
      failures = 0;
      clearTimeout(timer);
      timer = undefined;
      if (fault)
        banner.resolve(id, {
          type: "important",
          title: "服务器已响应，请检查当前请求状态",
          message: "连接已建立，请检查登录、权限或页面错误提示",
          lifetime: { mode: "persistent" },
        });
      fault = false;
      return;
    }
    failures++;
    if (failures >= 2) {
      fault = true;
      const content = {
        title: "无法连接服务器，正在重连",
        type: "important" as const,
        priority: "critical" as const,
        lifetime: { mode: "until-resolved" as const },
        icon: "cloud-off" as const,
        action: { label: "重试", onPress: retry },
      };
      if (!banner.update(id, content)) banner.show({ id, ...content });
    }
    schedule();
  });
  const reset = onConnectionReset(() => {
    cancel();
    failures = 0;
    fault = false;
    latest = 0;
    attempt = 0;
  });
  return {
    setActive(value: boolean) {
      active = value;
      if (!active) cancel();
      else schedule();
    },
    stop() {
      stopped = true;
      cancel();
      remove();
      reset();
    },
  };
}
