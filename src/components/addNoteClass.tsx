// src/components/addNoteClass.tsx
// 添加笔记分类弹窗组件 ,但是现在还没有实际设计 只是示范用

import { Pressable, Text, View } from "react-native";

type ActionSheetProps = {
    visible: boolean;
    onClose: () => void;
};

export default function ActionSheet({ visible, onClose }: ActionSheetProps) {
    if (!visible) return null;

    // 🔧 以后在这里加 addNoteClass 功能
    // const addNoteClass = ...

    return (
        <View className="absolute top-[200px] left-[70px] bg-white rounded-[12px] p-2 shadow-lg border border-gray-100 z-500 w-[300px] h-[400px]">
            {/* 🔧 这里写你的 addNoteClass 内容 */}

            <View className="h-[1px] bg-gray-100 mx-3" />
            <Pressable className="py-3 px-4 rounded-[12px]" onPress={onClose}>
                <Text className="text-[14px] text-red-400 text-center">
                    取消
                </Text>
            </Pressable>
        </View>
    );
}
