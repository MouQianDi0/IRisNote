import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useApplicationDatabase } from "@/core/database";
import { banner } from "@/core/notifications";
import { useOverlay } from "@/shared/ui/Overlay/overlay-context";
import { detectClipboard } from "../domain/clipboard-detection";
import {
    createDetectionTrigger,
    PAGE_FOCUS_DELAY_MS,
} from "../domain/clipboard-detection-trigger";
import { clipboardHandledStoreFor } from "../services/clipboard-handled";
import { clipboardService } from "../services/clipboard.service";
import { newExcerptId } from "../services/excerpt-service";
import { excerptRepository } from "../state/excerpt-store";
import type { ExcerptEntity } from "../excerpts.types";

type ClipboardOffer = { ownerKey: string; content: string; hash: string };

/**
 * 只在摘录页生效：页面获得焦点、停留在摘录页时从后台回来（Android 等窗口焦点）、
 * 分屏/小窗等其他窗口交还焦点、或停留期间剪贴板变化时检测。
 * 检测时机见 clipboard-detection-trigger。
 * 检测结果只提示，由用户选择保存或忽略；两者都会把该内容记为已处理。
 */
export function useClipboardDetection({
    enabled,
    ready,
    ownerKey,
    generation,
    entities,
}: {
    enabled: boolean;
    ready: boolean;
    ownerKey: string;
    generation: number;
    entities: readonly ExcerptEntity[];
}) {
    const database = useApplicationDatabase();
    const [offer, setOffer] = useState<ClipboardOffer | null>(null);
    const [saving, setSaving] = useState(false);
    const focused = useRef(false);
    const running = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef({ enabled, ready, ownerKey, generation, entities });
    // AppModal 打开时会登记到全局弹窗层，top 非空即表示有应用内弹窗。
    const overlayTop = useOverlay()?.top;
    const inAppModalOpen = useRef(false);
    useLayoutEffect(() => {
        latest.current = { enabled, ready, ownerKey, generation, entities };
        inAppModalOpen.current = overlayTop !== undefined;
    });

    const markHandled = useCallback(
        (hash: string) =>
            clipboardHandledStoreFor(database)
                .markHandled(hash)
                .catch(() => undefined),
        [database],
    );

    const check = useCallback(async () => {
        const start = latest.current;
        if (running.current || !focused.current || !start.ready) return;
        running.current = true;
        try {
            const result = await detectClipboard({
                enabled: async () => latest.current.enabled,
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
            if (!focused.current || latest.current.ownerKey !== start.ownerKey)
                return;
            if (result.kind === "offer")
                setOffer({
                    ownerKey: start.ownerKey,
                    content: result.content,
                    hash: result.hash,
                });
            else if (result.hash) await markHandled(result.hash);
        } catch {
            // 检测失败不打扰用户，下次进入页面再试。
        } finally {
            running.current = false;
        }
    }, [database, markHandled]);

    const cancel = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
    }, []);

    const schedule = useCallback(
        (delayMs: number) => {
            cancel();
            timer.current = setTimeout(() => {
                timer.current = null;
                void check();
            }, delayMs);
        },
        [cancel, check],
    );

    useFocusEffect(
        useCallback(() => {
            focused.current = true;
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
                focused.current = false;
                cancel();
                for (const subscription of subscriptions) subscription.remove();
                stopClipboard();
            };
        }, [schedule, cancel]),
    );

    // 刚开启开关、摘录加载完成或切换账号时，若仍停留在本页则补检一次。
    useEffect(() => {
        if (enabled && ready && focused.current) schedule(PAGE_FOCUS_DELAY_MS);
    }, [enabled, ready, ownerKey, schedule]);

    const visibleOffer =
        enabled &&
        offer &&
        offer.ownerKey === ownerKey &&
        !entities.some((item) => item.contentHash === offer.hash)
            ? offer
            : null;

    const ignore = useCallback(() => {
        if (!visibleOffer) return;
        setOffer(null);
        void markHandled(visibleOffer.hash);
    }, [visibleOffer, markHandled]);

    const save = useCallback(async () => {
        if (!visibleOffer || saving) return;
        setSaving(true);
        try {
            const receipt = await excerptRepository.save(
                ownerKey,
                newExcerptId(),
                visibleOffer.content,
                "auto",
                new Date(),
            );
            setOffer(null);
            void markHandled(visibleOffer.hash);
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
                excerptRepository.ownerKey === ownerKey &&
                excerptRepository.generation === generation
            )
                banner.show({
                    title: "保存失败",
                    message: cause instanceof Error ? cause.message : "请重试",
                    type: "important",
                });
        } finally {
            setSaving(false);
        }
    }, [visibleOffer, saving, ownerKey, generation, markHandled]);

    return { offer: visibleOffer, saving, ignore, save };
}
