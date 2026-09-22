import { categoryIconGroups, getCategoryIcon } from "../category-icons";
import { colors, radii } from "@/shared/theme";
import { Pressable, ScrollView, Text, View } from "react-native";

type CategoryIconPickerProps = {
    selectedIcon: string;
    onChange: (icon: string) => void;
    showLabels?: boolean;
    variant?: "default" | "hyper";
};

export default function CategoryIconPicker({
    selectedIcon,
    onChange,
    showLabels = true,
    variant = "default",
}: CategoryIconPickerProps) {
    const hyper = variant === "hyper";
    if (hyper) {
        return (
            <ScrollView
                style={{ maxHeight: 240 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 12 }}
            >
                {categoryIconGroups.map((group) => (
                    <View key={group.label}>
                        {showLabels && (
                            <Text
                                style={{
                                    fontSize: 13,
                                    color: colors.hyperTextSecondary,
                                    marginBottom: 8,
                                }}
                            >
                                {group.label}
                            </Text>
                        )}
                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 8,
                            }}
                        >
                            {group.icons.map((iconName) => {
                                const Icon = getCategoryIcon(iconName);
                                const selected = iconName === selectedIcon;
                                return (
                                    <Pressable
                                        key={iconName}
                                        accessibilityRole="button"
                                        accessibilityLabel={iconName}
                                        accessibilityState={{ selected }}
                                        onPress={() => onChange(iconName)}
                                        style={({ pressed }) => ({
                                            width: 48,
                                            height: 48,
                                            flexShrink: 0,
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRadius: radii.iconCell,
                                            borderWidth: 1,
                                            borderColor: selected
                                                ? colors.primary
                                                : colors.transparent,
                                            backgroundColor: selected
                                                ? colors.hyperCardSelected
                                                : colors.hyperCard,
                                            opacity: pressed ? 0.85 : 1,
                                        })}
                                    >
                                        <Icon
                                            size={24}
                                            color={
                                                selected
                                                    ? colors.primary
                                                    : colors.textSecondary
                                            }
                                        />
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                ))}
            </ScrollView>
        );
    }
    return (
        <View>
            {categoryIconGroups.map((group) => (
                <View key={group.label} className="mb-1">
                    {showLabels && (
                        <Text className="mb-1 text-[12px] text-gray-400">
                            {group.label}
                        </Text>
                    )}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{
                            gap: 8,
                            paddingHorizontal: 4,
                            paddingVertical: 8,
                        }}
                        style={{ maxWidth: 300 }}
                    >
                        {group.icons.map((iconName) => {
                            const Icon = getCategoryIcon(iconName);
                            const selected = iconName === selectedIcon;
                            return (
                                <Pressable
                                    key={iconName}
                                    accessibilityRole="button"
                                    accessibilityLabel={iconName}
                                    accessibilityState={{ selected }}
                                    onPress={() => onChange(iconName)}
                                    className={`h-[48px] w-[48px] items-center justify-center rounded-icon-cell ${selected ? "bg-primary" : "bg-surface-muted"}`}
                                >
                                    <Icon
                                        size={24}
                                        color={
                                            selected
                                                ? colors.surface
                                                : colors.textSecondary
                                        }
                                    />
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            ))}
        </View>
    );
}
