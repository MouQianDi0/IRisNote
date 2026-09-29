import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { AppState } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useApplicationDatabase } from "@/core/database";
import { banner } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
    acknowledgeStoppedExcerptSession,
    cancelExcerptSession,
    excerptSessionNotificationPermission,
    excerptSessionSupported,
    postExcerptSessionNotification,
    stoppedExcerptSession,
} from "../services/excerpt-session-notifications";
import { ExcerptSessionRepository } from "../data/excerpt-session.repository";
import { sessionIsActive } from "../domain/excerpt-session";
import { newExcerptId } from "../services/excerpt-service";
import { ExcerptSessionCoordinator } from "../services/excerpt-session-coordinator";
import { useClipboardOfferStore } from "../state/clipboard-offer-store";
import { useExcerptSessionStore } from "../state/excerpt-session-store";
import { useClipboardDetectionController } from "./useClipboardDetection";
import { useClipboardPreferences } from "./useClipboardPreferences";
import { useExcerptScope } from "./useExcerptScope";

const OFFER_BANNER_ID = "excerpt.clipboard-offer";

/** 根布局唯一实例，运行在数据库、账号、Overlay providers 之下。 */
export function useExcerptSession() {
    const database = useApplicationDatabase();
    const scope = useExcerptScope();
    const { loading: authLoading } = useAuth();
    const preferences = useClipboardPreferences();
    const pathname = usePathname();
    const router = useRouter();
    const excerptPage = pathname === "/excerpt";
    const supported = excerptSessionSupported();
    const state = useExcerptSessionStore();
    const offer = useClipboardOfferStore((snapshot) => snapshot.offer);
    const coordinator = useMemo(() => {
        const repository = new ExcerptSessionRepository(database);
        return new ExcerptSessionCoordinator({
            read: () => repository.read(),
            save: (session) => repository.save(session),
            clear: () => repository.clear(),
            permission: excerptSessionNotificationPermission,
            post: postExcerptSessionNotification,
            cancel: cancelExcerptSession,
            stopped: stoppedExcerptSession,
            acknowledgeStopped: acknowledgeStoppedExcerptSession,
            publish: (snapshot) => useExcerptSessionStore.setState(snapshot),
            ended: (reason) => {
                useClipboardOfferStore.setState({ offer: null });
                banner.dismiss(OFFER_BANNER_ID);
                banner.show({
                    title:
                        reason === "expired"
                            ? "快速摘录已结束"
                            : reason === "owner"
                              ? "账号已变化，快速摘录会话已结束"
                              : "快速摘录已停止",
                    type: "neutral",
                });
            },
            started: (visible) =>
                banner.show({
                    title: "快速摘录已开启",
                    ...(visible
                        ? {}
                        : { message: "通知暂不可用，仅在应用内提示" }),
                    type: visible ? "success" : "neutral",
                }),
            now: Date.now,
            newId: newExcerptId,
        });
    }, [database]);

    useLayoutEffect(() => {
        coordinator.setOwner(authLoading ? null : scope.ownerKey);
        useExcerptSessionStore.setState({
            start: (duration) => coordinator.start(duration),
            stop: () => coordinator.stop(),
        });
    }, [coordinator, authLoading, scope.ownerKey]);

    const reconcile = useCallback(async () => {
        if (supported) {
            await coordinator.reconcile();
            banner.dismiss("excerpt.session-error");
        }
    }, [coordinator, supported]);
    useEffect(() => {
        if (!supported || authLoading) return;
        const refresh = () => {
            void reconcile().catch(() => {
                banner.show({
                    id: "excerpt.session-error",
                    title: "快速摘录状态恢复失败",
                    message: "回到应用时将重试",
                    type: "important",
                });
            });
        };
        refresh();
        const subscriptions = [
            AppState.addEventListener("change", (next) => {
                if (next === "active") refresh();
            }),
            AppState.addEventListener("focus", refresh),
        ];
        return () =>
            subscriptions.forEach((subscription) => subscription.remove());
    }, [supported, authLoading, scope.ownerKey, reconcile]);

    useEffect(() => {
        if (!state.session || authLoading) return;
        const delay = Math.max(0, state.session.endsAt - Date.now());
        const timer = setTimeout(() => {
            void reconcile().catch(() => undefined);
        }, delay);
        return () => clearTimeout(timer);
    }, [state.session, authLoading, reconcile]);

    useClipboardDetectionController({
        excerptPage,
        enabled: preferences.autoDetectEnabled,
        ready: scope.ready,
        ownerKey: scope.ownerKey,
        generation: scope.generation,
        entities: scope.entities,
        beforeDetect: reconcile,
    });

    useEffect(() => {
        if (
            !offer ||
            excerptPage ||
            !scope.ready ||
            offer.ownerKey !== scope.ownerKey ||
            !sessionIsActive(state.session, scope.ownerKey, Date.now())
        ) {
            banner.dismiss(OFFER_BANNER_ID);
            return;
        }
        banner.show({
            id: OFFER_BANNER_ID,
            title: "剪贴板有新内容",
            type: "neutral",
            action: {
                label: "去摘录",
                onPress: () => {
                    router.navigate("/(tabs)/excerpt");
                },
            },
        });
        return () => {
            banner.dismiss(OFFER_BANNER_ID);
        };
    }, [
        offer,
        excerptPage,
        scope.ready,
        scope.ownerKey,
        state.session,
        router,
    ]);
}
