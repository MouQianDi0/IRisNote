import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { radii, semanticColors } from "@/shared/theme";
import { AppModal } from "../Overlay/app-modal";

/** Fixed header/actions stay inside the panel; callers put only the form in a ScrollView. */
export function FormDialog({
    title,
    visible = true,
    onClose,
    children,
    actions,
}: {
    title: ReactNode;
    visible?: boolean;
    onClose: () => void;
    children: ReactNode;
    actions: ReactNode;
}) {
    return (
        <AppModal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                <View
                    style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 24,
                        backgroundColor: semanticColors.scrim,
                    }}
                >
                    <Pressable
                        accessibilityLabel="关闭弹窗"
                        accessible={false}
                        onPress={onClose}
                        style={{
                            position: "absolute",
                            top: 0,
                            bottom: 0,
                            left: 0,
                            right: 0,
                        }}
                    />
                    <View
                        accessibilityViewIsModal
                        style={{
                            width: "100%",
                            maxWidth: 440,
                            maxHeight: "85%",
                            padding: 24,
                            borderRadius: radii.dialog,
                            borderCurve: "continuous",
                            backgroundColor: semanticColors.surface,
                        }}
                    >
                        <View style={{ marginBottom: 16 }}>{title}</View>
                        {children}
                        <View style={{ marginTop: 16 }}>{actions}</View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </AppModal>
    );
}
