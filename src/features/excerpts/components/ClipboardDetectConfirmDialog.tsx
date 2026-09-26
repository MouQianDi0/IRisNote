import { Text, View } from "react-native";
import { DialogButton, DraftDialog } from "@/shared/ui/Dialog/dialog";

/** 开启前的说明确认：标题 24sp → 12 → 说明 14sp 蓝灰 → 12 → 取消 / 开启（高 48、间距 10）。 */
export function ClipboardDetectConfirmDialog({
    visible,
    pending,
    onCancel,
    onConfirm,
}: {
    visible: boolean;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <DraftDialog
            visible={visible}
            title="开启剪贴板自动检测？"
            onClose={onCancel}
        >
            <Text className="text-sm leading-5 text-hyper-text-secondary">
                停留在摘录页时检测剪贴板，发现新内容会询问是否保存，不会自动保存或上传。Android
                系统可能会提示应用读取了剪贴板。
            </Text>
            <View className="mt-3 flex-row gap-2.5">
                <DialogButton
                    className="flex-1"
                    label="取消"
                    variant="secondary"
                    disabled={pending}
                    onPress={onCancel}
                />
                <DialogButton
                    className="flex-1"
                    label="开启"
                    disabled={pending}
                    onPress={onConfirm}
                />
            </View>
        </DraftDialog>
    );
}
