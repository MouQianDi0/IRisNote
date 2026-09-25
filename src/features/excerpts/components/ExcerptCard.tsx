import { memo } from "react";
import { Copy, Pin } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { IconButton } from "@/shared/ui";
import { excerptMetaLabel } from "../domain/excerpt-display";
import type { ExcerptEntity } from "../excerpts.types";

/** 浅灰卡片：内边距上下 12、左 16、右 8；正文最多 3 行，元信息行距正文 6。 */
export const ExcerptCard = memo(function ExcerptCard({
    excerpt,
    now,
    onPress,
    onCopy,
}: {
    excerpt: ExcerptEntity;
    now: Date;
    onPress: (excerpt: ExcerptEntity) => void;
    onCopy: (excerpt: ExcerptEntity) => void;
}) {
    const meta = excerptMetaLabel(excerpt, now);
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`摘录，${excerpt.content.slice(0, 60)}，${meta}`}
            accessibilityHint="打开摘录操作"
            onPress={() => onPress(excerpt)}
            style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 12,
                paddingLeft: 16,
                paddingRight: 8,
                borderRadius: radii.card,
                borderCurve: "continuous",
                backgroundColor: semanticColors.surfaceControl,
                opacity: pressed ? 0.85 : 1,
            })}
        >
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    numberOfLines={3}
                    style={{
                        fontSize: 15,
                        lineHeight: 21,
                        color: semanticColors.textPrimary,
                    }}
                >
                    {excerpt.content}
                </Text>
                <View
                    style={{
                        marginTop: 6,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    {excerpt.isPinned && (
                        <Pin size={12} color={semanticColors.textSecondary} />
                    )}
                    <Text
                        numberOfLines={1}
                        style={{
                            flexShrink: 1,
                            fontSize: 12,
                            color: semanticColors.textSecondary,
                        }}
                    >
                        {meta}
                    </Text>
                </View>
            </View>
            <IconButton
                icon={Copy}
                accessibilityLabel="复制摘录"
                size="compact"
                iconSize={20}
                onPress={() => onCopy(excerpt)}
            />
        </Pressable>
    );
});
