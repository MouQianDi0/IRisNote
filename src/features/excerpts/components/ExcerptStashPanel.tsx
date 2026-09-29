import { ScrollView, Text, View } from "react-native";
import { AppButton } from "@/shared/ui";
import type { ExcerptStashItem } from "../data/excerpt-stash.repository";

/** 捕获窗口与摘录页共用相同的暂存操作面板。 */
export function ExcerptStashPanel({ items, busy, onMove, onEdit, onRemove, onClear, onMerge }: {
    items: readonly ExcerptStashItem[];
    busy: boolean;
    onMove: (id: string, direction: "up" | "down") => void;
    onEdit: (item: ExcerptStashItem) => void;
    onRemove: (id: string) => void;
    onClear: () => void;
    onMerge: () => void;
}) {
    return <>
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {items.map((item, index) => <View key={item.clientId} className="mb-3 rounded-xl bg-hyper-card p-3">
                <Text numberOfLines={2} className="text-sm text-hyper-text-primary">{index + 1}　{item.content}</Text>
                <View className="mt-2 flex-row flex-wrap gap-1">
                    <AppButton size="compact" variant="secondary" label="上移" disabled={busy || index === 0} onPress={() => onMove(item.clientId, "up")} />
                    <AppButton size="compact" variant="secondary" label="下移" disabled={busy || index === items.length - 1} onPress={() => onMove(item.clientId, "down")} />
                    <AppButton size="compact" variant="secondary" label="编辑" disabled={busy} onPress={() => onEdit(item)} />
                    <AppButton size="compact" variant="secondary" label="删除" disabled={busy} onPress={() => onRemove(item.clientId)} />
                </View>
            </View>)}
        </ScrollView>
        <View className="mt-3 flex-row gap-2.5">
            <AppButton className="flex-1" variant="secondary" label="清空" disabled={busy || items.length === 0} onPress={onClear} />
            <AppButton className="flex-1" label="合并保存" disabled={busy || items.length === 0} onPress={onMerge} />
        </View>
    </>;
}
