import { useState } from "react";
import { Text, View } from "react-native";

import { AppCalendar } from "@/shared/ui";

export default function TodosScreen() {
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);

  return (
    <View className="mt-[15px] flex-1 bg-app-background">
      <View className="flex-1 flex-row">
        <View className="relative flex-1">
          <View className="mb-2 h-[100%] rounded-tr-content border-b border-r border-t border-note-page-border bg-white p-4 pb-6">
            <View className="pt-3">
              <AppCalendar
                initialViewMode="week"
                value={selectedDateId}
                onChange={(value) =>
                  setSelectedDateId(typeof value === "string" ? value : null)
                }
              />
            </View>
            <View className="flex-1 items-center justify-center px-4">
              <Text className="mb-[10px] text-2xl font-bold">待办事项</Text>
              <Text className="mb-5 text-base text-text-secondary">
                这里是你的待办清单
              </Text>
              <Text className="text-sm text-text-muted">
                点击 + 按钮添加新待办
              </Text>
            </View>
          </View>
        </View>
        <View className="relative h-auto w-[75px] items-center gap-[6px] rounded-floating bg-app-background" />
      </View>
    </View>
  );
}
