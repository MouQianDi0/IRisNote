import { type Href, usePathname, useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
    ClipboardPenLine,
    Notebook,
    SquareCheckBig,
    Sticker,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { pulse } from "../hooks/animations";
import { useSwipeTab } from "../hooks/FloatingMenu/useSwipeTab";
import ActionButton from "./ActionButton";

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

export default function FloatingMenu({ state }: BottomTabBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = state.routes[state.index]?.name ?? "note";
    const panHandlers = useSwipeTab(pathname);

    return (
        <View
            className="absolute bottom-[50] right-5 items-end flex "
            {...panHandlers}
        >
            <View className="mb-[15] rounded-[18] bg-white px-2 py-[10] shadow-md">
                {menuItems.map((item, index) => (
                    <Pressable
                        key={index}
                        className={`my-[5] size-[50] items-center justify-center rounded-full ${
                            activeTab === item.key
                                ? "opacity-100"
                                : "opacity-70"
                        }`}
                        style={({ pressed }) =>
                            pressed ? { opacity: 0.7 } : undefined
                        }
                        onPress={() => {
                            if (activeTab === item.key) return;
                            router.replace(item.route as Href);
                        }}
                    >
                        {activeTab === item.key ? (
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
            </View>
            <ActionButton />
        </View>
    );
}
