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
import { PanResponder, Pressable, StyleSheet, View } from "react-native";

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
        name: "剪贴板摘录",
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
    route: Href;
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
        <View style={styles.outerContainer} {...panResponder.panHandlers}>
            <View style={styles.menuContainer}>
                {menuItems.map((item, index) => (
                    <Pressable
                        key={index}
                        style={({ pressed }) => [
                            styles.menuItem,
                            getActiveTabKey(pathname) === item.key &&
                            styles.activeItem,
                            pressed && styles.pressedItem,
                        ]}

                        onPress={() => {
                            if (getActiveTabKey(pathname) == item.key) return;

                            router.push(item.route as Href)
                        }
                        }
                    >
                        <item.icon
                            size={24}
                            color={
                                getActiveTabKey(pathname) === item.key
                                    ? "#37a5ffff"
                                    : "#666"
                            }
                        />
                    </Pressable>
                ))}
            </View>
            <Pressable
                style={({ pressed }) => [
                    styles.addButton,
                    pressed && styles.addButtonPressed,
                ]}
                onPress={() => router.push(actionRoute as Href)}
            >
                <ActionIcon size={24} color="#ffffffff" />
            </Pressable>
        </View>
    );
}
const styles = StyleSheet.create({
    outerContainer: {
        position: "absolute",
        bottom: 50,
        right: 20,
        alignItems: "flex-end",
    },
    menuContainer: {
        backgroundColor: "#ffffff", // 白色背景
        borderRadius: 18, // 圆角
        paddingVertical: 10, // 垂直内边距 10px
        paddingHorizontal: 8, // 水平内边距 8px
        marginBottom: 15, // 与"+"按钮的间距
        shadowColor: "#000", // 阴影颜色
        shadowOffset: { width: 0, height: 2 }, // 阴影偏移
        shadowOpacity: 0.25, // 阴影透明度
        shadowRadius: 3.84, // 阴影模糊半径
        elevation: 5, // Android 阴影
    },
    menuItem: {
        width: 50, // 宽度 50px
        height: 50, // 高度 50px
        justifyContent: "center", // 垂直居中
        alignItems: "center", // 水平居中
        marginVertical: 5, // 上下间距 5px
        borderRadius: 25, // 圆形（宽高的一半）
    },
    pressedItem: {
        backgroundColor: "transparent",
        opacity: 0.7,
    },
    addButton: {
        width: 66, // 宽度 60px
        height: 66, // 高度 60px
        borderRadius: 18, // 圆角
        backgroundColor: "#0037ebff", // 蓝色背景
        justifyContent: "center", // 垂直居中
        alignItems: "center", // 水平居中
        shadowColor: "#000", // 阴影颜色
        shadowOffset: { width: 0, height: 2 }, // 阴影偏移
        shadowOpacity: 0.3, // 阴影透明度
        shadowRadius: 4, // 阴影模糊半径
        elevation: 8, // Android 阴影
    },
    addButtonPressed: {
        backgroundColor: "#001692ff",
        opacity: 0.7,
    },
    activeItem: {
        backgroundColor: "transparent",
        opacity: 0.7,
    },
});
