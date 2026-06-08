import { Tabs } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
export default function TabsLayout() {
    return (
        <SafeAreaView style={{ flex: 1 }}>
            <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
                <Tabs.Screen name="note" />
                <Tabs.Screen name="todo" />
                <Tabs.Screen name="excerpt" />
                <Tabs.Screen name="user" />
            </Tabs>
        </SafeAreaView>
    );
}
