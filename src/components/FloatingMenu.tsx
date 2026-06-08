import { type Href, usePathname, useRouter } from "expo-router";
import {
    Bolt,
    ClipboardPenLine,
    Notebook,
    PencilLine,
    SquareCheckBig,
    Sticker,
} from "lucide-react-native";
import { useRef } from "react";

import { PanResponder, Pressable, Text, View } from "react-native";
import Animated, { CSSAnimationKeyframes } from "react-native-reanimated";
import "../../global.css";

const pulse: CSSAnimationKeyframes = {
    from: {
        opacity: 0.5,
        transform: [{ scale: 0.6 }],
    },
    to: {
        opacity: 1,
        transform: [{ scale: 1 }],
    },
};

const shake: CSSAnimationKeyframes = {
    "0%": { transform: [{ rotate: "0deg" }] },
    "85%": { transform: [{ rotate: "0deg" }] },
    "87%": { transform: [{ rotate: "-9deg" }] },
    "91%": { transform: [{ rotate: "9deg" }] },
    "95%": { transform: [{ rotate: "-5deg" }] },
    "98%": { transform: [{ rotate: "5deg" }] },
    "100%": { transform: [{ rotate: "0deg" }] },
};


type TabKey = "note" | "todo" | "excerpt" | "user";

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

const tabPaths = [
    "/(tabs)/user",
    "/(tabs)/excerpt",
    "/(tabs)/todo",
    "/(tabs)/note",
] as const;

const pathToIndex: Record<TabKey, number> = {
    user: 0,
    excerpt: 1,
    todo: 2,
    note: 3,
};

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
    const pathRef = useRef(pathname);
    pathRef.current = pathname;

    const panResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
            return (
                Math.abs(gesture.dy) > 20 &&
                Math.abs(gesture.dy) > Math.abs(gesture.dx)
            );
        },
        onPanResponderRelease: (_, gesture) => {
            if (Math.abs(gesture.dy) < 30) return;

            const currentIndex = pathToIndex[getActiveTabKey(pathRef.current)];
            const total = tabPaths.length;

            if (gesture.dy < -30) {
                const prevIndex = (currentIndex - 1 + total) % total;
                router.push(tabPaths[prevIndex] as Href);
            } else if (gesture.dy > 30) {
                const nextIndex = (currentIndex + 1) % total;
                router.push(tabPaths[nextIndex] as Href);
            }
        },
    });

    const { icon: ActionIcon, route: actionRoute } = getAction(pathname);

    return (

        <View
            className="absolute bottom-[50] right-5 items-end"
            {...panResponder.panHandlers}
        >
            <Animated.View className="mb-[15] rounded-[18] bg-white px-2 py-[10] shadow-md">
                {menuItems.map((item, index) => (
                    <Pressable
                        key={index}
                        className={`my-[5] size-[50] items-center justify-center rounded-full ${getActiveTabKey(pathname) === item.key
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
            <Pressable
                className="size-[66] items-center justify-center rounded-[18] bg-[#0037ebff] shadow-lg"
                style={({ pressed }) =>
                    pressed
                        ? { backgroundColor: "#001692ff", opacity: 0.7 }
                        : undefined
                }
                onPress={() => router.push(actionRoute as Href)}
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
        </View>
    );
}


