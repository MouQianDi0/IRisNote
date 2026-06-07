import { Tabs } from "expo-router";

export default function TabsLayout() {
    return (
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="note" />
            <Tabs.Screen name="todo" />
            <Tabs.Screen name="excerpt" />
            <Tabs.Screen name="user" />
        </Tabs>
    );
}
