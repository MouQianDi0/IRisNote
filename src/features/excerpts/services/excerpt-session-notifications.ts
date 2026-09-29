import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import NativeSystem from "@modules/irisnote-system";
import {
    EXCERPT_SESSION_CHANNEL,
    EXCERPT_SESSION_NOTIFICATION_ID,
} from "@/core/system-notifications/system-notification.types";
import type { ExcerptSession } from "../domain/excerpt-session";

/** 安全入口不能静态加载 expo-notifications：Expo Go 不应加载缺失的通知模块。 */
export function excerptSessionSupported(): boolean {
    return (
        Platform.OS === "android" &&
        Number(Platform.Version) >= 26 &&
        !isRunningInExpoGo() &&
        typeof NativeSystem?.getStoppedExcerptSession === "function" &&
        typeof NativeSystem?.stopExcerptSession === "function"
    );
}

export async function excerptSessionNotificationPermission(
    request: boolean,
): Promise<boolean> {
    if (!excerptSessionSupported()) return false;
    const service =
        await import("@/core/system-notifications/system-notification.service");
    return service.excerptSessionNotificationPermission(request);
}

export async function postExcerptSessionNotification(
    session: ExcerptSession,
): Promise<void> {
    if (!excerptSessionSupported())
        throw new Error("当前环境不支持快速摘录通知");
    const service =
        await import("@/core/system-notifications/system-notification.service");
    await service.postStateCard({
        id: EXCERPT_SESSION_NOTIFICATION_ID,
        channelId: EXCERPT_SESSION_CHANNEL,
        title: "快速摘录进行中",
        text: "复制内容后回到 IRisNote 即可保存",
        iconResourceName: "ic_excerpt_session",
        chronoAt: session.endsAt,
        chronoCountdown: true,
        excerptSessionId: session.sessionId,
        expiresAt: session.endsAt,
    });
}

export async function stoppedExcerptSession(): Promise<string | null> {
    return NativeSystem ? NativeSystem.getStoppedExcerptSession() : null;
}

export async function cancelExcerptSession(sessionId?: string): Promise<void> {
    if (!NativeSystem) return;
    if (sessionId) await NativeSystem.stopExcerptSession(sessionId);
    else
        await NativeSystem.cancelProgressNotification(
            EXCERPT_SESSION_NOTIFICATION_ID,
        );
}

export async function acknowledgeStoppedExcerptSession(
    sessionId: string,
): Promise<void> {
    await NativeSystem?.acknowledgeStoppedExcerptSession(sessionId);
}
