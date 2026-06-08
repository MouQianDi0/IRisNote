import { type Href, usePathname, useRouter } from "expo-router";
import {
    Bolt,
    ClipboardPenLine,
    Notebook,
    PencilLine,
    SquareCheckBig,
    Sticker,
} from "lucide-react-native"; // 引入图标组件
import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { pulse, shake } from "../gestures/animations";
import { useLongPressButton } from "../gestures/useLongPressButton";
import { useSwipeTab } from "../gestures/useSwipeTab";

type TabKey = "note" | "todo" | "excerpt" | "user"; // 选项卡键

const getActiveTabKey = (path: string): TabKey => {
    if (
        path === "/" ||
        path === "/note" ||
        path.startsWith("/note/") ||
        path === "/(tabs)/note" ||
        path.startsWith("/(tabs)/note/")
    ) {
        return "note";
    }
    if (
        path === "/todo" ||
        path.startsWith("/todo/") ||
        path === "/(tabs)/todo" ||
        path.startsWith("/(tabs)/todo/")
    ) {
        return "todo";
    }
    if (
        path === "/excerpt" ||
        path.startsWith("/excerpt/") ||
        path === "/(tabs)/excerpt" ||
        path.startsWith("/(tabs)/excerpt/")
    ) {
        return "excerpt";
    }
    if (
        path === "/user" ||
        path.startsWith("/user/") ||
        path === "/(tabs)/user" ||
        path.startsWith("/(tabs)/user/")
    ) {
        return "user";
    }
    return "note";
};

const menuItems = [
    {
        name: "笔记",
        key: "note" as const,
        route: "/(tabs)/note" as const,
        icon: Notebook,
    },
    {
        name: "待办",
        key: "todo" as const,
        route: "/(tabs)/todo" as const,
        icon: SquareCheckBig,
    },
    {
        name: "剪贴",
        key: "excerpt" as const,
        route: "/(tabs)/excerpt" as const,
        icon: ClipboardPenLine,
    },
    {
        name: "用户",
        key: "user" as const,
        route: "/(tabs)/user" as const,
        icon: Sticker,
    },
];

const getAction = (
    path: string,
): {
    icon:
        | typeof PencilLine
        | typeof SquareCheckBig
        | typeof ClipboardPenLine
        | typeof Bolt;

    route: string;
} => {
    switch (getActiveTabKey(path)) {
        case "note":
            return { icon: PencilLine, route: "/(tabs)/note/create" };
        case "todo":
            return { icon: SquareCheckBig, route: "/(tabs)/todo/create" };
        case "excerpt":
            return { icon: ClipboardPenLine, route: "/(tabs)/excerpt/create" };
        case "user":
            return { icon: Bolt, route: "/(tabs)/user/settings" };
        default:
            return { icon: PencilLine, route: "/(tabs)/note/create" };
    }
};

export default function FloatingMenu() {
    const router = useRouter();
    const pathname = usePathname();
    const panHandlers = useSwipeTab(pathname);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lockRef = useRef(false);

    const { icon: ActionIcon } = getAction(pathname);
    const { gesture: longPress, animatedStyle } = useLongPressButton(
        getAction(pathname).route as Href,
    );

    return (
        <View
            className="absolute bottom-[50] right-5 items-end"
            {...panHandlers}
        >
            <Animated.View className="mb-[15] rounded-[18] bg-white px-2 py-[10] shadow-md">
                {menuItems.map((item, index) => (
                    <Pressable
                        key={index}
                        className={`my-[5] size-[50] items-center justify-center rounded-full ${
                            getActiveTabKey(pathname) === item.key
                                ? "opacity-100"
                                : "opacity-70"
                        }`}
                        style={({ pressed }) =>
                            pressed ? { opacity: 0.7 } : undefined
                        }
                        onPress={() => {
                            if (getActiveTabKey(pathname) === item.key) return;
                            router.push(item.route as Href);
                        }}
                    >
                        {getActiveTabKey(pathname) === item.key ? (
                            <Animated.View
                                style={{
                                    animationName: pulse,
                                    animationDuration: "0.5s",
                                    animationTimingFunction: "ease-out",
                                }}
                            >
                                <item.icon size={24} color="#37a5ffff" />
                            </Animated.View>
                        ) : (
                            <item.icon size={24} color="#666" />
                        )}
                        <Text className="top-[3] text-center text-xs text-[#666] opacity-100">
                            {item.name}
                        </Text>
                    </Pressable>
                ))}
            </Animated.View>
            <Animated.View style={animatedStyle}>
                <GestureDetector gesture={longPress}>
                    <Pressable
                        className="size-[66] items-center justify-center rounded-[18] bg-[#0037ebff] shadow-lg"
                        style={({ pressed }) =>
                            pressed
                                ? { backgroundColor: "#001692ff", opacity: 0.7 }
                                : undefined
                        }
                        onPress={() => {
                            if (lockRef.current) return;
                            if (debounceTimer.current) {
                                clearTimeout(debounceTimer.current);
                            }
                            debounceTimer.current = setTimeout(() => {
                                debounceTimer.current = null;
                                if (pathname === getAction(pathname).route)
                                    return;
                                lockRef.current = true;
                                router.push(getAction(pathname).route as Href);
                                setTimeout(() => {
                                    lockRef.current = false;
                                }, 300);
                            }, 100);
                        }}
                    >
                        <Animated.View
                            style={{
                                animationName: shake,
                                animationDuration: "2s",
                                animationIterationCount: "infinite",
                                animationTimingFunction: "ease-in-out",
                            }}
                        >
                            <ActionIcon size={35} color="#ffffffff" />
                        </Animated.View>
                    </Pressable>
                </GestureDetector>
            </Animated.View>
        </View>
    );
}
