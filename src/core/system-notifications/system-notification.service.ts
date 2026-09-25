import * as Notifications from "expo-notifications";
import * as Application from "expo-application";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
import NativeSystem, {
    type NativeLiveTodoTimelineCard,
} from "@modules/irisnote-system";
import {
    diagnosticErrorCategory,
    opaqueDiagnosticId,
    recordDiagnostic,
} from "@/core/diagnostics";
import {
    DIAGNOSTIC_CHANNEL,
    LIVE_TEST_NOTIFICATION_ID,
    LIVE_TODO_CHANNEL,
    LIVE_TODO_SUMMARY_CHANNEL,
    LIVE_TODO_SUMMARY_NOTIFICATION_ID,
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
     * 默认关闭；聚合状态卡通过 postStateCard 明确开启。
     * 普通提醒类不经此函数，政策禁区不受影响。36.0 设备原生侧自动退化。
     */
    promoted?: boolean;
    /** 系统 chronometer 秒级计时锚点（epoch ms）；null 不启用。 */
    chronoAt?: number | null;
    /** true = 倒计时（锚点为终点），false = 正向计时（锚点为起点）。 */
    chronoCountdown?: boolean;
    iconResourceName?: string | null;
};

async function initializeLiveUpdateChannels() {
    if (Platform.OS !== "android") return;
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
    await Notifications.setNotificationChannelAsync(LIVE_TODO_SUMMARY_CHANNEL, {
        name: "待办总览",
        description: "今日待办的聚合动态状态",
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

/** 应用权限与待办进行中渠道均可展示时才允许发动态卡片。 */
export async function liveTodoNotificationPermission(): Promise<boolean> {
    if (!liveUpdateSupported()) return false;
    if (!(await applicationNotificationPermission()).granted) return false;
    await ensureLiveUpdateChannels();
    const channel = await Notifications.getNotificationChannelAsync(LIVE_TODO_CHANNEL);
    return channel !== null &&
        channel !== undefined &&
        channel.importance !== Notifications.AndroidImportance.NONE;
}

/** 聚合渠道权限独立于逐条卡渠道。 */
export async function liveTodoSummaryNotificationPermission(): Promise<boolean> {
    if (!liveUpdateSupported()) return false;
    if (!(await applicationNotificationPermission()).granted) return false;
    await ensureLiveUpdateChannels();
    const channel = await Notifications.getNotificationChannelAsync(LIVE_TODO_SUMMARY_CHANNEL);
    return channel !== null && channel !== undefined &&
        channel.importance !== Notifications.AndroidImportance.NONE;
}

/** 通用状态卡发送协议：调用模块声明渠道、快照文案、图标与通知身份。 */
export type StateCardPayload = {
    id: number;
    channelId: string;
    title: string;
    text: string;
    iconResourceName: string;
    chronoAt?: number | null;
    chronoCountdown?: boolean;
};

export function postStateCard(card: StateCardPayload): Promise<void> {
    return postLiveUpdate({
        id: card.id, channelId: card.channelId, title: card.title,
        text: card.text, progress: 0, max: 0, indeterminate: true,
        ongoing: true, promoted: true, iconResourceName: card.iconResourceName,
        chronoAt: card.chronoAt, chronoCountdown: card.chronoCountdown,
    });
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
            promoted: content.promoted ?? false,
            iconResourceName: content.iconResourceName ?? null,
            chronoAt: content.chronoAt ?? null,
            chronoCountdown: content.chronoCountdown ?? false,
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

/**
 * 方案 A：退后台移交时间线快照——原生闹钟节拍按墙钟差量刷新（分钟级），
 * 进程被杀后从持久化快照恢复续算。空数组等价于取消原生接管。
 */
export async function handoffLiveTodoTimelines(
    timelines: readonly NativeLiveTodoTimelineCard[],
): Promise<void> {
    if (!liveUpdateSupported()) return;
    const native = NativeSystem;
    if (!native) return;
    try {
        await native.scheduleLiveTodoCards([...timelines]);
        void recordDiagnostic("live_update", "handoff_scheduled", {
            cards: timelines.length,
        });
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "handoff_failed",
            {
                cards: timelines.length,
                error: diagnosticErrorCategory(cause),
            },
            "error",
        );
        throw cause;
    }
}

/**
 * 方案 B 数据供给：仅持久化时间线快照（不排闹钟）——JS 在前台启动
 * 前台服务前调用，FGS 每秒从快照重算；空数组等价于清空快照。
 * 失败记诊断后 rethrow，由协调器跳过本次 FGS 启动（保持方案 A 兜底）。
 */
export async function persistLiveTodoTimelines(
    timelines: readonly NativeLiveTodoTimelineCard[],
): Promise<void> {
    if (!liveUpdateSupported()) return;
    const native = NativeSystem;
    if (!native) return;
    try {
        await native.updateLiveTodoCards([...timelines]);
        void recordDiagnostic("live_update", "timeline_persisted", {
            cards: timelines.length,
        });
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "timeline_persist_failed",
            {
                cards: timelines.length,
                error: diagnosticErrorCategory(cause),
            },
            "error",
        );
        throw cause;
    }
}

/**
 * 回前台收回接管权：取消闹钟、清空原生快照；不动已展示的通知
 * （JS 差量刷新按同 ID 原位覆盖对账，避免闪烁）。失败记诊断后 rethrow
 * ——start() 据此放弃本轮接管，避免 JS 与原生闹钟双驱动（降级为原生
 * 分钟级驱动，下一次 start 重试收回）。
 */
export async function reclaimLiveTodoTimelines(): Promise<void> {
    if (!liveUpdateSupported()) return;
    const native = NativeSystem;
    if (!native) return;
    try {
        await native.cancelScheduledLiveTodoCards();
        void recordDiagnostic("live_update", "reclaimed");
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "reclaim_failed",
            { error: diagnosticErrorCategory(cause) },
            "error",
        );
        throw cause;
    }
}

/**
 * 方案 B：启动前台服务秒级刷新。仅限应用前台调用（Android 12+ 禁止
 * 后台启动前台服务）；后台误触发会被系统拒绝，此处捕获并记诊断，
 * 行为降级为方案 A 分钟级（闹钟节拍始终并存兜底）。
 */
export async function startLiveTodoForegroundService(): Promise<boolean> {
    if (!liveUpdateSupported()) return false;
    const native = NativeSystem;
    if (!native) return false;
    try {
        await native.startLiveTodoForegroundService();
        void recordDiagnostic("live_update", "fgs_start_requested");
        return true;
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "fgs_start_failed",
            { error: diagnosticErrorCategory(cause) },
            "error",
        );
        return false;
    }
}

/** 方案 B：停止前台服务；FGS 通知撤除，其余卡片由接管方对账。 */
export async function stopLiveTodoForegroundService(): Promise<void> {
    if (!liveUpdateSupported()) return;
    const native = NativeSystem;
    if (!native) return;
    try {
        await native.stopLiveTodoForegroundService();
        void recordDiagnostic("live_update", "fgs_stop_requested");
    } catch (cause) {
        void recordDiagnostic(
            "live_update",
            "fgs_stop_failed",
            { error: diagnosticErrorCategory(cause) },
            "error",
        );
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
                await native.cancelProgressNotificationsByChannel(
                    LIVE_TODO_SUMMARY_CHANNEL,
                );
                await native.cancelProgressNotification(
                    LIVE_TODO_SUMMARY_NOTIFICATION_ID,
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
