import TabsBackExitHandler from "@/core/navigation/components/TabsBackExitHandler";
import FloatingMenu from "@/core/navigation/components/FloatingMenu";
import { SwipeTabs } from "@/core/navigation/components/SwipeTabsNavigator";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { Redirect } from "expo-router";
import { BlurTargetView } from "expo-blur";
import { createRef, useState, type RefObject } from "react";
import { ActivityIndicator, Dimensions, View } from "react-native";

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
      <SwipeTabs
        initialLayout={{ width: Dimensions.get("window").width }}
        tabBarPosition="bottom"
        keyboardDismissMode="auto"
        overScrollMode="never"
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
          swipeEnabled: true,
          animationEnabled: true,
          lazy: true,
          lazyPreloadDistance: 1,
        }}
      >
        <SwipeTabs.Screen name="note" />
        <SwipeTabs.Screen name="todo" />
        <SwipeTabs.Screen name="excerpt" />
        <SwipeTabs.Screen name="user" />
      </SwipeTabs>
    </>
  );
}
