import {
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
import {
  diagnosticErrorCategory,
  opaqueDiagnosticId,
  recordDiagnostic,
} from "@/core/diagnostics";
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
import { SystemPreferencesRepository } from "@/features/settings/data/system-preferences.repository";
import {
  parseTodoNotificationData,
  type SystemNotificationPermission,
} from "./system-notification.types";
import { SystemNotificationContext } from "./system-notification-context";
import {
  applicationNotificationPermission,
  exactAlarmAccess,
  ensureRuntimeNotification,
  initializeSystemNotifications,
  openSystemNotificationSettings,
  openExactAlarmSettings,
  removeRuntimeNotification,
  requestApplicationNotificationPermission,
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
      const kind = notification.request.content.data?.kind;
      if (kind === "runtime-status") {
        void recordDiagnostic("runtime_notification", "received_foreground");
        return {
          shouldShowBanner: false,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      }
      if (kind === "diagnostic-test") {
        void recordDiagnostic("diagnostic_notification", "received_foreground");
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        };
      }
      const data = parseTodoNotificationData(notification.request.content.data);
      const current = snapshot();
      const todo =
        data && resolveReminderTarget(data, current.ownerKey, current.entities);
      const show = !!todo && todo.reminderEnabled && !todo.isCompleted;
      void recordDiagnostic("todo_reminder", "delivery_evaluated", {
        notification: opaqueDiagnosticId(notification.request.identifier),
        payloadValid: !!data,
        targetFound: !!todo,
        show,
      });
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
}

export function SystemNotificationProvider({ children }: PropsWithChildren) {
  const database = useApplicationDatabase();
  const scope = useTodoScope();
  const navigation = useRootNavigationState();
  const [permission, setPermission] =
    useState<SystemNotificationPermission | null>(
      supportsSystemNotifications
        ? null
        : { granted: false, canAskAgain: false },
    );
  const [runtimeNotificationEnabled, setRuntimeNotificationEnabledState] =
    useState(false);
  const [runtimeNotificationPending, setRuntimeNotificationPending] = useState(
    supportsSystemNotifications,
  );
  const [response, setResponse] =
    useState<Notifications.NotificationResponse | null>(null);
  const handled = useRef(new Set<string>());
  const preferences = useMemo(
    () => new SystemPreferencesRepository(database),
    [database],
  );
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
        const exactAccess = await exactAlarmAccess();
        const previousExactAccess = await preferences.exactAlarmAccess();
        const forceReschedule =
          exactAccess === "granted" && previousExactAccess !== "granted";
        await coordinator.reconcile({ forceReschedule });
        if (exactAccess !== "unavailable" && exactAccess !== previousExactAccess)
          await preferences.setExactAlarmAccess(exactAccess);
        void recordDiagnostic("exact_alarm", "state_reconciled", {
          status: exactAccess,
          previousStatus: previousExactAccess ?? "unknown",
          forceReschedule,
        });
        if (active && previousExactAccess === "denied" && forceReschedule)
          banner.show({
            id: "todo-reminder-exact-alarm-enabled",
            title: "准时提醒权限已开启",
            message: "已有未来提醒已重新安排",
            type: "success",
          });
        const runtimeEnabled = await preferences.runtimeNotificationEnabled();
        if (!active) return;
        setRuntimeNotificationEnabledState(runtimeEnabled);
        const applicationPermission = await applicationNotificationPermission();
        if (runtimeEnabled && applicationPermission.granted)
          await ensureRuntimeNotification();
        void recordDiagnostic("runtime_notification", "state_reconciled", {
          enabled: runtimeEnabled,
          permissionGranted: applicationPermission.granted,
        });
      } catch (cause) {
        void recordDiagnostic(
          "notifications",
          "provider_refresh_failed",
          {
            error: diagnosticErrorCategory(cause),
          },
          "error",
        );
        if (active)
          banner.show({
            id: "todo-reminder-error",
            title: "系统提醒暂不可用",
            type: "important",
          });
      } finally {
        if (active) setRuntimeNotificationPending(false);
      }
    };
    void refresh();
    const unsubscribe = todoRepository.subscribe(() => {
      void coordinator.reconcile();
    });
    const appState = AppState.addEventListener("change", (state) => {
      void recordDiagnostic("application", "state_changed", { state });
      if (state === "active") void refresh();
    });
    const receivedListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        const kind = notification.request.content.data?.kind;
        void recordDiagnostic("notifications", "received", {
          notification: opaqueDiagnosticId(notification.request.identifier),
          kind: typeof kind === "string" ? kind : "unknown",
        });
      },
    );
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
      receivedListener.remove();
    };
  }, [coordinator, preferences]);

  useEffect(() => {
    if (!response || !navigation?.key || !scope.ready) return;
    const id = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    const data = parseTodoNotificationData(
      response.notification.request.content.data,
    );
    const kind = response.notification.request.content.data?.kind;
    void recordDiagnostic("notifications", "response_received", {
      notification: opaqueDiagnosticId(
        response.notification.request.identifier,
      ),
      kind: typeof kind === "string" ? kind : "unknown",
      action:
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
          ? "default"
          : "custom",
    });
    if (!data) {
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
      return;
    }
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

  async function setRuntimeNotificationEnabled(enabled: boolean) {
    setRuntimeNotificationPending(true);
    void recordDiagnostic("runtime_notification", "toggle_requested", {
      enabled,
    });
    try {
      if (enabled) {
        const nextPermission = await requestApplicationNotificationPermission();
        if (!nextPermission.granted) {
          setPermission(nextPermission);
          banner.show({
            title: "请先开启系统通知",
            message: "开启后才能显示常驻通知",
            type: "neutral",
          });
          return false;
        }
        await preferences.setRuntimeNotificationEnabled(true);
        await ensureRuntimeNotification();
        setRuntimeNotificationEnabledState(true);
      } else {
        await preferences.setRuntimeNotificationEnabled(false);
        await removeRuntimeNotification();
        setRuntimeNotificationEnabledState(false);
      }
      void recordDiagnostic("runtime_notification", "toggle_completed", {
        enabled,
      });
      return true;
    } catch (cause) {
      void recordDiagnostic(
        "runtime_notification",
        "toggle_failed",
        {
          enabled,
          error: diagnosticErrorCategory(cause),
        },
        "error",
      );
      banner.show({
        title: enabled ? "常驻通知开启失败" : "常驻通知关闭失败",
        message: "诊断日志已记录本次失败",
        type: "important",
      });
      return false;
    } finally {
      setRuntimeNotificationPending(false);
    }
  }

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
      exactAlarmAccess,
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
      showExactAlarmDisabled: () => {
        banner.show({
          id: "todo-reminder-exact-alarm",
          title: "待办已保存，准时提醒权限尚未开启",
          message: "系统可能延迟到点提醒",
          type: "neutral",
          action: {
            label: "去开启",
            onPress: async () => {
              if (!current()) return;
              try {
                await openExactAlarmSettings();
              } catch {
                banner.show({
                  title: "无法打开准时提醒设置",
                  message: "请在系统设置中找到 IRisNote 的闹钟和提醒权限",
                  type: "neutral",
                });
              }
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
      value={{
        permission,
        runtimeNotificationEnabled,
        runtimeNotificationPending,
        setRuntimeNotificationEnabled,
        afterSave,
        openSettings,
      }}
    >
      {children}
    </SystemNotificationContext.Provider>
  );
}
