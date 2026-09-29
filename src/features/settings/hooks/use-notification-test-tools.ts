import { diagnosticErrorCategory, recordDiagnostic } from "@/core/diagnostics";
import { banner } from "@/core/notifications";
import {
    systemNotificationsAvailable,
    useSystemNotifications,
} from "@/core/system-notifications/system-notification-provider";
import NativeSystem from "@modules/irisnote-system";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * 开发者选项的通知测试工具：普通测试通知与 60 秒模拟待办动态通知。
 * 逻辑自帮助与反馈页原样迁出，诊断 scope/事件名保持不变。
 */
export function useNotificationTestTools() {
    const { startTodoLiveDemo } = useSystemNotifications();
    const [testing, setTesting] = useState(false);
    const [liveTesting, setLiveTesting] = useState(false);
    const [liveRemaining, setLiveRemaining] = useState(0);
    const liveDemoRef = useRef<{
        cancel: () => void;
        completion: Promise<"completed" | "cancelled" | "failed">;
    } | null>(null);
    const liveDemoDisposed = useRef(false);
    const liveUpdateReady =
        systemNotificationsAvailable &&
        Platform.OS === "android" &&
        Number(Platform.Version) >= 36 &&
        !!NativeSystem;
    const testNotificationReady =
        systemNotificationsAvailable &&
        (Platform.OS === "android" || Platform.OS === "ios");

    const sendTestNotification = async () => {
        if (testing) return;
        setTesting(true);
        void recordDiagnostic("diagnostic_notification", "button_pressed");
        try {
            const {
                requestApplicationNotificationPermission,
                sendDiagnosticTestNotification,
            } =
                await import("@/core/system-notifications/system-notification.service");
            const permission = await requestApplicationNotificationPermission();
            if (!permission.granted) {
                void recordDiagnostic(
                    "diagnostic_notification",
                    "permission_denied",
                    { canAskAgain: permission.canAskAgain },
                    "warning",
                );
                banner.show({
                    title: "测试通知未发送",
                    message: "请先在系统设置中开启 IRisNote 通知",
                    type: "neutral",
                });
                return;
            }
            await sendDiagnosticTestNotification();
            banner.show({
                title: "测试通知已发送",
                message: "本次操作已写入诊断日志",
                type: "success",
            });
        } catch (cause) {
            void recordDiagnostic(
                "diagnostic_notification",
                "button_failed",
                {
                    error: diagnosticErrorCategory(cause),
                },
                "error",
            );
            banner.show({
                title: "测试通知发送失败",
                message: "失败信息已写入诊断日志",
                type: "important",
            });
        } finally {
            setTesting(false);
        }
    };

    const startLiveDemo = async () => {
        if (liveTesting || !liveUpdateReady) return;
        setLiveTesting(true);
        setLiveRemaining(0);
        void recordDiagnostic("live_update", "demo_button_pressed");
        try {
            const { requestApplicationNotificationPermission } =
                await import("@/core/system-notifications/system-notification.service");
            const permission = await requestApplicationNotificationPermission();
            if (!permission.granted) {
                void recordDiagnostic(
                    "live_update",
                    "demo_permission_denied",
                    { canAskAgain: permission.canAskAgain },
                    "warning",
                );
                banner.show({
                    title: "动态通知未发送",
                    message: "请先在系统设置中开启 IRisNote 通知",
                    type: "neutral",
                });
                return;
            }
            const demo = await startTodoLiveDemo((remaining) => {
                if (!liveDemoDisposed.current) setLiveRemaining(remaining);
            });
            if (liveDemoDisposed.current) {
                demo.cancel();
                return;
            }
            liveDemoRef.current = demo;
            const result = await demo.completion;
            if (result === "completed") {
                banner.show({
                    title: "模拟待办已完成",
                    message: "本次操作已写入诊断日志",
                    type: "success",
                });
            } else if (result === "failed") {
                banner.show({
                    title: "动态通知演示失败",
                    message: "失败信息已写入诊断日志",
                    type: "important",
                });
            }
        } catch (cause) {
            void recordDiagnostic(
                "live_update",
                "demo_button_failed",
                {
                    error: diagnosticErrorCategory(cause),
                },
                "error",
            );
            banner.show({
                title: "动态通知发送失败",
                message: "失败信息已写入诊断日志",
                type: "important",
            });
        } finally {
            liveDemoRef.current = null;
            setLiveTesting(false);
            setLiveRemaining(0);
        }
    };

    // 离开页面时取消模拟待办；按 Home 退后台时页面仍挂载，由原生时间线续算。
    useEffect(() => {
        liveDemoDisposed.current = false;
        return () => {
            liveDemoDisposed.current = true;
            liveDemoRef.current?.cancel();
        };
    }, []);

    return {
        testing,
        liveTesting,
        liveRemaining,
        liveUpdateReady,
        testNotificationReady,
        sendTestNotification,
        startLiveDemo,
    };
}
