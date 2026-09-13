import { colors } from "@/shared/theme";
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type SettingsRowProps = {
  icon: LucideIcon;
  label: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  last?: boolean;
  onPress?: () => void;
};

/** 说明行保持只读；未开放项目禁用，只有可跳转项目显示箭头。 */
export function SettingsRow({
  icon: Icon,
  label,
  value,
  description,
  disabled = false,
  last = false,
  onPress,
}: SettingsRowProps) {
  const content = (
    <>
      <Icon size={22} color={disabled ? colors.textMuted : colors.primary} />
      <View className="min-w-0 flex-1">
        <View className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <Text
            className={
              disabled
                ? "text-[17px] text-text-muted"
                : "text-[17px] text-text-primary"
            }
          >
            {label}
          </Text>
          {value ? (
            <Text className="shrink text-[13px] text-text-secondary">
              {value}
            </Text>
          ) : null}
        </View>
        {description ? (
          <Text className="mt-1 text-sm leading-5 text-text-secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {onPress && !disabled ? (
        <ChevronRight size={18} color={colors.textMuted} />
      ) : null}
    </>
  );

  return (
    <>
      {onPress || disabled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={[label, value, description]
            .filter(Boolean)
            .join("，")}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          className="min-h-14 flex-row items-center gap-3 px-4 py-4 active:bg-surface-muted"
        >
          {content}
        </Pressable>
      ) : (
        <View className="min-h-14 flex-row items-center gap-3 px-4 py-4">
          {content}
        </View>
      )}
      {!last && <View className="mx-4 h-px bg-hyper-divider" />}
    </>
  );
}
