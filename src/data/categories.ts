import * as LucideIcons from "lucide-react-native";

export type Category = {
    id: number;
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

// "all" 是前端虚拟分类，不会出现在后端返回的数据中
export const ALL_CATEGORY: Category = {
    id: 0,
    name: "全部",
    icon: "Folder",
    is_pinned: false,
    is_starred: false,
};

// 共享当前选中的分类 ID，跨组件传递（FloatingBar → create 页面）
let _currentCategoryId = ALL_CATEGORY.id;
let _currentCategoryName = ALL_CATEGORY.name;
export const setCurrentCategory = (id: number, name: string) => {
    _currentCategoryId = id;
    _currentCategoryName = name;
};
export const getCurrentCategoryId = () => _currentCategoryId;
export const getCurrentCategoryName = () => _currentCategoryName;
