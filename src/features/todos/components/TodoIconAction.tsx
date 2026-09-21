import type { LucideIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { semanticColors } from "@/shared/theme";

export function TodoIconAction({
  icon: Icon,
  label,
  onPress,
  selected = false,
  danger = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon
        size={20}
        color={
          disabled
            ? semanticColors.textDisabled
            : selected
              ? semanticColors.brandPrimary
              : danger
                ? semanticColors.destructive
                : semanticColors.textSecondary
        }
      />
    </Pressable>
  );
}
