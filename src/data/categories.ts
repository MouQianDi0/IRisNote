// 分类模版
import { Bookmark, Folder, FolderOpen, Lightbulb, Tag } from "lucide-react-native";

export type Category = {
    id: string;
    name: string;
    icon: typeof Folder;
};

export const noteCategories: Category[] = [
    { id: "all", name: "全部", icon: Folder },
    { id: "work", name: "工作", icon: FolderOpen },
    { id: "study", name: "学习", icon: Tag },
    { id: "life", name: "生活", icon: Bookmark },
    { id: "idea", name: "灵感", icon: Lightbulb },
];

