import { ClipboardPaste, Search, X } from "lucide-react-native";
import { Text, View } from "react-native";
import { semanticColors } from "@/shared/theme";
import { IconButton } from "@/shared/ui";

/** 行高 40：左侧标题与数量，右侧搜索与「粘贴一次」两个 40×40 图标按钮，间距 4。 */
export function ExcerptToolbar({
    count,
    searchOpen,
    pasting,
    disabled,
    onSearch,
    onPaste,
}: {
    count: number;
    searchOpen: boolean;
    pasting: boolean;
    disabled: boolean;
    onSearch: () => void;
    onPaste: () => void;
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
                icon={searchOpen ? X : Search}
                accessibilityLabel={searchOpen ? "关闭搜索" : "搜索摘录"}
                size="compact"
                iconSize={20}
                selected={searchOpen}
                disabled={disabled}
                onPress={onSearch}
            />
            <IconButton
                icon={ClipboardPaste}
                accessibilityLabel="粘贴剪贴板内容为摘录"
                size="compact"
                iconSize={20}
                loading={pasting}
                disabled={disabled}
                onPress={onPaste}
            />
        </View>
    );
}
