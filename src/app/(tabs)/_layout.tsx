import TabsBackExitHandler from "@/core/navigation/components/TabsBackExitHandler";
import FloatingMenu from "@/core/navigation/components/FloatingMenu";
import { SwipeTabs } from "@/core/navigation/components/SwipeTabsNavigator";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { Redirect } from "expo-router";
import { ActivityIndicator, Dimensions, View } from "react-native";

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
        tabBar={(props) => <FloatingMenu {...props} />}
        screenOptions={{
          headerShown: false,
          swipeEnabled: true,
          animationEnabled: true,
          lazy: true,
          lazyPreloadDistance: 1,
        }}
      >
        <SwipeTabs.Screen name="note" />
        <SwipeTabs.Screen name="excerpt" />
        <SwipeTabs.Screen name="todo" />
        <SwipeTabs.Screen name="user" />
      </SwipeTabs>
    </>
  );
}
