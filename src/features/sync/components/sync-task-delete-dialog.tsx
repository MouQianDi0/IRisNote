import { semanticColors } from "@/shared/theme";
import { AppButton, AppText, ModalPanel } from "@/shared/ui";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { useState } from "react";
import { View } from "react-native";
import type { UploadQueueTask } from "@/core/sync";

type Props = {
    task: UploadQueueTask | null;
    onClose: () => void;
    onConfirm: (task: UploadQueueTask) => Promise<void>;
};

const cleanErrorMessage = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : "暂存任务删除失败";
    return message.replace(/^\[[^\]]+\]\s*/, "");
};

export function SyncTaskDeleteDialog({ task, onClose, onConfirm }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    if (!task) return null;

    const isNote = task.kind === "note-sync";
    const close = () => {
        if (busy) return;
        setError("");
        onClose();
    };
    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await onConfirm(task);
            setBusy(false);
            onClose();
        } catch (cause) {
            setError(cleanErrorMessage(cause));
            setBusy(false);
        }
    };

    return (
        <AppModal
            visible
            transparent
            animationType="fade"
            onRequestClose={close}
        >
            <View
                style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    backgroundColor: semanticColors.scrim,
                }}
                onStartShouldSetResponder={busy ? undefined : () => true}
                onResponderRelease={busy ? undefined : close}
            >
                <ModalPanel
                    accessibilityViewIsModal
                    variant="confirm"
                    onStartShouldSetResponder={() => true}
                >
                    <View style={{ gap: 12 }}>
                        <AppText variant="title" accessibilityRole="header">
                            {isNote ? "确认回滚？" : "删除暂存任务？"}
                        </AppText>
                        <AppText variant="body" tone="secondary">
                            {isNote
                                ? `删除暂存任务后，本地笔记“${task.title}”将回滚到上一个版本。当前版本仍保留在版本历史中，云端不会上传本次修改。`
                                : `删除后，“${task.title}”将不再自动上传，相关本地暂存状态会同步取消。`}
                        </AppText>
                        {isNote && task.attemptCount > 0 && (
                            <AppText variant="helper" tone="danger">
                                该任务已经尝试上传，云端状态可能需要重新核对。
                            </AppText>
                        )}
                        {!!error && (
                            <AppText
                                variant="helper"
                                tone="danger"
                                accessibilityRole="alert"
                                selectable
                            >
                                {error}
                            </AppText>
                        )}
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <AppButton
                                className="flex-1"
                                label="取消"
                                variant="secondary"
                                disabled={busy}
                                onPress={close}
                            />
                            <AppButton
                                className="flex-1"
                                label={isNote ? "确认回滚" : "确认删除"}
                                loadingLabel={isNote ? "回滚中…" : "删除中…"}
                                variant="danger"
                                loading={busy}
                                onPress={() => void confirm()}
                            />
                        </View>
                    </View>
                </ModalPanel>
            </View>
        </AppModal>
    );
}
