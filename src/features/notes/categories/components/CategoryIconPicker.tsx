import { categoryIconGroups, getCategoryIcon } from "../category-icons";
import { colors } from "@/shared/theme";
import { Pressable, ScrollView, Text, View } from "react-native";

type CategoryIconPickerProps = {
    selectedIcon: string;
    onChange: (icon: string) => void;
    showLabels?: boolean;
};

export default function CategoryIconPicker({
    selectedIcon,
    onChange,
    showLabels = true,
}: CategoryIconPickerProps) {
    return (
        <View>
            {categoryIconGroups.map((group) => (
                <View key={group.label} className="mb-1">
                    {showLabels && (
                        <Text className="text-[12px] text-gray-400 mb-1">
                            {group.label}
                        </Text>
                    )}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingVertical: 8 }}
                        style={{ maxWidth: 300 }}
                    >
                        {group.icons.map((iconName) => {
                            const Icon = getCategoryIcon(iconName);
                            const selected = iconName === selectedIcon;
                            return (
                                <Pressable
                                    key={iconName}
                                    onPress={() => onChange(iconName)}
                                    className={`w-[48px] h-[48px] items-center justify-center rounded-control ${selected ? "bg-primary" : "bg-surface-muted"}`}
                                >
                                    <Icon size={24} color={selected ? colors.surface : colors.textSecondary} />
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            ))}
        </View>
    );
}
