import { Text, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { AppButton } from "@/shared/ui";

/** 检测到新内容：浅蓝底、1dp 主题蓝边框、16 圆角、内边距 16；标题 → 8 → 预览 3 行 → 12 → 按钮。 */
export function ClipboardDetectedCard({
    content,
    saving,
    onIgnore,
    onSave,
}: {
    content: string;
    saving: boolean;
    onIgnore: () => void;
    onSave: () => void;
}) {
    return (
        <View
            accessibilityRole="alert"
            style={{
                padding: 16,
                borderWidth: 1,
                borderColor: semanticColors.brandPrimary,
                borderRadius: radii.card,
                borderCurve: "continuous",
                backgroundColor: semanticColors.surfaceSelected,
            }}
        >
            <Text style={{ fontSize: 13, color: semanticColors.brandPrimary }}>
                检测到剪贴板新内容
            </Text>
            <Text
                numberOfLines={3}
                style={{
                    marginTop: 8,
                    fontSize: 15,
                    lineHeight: 21,
                    color: semanticColors.textPrimary,
                }}
            >
                {content}
            </Text>
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
                <AppButton
                    className="flex-1"
                    size="compact"
                    variant="secondary"
                    label="忽略"
                    disabled={saving}
                    onPress={onIgnore}
                />
                <AppButton
                    className="flex-1"
                    size="compact"
                    label="保存"
                    loading={saving}
                    loadingLabel="保存中…"
                    onPress={onSave}
                />
            </View>
        </View>
    );
}
