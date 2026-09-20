import { Pressable, Text, View } from "react-native";
import { semanticColors } from "@/shared/theme";
import type { TodoSyncRecord } from "../sync.types";

export function TodoSyncQueueRow({
  record,
  onConflict,
  onRetry,
}: {
  record: TodoSyncRecord;
  onConflict: () => void;
  onRetry: () => void;
}) {
  const conflict = record.status === "conflict";
  return (
    <View
      style={{
        minHeight: 72,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 16,
            fontWeight: "600",
            color: semanticColors.textPrimary,
          }}
        >
          {record.candidate.body}
        </Text>
        <Text style={{ fontSize: 13, color: semanticColors.textSecondary }}>
          {record.deleted ? "删除待办" : "同步待办"} ·{" "}
          {conflict
            ? "需要处理"
            : record.status === "blocked"
              ? "需要检查内容"
              : "等待服务器确认"}
        </Text>
        {!!record.error && (
          <Text
            numberOfLines={3}
            style={{ fontSize: 12, color: semanticColors.destructive }}
          >
            {record.error}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={conflict ? "处理待办冲突" : "重试待办同步"}
        onPress={conflict ? onConflict : onRetry}
        style={{
          minHeight: 48,
          justifyContent: "center",
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ color: semanticColors.brandPrimary, fontSize: 14 }}>
          {conflict ? "处理冲突" : "重试"}
        </Text>
      </Pressable>
    </View>
  );
}
