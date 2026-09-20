import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { router, useRootNavigationState } from "expo-router";
import { useApplicationDatabase } from "@/core/database";
import { banner } from "@/core/notifications";
import { useTodoScope } from "@/features/todos/hooks/useTodoScope";
import {
  todoRepository,
  selectTodoDate,
} from "@/features/todos/state/todo-store";
import { TodoReminderRepository } from "@/features/todos/data/todo-reminder.repository";
import { TodoReminderCoordinator } from "@/features/todos/state/todo-reminder-coordinator";
import {
  afterSavedTodoReminder,
  resolveReminderTarget,
} from "@/features/todos/services/todo-reminder.service";
import type { TodoEntity } from "@/features/todos/todos.types";
import {
  parseTodoNotificationData,
  type SystemNotificationPermission,
} from "./system-notification.types";
import {
  initializeSystemNotifications,
  openSystemNotificationSettings,
  requestSystemNotificationPermission,
  supportsSystemNotifications,
  systemNotifications,
} from "./system-notification.service";

function snapshot() {
  const { ownerKey, ready, generation } = todoRepository;
  return {
    ownerKey,
    ready,
    generation,
    entities: ownerKey && ready ? todoRepository.list(ownerKey) : [],
  };
}

if (supportsSystemNotifications) {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = parseTodoNotificationData(notification.request.content.data);
      const current = snapshot();
      const todo =
        data && resolveReminderTarget(data, current.ownerKey, current.entities);
      const show = !!todo && todo.reminderEnabled && !todo.isCompleted;
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

const SystemNotificationContext = createContext({
  permission: null as SystemNotificationPermission | null,
  afterSave: async (_todo: TodoEntity, _reason: "confirm" | "dismiss") => {},
  openSettings: () => {},
});
export const useSystemNotifications = () =>
  useContext(SystemNotificationContext);

export function SystemNotificationProvider({ children }: PropsWithChildren) {
  const database = useApplicationDatabase();
  const scope = useTodoScope();
  const navigation = useRootNavigationState();
  const [permission, setPermission] =
    useState<SystemNotificationPermission | null>(supportsSystemNotifications ? null : { granted: false, canAskAgain: false });
  const [response, setResponse] =
    useState<Notifications.NotificationResponse | null>(null);
  const handled = useRef(new Set<string>());
  const coordinator = useMemo(
    () =>
      new TodoReminderCoordinator(
        new TodoReminderRepository(database),
        systemNotifications,
        snapshot,
        (message) =>
          banner.show({
            id: "todo-reminder-error",
            title: "系统提醒",
            message,
            type: "important",
          }),
      ),
    [database],
  );

  useEffect(() => {
    if (!supportsSystemNotifications) return;
    let active = true;
    const refresh = async () => {
      try {
        await initializeSystemNotifications();
        const next = await systemNotifications.permission();
        if (!active) return;
        setPermission(next);
        await coordinator.reconcile();
      } catch {
        if (active)
          banner.show({
            id: "todo-reminder-error",
            title: "系统提醒暂不可用",
            type: "important",
          });
      }
    };
    void refresh();
    const unsubscribe = todoRepository.subscribe(() => {
      void coordinator.reconcile();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    const listener = Notifications.addNotificationResponseReceivedListener(
      (value) => {
        if (active) setResponse(value);
      },
    );
    void Notifications.getLastNotificationResponseAsync()
      .then((value) => {
        if (active && value) setResponse((previous) => previous ?? value);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
      listener.remove();
    };
  }, [coordinator]);

  useEffect(() => {
    if (!response || !navigation?.key || !scope.ready) return;
    const id = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    const data = parseTodoNotificationData(
      response.notification.request.content.data,
    );
    if (!data) return;
    const current = snapshot();
    const target = resolveReminderTarget(
      data,
      current.ownerKey,
      current.entities,
    );
    if (target) selectTodoDate(target.ownerKey, target.dateId);
    router.push({
      pathname: "/(tabs)/todo",
      params: { reminderVisit: String(Date.now()) },
    });
    if (!target)
      banner.show({
        title: "该提醒对应的待办已删除或不属于当前账号",
        type: "neutral",
      });
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [response, navigation?.key, scope.ready, scope.ownerKey]);

  const openSettings = () => {
    void openSystemNotificationSettings().catch(() => {
      banner.show({
        title: "无法打开系统通知设置",
        message: "请在系统设置中找到 IRisNote 的通知选项",
        type: "neutral",
      });
    });
  };

  async function afterSave(todo: TodoEntity, reason: "confirm" | "dismiss") {
    const generation = todoRepository.generation;
    const current = () =>
      todoRepository.ready &&
      todoRepository.ownerKey === todo.ownerKey &&
      todoRepository.generation === generation;
    await afterSavedTodoReminder(todo, reason, {
      isCurrent: current,
      permission: () => systemNotifications.permission(),
      request: requestSystemNotificationPermission,
      publish: setPermission,
      reconcile: () => coordinator.reconcile(),
      showDisabled: () => {
        banner.show({
          id: "todo-reminder-permission",
          title: "待办已保存，系统提醒尚未开启",
          type: "neutral",
          action: {
            label: "开启",
            onPress: async () => {
              if (!current()) return;
              const value = await requestSystemNotificationPermission();
              if (!current()) return;
              setPermission(value);
              if (!value.granted) openSettings();
              await coordinator.reconcile();
            },
          },
        });
      },
      showError: () => {
        banner.show({
          id: "todo-reminder-error",
          title: "待办已保存，系统提醒安排失败",
          type: "important",
        });
      },
    });
  }

  return (
    <SystemNotificationContext.Provider
      value={{ permission, afterSave, openSettings }}
    >
      {children}
    </SystemNotificationContext.Provider>
  );
}
