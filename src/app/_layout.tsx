import { AuthProvider } from "@/hooks/useAuth";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import "../../global.css";

export default function RootLayout() {
    return (
        <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <SafeAreaView
                    style={{ flex: 1, backgroundColor: "rgb(242, 242, 242)" }}
                >
                    <Stack screenOptions={{ animation: "fade_from_bottom" }}>
                        <Stack.Screen
                            name="(tabs)"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/note/create"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/todo/create"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/excerpt/create"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/note/[id]"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/settings"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="auth/login"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="auth/register"
                            options={{ headerShown: false }}
                        />
                    </Stack>
                </SafeAreaView>
            </GestureHandlerRootView>
        </AuthProvider>
    );
}
