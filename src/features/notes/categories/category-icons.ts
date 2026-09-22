import * as LucideIcons from "lucide-react-native";
import { createElement, type ComponentType } from "react";

const fallback = "Folder";

export const getCategoryIcon = (name: string) => {
    const icon = (LucideIcons as Record<string, unknown>)[name];
    if (!icon && __DEV__) {
        console.warn(`[IconMap] 未知图标: "${name}"，已降级为 ${fallback}`);
    }
    return (icon ??
        (LucideIcons as Record<string, unknown>)[fallback]) as ComponentType<{
        size?: number;
        color?: string;
        fill?: string;
    }>;
};

export function CategoryIcon({
    name,
    ...props
}: {
    name: string;
    size?: number;
    color?: string;
    fill?: string;
}) {
    return createElement(getCategoryIcon(name), props);
}

export const categoryIconGroups = [
    {
        label: "文件/组织",
        icons: [
            "Folder",
            "FolderOpen",
            "FolderPlus",
            "FolderHeart",
            "FileText",
            "File",
            "FileCheck",
            "Archive",
            "Inbox",
            "ClipboardList",
            "Lightbulb",
            "LightbulbOff",
            "Sparkles",
            "Zap",
            "Flame",
            "Rocket",
            "Gem",
            "Tag",
            "Tags",
            "Bookmark",
            "BookmarkCheck",
        ],
    },
    {
        label: "标签/任务/学习",
        icons: [
            "Flag",
            "Star",
            "Heart",
            "CheckCircle",
            "ListTodo",
            "Briefcase",
            "Target",
            "Calendar",
            "Clock",
            "Timer",
            "BookOpen",
            "Book",
            "GraduationCap",
            "Brain",
            "Library",
            "Notebook",
            "PenTool",
            "Coffee",
            "Music",
            "Camera",
            "Gamepad2",
        ],
    },
    {
        label: "生活/工具/其他",
        icons: [
            "Palette",
            "Utensils",
            "Plane",
            "Code",
            "Terminal",
            "Database",
            "Wrench",
            "Settings",
            "Cpu",
            "Wifi",
            "Home",
            "Map",
            "Compass",
            "Globe",
            "Bell",
            "Gift",
            "Smile",
            "Eye",
        ],
    },
] as const;
