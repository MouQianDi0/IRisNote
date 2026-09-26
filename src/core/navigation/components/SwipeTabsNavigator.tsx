import { colors as appColors } from "@/shared/theme";
import { BlurTargetView } from "expo-blur";
import { withLayoutContext } from "expo-router";
import {
    CommonActions,
    createNavigatorFactory,
    TabRouter,
    useLocale,
    useNavigationBuilder,
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
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
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
    blurTarget: RefObject<View | null>;
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

function SwipeTabsBar({
    renderBar,
    ...props
}: SwipeTabsBarProps & {
    renderBar: NonNullable<SwipeTabsConfig["tabBar"]>;
}) {
    return renderBar(props);
}

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
    const { direction } = useLocale();
    const focusedOptions = descriptors[state.routes[state.index].key].options;
    const activeTab = state.routes[state.index].name;
    const blurTarget = useRef<View>(null);
    const bar = tabBar ? (
        <SwipeTabsBar
            renderBar={tabBar}
            state={state}
            navigation={navigation}
            descriptors={descriptors}
            blurTarget={blurTarget}
        />
    ) : null;

    useEffect(() => {
        const mountedAt = Date.now();
        console.info(
            "[IRisNoteCrashTrace]",
            JSON.stringify({
                scope: "tabs",
                stage: "mounted",
                timestamp: mountedAt,
            }),
        );
        return () => {
            console.info(
                "[IRisNoteCrashTrace]",
                JSON.stringify({
                    scope: "tabs",
                    stage: "unmounted",
                    timestamp: Date.now(),
                    elapsedMs: Date.now() - mountedAt,
                }),
            );
        };
    }, []);

    useEffect(() => {
        console.info(
            "[IRisNoteCrashTrace]",
            JSON.stringify({
                scope: "tabs",
                stage: "active_tab_committed",
                timestamp: Date.now(),
                tab: activeTab,
                index: state.index,
            }),
        );
    }, [activeTab, state.index]);

    return (
        <NavigationContent>
            <View style={styles.container}>
                {tabBarPosition === "top" ? bar : null}
                {/* Keep the sampling surface fixed while its pages slide underneath. */}
                <BlurTargetView ref={blurTarget} style={styles.container}>
                    <TabView
                        style={styles.container}
                        pagerStyle={styles.pageSurface}
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
                            console.info(
                                "[IRisNoteCrashTrace]",
                                JSON.stringify({
                                    scope: "tabs",
                                    stage: "index_change_requested",
                                    timestamp: Date.now(),
                                    tab: state.routes[index].name,
                                    index,
                                }),
                            );
                            navigation.dispatch({
                                ...CommonActions.navigate(state.routes[index]),
                                target: state.key,
                            });
                        }}
                        onSwipeEnd={() => navigation.emit({ type: "swipeEnd" })}
                        onSwipeStart={() =>
                            navigation.emit({ type: "swipeStart" })
                        }
                        options={Object.fromEntries(
                            state.routes.map((route) => [
                                route.key,
                                {
                                    sceneStyle: [
                                        styles.pageSurface,
                                        descriptors[route.key].options
                                            .sceneStyle,
                                    ],
                                },
                            ]),
                        )}
                        overScrollMode={overScrollMode}
                        renderScene={({ route }) =>
                            descriptors[route.key].render()
                        }
                        renderTabBar={() => null}
                        swipeEnabled={focusedOptions.swipeEnabled}
                        tabBarPosition={tabBarPosition}
                    />
                </BlurTargetView>
                {/* The menu must stay outside its own blur sampling surface. */}
                {tabBarPosition === "bottom" ? bar : null}
            </View>
        </NavigationContent>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: appColors.appBackground,
    },
    pageSurface: {
        flex: 1,
        backgroundColor: appColors.surface,
    },
});

const SwipeTabsNavigatorFactory = createNavigatorFactory(SwipeTabsNavigator)();

export const SwipeTabs = withLayoutContext<
    SwipeTabOptions,
    // The factory returns any in Expo Router; preserve the original component's props.
    typeof SwipeTabsNavigator,
    TabNavigationState<ParamListBase>,
    SwipeTabEventMap
>(SwipeTabsNavigatorFactory.Navigator);
