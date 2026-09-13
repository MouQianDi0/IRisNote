import { colors, radius } from "@/shared/theme";
import { CircleCheck, CirclePlus, Keyboard, KeyboardOff, Mic } from "lucide-react-native";
import { Pressable, View } from "react-native";

type Props = {
  docked: boolean;
  disabled: boolean;
  onEdit: () => void;
};

const TOOLBAR_HEIGHT = 48;
export const FLOATING_TOUCH_HEIGHT = 48;
export const FLOATING_BOTTOM = 40;

/** 自定义四区工具栏；后三项仅展示预留入口。 */
export default function EditorBottomToolbar({
  docked,
  disabled,
  onEdit,
}: Props) {
  const PrimaryIcon = docked ? KeyboardOff : Keyboard;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: docked ? TOOLBAR_HEIGHT : FLOATING_TOUCH_HEIGHT,
        width: docked ? "100%" : 225,
        alignSelf: "center",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderRadius: docked ? 0 : radius.hyperControl,
          borderTopWidth: docked ? 1 : 0,
          borderColor: colors.borderSoft,
          boxShadow: docked ? undefined : "0 6px 24px rgba(0,0,0,0.14)",
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="编辑正文"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onEdit}
        style={({ pressed }) => ({
          flex: 1,
          height: docked ? TOOLBAR_HEIGHT : FLOATING_TOUCH_HEIGHT,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        })}
      >
        <PrimaryIcon size={18} strokeWidth={1.7} color={colors.textSecondary} />
      </Pressable>
      {[
        { label: "待办，暂未开放", Icon: CircleCheck },
        { label: "语音，暂未开放", Icon: Mic },
        { label: "添加，暂未开放", Icon: CirclePlus },
      ].map(({ label, Icon }) => (
        <View
          key={label}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: true }}
          style={{
            flex: 1,
            height: TOOLBAR_HEIGHT,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} strokeWidth={1.7} color={colors.textSecondary} />
        </View>
      ))}
    </View>
  );
}
