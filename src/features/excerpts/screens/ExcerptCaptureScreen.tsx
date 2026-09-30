import { useEffect, useRef, useState } from "react";
import { BackHandler, Pressable } from "react-native";
import NativeSystem from "@modules/irisnote-system";
import { applicationDatabaseResource } from "@/core/database/application-database-resource";
import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { defaultThemePreset } from "@/shared/theme";
import { ExcerptCaptureFeedback } from "../components/ExcerptCaptureFeedback";
import {
    captureFeedback,
    type CaptureFeedback,
} from "../domain/excerpt-capture-feedback";
import type { ExcerptCaptureController } from "../services/excerpt-capture-controller";
import { createExcerptCapture } from "../services/excerpt-capture";
import "../../../../global.css";

/** 独立透明 Surface：一次检测后直接保存本机摘录，短反馈后退出独立任务。 */
export function ExcerptCaptureScreen({
    sessionId,
    captureId,
    captureEntry,
}: {
    sessionId: string;
    captureId: string;
    captureEntry?: string;
}) {
    const [feedback, setFeedback] = useState<CaptureFeedback | null>(null);
    const [leaving, setLeaving] = useState(false);
    const dismissible = useRef(false);
    // Effect 重挂仍共享同一窗口任务，防开发 StrictMode 重读剪贴板。
    const task = useRef<Promise<CaptureFeedback> | null>(null);
    const controller = useRef<ExcerptCaptureController | null>(null);
    const live = useRef(false);
    const close = () => {
        if (!dismissible.current) return;
        // 成功已经在 Surface 显示；false 避免原生再叠加成功 Toast。
        void NativeSystem?.finishExcerptCapture(captureId, false).catch(
            () => undefined,
        );
    };
    useEffect(() => {
        let active = true;
        live.current = true;
        let hold: ReturnType<typeof setTimeout> | undefined;
        let fade: ReturnType<typeof setTimeout> | undefined;
        dismissible.current = false;
        const back = BackHandler.addEventListener("hardwareBackPress", () => {
            if (dismissible.current)
                void NativeSystem?.finishExcerptCapture(captureId, false).catch(
                    () => undefined,
                );
            return true;
        });
        if (!task.current) {
            const lease = applicationDatabaseResource.acquire();
            void recordDiagnostic("excerpt_capture", "window_opened", {
                entry:
                    captureEntry === "card_button"
                        ? "card_button"
                        : "card_body",
            });
            task.current = (async () => {
                try {
                    const resource = await lease.ready;
                    if (!live.current) throw new Error("捕获窗口已关闭");
                    const capture = createExcerptCapture(
                        sessionId,
                        captureId,
                        resource.database,
                    );
                    controller.current = capture;
                    return captureFeedback(await capture.capture());
                } catch (cause) {
                    return {
                        tone: "error",
                        duration: 2000,
                        message:
                            cause instanceof Error
                                ? cause.message
                                : "摘录失败，请重新点通知",
                    } satisfies CaptureFeedback;
                } finally {
                    // 已受理的写入完成前保留租约，避免关窗提前关闭数据库。
                    void lease.release().catch(() => undefined);
                }
            })();
        }
        void task.current.then((result) => {
            if (!active) return;
            setFeedback(result);
            dismissible.current = true;
            hold = setTimeout(() => {
                setLeaving(true);
                fade = setTimeout(() => {
                    if (active)
                        void NativeSystem?.finishExcerptCapture(
                            captureId,
                            false,
                        ).catch(() => undefined);
                }, defaultThemePreset.motion.fastDuration);
            }, result.duration);
        });
        return () => {
            active = false;
            live.current = false;
            if (hold) clearTimeout(hold);
            if (fade) clearTimeout(fade);
            back.remove();
            // StrictMode 的同步重挂不撤销同一任务，真正卸载后阻止后续读取/保存。
            queueMicrotask(() => {
                if (!live.current) controller.current?.dispose();
            });
        };
    }, [sessionId, captureId, captureEntry]);
    return (
        <Pressable
            style={{ flex: 1, backgroundColor: "transparent" }}
            onPress={close}
            accessible={false}
        >
            <ExcerptCaptureFeedback feedback={feedback} leaving={leaving} />
        </Pressable>
    );
}
