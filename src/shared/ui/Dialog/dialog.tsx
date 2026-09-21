import { AppModal } from "../Overlay/app-modal";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import {
  dialogButtonLabelStyles,
  dialogButtonStyles,
  dialogCard,
  dialogScrim,
  dialogTitle,
  type DialogButtonVariant,
} from "./dialog.styles";

/** Extracted without changing existing note/category dialog geometry or handlers. */
export function DraftDialog({
  visible,
  title,
  onClose,
  children,
  headerExtra,
  leading,
  closeOnScrimTap = true,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  headerExtra?: ReactNode;
  leading?: ReactNode;
  closeOnScrimTap?: boolean;
}) {
  return (
    <AppModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className={dialogScrim}
        onStartShouldSetResponder={closeOnScrimTap ? () => true : undefined}
        onResponderRelease={closeOnScrimTap ? onClose : undefined}
      >
        <View
          accessibilityViewIsModal
          className={dialogCard}
          onStartShouldSetResponder={() => true}
        >
          <View className="mb-3 flex-row items-center justify-between gap-3">
            {leading}
            <Text accessibilityRole="header" className={dialogTitle}>
              {title}
            </Text>
            {headerExtra}
          </View>
          {children}
        </View>
      </View>
    </AppModal>
  );
}

export function DialogButton({
  label,
  variant = "primary",
  disabled = false,
  onPress,
  className,
  leading,
}: {
  label: string;
  variant?: DialogButtonVariant;
  disabled?: boolean;
  onPress: () => void;
  className?: string;
  leading?: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ height: variant === "text" ? 44 : 48 }}
      className={dialogButtonStyles({
        variant,
        disabled,
        pressed,
        class: className,
      })}
    >
      <View className="flex-row items-center gap-2">
        {leading}
        <Text
          numberOfLines={1}
          className={dialogButtonLabelStyles({ variant, disabled })}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
