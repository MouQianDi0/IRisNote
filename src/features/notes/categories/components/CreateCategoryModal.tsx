import { useState } from "react";
import { Modal, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { colors } from "@/shared/theme";
import { Button, ModalPanel } from "@/shared/ui";
import { tv } from "tailwind-variants";
import CategoryIconPicker from "./CategoryIconPicker";

const submitLabelStyles = tv({
    base: "text-center text-[14px]",
    variants: {
        disabled: {
            true: "text-gray-400",
            false: "text-white",
        },
    },
    defaultVariants: {
        disabled: false,
    },
});

type CreateCategoryModalProps = {
    visible: boolean;
    onClose: () => void;
    onAdd: (name: string, icon: string) => void;
};

export default function CreateCategoryModal({
    visible,
    onClose,
    onAdd,
}: CreateCategoryModalProps) {
    const [name, setName] = useState("");
    const [selectedIcon, setSelectedIcon] = useState("Briefcase");

    const handleSubmit = () => {
        const categoryName = name.trim();
        if (!categoryName) return;

        onAdd(categoryName, selectedIcon);
        setName("");
        setSelectedIcon("Briefcase");
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 bg-overlay justify-center items-center">
                    <TouchableWithoutFeedback>
                        <ModalPanel variant="create">
                            <Text className="text-[18px] font-semibold text-gray-800 text-center mb-4">新建分类</Text>
                            <Text className="text-[14px] text-gray-500 mb-2">分类名称</Text>
                            <TextInput
                                className="border border-gray-300 rounded-control px-4 py-3 text-[16px] mb-4"
                                placeholder="请输入分类名称"
                                placeholderTextColor={colors.textMuted}
                                value={name}
                                onChangeText={setName}
                                maxLength={10}
                            />
                            <Text className="text-[14px] text-gray-500 mb-2">选择图标</Text>
                            <CategoryIconPicker selectedIcon={selectedIcon} onChange={setSelectedIcon} />
                            <View className="flex-row gap-3 mt-4">
                                <Button className="flex-1 py-3 rounded-control" variant="secondary" onPress={onClose}>
                                    <Text className="text-[14px] text-gray-600 text-center">取消</Text>
                                </Button>
                                <Button
                                    className="flex-1 py-3 rounded-control"
                                    onPress={handleSubmit}
                                    disabled={!name.trim()}
                                >
                                    <Text className={submitLabelStyles({ disabled: !name.trim() })}>确定</Text>
                                </Button>
                            </View>
                        </ModalPanel>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}
