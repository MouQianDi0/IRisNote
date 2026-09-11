import {
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bookmark } from "lucide-react-native";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { colors } from "@/shared/theme";
import type { ReadingNavigationEntry } from "../../reading/reading-navigation";

export default function ReadingNavigationPanel({
  visible,
  entries,
  currentIds,
  onClose,
  onJump,
}: {
  visible: boolean;
  entries: readonly ReadingNavigationEntry[];
  currentIds: readonly string[];
  onClose: () => void;
  onJump: (entry: ReadingNavigationEntry) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <AppModal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: colors.overlay,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭大纲"
          onPress={onClose}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        />
        <View
          style={{
            height: (height - insets.top - insets.bottom) * 0.6 + insets.bottom,
            paddingBottom: insets.bottom,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            overflow: "hidden",
            backgroundColor: colors.surface,
          }}
        >
          <View
            style={{
              height: 48,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 1,
              borderColor: colors.borderSoft,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 17,
                fontWeight: "600",
                color: colors.textPrimary,
              }}
            >
              大纲
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={{
                position: "absolute",
                right: 8,
                minHeight: 44,
                minWidth: 44,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                关闭
              </Text>
            </Pressable>
          </View>
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            ListEmptyComponent={
              <Text
                style={{
                  paddingVertical: 24,
                  textAlign: "center",
                  color: colors.textSecondary,
                }}
              >
                暂无段落标题或书签
              </Text>
            }
            renderItem={({ item }) => {
              const active = currentIds.includes(item.id);
              const color = active ? colors.primary : colors.textPrimary;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onJump(item)}
                  style={{
                    minHeight: 44,
                    paddingVertical: 10,
                    paddingLeft:
                      Math.min(6, Math.max(0, (item.level ?? 1) - 1)) * 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {item.kind === "bookmark" && (
                    <Bookmark size={16} color={color} />
                  )}
                  <Text style={{ color, fontSize: 15, flexShrink: 1 }}>
                    {item.title ||
                      (item.kind === "bookmark" ? "书签" : "未命名标题")}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </AppModal>
  );
}
