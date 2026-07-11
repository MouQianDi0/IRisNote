import * as LucideIcons from "lucide-react-native";
import type { Category } from "@/features/notes/categories/categories.types";

export type { Category } from "@/features/notes/categories/categories.types";

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

// 分类变更通知机制（FloatingBar 修改分类 → note/index 刷新标签）
type CategoriesListener = () => void;
const _categoriesListeners: CategoriesListener[] = [];

export const notifyCategoriesChanged = () => {
    _categoriesListeners.forEach((fn) => fn());
};

export const onCategoriesChanged = (fn: CategoriesListener) => {
    _categoriesListeners.push(fn);
    return () => {
        const idx = _categoriesListeners.indexOf(fn);
        if (idx >= 0) _categoriesListeners.splice(idx, 1);
    };
};
