import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import NativeSystem from "@modules/irisnote-system";
import { applicationDatabaseResource } from "@/core/database/application-database-resource";
import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { semanticColors } from "@/shared/theme";
import { AppButton } from "@/shared/ui";
import { DraftDialog } from "@/shared/ui/Dialog/dialog";
import { ExcerptFormDialog } from "../components/ExcerptFormDialog";
import { ExcerptStashPanel } from "../components/ExcerptStashPanel";
import type { ExcerptStashItem } from "../data/excerpt-stash.repository";
import { mergeStashContents } from "../domain/excerpt-stash-merge";
import type { ClipboardDetectionResult } from "../domain/clipboard-detection";
import type { ExcerptCaptureController } from "../services/excerpt-capture-controller";
import { createExcerptCapture } from "../services/excerpt-capture";
import "../../../../global.css";

type CaptureState = { kind: "loading" } | { kind: "result"; result: ClipboardDetectionResult } | { kind: "error" };
type FormState = { kind: "offer" } | { kind: "edit"; item: ExcerptStashItem } | { kind: "merge" };

/** 独立原生 Surface：只通过 SQLite 与主应用共享摘录和暂存。 */
export function ExcerptCaptureScreen({ sessionId, captureId, captureEntry }: {
    sessionId: string;
    captureId: string;
    captureEntry?: string;
}) {
    const controller = useRef<ExcerptCaptureController | null>(null);
    const mounted = useRef(true);
    const busyRef = useRef(false);
    const modeRef = useRef<"main" | "panel" | "form">("main");
    const [state, setState] = useState<CaptureState>({ kind: "loading" });
    const [scope, setScope] = useState<{ ownerKey: string; generation: number } | null>(null);
    const [items, setItems] = useState<ExcerptStashItem[]>([]);
    const [panel, setPanel] = useState(false);
    const [form, setForm] = useState<FormState | null>(null);
    const [separator, setSeparator] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    useEffect(() => { modeRef.current = form ? "form" : panel ? "panel" : "main"; }, [form, panel]);
    const close = (saved = false) => NativeSystem?.finishExcerptCapture(captureId, saved);
    const refresh = async () => {
        const next = await controller.current?.listStash();
        if (mounted.current && next) {
            setItems(next);
            if (next.length === 0) setPanel(false);
        }
    };
    useEffect(() => {
        mounted.current = true;
        void recordDiagnostic("excerpt_capture", "window_opened", {
            entry: captureEntry ?? "card_body",
        });
        const back = BackHandler.addEventListener("hardwareBackPress", () => {
            if (busyRef.current) return true;
            if (modeRef.current === "form") setForm(null);
            else if (modeRef.current === "panel") setPanel(false);
            else void NativeSystem?.finishExcerptCapture(captureId, false).catch(() => undefined);
            return true;
        });
        const lease = applicationDatabaseResource.acquire();
        let capture: ExcerptCaptureController | null = null;
        void (async () => {
            try {
                const resource = await lease.ready;
                if (!lease.active) return;
                capture = createExcerptCapture(sessionId, captureId, resource.database);
                controller.current = capture;
                const result = await capture.detect();
                const currentScope = await capture.scope();
                const stash = await capture.listStash();
                if (lease.active) {
                    setScope(currentScope);
                    setItems(stash);
                    setState({ kind: "result", result });
                }
            } catch {
                if (lease.active) {
                    setError("检测失败，请关闭后重新点通知；也可以回到 IRisNote 粘贴保存。");
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
    }, [sessionId, captureId, captureEntry]);

    const run = async (action: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setError(null);
        try { await action(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败，请重试"); }
        finally { busyRef.current = false; if (mounted.current) setBusy(false); }
    };
    const stash = () => void run(async () => {
        const result = await controller.current?.stash();
        setNotice(result === "duplicate" ? "已在暂存中" : "已暂存");
        await new Promise<void>((resolve) => setTimeout(resolve, 650));
        await close(false);
    });
    const changeStash = (action: () => Promise<void>) => void run(async () => { await action(); await refresh(); });
    const offer = state.kind === "result" && state.result.kind === "offer" ? state.result : null;
    const message = state.kind === "result" && state.result.kind === "skip"
        ? state.result.reason === "tooLong" ? "内容超过 20000 字，建议回到 IRisNote 保存为笔记"
        : state.result.reason === "noText" || state.result.reason === "empty" ? "剪贴板里没有文字，复制文字后再试"
        : "没有需要保存的新内容" : null;
    const formText = form?.kind === "offer" ? offer?.content ?? ""
        : form?.kind === "edit" ? form.item.content
        : mergeStashContents(items, separator);

    return <GestureHandlerRootView className="flex-1 bg-transparent">
        {state.kind === "loading" ? <View className="flex-1 items-center justify-center"><ActivityIndicator color={semanticColors.brandPrimary} accessibilityLabel="正在检测剪贴板" /></View> : !form && (
            <DraftDialog visible title={panel ? `暂存区（${items.length} 条）` : "快速摘录"} onClose={() => { if (panel) setPanel(false); else void close(false); }} closeOnScrimTap={!busy} leading={panel ? <Pressable accessibilityRole="button" accessibilityLabel="返回快速摘录" onPress={() => setPanel(false)}><Text>←</Text></Pressable> : undefined} headerExtra={<Pressable accessibilityRole="button" accessibilityLabel="关闭快速摘录" disabled={busy} onPress={() => void close(false)}><Text>✕</Text></Pressable>}>
                {panel ? <>
                    <ExcerptStashPanel items={items} busy={busy} onMove={(id, direction) => changeStash(() => controller.current!.moveStash(id, direction))} onEdit={(item) => setForm({ kind: "edit", item })} onRemove={(id) => changeStash(() => controller.current!.removeStash(id))} onClear={() => changeStash(() => controller.current!.clearStash())} onMerge={() => { setSeparator(true); setForm({ kind: "merge" }); }} />
                    <AppButton className="mt-2" variant="secondary" label="返回" disabled={busy} onPress={() => setPanel(false)} />
                </> : <>
                    {offer ? <><Text className="text-sm leading-5 text-primary">检测到剪贴板新内容</Text><Text numberOfLines={3} className="mt-2 text-[15px] leading-[21px] text-black">{offer.content}</Text><Text className="mt-3 text-sm leading-5 text-hyper-text-secondary">摘录仅保存在本机，暂不同步到云端</Text></> : <Text className="text-sm leading-5 text-hyper-text-secondary">{message}</Text>}
                    {items.length > 0 && <Text className="mt-3 text-sm text-primary" onPress={() => setPanel(true)}>暂存区有 {items.length} 条 · 查看</Text>}
                    {!offer && <View className="mt-3 flex-row gap-2.5"><AppButton className="flex-1" variant="secondary" label="返回原应用" onPress={() => void close(false)} /><AppButton className="flex-1" label="查看暂存区" disabled={items.length === 0} onPress={() => setPanel(true)} /></View>}
                    {offer && <View className="mt-3 flex-row gap-2.5"><AppButton className="flex-1" variant="secondary" label="暂存" disabled={busy} onPress={stash} /><AppButton className="flex-1" label="保存" disabled={busy} onPress={() => setForm({ kind: "offer" })} /></View>}
                </>}
                {notice && <Text accessibilityRole="alert" className="mt-2 text-sm text-primary">{notice}</Text>}
                {error && <Text accessibilityRole="alert" className="mt-3 text-sm text-hyper-error">{error}</Text>}
            </DraftDialog>
        )}
        {form && scope && <ExcerptFormDialog key={form.kind === "edit" ? form.item.clientId : form.kind} ownerKey={scope.ownerKey} generation={scope.generation} initialText={formText} duplicateMessage={form.kind === "edit" ? "已在暂存中" : undefined} mergeSeparator={form.kind === "merge" ? { enabled: separator, onChange: setSeparator, regenerate: (enabled) => mergeStashContents(items, enabled) } : undefined} onClose={() => setForm(null)} onSaved={() => { if (form.kind === "edit") { setForm(null); void refresh(); } else void close(true); }} submitText={async (text) => {
            if (!controller.current) throw new Error("捕获窗口已关闭");
            if (form.kind === "edit") return controller.current.updateStash(form.item.clientId, text);
            if (form.kind === "merge") return controller.current.saveMerged(text);
            const receipt = await controller.current.save(text);
            return receipt.duplicated ? "duplicate" : "saved";
        }} />}
    </GestureHandlerRootView>;
}
