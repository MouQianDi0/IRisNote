import { AppProviders } from "@/core/providers/AppProviders";
import { colors } from "@/shared/theme";
import { OverlaySlot } from "@/shared/ui/Overlay/overlay-context";
import { Stack, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import "../../global.css";

/** 页面自身为白色的路由前缀：安全区需与页面背景保持一致。 */
const WHITE_SURFACE_ROUTES = ["/auth/", "/pages/note/"];

export default function RootLayout() {
    const pathname = usePathname();
    const safeAreaBackground = WHITE_SURFACE_ROUTES.some((prefix) =>
        pathname.startsWith(prefix),
    )
        ? colors.surface
        : colors.appBackground;

    return (
        <AppProviders>
            <SafeAreaView
                edges={["top", "left", "right"]}
                style={{ flex: 1, backgroundColor: safeAreaBackground }}
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
                        name="pages/user/cloud-storage"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/data-storage"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/notes"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/starred"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/drafts"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/trash"
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
                        name="pages/user/profile/index"
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="pages/user/profile/platforms"
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
