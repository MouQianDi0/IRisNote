import { useState } from "react";
import {
    Modal,
    Pressable,
    Text,
    TextInput,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { Category, noteCategories } from "../data/categories";

type ActionSheetProps = {
    visible: boolean;
    onClose: () => void;
    onAdd: (category: Category) => void;
};

const categoryToIcon: Record<string, string> = {
    all: "Folder",
    work: "FolderOpen",
    study: "Tag",
    life: "Bookmark",
    idea: "Lightbulb",
};

export default function AddNoteClass({
    visible,
    onClose,
    onAdd,
}: ActionSheetProps) {
    const [ClassName, setClassName] = useState("");
    const [CategoryType, setCategoryType] = useState("work");

    const handleSubmit = () => {
        if (!ClassName) {
            return;
        }
        const categoryName = ClassName.trim();
        const newCategory: Category = {
            id: `${Date.now()}`,
            name: categoryName,
            icon: categoryToIcon[CategoryType],
        };
        onAdd(newCategory);
        setClassName("");
        setCategoryType("work");
        onClose();
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
                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {noteCategories.slice(1).map((category) => (
                                    <Pressable
                                        key={category.id}
                                        className={`px-3 py-2 rounded-[12px] ${
                                            CategoryType === category.id
                                                ? "bg-[#007AFF]"
                                                : "bg-[#F5F5F5]"
                                        }`}
                                        onPress={() =>
                                            setCategoryType(category.id)
                                        }
                                    >
                                        <Text
                                            className={`text-[14px] ${
                                                CategoryType === category.id
                                                    ? "text-white"
                                                    : "text-[#333]"
                                            }`}
                                        >
                                            {category.name}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                            <View className="flex-row gap-3">
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
