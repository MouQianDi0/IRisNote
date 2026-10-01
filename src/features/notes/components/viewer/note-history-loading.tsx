import { semanticColors } from "@/shared/theme";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

/** 延迟出现转圈，快速读取不闪烁；任务改变或卸载时清理计时器。 */
export default function NoteHistoryLoading({ label }: { label: string }) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            if (!cancelled) setShown(true);
        }, 150);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, []);
    return (
        <View
            accessibilityState={{ busy: true }}
            accessibilityLabel={label}
            style={{ minHeight: 160 }}
            className="items-center justify-center gap-2"
        >
            {shown && (
                <>
                    <ActivityIndicator
                        size="small"
                        color={semanticColors.brandPrimary}
                    />
                    <Text className="text-sm text-text-secondary">{label}</Text>
                </>
            )}
        </View>
    );
}
