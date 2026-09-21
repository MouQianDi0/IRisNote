import { useRef, useState } from "react";
import { Clock, Search } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { AnchoredPopover } from "@/shared/ui";
import type { TodoFilter, TodoSort } from "../todos.types";
import { TodoIconAction } from "./TodoIconAction";

const filters: { value: TodoFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待进行" },
  { value: "inProgress", label: "进行中" },
  { value: "expired", label: "已过期" },
];
const sorts: { value: TodoSort; label: string }[] = [
  { value: "timeAsc", label: "时间正序" },
  { value: "timeDesc", label: "时间倒序" },
  { value: "priority", label: "优先级" },
];

export function TodoFilterBar({
  filter,
  sort,
  searchOpen,
  onFilter,
  onSort,
  onSearch,
}: {
  filter: TodoFilter;
  sort: TodoSort;
  searchOpen: boolean;
  onFilter: (value: TodoFilter) => void;
  onSort: (value: TodoSort) => void;
  onSearch: () => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const anchor = useRef<View>(null);
  return (
    <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "center", gap: 8 }}
      >
        {filters.map(({ value, label }) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`筛选${label}`}
            accessibilityState={{ selected: filter === value }}
            onPress={() => onFilter(value)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={{
              minHeight: 32,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                filter === value
                  ? semanticColors.brandPrimary
                  : semanticColors.surfaceControl,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color:
                  filter === value
                    ? semanticColors.onBrandPrimary
                    : semanticColors.textSecondary,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View ref={anchor} collapsable={false}>
        <TodoIconAction
          icon={Clock}
          label="待办排序"
          onPress={() => setSortOpen(true)}
        />
      </View>
      <TodoIconAction
        icon={Search}
        label={searchOpen ? "收起待办搜索" : "搜索待办"}
        selected={searchOpen}
        onPress={onSearch}
      />
      <AnchoredPopover
        visible={sortOpen}
        anchorRef={anchor}
        width={180}
        maxHeight={200}
        accessibilityLabel="待办排序"
        onClose={() => setSortOpen(false)}
      >
        <View style={{ padding: 8 }}>
          {sorts.map(({ value, label }) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: sort === value }}
              onPress={() => {
                onSort(value);
                setSortOpen(false);
              }}
              style={{
                minHeight: 48,
                paddingHorizontal: 12,
                justifyContent: "center",
                borderRadius: radii.control,
                backgroundColor:
                  sort === value
                    ? semanticColors.surfaceSelected
                    : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color:
                    sort === value
                      ? semanticColors.brandPrimary
                      : semanticColors.textPrimary,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </AnchoredPopover>
    </View>
  );
}
