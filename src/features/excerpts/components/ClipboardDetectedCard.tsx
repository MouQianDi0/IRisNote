import { useMemo } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { AppButton } from "@/shared/ui";

/** 检测到新内容：浅蓝底、1dp 主题蓝边框、16 圆角、内边距 16；标题 → 8 → 预览 3 行 → 12 → 按钮。 */
export function ClipboardDetectedCard({
    content,
    onDismiss,
    onSave,
}: {
    content: string;
    onDismiss: () => void;
    onSave: () => void;
}) {
    const swipe = useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => { if (Math.abs(gesture.dx) > 80) onDismiss(); },
    }), [onDismiss]);
    return (
        <View
            {...swipe.panHandlers}
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
            <Pressable accessibilityRole="button" accessibilityLabel="关闭提示" onPress={onDismiss} style={{ position: "absolute", right: 12, top: 10 }}><Text>✕</Text></Pressable>
            <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
                <AppButton
                    className="flex-1"
                    size="compact"
                    label="保存"
                    onPress={onSave}
                />
            </View>
        </View>
    );
}
