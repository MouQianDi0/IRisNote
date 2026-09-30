import { ClipboardPaste, Inbox, Search, Timer, X } from "lucide-react-native";
import { Text, View } from "react-native";
import { semanticColors } from "@/shared/theme";
import { IconButton } from "@/shared/ui";

/** 右侧固定顺序：暂存区 / 快速摘录（支持环境）/ 粘贴 / 搜索。 */
export function ExcerptToolbar({
    count,
    searchOpen,
    pasting,
    disabled,
    onSearch,
    onPaste,
    sessionSupported,
    sessionActive,
    sessionDisabled,
    onSession,
    stashCount,
    onStash,
}: {
    count: number;
    searchOpen: boolean;
    pasting: boolean;
    disabled: boolean;
    onSearch: () => void;
    onPaste: () => void;
    sessionSupported: boolean;
    sessionActive: boolean;
    sessionDisabled: boolean;
    onSession: () => void;
    stashCount: number;
    onStash: () => void;
}) {
    return (
        <View
            style={{
                minHeight: 40,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
            }}
        >
            <Text
                accessibilityRole="header"
                numberOfLines={1}
                style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 17,
                    color: semanticColors.textPrimary,
                }}
            >
                摘录
                <Text
                    style={{
                        fontSize: 13,
                        color: semanticColors.textSecondary,
                    }}
                >
                    {` · ${count} 条`}
                </Text>
            </Text>
            <IconButton
                icon={Inbox}
                accessibilityLabel={`查看暂存区，${stashCount} 条`}
                size="compact"
                iconSize={20}
                disabled={disabled}
                onPress={onStash}
            />
            {sessionSupported && (
                <IconButton
                    icon={Timer}
                    accessibilityLabel={
                        sessionActive ? "快速摘录进行中" : "开启快速摘录"
                    }
                    size="compact"
                    iconSize={20}
                    selected={sessionActive}
                    disabled={sessionDisabled}
                    onPress={onSession}
                />
            )}
            <IconButton
                icon={ClipboardPaste}
                accessibilityLabel="粘贴剪贴板内容为摘录"
                size="compact"
                iconSize={20}
                loading={pasting}
                disabled={disabled}
                onPress={onPaste}
            />
            <IconButton
                icon={searchOpen ? X : Search}
                accessibilityLabel={searchOpen ? "关闭搜索" : "搜索摘录"}
                size="compact"
                iconSize={20}
                selected={searchOpen}
                disabled={disabled}
                onPress={onSearch}
            />
        </View>
    );
}
