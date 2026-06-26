import * as LucideIcons from "lucide-react-native";

export type Category = {
    id: string;
    name: string;
    icon: string;
    is_pinned: boolean;
    is_starred: boolean;
};

// 动态解析图标，拼错名字自动降级为 Folder
const fallback = "Folder";

export const getIcon = (name: string) => {
    const icon = (LucideIcons as any)[name];
    if (!icon && __DEV__) {
        console.warn(`[IconMap] 未知图标: "${name}"，已降级为 ${fallback}`);
    }
    return icon ?? (LucideIcons as any)[fallback];
};

// 分类列表（icon 存储字符串，通过 getIcon 获取组件）
export const noteCategories: Category[] = [
    { id: "all", name: "全部", icon: "Folder", is_pinned: false, is_starred: false },
];
