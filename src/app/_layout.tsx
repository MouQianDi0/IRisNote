import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../../global.css";

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="pages/note/create" options={{ headerShown: false }} />
                <Stack.Screen name="pages/todo/create" options={{ headerShown: false }} />
                <Stack.Screen name="pages/excerpt/create" options={{ headerShown: false }} />
                <Stack.Screen name="pages/user/settings" options={{ headerShown: false }} />
            </Stack>
        </GestureHandlerRootView>
    );
}
