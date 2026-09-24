import { DialogButton, DraftDialog } from "@/shared/ui/Dialog/dialog";
import { Text, View } from "react-native";

type UnsavedProfileDialogProps = {
    visible: boolean;
    onDiscard: () => void;
    onContinue: () => void;
};

/** 编辑页有未保存改动时离开的确认；点遮罩等同继续编辑。 */
export function UnsavedProfileDialog({
    visible,
    onDiscard,
    onContinue,
}: UnsavedProfileDialogProps) {
    return (
        <DraftDialog visible={visible} title="放弃修改？" onClose={onContinue}>
            <Text className="text-sm leading-5 text-hyper-text-secondary">
                本次修改尚未保存，离开后将丢失。
            </Text>
            <View className="mt-3 flex-row gap-2.5">
                <DialogButton
                    label="放弃修改"
                    variant="secondary"
                    className="flex-1"
                    onPress={onDiscard}
                />
                <DialogButton
                    label="继续编辑"
                    variant="primary"
                    className="flex-1"
                    onPress={onContinue}
                />
            </View>
        </DraftDialog>
    );
}
