import { useState } from "react";
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

type ActionSheetProps = {
    visible: boolean;
    onClose: () => void;
    onAdd: (name: string, icon: string) => void;
};

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
const groupLabels = ["文件/组织", "标签/任务/学习", "生活/工具/其他"];
export default function AddNoteClass({
    visible,
    onClose,
    onAdd,
}: ActionSheetProps) {
    const [ClassName, setClassName] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("Briefcase");

    const handleSubmit = () => {
        const categoryName = ClassName.trim();
        if (!categoryName) return;
        onAdd(categoryName, selectedIcon);
        setClassName("");
        setSelectedIcon("Briefcase");
        onClose();
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
    const handleIconChange = (icon: string) => {
        setSelectedIcon(icon);
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-[rgba(0,0,0,0.4)] justify-center items-center">
                    <TouchableWithoutFeedback>
                        <View className="bg-white rounded-[16px] p-5 w-[320px] shadow-lg">
                            <Text className="text-[18px] font-semibold text-gray-800 text-center mb-4">
                                新建分类
                            </Text>
                            <Text className="text-[14px] text-gray-500 mb-2">
                                分类名称
                            </Text>
                            <TextInput
                                className="border border-gray-300 rounded-[12px] px-4 py-3 text-[16px] mb-4"
                                placeholder="请输入分类名称"
                                placeholderTextColor="#999"
                                value={ClassName}
                                onChangeText={setClassName}
                                maxLength={10}
                            />
                            <Text className="text-[14px] text-gray-500 mb-2">
                                选择图标
                            </Text>
                            <View className="mb-1">
                                <Text className="text-[12px] text-gray-400 mb-1">
                                    {groupLabels[0]}
                                </Text>
                                {renderIconRow(iconsGroup1)}
                            </View>
                            <View className="mb-1">
                                <Text className="text-[12px] text-gray-400 mb-1">
                                    {groupLabels[1]}
                                </Text>
                                {renderIconRow(iconsGroup2)}
                            </View>
                            <View className="mb-1">
                                <Text className="text-[12px] text-gray-400 mb-1">
                                    {groupLabels[2]}
                                </Text>
                                {renderIconRow(iconsGroup3)}
                            </View>
                            <View className="flex-row gap-3 mt-4">
                                <Pressable
                                    className="flex-1 py-3 rounded-[12px] bg-gray-100"
                                    onPress={onClose}
                                >
                                    <Text className="text-[14px] text-gray-600 text-center">
                                        取消
                                    </Text>
                                </Pressable>
                                <Pressable
                                    className={`flex-1 py-3 rounded-[12px] ${
                                        ClassName.trim()
                                            ? "bg-[#007AFF]"
                                            : "bg-gray-300"
                                    }`}
                                    onPress={handleSubmit}
                                    disabled={!ClassName.trim()}
                                >
                                    <Text
                                        className={`text-[14px] text-center ${
                                            ClassName.trim()
                                                ? "text-white"
                                                : "text-gray-400"
                                        }`}
                                    >
                                        确定
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}
