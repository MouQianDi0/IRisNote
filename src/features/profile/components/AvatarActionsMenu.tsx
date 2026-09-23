import { colors } from "@/shared/theme";
import { AnchoredPopover } from "@/shared/ui";
import {
    Camera,
    Eye,
    Image as ImageIcon,
    type LucideIcon,
} from "lucide-react-native";
import type { RefObject } from "react";
import { Pressable, Text, View } from "react-native";
import type { AvatarMenuAction } from "../hooks/useAvatarUpdate";

const ACTIONS: { key: AvatarMenuAction; label: string; icon: LucideIcon }[] = [
    { key: "view", label: "查看头像", icon: Eye },
    { key: "library", label: "从相册选择", icon: ImageIcon },
    { key: "camera", label: "拍照", icon: Camera },
];

type AvatarActionsMenuProps = {
    visible: boolean;
    anchorRef: RefObject<View | null>;
    hasAvatar: boolean;
    onClose: () => void;
    onSelect: (action: AvatarMenuAction) => void;
};

/** 头像来源菜单：高度随行数自适应，没有头像时「查看头像」禁用。 */
export function AvatarActionsMenu({
    visible,
    anchorRef,
    hasAvatar,
    onClose,
    onSelect,
}: AvatarActionsMenuProps) {
    return (
        <AnchoredPopover
            visible={visible}
            anchorRef={anchorRef}
            onClose={onClose}
            width={232}
            accessibilityLabel="头像操作菜单"
        >
            <View>
                {ACTIONS.map(({ key, label, icon: Icon }, index) => {
                    const disabled = key === "view" && !hasAvatar;
                    return (
                        <View key={key}>
                            <Pressable
                                accessibilityLabel={label}
                                accessibilityRole="button"
                                accessibilityState={{ disabled }}
                                className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-hyper-card-selected active:opacity-[0.85]"
                                disabled={disabled}
                                onPress={() => onSelect(key)}
                            >
                                <Icon
                                    size={22}
                                    color={
                                        disabled
                                            ? colors.textMuted
                                            : colors.primary
                                    }
                                />
                                <Text
                                    className={
                                        disabled
                                            ? "min-w-0 flex-1 text-[17px] text-text-muted"
                                            : "text-text-primary min-w-0 flex-1 text-[17px]"
                                    }
                                >
                                    {label}
                                </Text>
                            </Pressable>
                            {index < ACTIONS.length - 1 ? (
                                <View className="mx-4 h-px bg-hyper-divider" />
                            ) : null}
                        </View>
                    );
                })}
            </View>
        </AnchoredPopover>
    );
}
