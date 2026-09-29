import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { AppState, Platform } from "react-native";
import { useApplicationDatabase } from "@/core/database";
import { banner } from "@/core/notifications";
import { useOverlay } from "@/shared/ui/Overlay/overlay-context";
import { detectClipboard } from "../domain/clipboard-detection";
import {
    createDetectionTrigger,
    createSerialRunner,
    PAGE_FOCUS_DELAY_MS,
} from "../domain/clipboard-detection-trigger";
import { sessionIsActive } from "../domain/excerpt-session";
import { clipboardHandledStoreFor } from "../services/clipboard-handled";
import { clipboardService } from "../services/clipboard.service";
import { saveDetectedOffer } from "../services/excerpt-service";
import { excerptCaptureOpen } from "../services/excerpt-capture";
import { useClipboardOfferStore } from "../state/clipboard-offer-store";
import { excerptRepository } from "../state/excerpt-store";
import { useExcerptSessionStore } from "../state/excerpt-session-store";
import type { ExcerptEntity } from "../excerpts.types";

/** 页面只消费共享候选，所有读取入口在根布局 controller 内。 */
export function useClipboardDetection() {
    return useClipboardOfferStore();
}

export function useClipboardDetectionController({
    excerptPage,
    enabled,
    ready,
    ownerKey,
    generation,
    entities,
    beforeDetect,
}: {
    excerptPage: boolean;
    enabled: boolean;
    ready: boolean;
    ownerKey: string;
    generation: number;
    entities: readonly ExcerptEntity[];
    beforeDetect: () => Promise<void>;
}) {
    const database = useApplicationDatabase();
    const latest = useRef({
        excerptPage,
        enabled,
        ready,
        ownerKey,
        generation,
        entities,
    });
    const overlayTop = useOverlay()?.top;
    const inAppModalOpen = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useLayoutEffect(() => {
        latest.current = {
            excerptPage,
            enabled,
            ready,
            ownerKey,
            generation,
            entities,
        };
        inAppModalOpen.current = overlayTop !== undefined;
    });

    const eligibility = useCallback(() => {
        const current = latest.current;
        if (
            !current.ready ||
            AppState.currentState !== "active" ||
            inAppModalOpen.current
        )
            return null;
        const session = useExcerptSessionStore.getState().session;
        if (sessionIsActive(session, current.ownerKey, Date.now()))
            return session?.sessionId ?? null;
        return current.excerptPage && current.enabled ? "page" : null;
    }, []);
    const markHandled = useCallback(
        (hash: string) =>
            clipboardHandledStoreFor(database)
                .markHandled(hash)
                .catch(() => undefined),
        [database],
    );

    const detectOnce = useCallback(async () => {
        if (!eligibility()) return;
        try {
            await beforeDetect();
            // 两个原生 Surface 共用 JS runtime，透明窗口期间只由它读取剪贴板。
            if (await excerptCaptureOpen()) return;
            const start = latest.current;
            const token = eligibility();
            if (!token) return;
            const valid = () =>
                eligibility() === token &&
                latest.current.ownerKey === start.ownerKey &&
                latest.current.generation === start.generation;
            const result = await detectClipboard({
                enabled: async () => valid() && !(await excerptCaptureOpen()) && valid(),
                hasText: clipboardService.hasText,
                readText: clipboardService.readText,
                isHandled: (hash) =>
                    clipboardHandledStoreFor(database)
                        .isHandled(hash)
                        .catch(() => false),
                lastWrittenHash: clipboardService.lastWrittenHash,
                savedHashes: () =>
                    new Set(
                        latest.current.entities.map((item) => item.contentHash),
                    ),
            });
            if (!valid() || (await excerptCaptureOpen())) return;
            if (result.kind === "offer") {
                const existing = useClipboardOfferStore.getState().offer;
                // 导航到摘录页时展示已有候选；它只由明确保存/忽略或下一次剪贴板变化替换。
                if (
                    existing?.ownerKey === start.ownerKey &&
                    existing.hash === result.hash
                )
                    return;
                useClipboardOfferStore.setState({
                    offer: {
                        ownerKey: start.ownerKey,
                        generation: start.generation,
                        content: result.content,
                        hash: result.hash,
                    },
                });
            } else if (result.hash) await markHandled(result.hash);
        } catch {
            /* 检测失败下次触发再试，不泄露正文到日志。 */
        }
    }, [beforeDetect, eligibility, database, markHandled]);
    const [runSerially] = useState(createSerialRunner);
    const cancel = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    }, []);
    const schedule = useCallback(
        (delay: number) => {
            cancel();
            timer.current = setTimeout(() => {
                timer.current = null;
                void runSerially(detectOnce);
            }, delay);
        },
        [cancel, runSerially, detectOnce],
    );

    useEffect(() => {
        const trigger = createDetectionTrigger({
            platform:
                Platform.OS === "android" || Platform.OS === "ios"
                    ? Platform.OS
                    : "other",
            initialAppState: AppState.currentState,
            schedule,
            cancel,
        });
        trigger.pageFocused();
        const subscriptions = [
            AppState.addEventListener("change", trigger.appStateChanged),
            AppState.addEventListener("blur", () =>
                trigger.windowBlurred(inAppModalOpen.current),
            ),
            AppState.addEventListener("focus", trigger.windowFocused),
        ];
        const stopClipboard = clipboardService.onChange(
            trigger.clipboardChanged,
        );
        return () => {
            cancel();
            subscriptions.forEach((item) => item.remove());
            stopClipboard();
        };
    }, [schedule, cancel]);

    const sessionId = useExcerptSessionStore(
        (state) => state.session?.sessionId,
    );
    useEffect(() => {
        if (ready && !(excerptPage && useClipboardOfferStore.getState().offer))
            schedule(PAGE_FOCUS_DELAY_MS);
    }, [
        ready,
        enabled,
        excerptPage,
        ownerKey,
        generation,
        sessionId,
        schedule,
    ]);
    useEffect(() => {
        const offer = useClipboardOfferStore.getState().offer;
        if (
            offer &&
            (!ready ||
                offer.ownerKey !== ownerKey ||
                offer.generation !== generation ||
                entities.some((item) => item.contentHash === offer.hash) ||
                (!sessionId && !enabled))
        ) {
            useClipboardOfferStore.setState({ offer: null });
        }
    }, [ready, ownerKey, generation, entities, enabled, sessionId]);

    useEffect(() => {
        const ignore = () => {
            const offer = useClipboardOfferStore.getState().offer;
            if (!offer || useClipboardOfferStore.getState().saving) return;
            useClipboardOfferStore.setState({ offer: null });
            void markHandled(offer.hash);
        };
        const save = async () => {
            const state = useClipboardOfferStore.getState();
            const offer = state.offer;
            if (!offer || state.saving) return;
            useClipboardOfferStore.setState({ saving: true });
            try {
                const receipt = await saveDetectedOffer(
                    excerptRepository,
                    offer,
                    markHandled,
                );
                if (useClipboardOfferStore.getState().offer === offer)
                    useClipboardOfferStore.setState({ offer: null });
                if (
                    latest.current.ownerKey !== offer.ownerKey ||
                    latest.current.generation !== offer.generation
                )
                    return;
                banner.show(
                    receipt.duplicated
                        ? {
                              title: "已存在相同摘录",
                              message: "已移到最前",
                              type: "neutral",
                          }
                        : { title: "已保存为摘录", type: "success" },
                );
            } catch (cause) {
                if (
                    latest.current.ownerKey === offer.ownerKey &&
                    latest.current.generation === offer.generation
                )
                    banner.show({
                        title: "保存失败",
                        message:
                            cause instanceof Error ? cause.message : "请重试",
                        type: "important",
                    });
            } finally {
                useClipboardOfferStore.setState({ saving: false });
            }
        };
        useClipboardOfferStore.setState({ ignore, save });
    }, [markHandled]);
}
