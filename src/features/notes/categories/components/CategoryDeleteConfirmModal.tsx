import { ScrollView, Text, View } from "react-native";
import { DialogButton, DraftDialog } from "../../components/editor/draft-dialog";

type CategoryDeleteConfirmModalProps = {
    visible: boolean;
    categoryName: string;
    onClose: () => void;
    onConfirm: () => void;
};

export default function CategoryDeleteConfirmModal({
    visible, categoryName, onClose, onConfirm,
}: CategoryDeleteConfirmModalProps) {
    return (
        <DraftDialog visible={visible} title="确认删除？" onClose={onClose}>
            <ScrollView style={{ flexShrink: 1 }}>
                <Text className="text-sm text-hyper-text-secondary">
                    删除后无法找回{"\n"}分类“{categoryName}”下的笔记将被永久删除
                </Text>
            </ScrollView>
            <View className="flex-row gap-2.5 mt-4">
                <DialogButton label="取消" variant="secondary" className="flex-1" onPress={onClose} />
                <DialogButton label="确认删除" variant="danger" className="flex-1" onPress={onConfirm} />
            </View>
        </DraftDialog>
    );
}
