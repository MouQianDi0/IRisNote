import TabsBackExitHandler from "@/core/navigation/components/TabsBackExitHandler";
import FloatingMenu from "@/core/navigation/components/FloatingMenu";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { Redirect, Tabs } from "expo-router";
import { BlurTargetView } from "expo-blur";
import { createRef, useState, type RefObject } from "react";
import { ActivityIndicator, Easing, View } from "react-native";

export default function TabsLayout() {
  const { isLoggedIn, loading } = useAuth();
  // Each mounted scene keeps its own target; the menu samples only the active tab.
  const [blurTargets] = useState<Record<string, RefObject<View | null>>>(
    () => ({
      note: createRef<View>(),
      todo: createRef<View>(),
      excerpt: createRef<View>(),
      user: createRef<View>(),
    }),
  );

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <Redirect href="/auth/welcome" />;
  }

  return (
    <>
      <TabsBackExitHandler />
      <Tabs
        screenLayout={({ children, route }) => (
          <BlurTargetView ref={blurTargets[route.name]} style={{ flex: 1 }}>
            {children}
          </BlurTargetView>
        )}
        tabBar={(props) => (
          <FloatingMenu
            {...props}
            blurTarget={blurTargets[props.state.routes[props.state.index].name]}
          />
        )}
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
    </>
  );
}
