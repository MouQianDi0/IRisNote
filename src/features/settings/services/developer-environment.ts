import {
    cloudStorageStatusLabel,
    getCloudStorageSnapshot,
} from "@/core/cloud-storage/cloud-storage-policy";
import { systemNotificationsAvailable } from "@/core/system-notifications/system-notification-provider";
import { TODO_NOTIFICATION_PREFIX } from "@/core/system-notifications/system-notification.types";
import { API_BASE_URL } from "@/shared/http/client";
import NativeSystem from "@modules/irisnote-system";
import NativeUpdater from "@modules/irisnote-updater";
import * as Application from "expo-application";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import {
    exactAlarmLabel,
    liveUpdateLabel,
    type DeveloperEnvironmentSnapshot,
} from "../utils/developer-environment-report";

const linked = (module: unknown) => (module ? "已链接" : "未链接");

function runMode() {
    const mode = __DEV__ ? "开发（__DEV__）" : "发布包";
    return isRunningInExpoGo() ? `${mode} · Expo Go` : mode;
}

function systemLabel() {
    const model = Device.modelName ? ` · ${Device.modelName}` : "";
    if (Platform.OS === "android")
        return `Android ${Device.osVersion ?? "?"}（API ${Platform.Version}）${model}`;
    return `${Platform.OS} ${Device.osVersion ?? String(Platform.Version)}${model}`;
}

/** 通知相关读数在 Expo Go 中不可用（不加载通知原生模块），按「不可用」展示。 */
async function notificationReadings() {
    const unavailable = {
        notificationPermission: "不可用",
        exactAlarm: "不可用",
        liveUpdate: "不支持",
        scheduledReminders: "不可用",
    };
    if (!systemNotificationsAvailable) return unavailable;
    const service =
        await import("@/core/system-notifications/system-notification.service");
    const [permission, alarm, scheduled] = await Promise.all([
        service.applicationNotificationPermission().catch(() => null),
        service.exactAlarmAccess(),
        service.systemNotifications.scheduled().catch(() => null),
    ]);
    const reminders = scheduled?.filter((item) =>
        item.identifier.startsWith(TODO_NOTIFICATION_PREFIX),
    );
    return {
        notificationPermission: !permission
            ? "读取失败"
            : permission.granted
              ? "已授权"
              : permission.canAskAgain
                ? "未授权（可再次请求）"
                : "未授权",
        exactAlarm: exactAlarmLabel(alarm),
        liveUpdate: liveUpdateLabel(
            service.liveUpdateSupported(),
            service.liveUpdateCompatSupported(),
        ),
        scheduledReminders: reminders ? `${reminders.length} 条` : "读取失败",
    };
}

export async function collectDeveloperEnvironment(): Promise<DeveloperEnvironmentSnapshot> {
    const cloud = getCloudStorageSnapshot();
    return {
        appVersion:
            Application.nativeApplicationVersion ??
            Constants.expoConfig?.version ??
            "未知",
        buildCode: Application.nativeBuildVersion ?? "未知",
        applicationId: Application.applicationId ?? "未知",
        runMode: runMode(),
        apiBaseUrl: API_BASE_URL,
        releaseApiUrl:
            process.env.EXPO_PUBLIC_RELEASE_API_URL?.trim() ||
            `${API_BASE_URL.replace(/\/$/, "")}/releases`,
        cloudStorage: cloudStorageStatusLabel(cloud),
        system: systemLabel(),
        nativeModules: `系统能力 ${linked(NativeSystem)} · 更新器 ${linked(NativeUpdater)}`,
        ...(await notificationReadings()),
    };
}
