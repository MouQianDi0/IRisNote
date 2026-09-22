import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
import NativeSystem from "@modules/irisnote-system";
import {
  diagnosticErrorCategory,
  opaqueDiagnosticId,
  recordDiagnostic,
} from "@/core/diagnostics";
import {
  DIAGNOSTIC_CHANNEL,
  REMINDER_CHANNEL,
  RUNTIME_CHANNEL,
  RUNTIME_NOTIFICATION_ID,
  type ExactAlarmAccess,
  type SystemNotificationPermission,
  type SystemNotificationPort,
} from "./system-notification.types";

export const supportsSystemNotifications =
  Platform.OS === "android" || Platform.OS === "ios";

export async function initializeSystemNotifications() {
  if (!supportsSystemNotifications) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: "待办提醒",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      showBadge: false,
    });
    void recordDiagnostic("notifications", "reminder_channel_ready", {
      channel: REMINDER_CHANNEL,
      importance: "high",
    });
  }
}

async function initializeRuntimeNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(RUNTIME_CHANNEL, {
    name: "运行状态",
    description: "显示 IRisNote 正在运行",
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    enableVibrate: false,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  void recordDiagnostic("notifications", "runtime_channel_ready", {
    channel: RUNTIME_CHANNEL,
    importance: "low",
  });
}

async function initializeDiagnosticNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(DIAGNOSTIC_CHANNEL, {
    name: "通知测试",
    description: "用于验证普通系统通知展示链路",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
    enableVibrate: true,
    showBadge: false,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  void recordDiagnostic("notifications", "diagnostic_channel_ready", {
    channel: DIAGNOSTIC_CHANNEL,
    importance: "default",
  });
}

function permissionResult(
  value: Notifications.NotificationPermissionsStatus,
): SystemNotificationPermission {
  return {
    granted:
      value.granted ||
      value.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      value.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL,
    canAskAgain: value.canAskAgain,
  };
}

export async function applicationNotificationPermission() {
  if (!supportsSystemNotifications)
    return { granted: false, canAskAgain: false };
  const permission = permissionResult(
    await Notifications.getPermissionsAsync(),
  );
  void recordDiagnostic("notifications", "application_permission_read", {
    granted: permission.granted,
    canAskAgain: permission.canAskAgain,
  });
  return permission;
}

export const systemNotifications: SystemNotificationPort = {
  async permission() {
    if (!supportsSystemNotifications)
      return { granted: false, canAskAgain: false };
    const permission = await applicationNotificationPermission();
    if (Platform.OS === "android" && permission.granted) {
      const channel =
        await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL);
      if (channel?.importance === Notifications.AndroidImportance.NONE) {
        void recordDiagnostic(
          "notifications",
          "reminder_channel_blocked",
          {
            channel: REMINDER_CHANNEL,
          },
          "warning",
        );
        return { granted: false, canAskAgain: false };
      }
    }
    return permission;
  },
  async scheduled() {
    return supportsSystemNotifications
      ? Notifications.getAllScheduledNotificationsAsync()
      : [];
  },
  async schedule(identifier, at, body, data) {
    if (!supportsSystemNotifications) throw new Error("当前平台不支持系统提醒");
    await initializeSystemNotifications();
    const diagnosticId = opaqueDiagnosticId(`${data.ownerKey}:${data.todoId}`);
    void recordDiagnostic("todo_reminder", "schedule_requested", {
      todo: diagnosticId,
      triggerAt: new Date(at).toISOString(),
    });
    try {
      const returnedId = await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: "待办提醒",
          body,
          data,
          sound: "default",
          interruptionLevel: "active",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(at),
          channelId: REMINDER_CHANNEL,
        },
      });
      void recordDiagnostic("todo_reminder", "schedule_accepted", {
        todo: diagnosticId,
        notification: opaqueDiagnosticId(returnedId),
      });
      return returnedId;
    } catch (cause) {
      void recordDiagnostic(
        "todo_reminder",
        "schedule_failed",
        {
          todo: diagnosticId,
          error: diagnosticErrorCategory(cause),
        },
        "error",
      );
      throw cause;
    }
  },
  async cancel(identifier) {
    if (!supportsSystemNotifications) return;
    const notification = opaqueDiagnosticId(identifier);
    void recordDiagnostic("todo_reminder", "cancel_requested", {
      notification,
    });
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
      await Notifications.dismissNotificationAsync(identifier);
      void recordDiagnostic("todo_reminder", "cancel_completed", {
        notification,
      });
    } catch (cause) {
      void recordDiagnostic(
        "todo_reminder",
        "cancel_failed",
        {
          notification,
          error: diagnosticErrorCategory(cause),
        },
        "error",
      );
      throw cause;
    }
  },
};

let requesting: Promise<SystemNotificationPermission> | null = null;
export function requestApplicationNotificationPermission(): Promise<SystemNotificationPermission> {
  if (requesting) return requesting;
  const pending = (async () => {
    if (!supportsSystemNotifications)
      return { granted: false, canAskAgain: false };
    await initializeSystemNotifications();
    const current = await applicationNotificationPermission();
    if (current.granted || !current.canAskAgain) return current;
    void recordDiagnostic("notifications", "permission_request_started");
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    const result = await applicationNotificationPermission();
    void recordDiagnostic("notifications", "permission_request_finished", {
      granted: result.granted,
      canAskAgain: result.canAskAgain,
    });
    return result;
  })();
  requesting = pending;
  void pending.then(
    () => {
      requesting = null;
    },
    () => {
      requesting = null;
    },
  );
  return pending;
}

export async function requestSystemNotificationPermission() {
  await requestApplicationNotificationPermission();
  return systemNotifications.permission();
}

export async function exactAlarmAccess(): Promise<ExactAlarmAccess> {
  if (Platform.OS !== "android") return "not-required";
  if (!NativeSystem) {
    void recordDiagnostic(
      "exact_alarm",
      "access_unavailable",
      undefined,
      "warning",
    );
    return "unavailable";
  }
  try {
    const status = await NativeSystem.getExactAlarmAccess();
    void recordDiagnostic("exact_alarm", "access_read", { status });
    return status;
  } catch (cause) {
    void recordDiagnostic(
      "exact_alarm",
      "access_read_failed",
      { error: diagnosticErrorCategory(cause) },
      "error",
    );
    return "unavailable";
  }
}

export async function openExactAlarmSettings() {
  if (Platform.OS !== "android")
    throw new Error("当前平台不需要准时提醒特殊权限");
  const status = await exactAlarmAccess();
  if (status === "not-required") return;
  if (status === "unavailable")
    throw new Error("当前安装包不支持读取准时提醒权限");
  void recordDiagnostic("exact_alarm", "settings_open_requested", { status });
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.REQUEST_SCHEDULE_EXACT_ALARM,
    { data: `package:${Application.applicationId}` },
  );
}

export async function ensureRuntimeNotification() {
  if (!supportsSystemNotifications) return;
  await initializeRuntimeNotificationChannel();
  const presented = await Notifications.getPresentedNotificationsAsync();
  if (
    presented.some(
      (item) => item.request.identifier === RUNTIME_NOTIFICATION_ID,
    )
  ) {
    void recordDiagnostic("runtime_notification", "already_presented");
    return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: RUNTIME_NOTIFICATION_ID,
    content: {
      title: "IRisNote正在运行",
      data: { kind: "runtime-status" },
      sticky: true,
      autoDismiss: false,
    },
    trigger: Platform.OS === "android" ? { channelId: RUNTIME_CHANNEL } : null,
  });
  void recordDiagnostic("runtime_notification", "presented");
}

export async function removeRuntimeNotification() {
  if (!supportsSystemNotifications) return;
  await Notifications.cancelScheduledNotificationAsync(RUNTIME_NOTIFICATION_ID);
  await Notifications.dismissNotificationAsync(RUNTIME_NOTIFICATION_ID);
  void recordDiagnostic("runtime_notification", "removed");
}

export async function sendDiagnosticTestNotification() {
  if (!supportsSystemNotifications) throw new Error("当前平台不支持系统通知");
  await initializeDiagnosticNotificationChannel();
  void recordDiagnostic("diagnostic_notification", "send_requested");
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: "IRisNote 测试通知",
        body: "如果你看到这条通知，系统通知展示链路工作正常。",
        data: { kind: "diagnostic-test" },
        sound: "default",
        autoDismiss: true,
      },
      trigger:
        Platform.OS === "android" ? { channelId: DIAGNOSTIC_CHANNEL } : null,
    });
    void recordDiagnostic("diagnostic_notification", "send_accepted", {
      notification: opaqueDiagnosticId(identifier),
    });
    return identifier;
  } catch (cause) {
    void recordDiagnostic(
      "diagnostic_notification",
      "send_failed",
      {
        error: diagnosticErrorCategory(cause),
      },
      "error",
    );
    throw cause;
  }
}

export async function openSystemNotificationSettings() {
  if (Platform.OS === "android") {
    await IntentLauncher.startActivityAsync(
      "android.settings.APP_NOTIFICATION_SETTINGS",
      {
        extra: {
          "android.provider.extra.APP_PACKAGE": Application.applicationId,
        },
      },
    );
  } else if (Platform.OS === "ios") await Linking.openURL("app-settings:");
  else throw new Error("当前平台不支持系统通知设置");
}
