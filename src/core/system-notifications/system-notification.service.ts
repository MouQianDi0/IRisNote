import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
import {
  REMINDER_CHANNEL,
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
  }
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

export const systemNotifications: SystemNotificationPort = {
  async permission() {
    if (!supportsSystemNotifications)
      return { granted: false, canAskAgain: false };
    const permission = permissionResult(
      await Notifications.getPermissionsAsync(),
    );
    if (Platform.OS === "android" && permission.granted) {
      const channel =
        await Notifications.getNotificationChannelAsync(REMINDER_CHANNEL);
      if (channel?.importance === Notifications.AndroidImportance.NONE)
        return { granted: false, canAskAgain: false };
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
    return Notifications.scheduleNotificationAsync({
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
  },
  async cancel(identifier) {
    if (!supportsSystemNotifications) return;
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.dismissNotificationAsync(identifier);
  },
};

let requesting: Promise<SystemNotificationPermission> | null = null;
export function requestSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (requesting) return requesting;
  const pending = (async () => {
    if (!supportsSystemNotifications)
      return { granted: false, canAskAgain: false };
    await initializeSystemNotifications();
    const current = await systemNotifications.permission();
    if (current.granted || !current.canAskAgain) return current;
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return systemNotifications.permission();
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
