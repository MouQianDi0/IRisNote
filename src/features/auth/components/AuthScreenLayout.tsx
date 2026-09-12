import { colors } from "@/shared/theme";
import { router, useFocusEffect } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, type PropsWithChildren } from "react";
import {
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

type AuthScreenLayoutProps = PropsWithChildren<{
    title: string;
    subtitle: string;
    footerPrompt: string;
    footerAction: string;
    onFooterPress: () => void;
    busy?: boolean;
}>;

export function AuthScreenLayout({
    title,
    subtitle,
    footerPrompt,
    footerAction,
    onFooterPress,
    busy = false,
    children,
}: AuthScreenLayoutProps) {
    const returnToWelcome = useCallback(() => {
        if (!busy) router.dismissTo("/auth/welcome");
    }, [busy]);

    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener(
                "hardwareBackPress",
                () => {
                    returnToWelcome();
                    return true;
                },
            );
            return () => subscription.remove();
        }, [returnToWelcome]),
    );

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-white"
            behavior={
                Platform.OS === "ios"
                    ? "padding"
                    : Platform.OS === "android"
                      ? "height"
                      : undefined
            }
        >
            <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ flexGrow: 1 }}
            >
                <View className="flex-1 items-center px-4 pb-6 pt-3">
                    <View className="w-full max-w-[440px]">
                        <View className="mb-2 h-11 flex-row items-center">
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="返回欢迎页"
                                accessibilityState={{ disabled: busy }}
                                disabled={busy}
                                onPress={returnToWelcome}
                                className="h-11 w-11 items-center justify-center active:opacity-85"
                            >
                                <ArrowLeft
                                    size={24}
                                    color={
                                        busy
                                            ? colors.hyperLabelDisabled
                                            : colors.textPrimary
                                    }
                                />
                            </Pressable>
                        </View>
                        <View className="mb-8 gap-3">
                            <Text
                                accessibilityRole="header"
                                className="text-center text-2xl text-black"
                            >
                                {title}
                            </Text>
                            <Text className="text-center text-sm text-hyper-text-secondary">
                                {subtitle}
                            </Text>
                        </View>
                        {children}
                        <View className="mt-4 flex-row flex-wrap items-center justify-center gap-1">
                            <Text className="text-sm text-hyper-text-secondary">
                                {footerPrompt}
                            </Text>
                            <Pressable
                                accessibilityRole="link"
                                accessibilityState={{ disabled: busy }}
                                disabled={busy}
                                onPress={onFooterPress}
                                className="min-h-11 justify-center active:opacity-85"
                            >
                                <Text
                                    className={
                                        busy
                                            ? "text-sm text-hyper-primary-faded"
                                            : "text-sm text-primary"
                                    }
                                >
                                    {footerAction}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
