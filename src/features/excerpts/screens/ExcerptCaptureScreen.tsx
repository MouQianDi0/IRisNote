import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import NativeSystem from "@modules/irisnote-system";
import { applicationDatabaseResource } from "@/core/database/application-database-resource";
import { semanticColors } from "@/shared/theme";
import { AppButton } from "@/shared/ui";
import { DraftDialog } from "@/shared/ui/Dialog/dialog";
import type { ClipboardDetectionResult } from "../domain/clipboard-detection";
import type { ExcerptCaptureController } from "../services/excerpt-capture-controller";
import { createExcerptCapture } from "../services/excerpt-capture";
import "../../../../global.css";

type CaptureState =
    | { kind: "loading" }
    | { kind: "result"; result: ClipboardDetectionResult }
    | { kind: "error" };

/** 独立原生 Surface：透明底、共享弹窗，不挂主应用导航、账号或待办 providers。 */
export function ExcerptCaptureScreen({
    sessionId,
    captureId,
}: {
    sessionId: string;
    captureId: string;
}) {
    const controller = useRef<ExcerptCaptureController | null>(null);
    const mounted = useRef(true);
    const busy = useRef(false);
    const [state, setState] = useState<CaptureState>({ kind: "loading" });
    const [saving, setSaving] = useState(false);
    const [ignoring, setIgnoring] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const close = async (saved = false) => {
        await NativeSystem?.finishExcerptCapture(captureId, saved);
    };

    useEffect(() => {
        mounted.current = true;
        // JS runtime 可能还有主应用的导航返回监听；捕获窗口优先消费返回。
        const back = BackHandler.addEventListener("hardwareBackPress", () => {
            if (!busy.current)
                void NativeSystem?.finishExcerptCapture(captureId, false).catch(
                    () => undefined,
                );
            return true;
        });
        const lease = applicationDatabaseResource.acquire();
        let capture: ExcerptCaptureController | null = null;
        void (async () => {
            try {
                const resource = await lease.ready;
                if (!lease.active) return;
                capture = createExcerptCapture(
                    sessionId,
                    captureId,
                    resource.database,
                );
                controller.current = capture;
                const result = await capture.detect();
                if (lease.active) setState({ kind: "result", result });
            } catch {
                if (lease.active) {
                    setError(
                        "检测失败，请关闭后重新点通知；也可以回到 IRisNote 粘贴保存。",
                    );
                    setState({ kind: "error" });
                }
            }
        })();
        return () => {
            mounted.current = false;
            back.remove();
            capture?.dispose();
            if (controller.current === capture) controller.current = null;
            void lease.release().catch(() => undefined);
        };
    }, [sessionId, captureId]);

    const submit = async (save: boolean) => {
        if (busy.current || !controller.current) return;
        busy.current = true;
        setSaving(true);
        setIgnoring(!save);
        setError(null);
        try {
            if (save) await controller.current.save();
            else await controller.current.ignore();
            if (mounted.current) await close(save);
        } catch {
            if (mounted.current)
                setError("操作失败，内容仍保留，请重试或返回原应用。");
        } finally {
            busy.current = false;
            if (mounted.current) {
                setSaving(false);
                setIgnoring(false);
            }
        }
    };
    const cancel = () => {
        if (!busy.current) void close().catch(() => undefined);
    };
    const offer =
        state.kind === "result" && state.result.kind === "offer"
            ? state.result
            : null;
    const message =
        state.kind === "result" && state.result.kind === "skip"
            ? state.result.reason === "tooLong"
                ? "内容超过 20000 字，建议回到 IRisNote 保存为笔记"
                : state.result.reason === "noText" ||
                    state.result.reason === "empty"
                  ? "剪贴板里没有文字，复制文字后再试"
                  : "没有需要保存的新内容"
            : null;
    return (
        <GestureHandlerRootView className="flex-1 bg-transparent">
            {state.kind === "loading" ? (
                // 加载时不打开 Modal 的第二个原生窗口，保留 Activity 的剪贴板焦点。
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator
                        color={semanticColors.brandPrimary}
                        accessibilityLabel="正在检测剪贴板"
                    />
                </View>
            ) : (
                <DraftDialog
                    visible
                    title="快速摘录"
                    onClose={cancel}
                    closeOnScrimTap={!saving}
                >
                    {offer ? (
                        <>
                            <Text className="text-sm leading-5 text-primary">
                                检测到剪贴板新内容
                            </Text>
                            <Text
                                numberOfLines={3}
                                className="mt-2 text-[15px] leading-[21px] text-black"
                            >
                                {offer.content}
                            </Text>
                            <Text className="mt-3 text-sm leading-5 text-hyper-text-secondary">
                                摘录仅保存在本机，暂不同步到云端
                            </Text>
                        </>
                    ) : message ? (
                        <Text className="text-sm leading-5 text-hyper-text-secondary">
                            {message}
                        </Text>
                    ) : null}
                    {error && (
                        <Text
                            accessibilityRole="alert"
                            className="mt-3 text-sm leading-5 text-hyper-error"
                        >
                            {error}
                        </Text>
                    )}
                    <View className="mt-3 flex-row gap-2.5">
                        <AppButton
                            className="flex-1"
                            variant="secondary"
                            label={offer ? "忽略" : "返回原应用"}
                            loading={ignoring}
                            loadingLabel="忽略中…"
                            disabled={saving}
                            onPress={offer ? () => void submit(false) : cancel}
                        />
                        {offer && (
                            <AppButton
                                className="flex-1"
                                label="保存"
                                disabled={saving}
                                loading={saving && !ignoring}
                                loadingLabel="保存中…"
                                onPress={() => void submit(true)}
                            />
                        )}
                    </View>
                </DraftDialog>
            )}
        </GestureHandlerRootView>
    );
}
