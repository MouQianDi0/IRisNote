import { Text, TouchableWithoutFeedback, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Button, ModalPanel } from "@/shared/ui";
import { Modal } from "react-native";

type CategoryDeleteConfirmModalProps = {
    visible: boolean;
    categoryName: string;
    onClose: () => void;
    onConfirm: () => void;
};

export default function CategoryDeleteConfirmModal({
    visible,
    categoryName,
    onClose,
    onConfirm,
}: CategoryDeleteConfirmModalProps) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View className="flex-1 items-center justify-center bg-overlay-strong">
                        <TouchableWithoutFeedback>
                            <ModalPanel variant="confirm">
                                <Text className="text-[16px] font-bold text-gray-800 text-center mb-2">
                                    确认删除？
                                </Text>
                                <Text className="text-[14px] text-gray-500 text-center mb-4">
                                    删除后无法找回{"\n"}分类“{categoryName}”下的笔记将被永久删除
                                </Text>
                                <View className="flex-row gap-3">
                                    <Button
                                        onPress={onClose}
                                        className="flex-1 py-3 rounded-control"
                                        variant="secondary"
                                    >
                                        <Text className="text-center text-[14px] text-gray-600">
                                            取消
                                        </Text>
                                    </Button>
                                    <Button
                                        onPress={onConfirm}
                                        className="flex-1 py-3 rounded-control"
                                        variant="danger"
                                    >
                                        <Text className="text-center text-[14px] font-bold text-white">
                                            确认删除
                                        </Text>
                                    </Button>
                                </View>
                            </ModalPanel>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </GestureHandlerRootView>
        </Modal>
    );
}
