import { useAuth } from "@/hooks/useAuth";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import FloatingMenu from "../../components/FloatingMenu";

export default function TabsLayout() {
    const { isLoggedIn, loading } = useAuth();

    if (loading) {
        return (
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    if (!isLoggedIn) {
        return <Redirect href="/auth/login" />;
    }

    return (
        <Tabs
            tabBar={(props) => <FloatingMenu {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tabs.Screen name="note" />
            <Tabs.Screen name="todo" />
            <Tabs.Screen name="excerpt" />
            <Tabs.Screen name="user" />
        </Tabs>
    );
}
