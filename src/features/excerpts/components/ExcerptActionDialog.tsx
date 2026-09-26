import { Copy, Pin, SquarePen, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/shared/theme";
import { StatusToggle } from "@/shared/ui";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { dialogCard, dialogScrim } from "@/shared/ui/Dialog/dialog.styles";
import type { ExcerptEntity } from "../excerpts.types";

/**
 * 外壳沿用 §4 弹窗（24 内边距与圆角、最大宽 440）。
 * 预览两行 → 16 → 置顶 → 12 → 编辑 | 复制 | 删除 操作条。
 */
export function ExcerptActionDialog({
    excerpt,
    busy,
    onClose,
    onTogglePin,
    onEdit,
    onCopy,
    onDelete,
}: {
    excerpt: ExcerptEntity | null;
    busy: boolean;
    onClose: () => void;
    onTogglePin: () => void;
    onEdit: () => void;
    onCopy: () => void;
    onDelete: () => void;
}) {
    const actions = [
        ["编辑", SquarePen, onEdit],
        ["复制", Copy, onCopy],
        ["删除", Trash2, onDelete],
    ] as const;
    return (
        <AppModal
            visible={!!excerpt}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View
                className={dialogScrim}
                onStartShouldSetResponder={() => true}
                onResponderRelease={onClose}
            >
                <View
                    accessibilityViewIsModal
                    className={dialogCard}
                    onStartShouldSetResponder={() => true}
                >
                    <Text
                        accessibilityRole="header"
                        numberOfLines={2}
                        className="text-[17px] leading-6 text-black"
                    >
                        {excerpt?.content}
                    </Text>
                    <StatusToggle
                        className="mt-4"
                        label={excerpt?.isPinned ? "取消置顶" : "置顶"}
                        icon={Pin}
                        selected={!!excerpt?.isPinned}
                        disabled={busy}
                        onPress={onTogglePin}
                    />
                    <View className="mt-3 flex-row items-center rounded-hyper-card bg-hyper-card">
                        {actions.map(([label, Icon, action], index) => (
                            <View
                                key={label}
                                className="flex-1 flex-row items-center"
                            >
                                {index > 0 && (
                                    <View className="h-5 w-px bg-hyper-divider" />
                                )}
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`${label}摘录`}
                                    disabled={busy}
                                    accessibilityState={{ disabled: busy }}
                                    onPress={action}
                                    style={({ pressed }) => ({
                                        opacity: pressed ? 0.85 : 1,
                                    })}
                                    className="min-h-12 flex-1 items-center justify-center gap-2 px-2.5 py-3"
                                >
                                    <Icon
                                        size={20}
                                        color={
                                            busy
                                                ? colors.hyperLabelDisabled
                                                : colors.textPrimary
                                        }
                                    />
                                    <Text className="text-sm text-black">
                                        {label}
                                    </Text>
                                </Pressable>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </AppModal>
    );
}
