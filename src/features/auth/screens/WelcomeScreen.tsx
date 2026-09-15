import { colors } from "@/shared/theme";
import { Image } from "expo-image";
import { Redirect, router } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { AuthButton } from "../components/AuthButton";
import { useAuth } from "../hooks/useAuth";

export default function WelcomeScreen() {
    const { isLoggedIn, loading } = useAuth();

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator
                    accessibilityLabel="正在恢复会话"
                    color={colors.primary}
                />
            </View>
        );
    }

    if (isLoggedIn) return <Redirect href="/(tabs)/note" />;

    return (
        <ScrollView
            className="flex-1 bg-white"
            contentContainerStyle={{ flexGrow: 1 }}
        >
            <View className="flex-1 items-center">
                <View className="w-full max-w-[528px] flex-1 px-11 pb-6">
                    <View className="min-h-[320px] flex-1 items-center justify-center py-8">
                        <Image
                            source={require("../../../../assets/images/IRisNote.png")}
                            accessibilityLabel="IRisNote 图标"
                            contentFit="contain"
                            style={{ width: 80, height: 80 }}
                        />
                        <Text
                            accessibilityRole="header"
                            className="mt-6 text-center text-[32px] text-black"
                        >
                            IRisNote
                        </Text>
                        <Text className="mt-3 text-center text-base text-hyper-text-secondary">
                            开始记录你的想法
                        </Text>
                    </View>
                    <View className="gap-2.5">
                        <AuthButton
                            label="注册"
                            onPress={() => router.push("/auth/register")}
                        />
                        <AuthButton
                            label="登录"
                            variant="tonal"
                            onPress={() => router.push("/auth/login")}
                        />
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}
