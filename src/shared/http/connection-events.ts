export type ConnectionEvent = {
  generation: number;
  sequence: number;
  outcome: "success" | "unavailable" | "reachable";
};
let generation = 0;
let sequence = 0;
const listeners = new Set<(event: ConnectionEvent) => void>();
const resetListeners = new Set<() => void>();
export function requestConnectionStamp() {
  return { generation, sequence: ++sequence };
}
export function publishConnectionEvent(event: ConnectionEvent) {
  if (event.generation !== generation) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      console.warn("[Connection] 状态监听器失败，请求结果保持不变");
    }
  }
}
export function onConnectionEvent(listener: (event: ConnectionEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function onConnectionReset(listener: () => void) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}
export function resetConnectionSession() {
  generation++;
  resetListeners.forEach((listener) => listener());
}
