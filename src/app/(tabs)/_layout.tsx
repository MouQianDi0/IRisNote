import { useAuth } from "@/hooks/useAuth";
import { colors } from "@/theme";
import { Redirect, Tabs, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import {
    ActivityIndicator,
    BackHandler,
    Easing,
    ToastAndroid,
    View,
} from "react-native";
import FloatingMenu from "../../components/FloatingMenu";

function TabsBackExitHandler() {
  const lastBackPressRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          const now = Date.now();

          if (now - lastBackPressRef.current <= 1500) {
            BackHandler.exitApp();
            return true;
          }

          lastBackPressRef.current = now;
          ToastAndroid.show("再次返回退出应用", ToastAndroid.SHORT);
          return true;
        },
      );

      return () => subscription.remove();
    }, []),
  );

  return null;
}

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
    return <Redirect href="/auth/login" />;
  }

  return (
    <>
      <TabsBackExitHandler />
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
    </>
  );
}
