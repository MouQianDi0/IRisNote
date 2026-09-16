import { withLayoutContext } from "expo-router";
import {
    CommonActions,
    createNavigatorFactory,
    TabRouter,
    useLocale,
    useNavigationBuilder,
    useTheme,
    type DefaultNavigatorOptions,
    type Descriptor,
    type NavigationHelpers,
    type NavigationProp,
    type ParamListBase,
    type RouteProp,
    type TabActionHelpers,
    type TabNavigationState,
    type TabRouterOptions,
} from "expo-router/react-navigation";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { TabView } from "react-native-tab-view";

export type SwipeTabOptions = {
    animationEnabled?: boolean;
    headerShown?: boolean;
    lazy?: boolean;
    lazyPreloadDistance?: number;
    sceneStyle?: StyleProp<ViewStyle>;
    swipeEnabled?: boolean;
};

type SwipeTabEventMap = {
    swipeEnd: { data: undefined };
    swipeStart: { data: undefined };
    tabLongPress: { data: undefined };
    tabPress: { canPreventDefault: true; data: undefined };
};

type SwipeTabNavigationProp<
    ParamList extends ParamListBase,
    RouteName extends keyof ParamList = keyof ParamList,
    NavigatorId extends string | undefined = undefined,
> = NavigationProp<
    ParamList,
    RouteName,
    NavigatorId,
    TabNavigationState<ParamList>,
    SwipeTabOptions,
    SwipeTabEventMap
> &
    TabActionHelpers<ParamList>;

type SwipeTabDescriptor = Descriptor<
    SwipeTabOptions,
    SwipeTabNavigationProp<ParamListBase>,
    RouteProp<ParamListBase>
>;

export type SwipeTabsBarProps = {
    descriptors: Record<string, SwipeTabDescriptor>;
    navigation: NavigationHelpers<ParamListBase, SwipeTabEventMap>;
    state: TabNavigationState<ParamListBase>;
};

type SwipeTabsConfig = {
    initialLayout?: { height?: number; width?: number };
    keyboardDismissMode?: "auto" | "none" | "on-drag";
    overScrollMode?: "always" | "auto" | "never";
    tabBar?: (props: SwipeTabsBarProps) => ReactNode;
    tabBarPosition?: "bottom" | "top";
};

type SwipeTabsNavigatorProps = DefaultNavigatorOptions<
    ParamListBase,
    string | undefined,
    TabNavigationState<ParamListBase>,
    SwipeTabOptions,
    SwipeTabEventMap,
    SwipeTabNavigationProp<ParamListBase>
> &
    TabRouterOptions &
    SwipeTabsConfig;

function SwipeTabsNavigator({
    id,
    initialRouteName,
    backBehavior,
    UNSTABLE_routeNamesChangeBehavior,
    children,
    layout,
    screenListeners,
    screenOptions,
    screenLayout,
    UNSTABLE_router,
    initialLayout,
    keyboardDismissMode,
    overScrollMode,
    tabBar,
    tabBarPosition = "top",
}: SwipeTabsNavigatorProps) {
    const { state, descriptors, navigation, NavigationContent } =
        useNavigationBuilder<
            TabNavigationState<ParamListBase>,
            TabRouterOptions,
            TabActionHelpers<ParamListBase>,
            SwipeTabOptions,
            SwipeTabEventMap
        >(TabRouter, {
            id,
            initialRouteName,
            backBehavior,
            UNSTABLE_routeNamesChangeBehavior,
            children,
            layout,
            screenListeners,
            screenOptions,
            screenLayout,
            UNSTABLE_router,
        });
    const { colors } = useTheme();
    const { direction } = useLocale();
    const focusedOptions = descriptors[state.routes[state.index].key].options;

    return (
        <NavigationContent>
            <TabView
                animationEnabled={focusedOptions.animationEnabled}
                direction={direction}
                initialLayout={initialLayout}
                keyboardDismissMode={keyboardDismissMode}
                lazy={({ route }) =>
                    descriptors[route.key].options.lazy === true &&
                    !state.preloadedRouteKeys.includes(route.key)
                }
                lazyPreloadDistance={focusedOptions.lazyPreloadDistance}
                navigationState={state}
                onIndexChange={(index) => {
                    navigation.dispatch({
                        ...CommonActions.navigate(state.routes[index]),
                        target: state.key,
                    });
                }}
                onSwipeEnd={() => navigation.emit({ type: "swipeEnd" })}
                onSwipeStart={() => navigation.emit({ type: "swipeStart" })}
                options={Object.fromEntries(
                    state.routes.map((route) => [
                        route.key,
                        {
                            sceneStyle: [
                                { backgroundColor: colors.background },
                                descriptors[route.key].options.sceneStyle,
                            ],
                        },
                    ]),
                )}
                overScrollMode={overScrollMode}
                renderScene={({ route }) => descriptors[route.key].render()}
                renderTabBar={() =>
                    tabBar?.({
                        state,
                        navigation,
                        descriptors,
                    }) ?? null
                }
                swipeEnabled={focusedOptions.swipeEnabled}
                tabBarPosition={tabBarPosition}
            />
        </NavigationContent>
    );
}

const SwipeTabsNavigatorFactory = createNavigatorFactory(SwipeTabsNavigator)();

export const SwipeTabs = withLayoutContext<
    SwipeTabOptions,
    typeof SwipeTabsNavigatorFactory.Navigator,
    TabNavigationState<ParamListBase>,
    SwipeTabEventMap
>(SwipeTabsNavigatorFactory.Navigator);
