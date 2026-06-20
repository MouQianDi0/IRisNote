import {
    Bolt,
    ClipboardPenLine,
    PencilLine,
    SquareCheckBig,
} from "lucide-react-native";

type TabKey = "note" | "todo" | "excerpt" | "user";

export type { TabKey };

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

export const getAction = (
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
            return { icon: PencilLine, route: "/pages/note/create" };
        case "todo":
            return { icon: SquareCheckBig, route: "/pages/todo/create" };
        case "excerpt":
            return { icon: ClipboardPenLine, route: "/pages/excerpt/create" };
        case "user":
            return { icon: Bolt, route: "/pages/user/settings" };
        default:
            return { icon: PencilLine, route: "/pages/note/create" };
    }
};
