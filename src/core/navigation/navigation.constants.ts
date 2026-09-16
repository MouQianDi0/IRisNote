import {
    ClipboardPenLine,
    Notebook,
    PencilLine,
    Settings,
    SquareCheckBig,
    Sticker,
} from "lucide-react-native";
import type { MainAction, TabKey } from "./navigation.types";

export const TAB_MENU_ITEMS = [
    {
        name: "笔记",
        key: "note" as const,
        route: "/(tabs)/note" as const,
        icon: Notebook,
    },
    {
        name: "剪贴",
        key: "excerpt" as const,
        route: "/(tabs)/excerpt" as const,
        icon: ClipboardPenLine,
    },
    {
        name: "待办",
        key: "todo" as const,
        route: "/(tabs)/todo" as const,
        icon: SquareCheckBig,
    },
    {
        name: "用户",
        key: "user" as const,
        route: "/(tabs)/user" as const,
        icon: Sticker,
    },
] as const;

export const getActiveTabKey = (path: string): TabKey => {
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

export const getMainAction = (path: string): MainAction => {
    switch (getActiveTabKey(path)) {
        case "note":
            return {
                icon: PencilLine,
                label: "新建笔记",
                route: "/pages/note/create",
            };
        case "todo":
            return {
                icon: SquareCheckBig,
                label: "新建待办",
                route: "/pages/todo/create",
            };
        case "excerpt":
            return {
                icon: ClipboardPenLine,
                label: "新建剪贴",
                route: "/pages/excerpt/create",
            };
        case "user":
            return {
                icon: Settings,
                label: "打开设置",
                route: "/pages/user/settings",
            };
    }
};
