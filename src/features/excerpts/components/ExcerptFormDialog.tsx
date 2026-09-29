import { useEffect, useRef, useState } from "react";
import { CloudOff } from "lucide-react-native";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { banner } from "@/core/notifications";
import { semanticColors } from "@/shared/theme";
import { AppButton, BodyInput, InlineHint } from "@/shared/ui";
import { FormDialog } from "@/shared/ui/Dialog/FormDialog";
import {
    EXCERPT_CONTENT_LIMIT,
    measureExcerpt,
    normalizeExcerptContent,
} from "../domain/excerpt-validation";
import { newExcerptId } from "../services/excerpt-service";
import { excerptRepository } from "../state/excerpt-store";
import type { ExcerptEntity } from "../excerpts.types";

/** 原有新建/编辑继续使用仓储；委托模式用于捕获、暂存编辑与合并保存。 */
export function ExcerptFormDialog({
    ownerKey,
    generation,
    base = null,
    initialText,
    submitText,
    mergeSeparator,
    onClose,
    onSaved,
    duplicateMessage = "已存在相同摘录",
}: {
    ownerKey: string;
    generation: number;
    base?: ExcerptEntity | null;
    initialText?: string;
    submitText?: (text: string) => Promise<"saved" | "duplicate">;
    mergeSeparator?: { enabled: boolean; onChange: (enabled: boolean) => void; regenerate: (enabled: boolean) => string };
    onClose: () => void;
    onSaved?: () => void;
    duplicateMessage?: string;
}) {
    const [clientId] = useState(newExcerptId);
    const [text, setText] = useState(initialText ?? base?.content ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const input = useRef<TextInput>(null);
    useEffect(() => {
        if (initialText === undefined) return;
        requestAnimationFrame(() => input.current?.setNativeProps({ selection: { start: initialText.length, end: initialText.length } }));
    }, [initialText]);
    const empty = !normalizeExcerptContent(text);
    const unchanged = base ? text === base.content : empty;
    const overLimit = measureExcerpt(text) > EXCERPT_CONTENT_LIMIT;

    const save = async (reason: "confirm" | "dismiss") => {
        if (busy) return;
        if (reason === "dismiss" && submitText) { onClose(); return; }
        if (overLimit) return;
        if (reason === "dismiss" && unchanged) { onClose(); return; }
        setBusy(true);
        setError("");
        try {
            excerptRepository.assertSession(ownerKey, generation);
            if (submitText) {
                const result = await submitText(text);
                if (result === "duplicate") {
                    setError(duplicateMessage);
                    setBusy(false);
                    return;
                }
            } else if (base) {
                const current = excerptRepository.get(ownerKey, base.clientId);
                await excerptRepository.update(ownerKey, current, { content: text }, new Date());
            } else {
                const receipt = await excerptRepository.save(ownerKey, clientId, text, "manual", new Date());
                if (receipt.duplicated) banner.show({ title: "已存在相同摘录", message: "已移到最前", type: "neutral" });
            }
            excerptRepository.assertSession(ownerKey, generation);
            (onSaved ?? onClose)();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "保存失败，请重试");
            setBusy(false);
        }
    };

    return (
        <FormDialog
            onClose={() => void save("dismiss")}
            title={<Text accessibilityRole="header" style={{ fontSize: 24, color: semanticColors.textPrimary }}>{base ? "编辑摘录" : "新建摘录"}</Text>}
            actions={<View style={{ flexDirection: "row", gap: 10 }}>
                <AppButton className="flex-1" variant="secondary" label="取消" disabled={busy} onPress={onClose} />
                <AppButton className="flex-1" label="保存" loading={busy} loadingLabel="保存中…" disabled={empty || overLimit || (!submitText && unchanged)} onPress={() => void save("confirm")} />
            </View>}
        >
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 2 }}>
                <BodyInput ref={input} value={text} onChangeText={(value) => { setText(value); setError(""); }} placeholder="输入或粘贴要保存的文字" invalid={!!error || overLimit} disabled={busy} maxLength={EXCERPT_CONTENT_LIMIT} truncate={false} measure={measureExcerpt} accessibilityLabel="摘录正文" />
                {overLimit && <Text accessibilityRole="alert" style={{ marginTop: 4, color: semanticColors.destructive }}>超出上限，请删减</Text>}
                {mergeSeparator && <View style={{ marginTop: 12 }}>
                    <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <Text style={{ flex: 1, color: semanticColors.textPrimary }}>条目间换行</Text>
                        <Switch
                            accessibilityLabel="条目间换行"
                            accessibilityHint="关闭后条目将直接拼接"
                            value={mergeSeparator.enabled}
                            disabled={busy}
                            trackColor={{ false: semanticColors.divider, true: semanticColors.brandPrimary }}
                            thumbColor={semanticColors.surface}
                            onValueChange={(enabled) => { setText(mergeSeparator.regenerate(enabled)); setError(""); mergeSeparator.onChange(enabled); }}
                        />
                    </View>
                    <Text style={{ marginTop: 2, color: semanticColors.textSecondary }}>关闭后条目将直接拼接</Text>
                </View>}
                <InlineHint icon={CloudOff} message="摘录仅保存在本机，暂不同步到云端" className="mt-3" />
                {!!error && <Text selectable accessibilityRole="alert" style={{ marginTop: 8, fontSize: 14, color: semanticColors.destructive }}>{error}</Text>}
            </ScrollView>
        </FormDialog>
    );
}
