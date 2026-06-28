import { Pencil, Pin, Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { getIcon } from "../data/categories";

type Props = {
    visible: boolean;
    onClose: () => void;
    onDelete: () => void;
    onStar: () => void;
    onPin: () => void;
    onRename: (name: string) => void;
    onChangeIcon: (icon: string) => void;
    categoryName: string;
    categoryIcon: string;
    isPinned: boolean;
    isStarred: boolean;
};

// 图标选项列表
// 图标分组：文件/组织
const iconsGroup1 = [
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
];
// 图标分组：标签/任务/学习
const iconsGroup2 = [
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
];
// 图标分组：生活/工具/其他
const iconsGroup3 = [
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
];

export default function CategoryActionModel({
    visible,
    onClose,
    onDelete,
    onStar,
    onPin,
    onRename,
    onChangeIcon,
    categoryName,
    categoryIcon,
    isPinned,
    isStarred,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(categoryName);
    const [selectedIcon, setSelectedIcon] = useState(categoryIcon);
    useEffect(() => {
        if (visible) {
            setEditing(false);
            setEditName(categoryName);
            setSelectedIcon(categoryIcon);
        }
    }, [visible, categoryName, categoryIcon]);

    const handleRename = () => {
        const trimmed = editName.trim();
        if (trimmed && trimmed !== categoryName) {
            onRename(trimmed);
        }
        setEditing(false);
    };
    const handleIconChange = (icon: string) => {
        setSelectedIcon(icon);
        onChangeIcon(icon);
    };
    const renderIconRow = (icons: string[]) => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
                gap: 8,
                paddingHorizontal: 4,
                paddingVertical: 8,
            }}
            style={{ maxWidth: 300 }}
        >
            {icons.map((iconName) => {
                const IconComp = getIcon(iconName);
                const isSelected = iconName === selectedIcon;
                return (
                    <Pressable
                        key={iconName}
                        onPress={() => handleIconChange(iconName)}
                        className={`w-[48px] h-[48px] items-center justify-center rounded-[12px] ${isSelected ? "bg-[#007AFF]" : "bg-[#F5F5F5]"}`}
                    >
                        <IconComp
                            size={24}
                            color={isSelected ? "#FFF" : "#666"}
                        />
                    </Pressable>
                );
            })}
        </ScrollView>
    );
    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View
                    className="flex-1 items-center justify-center"
                    style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
                >
                    <TouchableWithoutFeedback>
                        <View className="bg-white p-5 rounded-[12px] shadow-md w-[300px]">
                            {editing ? (
                                <TextInput
                                    value={editName}
                                    onChangeText={setEditName}
                                    placeholder="输入新名称"
                                    maxLength={10}
                                    autoFocus
                                    onBlur={handleRename}
                                    onSubmitEditing={handleRename}
                                />
                            ) : (
                                <Text className="text-[18px] font-bold text-gray-800">
                                    "{categoryName}"
                                </Text>
                            )}
                            <Pressable
                                onPress={() => setEditing(true)}
                                className="p-1"
                            >
                                <Pencil size={24} color="#666" />
                            </Pressable>

                            <View className="flex-row gap-3 mb-4 mt-3">
                                <Pressable
                                    onPress={onPin}
                                    className={`flex-1 flex-row items-center justify-center gap-1 rounded-[12px] py-2 ${isPinned ? "bg-[#FFF3E0]" : "bg-[#F5F5F5]"}`}
                                >
                                    <Pin
                                        size={24}
                                        color={isPinned ? "#FF9800" : "#666"}
                                        fill={
                                            isPinned ? "#FF9800" : "transparent"
                                        }
                                    />
                                    <Text className="text-[14px] text-gray-500">
                                        {isPinned ? "已置顶" : "未置顶"}
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={onStar}
                                    className={`flex-1 flex-row items-center justify-center gap-1 rounded-[12px] py-2 ${isStarred ? "bg-[#FFF3E0]" : "bg-[#F5F5F5]"}`}
                                >
                                    <Star
                                        size={24}
                                        color={isStarred ? "#FF9800" : "#666"}
                                        fill={
                                            isStarred
                                                ? "#FF9800"
                                                : "transparent"
                                        }
                                    />
                                    <Text className="text-[14px] text-gray-500">
                                        {isStarred ? "已标星" : "未标星"}
                                    </Text>
                                </Pressable>
                            </View>

                            <Text className="text-[18px] font-bold  mt-3">
                                选择图标
                            </Text>
                            <View className="-mb-3">
                                {renderIconRow(iconsGroup1)}
                            </View>
                            <View className="-mb-3">
                                {renderIconRow(iconsGroup2)}
                            </View>
                            <View className="mb-1">
                                {renderIconRow(iconsGroup3)}
                            </View>
                            <Pressable
                                onPress={onDelete}
                                className="mt-4 py-3 bg-red-50 rounded-[12px]"
                            >
                                <Text className="text-center text-[14px] font-bold text-red-500">
                                    删除
                                </Text>
                            </Pressable>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}
