import { AppProviders } from "@/core/providers/AppProviders";
import { OverlaySlot } from "@/shared/ui/Overlay/overlay-context";
import { colors } from "@/shared/theme";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import "../../global.css";

export default function RootLayout() {
    return (
        <AppProviders>
                <SafeAreaView
                    edges={["top", "left", "right"]}
                    style={{ flex: 1, backgroundColor: colors.appBackground }}
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
                            options={{
                                headerShown: false,
                                presentation: "transparentModal",
                                contentStyle: { backgroundColor: "transparent" },
                                animation: "none",
                            }}
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
                            name="pages/note/edit/[id]"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/settings"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/permissions"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/about"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/help-feedback"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="pages/user/sync-queue"
                            options={{ headerShown: false }}
                        />
                        <Stack.Screen
                            name="auth/welcome"
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
                    <OverlaySlot />
                </SafeAreaView>
        </AppProviders>
    );
}
