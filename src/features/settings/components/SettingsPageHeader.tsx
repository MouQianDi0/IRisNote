import { colors } from "@/shared/theme";
import { ArrowLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type SettingsPageHeaderProps = {
    title: string;
    backLabel: string;
    onBack: () => void;
};

export function SettingsPageHeader({
    title,
    backLabel,
    onBack,
}: SettingsPageHeaderProps) {
    return (
        <View className="h-16 flex-row items-center justify-between">
            <Pressable
                accessibilityLabel={backLabel}
                accessibilityRole="button"
                className="h-11 w-11 items-center justify-center rounded-full active:bg-hyper-card active:opacity-[0.85]"
                onPress={onBack}
            >
                <ArrowLeft size={24} color={colors.textPrimary} />
            </Pressable>
            <Text
                accessibilityRole="header"
                className="text-text-primary text-2xl"
            >
                {title}
            </Text>
            <View className="h-11 w-11" />
        </View>
    );
}
