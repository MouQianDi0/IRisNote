import { useAuth } from "@/hooks/useAuth";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Easing, View } from "react-native";
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
            screenOptions={{
                headerShown: false,
                transitionSpec: {
                    animation: "timing",
                    config: {
                        duration: 180,
                        easing: Easing.out(Easing.quad),
                    },
                },

                sceneStyleInterpolator: ({ current }) => ({
                    sceneStyle: {
                        opacity: current.progress.interpolate({
                            inputRange: [-1, 0, 1],
                            outputRange: [0.4, 1, 0.4],
                        }),

                        transform: [
                            {
                                translateY: current.progress.interpolate({
                                    inputRange: [-1, 0, 1],
                                    outputRange: [8, 0, 8],
                                }),
                            },
                            {
                                scale: current.progress.interpolate({
                                    inputRange: [-1, 0, 1],
                                    outputRange: [0.98, 1, 0.98],
                                }),
                            },
                        ],
                    },
                }),
            }}
        >
            <Tabs.Screen name="note" />
            <Tabs.Screen name="todo" />
            <Tabs.Screen name="excerpt" />
            <Tabs.Screen name="user" />
        </Tabs>
    );
}
