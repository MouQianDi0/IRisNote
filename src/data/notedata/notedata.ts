//笔记分类模版
import { Folder, FolderOpen, Tag } from "lucide-react-native";

// 分类类型定义
export type Category = {
    id: string;        // 唯一标识
    name: string;      // 显示名称
    icon: typeof Folder; // 图标组件
};

// 用户自定义分类列表
// 后续可改为从 AsyncStorage 读取
export const noteCategories: Category[] = [
    { id: "all", name: "全部", icon: Folder },
    { id: "work", name: "工作", icon: FolderOpen },
    { id: "study", name: "学习", icon: Tag },
    { id: "life", name: "生活", icon: Folder },
    { id: "idea", name: "灵感", icon: Tag },
];