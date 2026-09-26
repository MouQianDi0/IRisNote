import type { LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { colors } from "@/shared/theme";

type SettingsOverviewItemProps = {
    icon: LucideIcon;
    label: string;
    value: string;
};

/** 设置首页概览项只陈述当前状态，不提供尚未接入的交互。 */
export function SettingsOverviewItem({
    icon: Icon,
    label,
    value,
}: SettingsOverviewItemProps) {
    return (
        <View
            accessible
            accessibilityLabel={`${label}，${value}`}
            className="min-w-0 flex-1 items-center px-1 py-1"
        >
            <Icon size={22} color={colors.primary} />
            <Text
                className="text-text-primary mt-2 text-center text-sm"
                numberOfLines={1}
            >
                {label}
            </Text>
            <Text
                className="mt-1 text-center text-[13px] text-hyper-text-secondary"
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}
