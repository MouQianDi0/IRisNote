// 分类模版
import {
    Bookmark,
    Folder,
    FolderOpen,
    Lightbulb,
    Tag,
} from "lucide-react-native";

export type Category = {
    id: string;
    name: string;
    icon: string;
};

// 图标组件类型
type IconComponent = typeof Folder;

// 图标映射：字符串 → 组件
export const iconMap: Record<string, IconComponent> = {
    Folder,
    FolderOpen,
    Tag,
    Bookmark,
    Lightbulb,
} as const;

// 分类列表（icon 存储字符串，通过 iconMap 获取组件）
export const noteCategories: Category[] = [
    { id: "all", name: "全部", icon: "Folder" },
];
