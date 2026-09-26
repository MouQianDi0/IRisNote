import { useState } from "react";
import { CloudOff } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
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

/** 新建与编辑共用；点遮罩或返回键时有改动则按保存处理，避免误触丢字。 */
export function ExcerptFormDialog({
    ownerKey,
    generation,
    base = null,
    onClose,
}: {
    ownerKey: string;
    generation: number;
    base?: ExcerptEntity | null;
    onClose: () => void;
}) {
    const [clientId] = useState(newExcerptId);
    const [text, setText] = useState(base?.content ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const empty = !normalizeExcerptContent(text);
    const unchanged = base ? text === base.content : empty;

    const save = async (reason: "confirm" | "dismiss") => {
        if (busy) return;
        if (reason === "dismiss" && unchanged) {
            onClose();
            return;
        }
        setBusy(true);
        setError("");
        try {
            excerptRepository.assertSession(ownerKey, generation);
            if (base) {
                const current = excerptRepository.get(ownerKey, base.clientId);
                await excerptRepository.update(
                    ownerKey,
                    current,
                    { content: text },
                    new Date(),
                );
            } else {
                const receipt = await excerptRepository.save(
                    ownerKey,
                    clientId,
                    text,
                    "manual",
                    new Date(),
                );
                if (receipt.duplicated)
                    banner.show({
                        title: "已存在相同摘录",
                        message: "已移到最前",
                        type: "neutral",
                    });
            }
            excerptRepository.assertSession(ownerKey, generation);
            onClose();
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "保存失败，请重试",
            );
            setBusy(false);
        }
    };

    return (
        <FormDialog
            onClose={() => void save("dismiss")}
            title={
                <Text
                    accessibilityRole="header"
                    style={{ fontSize: 24, color: semanticColors.textPrimary }}
                >
                    {base ? "编辑摘录" : "新建摘录"}
                </Text>
            }
            actions={
                <View style={{ flexDirection: "row", gap: 10 }}>
                    <AppButton
                        className="flex-1"
                        variant="secondary"
                        label="取消"
                        disabled={busy}
                        onPress={onClose}
                    />
                    <AppButton
                        className="flex-1"
                        label="保存"
                        loading={busy}
                        loadingLabel="保存中…"
                        disabled={empty || unchanged}
                        onPress={() => void save("confirm")}
                    />
                </View>
            }
        >
            <ScrollView
                style={{ flexShrink: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 2 }}
            >
                <BodyInput
                    value={text}
                    onChangeText={(value) => {
                        setText(value);
                        setError("");
                    }}
                    placeholder="输入或粘贴要保存的文字"
                    invalid={!!error}
                    disabled={busy}
                    maxLength={EXCERPT_CONTENT_LIMIT}
                    // 不截断原文：开头空行等会在保存时规范化掉，计数与上限只看将要保存的正文。
                    truncate={false}
                    measure={measureExcerpt}
                    accessibilityLabel="摘录正文"
                />
                <InlineHint
                    icon={CloudOff}
                    message="摘录仅保存在本机，暂不同步到云端"
                    className="mt-3"
                />
                {!!error && (
                    <Text
                        selectable
                        accessibilityRole="alert"
                        style={{
                            marginTop: 8,
                            fontSize: 14,
                            color: semanticColors.destructive,
                        }}
                    >
                        {error}
                    </Text>
                )}
            </ScrollView>
        </FormDialog>
    );
}
