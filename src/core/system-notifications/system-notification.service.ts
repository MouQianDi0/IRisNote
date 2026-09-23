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
    LIVE_TEST_CHANNEL,
    LIVE_TEST_NOTIFICATION_ID,
    LIVE_TODO_CHANNEL,
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
            lockscreenVisibility:
                Notifications.AndroidNotificationVisibility.PRIVATE,
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
        lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PRIVATE,
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
        lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PRIVATE,
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
            value.ios?.status ===
                Notifications.IosAuthorizationStatus.PROVISIONAL ||
            value.ios?.status ===
                Notifications.IosAuthorizationStatus.EPHEMERAL,
        canAskAgain: value.canAskAgain,
    };
}

/**
 * 进程内记忆上次记录的授权状态：仅翻转时写 application_permission_read，
 * 避免动态卡片 30 秒节律的重复读取冲刷诊断窗口（其余调用方为低频，不受影响）。
 */
let lastRecordedPermissionGranted: boolean | null = null;

export async function applicationNotificationPermission() {
    if (!supportsSystemNotifications)
        return { granted: false, canAskAgain: false };
    const permission = permissionResult(
        await Notifications.getPermissionsAsync(),
    );
    if (permission.granted !== lastRecordedPermissionGranted) {
        lastRecordedPermissionGranted = permission.granted;
        void recordDiagnostic("notifications", "application_permission_read", {
            granted: permission.granted,
            canAskAgain: permission.canAskAgain,
        });
    }
    return permission;
}

export const systemNotifications: SystemNotificationPort = {
    async permission() {
        if (!supportsSystemNotifications)
            return { granted: false, canAskAgain: false };
        const permission = await applicationNotificationPermission();
        if (Platform.OS === "android" && permission.granted) {
            const channel =
                await Notifications.getNotificationChannelAsync(
                    REMINDER_CHANNEL,
                );
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
        if (!supportsSystemNotifications)
            throw new Error("当前平台不支持系统提醒");
        await initializeSystemNotifications();
        const diagnosticId = opaqueDiagnosticId(
            `${data.ownerKey}:${data.todoId}`,
        );
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
        trigger:
            Platform.OS === "android" ? { channelId: RUNTIME_CHANNEL } : null,
    });
    void recordDiagnostic("runtime_notification", "presented");
}

export async function removeRuntimeNotification() {
    if (!supportsSystemNotifications) return;
    await Notifications.cancelScheduledNotificationAsync(
        RUNTIME_NOTIFICATION_ID,
    );
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
                Platform.OS === "android"
                    ? { channelId: DIAGNOSTIC_CHANNEL }
                    : null,
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

export function liveUpdateSupported(): boolean {
    return (
        Platform.OS === "android" &&
        Number(Platform.Version) >= 36 &&
        NativeSystem !== null
    );
}

export type LiveUpdateContent = {
    id: number;
    channelId: string;
    title: string;
    text: string | null;
    progress: number;
    max: number;
    indeterminate: boolean;
    ongoing: boolean;
    /**
     * 请求 Live Updates 提升式展示（状态栏胶囊/锁屏常驻/抽屉置顶）。
     * 默认开启：仅 live-test/live-todo 两渠道走本收口，内容均为
     * "用户主动发起、正在进行"的任务（计时器/进行中待办），符合政策准入；
     * 普通提醒类不经此函数，政策禁区不受影响。36.0 设备原生侧自动退化。
     */
    promoted?: boolean;
};

async function initializeLiveUpdateChannels() {
    if (Platform.OS !== "android") return;
    await Notifications.setNotificationChannelAsync(LIVE_TEST_CHANNEL, {
        name: "动态通知测试",
        description: "用于验证 Android 16 动态通知展示链路",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: "default",
        enableVibrate: true,
        showBadge: false,
        lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    void recordDiagnostic("live_update", "test_channel_ready", {
        channel: LIVE_TEST_CHANNEL,
        importance: "default",
    });
    await Notifications.setNotificationChannelAsync(LIVE_TODO_CHANNEL, {
        name: "待办进行中",
        description: "正在进行中的待办动态进度卡片",
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    void recordDiagnostic("live_update", "todo_channel_ready", {
        channel: LIVE_TODO_CHANNEL,
        importance: "low",
    });
}

let liveUpdateChannelsReady: Promise<void> | null = null;

/** 渠道初始化进程内记忆一次；失败后允许下次重试。 */
export function ensureLiveUpdateChannels(): Promise<void> {
    if (!liveUpdateChannelsReady) {
        liveUpdateChannelsReady = initializeLiveUpdateChannels().catch(
            (cause) => {
                liveUpdateChannelsReady = null;
                throw cause;
            },
        );
    }
    return liveUpdateChannelsReady;
}

export async function postLiveUpdate(
    content: LiveUpdateContent,
): Promise<void> {
    if (!liveUpdateSupported())
        throw new Error("动态通知需要 Android 16 及以上设备");
    await ensureLiveUpdateChannels();
    const native = NativeSystem;
    if (!native) throw new Error("当前安装包不支持动态通知");
    try {
        await native.postProgressNotification({
            id: content.id,
            channelId: content.channelId,
            title: content.title,
            text: content.text,
            progress: content.progress,
            max: content.max,
            indeterminate: content.indeterminate,
            ongoing: content.ongoing,
            promoted: content.promoted ?? true,
        });
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "post_failed",
            {
                notification: content.id,
                error: diagnosticErrorCategory(cause),
            },
            "error",
        );
        throw cause;
    }
}

export async function cancelLiveUpdate(id: number): Promise<void> {
    if (!liveUpdateSupported()) return;
    const native = NativeSystem;
    if (!native) return;
    try {
        await native.cancelProgressNotification(id);
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "cancel_failed",
            {
                notification: id,
                error: diagnosticErrorCategory(cause),
            },
            "error",
        );
        throw cause;
    }
}

let staleLiveUpdatesCleared: Promise<void> | null = null;

/**
 * 冷启动清理被杀残留：进程死亡时 JS 无机会撤卡，系统栏可能残留不可滑除的
 * ongoing 卡片。启动时按 live-todo 渠道整清 + 无条件撤下演示通知；
 * 进程内只执行一次，失败仅记诊断、不打断启动链路。
 */
export function clearStaleLiveUpdates(): Promise<void> {
    if (!staleLiveUpdatesCleared) {
        staleLiveUpdatesCleared = (async () => {
            if (!liveUpdateSupported()) return;
            const native = NativeSystem;
            if (!native) return;
            try {
                await native.cancelProgressNotificationsByChannel(
                    LIVE_TODO_CHANNEL,
                );
                await native.cancelProgressNotification(
                    LIVE_TEST_NOTIFICATION_ID,
                );
                void recordDiagnostic("live_update", "stale_cleared");
            } catch (cause) {
                void recordDiagnostic(
                    "live_update",
                    "stale_clear_failed",
                    { error: diagnosticErrorCategory(cause) },
                    "error",
                );
            }
        })();
    }
    return staleLiveUpdatesCleared;
}

export const LIVE_DEMO_SECONDS = 120;

export type LiveUpdateDemoResult = "completed" | "cancelled" | "failed";

export type LiveUpdateDemoHandle = {
    cancel(): void;
    completion: Promise<LiveUpdateDemoResult>;
};

/**
 * 设置页动态通知演示：120 秒倒计时，进度每秒原位更新同一条通知
 * （同一整型 ID + setOnlyAlertOnce），倒计时归零后自动消除。
 */
export function startDiagnosticLiveUpdateDemo(options?: {
    onTick?: (remainingSeconds: number) => void;
}): LiveUpdateDemoHandle {
    let remaining = LIVE_DEMO_SECONDS;
    let timer: ReturnType<typeof setInterval> | null = null;
    let finished = false;
    let settle: (result: LiveUpdateDemoResult) => void = () => {};
    const completion = new Promise<LiveUpdateDemoResult>((resolve) => {
        settle = resolve;
    });

    const post = async () => {
        if (finished) return;
        await postLiveUpdate({
            id: LIVE_TEST_NOTIFICATION_ID,
            channelId: LIVE_TEST_CHANNEL,
            title: "IRisNote 动态通知",
            text: `倒计时演示：剩余 ${remaining} 秒`,
            progress: remaining,
            max: LIVE_DEMO_SECONDS,
            indeterminate: false,
            ongoing: true,
        });
        options?.onTick?.(remaining);
    };

    const finish = async (result: LiveUpdateDemoResult) => {
        if (finished) return;
        finished = true;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        try {
            await cancelLiveUpdate(LIVE_TEST_NOTIFICATION_ID);
        } catch {
            // 取消失败已写入诊断日志，不影响演示结果上报
        }
        void recordDiagnostic("live_update", "demo_finished", { result });
        settle(result);
    };

    void (async () => {
        try {
            if (!liveUpdateSupported())
                throw new Error("动态通知需要 Android 16 及以上设备");
            await post();
            void recordDiagnostic("live_update", "demo_started", {
                seconds: LIVE_DEMO_SECONDS,
            });
            timer = setInterval(() => {
                if (finished) return;
                remaining = Math.max(0, remaining - 1);
                void post()
                    .then(() => {
                        if (remaining <= 0) return finish("completed");
                    })
                    .catch(() => finish("failed"));
            }, 1000);
        } catch (cause) {
            void recordDiagnostic(
                "live_update",
                "demo_failed",
                { error: diagnosticErrorCategory(cause) },
                "error",
            );
            finished = true;
            settle("failed");
        }
    })();

    return {
        cancel: () => {
            void finish("cancelled");
        },
        completion,
    };
}

export async function openSystemNotificationSettings() {
    if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync(
            "android.settings.APP_NOTIFICATION_SETTINGS",
            {
                extra: {
                    "android.provider.extra.APP_PACKAGE":
                        Application.applicationId,
                },
            },
        );
    } else if (Platform.OS === "ios") await Linking.openURL("app-settings:");
    else throw new Error("当前平台不支持系统通知设置");
}
