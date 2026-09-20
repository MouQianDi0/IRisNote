import { useEffect, useLayoutEffect, useRef, type PropsWithChildren } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { router } from "expo-router";
import { banner, captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createTodoTransport } from "../api/todos.api";
import { useTodoScope } from "../hooks/useTodoScope";
import { syncTodos } from "../services/todo-sync.service";
import { todoRepository } from "./todo-store";
import { startTodoSyncCoordinator } from "./todo-sync-coordinator";
import { onTodoSyncRetry } from "./todo-sync-runtime";

export const TODO_CLOUD_SYNC_ENABLED =
  process.env.EXPO_PUBLIC_TODO_CLOUD_SYNC === "1";
export function TodoSyncProvider({ children }: PropsWithChildren) {
  const scope = useTodoScope();
  const { user, token, loading } = useAuth();
  const current = useRef({ owner: scope.ownerKey, token, loading });
  useLayoutEffect(() => {
    current.current = { owner: scope.ownerKey, token, loading };
  }, [scope.ownerKey, token, loading]);
  useEffect(() => {
    if (
      !TODO_CLOUD_SYNC_ENABLED ||
      !scope.ready ||
      loading ||
      !user ||
      !token ||
      scope.ownerKey !== `user:${user.id}`
    )
      return;
    const owner = scope.ownerKey;
    const generation = todoRepository.generation;
    let stopped = false;
    const session = captureNotificationSession();
    const valid = () =>
      !stopped &&
      !current.current.loading &&
      current.current.owner === owner &&
      current.current.token === token &&
      todoRepository.ownerKey === owner &&
      todoRepository.generation === generation;
    const coordinator = startTodoSyncCoordinator({
      run: (signal) =>
        syncTodos({
          repository: todoRepository,
          ownerKey: owner,
          transport: createTodoTransport(user.id, token, signal),
          isCurrent: () => valid() && !signal.aborted,
        }),
      onError: () => {
        if (!valid() || !session()) return;
        const content = {
          id: "todo-cloud-sync",
          title: "待办同步未完成",
          message: "本地内容已保留，可在同步队列查看和重试",
          type: "important" as const,
          action: {
            label: "查看待办同步",
            onPress: () => {
              if (valid()) router.push("/pages/user/sync-queue");
            },
          },
        };
        if (!banner.update(content.id, content)) banner.show(content);
      },
      onSuccess: (pending) => {
        if (!valid() || !session()) return;
        if (!pending) {
          banner.dismiss("todo-cloud-sync");
          return;
        }
        const content = {
          id: "todo-cloud-sync",
          title: "待办尚未全部同步",
          message: `${pending} 项本地修改已保留，可在同步队列查看或处理冲突`,
          type: "important" as const,
          action: {
            label: "查看待办同步",
            onPress: () => {
              if (valid()) router.push("/pages/user/sync-queue");
            },
          },
        };
        if (!banner.update(content.id, content)) banner.show(content);
      },
    });
    const applyNetwork = (state: Network.NetworkState) => {
      if (valid())
        coordinator.setOnline(
          state.isConnected === true && state.isInternetReachable !== false,
        );
    };
    const network = Network.addNetworkStateListener(applyNetwork);
    void Network.getNetworkStateAsync()
      .then(applyNetwork)
      .catch(() => undefined);
    coordinator.setActive(AppState.currentState === "active");
    const app = AppState.addEventListener("change", (state) =>
      coordinator.setActive(state === "active"),
    );
    const unsubscribe = todoRepository.subscribe(coordinator.wake);
    const retry = onTodoSyncRetry(coordinator.wake);
    return () => {
      stopped = true;
      coordinator.stop();
      network.remove();
      app.remove();
      unsubscribe();
      retry();
    };
  }, [scope.ready, scope.ownerKey, scope.generation, user, token, loading]);
  return children;
}
