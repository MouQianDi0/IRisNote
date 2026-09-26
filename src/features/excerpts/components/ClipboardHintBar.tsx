import { Info, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { InlineHint } from "@/shared/ui";

/** 自动检测关闭时的提示条：浅灰底、16 圆角，内边距上下 12 / 左右 16；× 后永久隐藏。 */
export function ClipboardHintBar({
    disabled,
    onEnable,
    onDismiss,
}: {
    disabled: boolean;
    onEnable: () => void;
    onDismiss: () => void;
}) {
    return (
        <View
            style={{
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: radii.card,
                borderCurve: "continuous",
                backgroundColor: semanticColors.surfaceControl,
            }}
        >
            <InlineHint icon={Info} message="自动检测已关闭，不会读取剪贴板" />
            <View
                style={{
                    marginTop: 4,
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="开启剪贴板自动检测"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={onEnable}
                    hitSlop={{ top: 6, bottom: 6 }}
                    style={({ pressed }) => ({
                        minHeight: 32,
                        paddingHorizontal: 8,
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <Text
                        style={{
                            fontSize: 14,
                            color: disabled
                                ? semanticColors.textDisabled
                                : semanticColors.brandPrimary,
                        }}
                    >
                        开启
                    </Text>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="不再显示此提示"
                    onPress={onDismiss}
                    hitSlop={6}
                    style={({ pressed }) => ({
                        width: 32,
                        height: 32,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <X size={16} color={semanticColors.textSecondary} />
                </Pressable>
            </View>
        </View>
    );
}
