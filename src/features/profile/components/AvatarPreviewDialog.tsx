import { colors } from "@/shared/theme";
import { DialogButton, DraftDialog } from "@/shared/ui/Dialog/dialog";
import { UserRound } from "lucide-react-native";
import {
    ActivityIndicator,
    Image,
    Text,
    View,
    useWindowDimensions,
    type ImageSourcePropType,
} from "react-native";
import type { AvatarPreviewState } from "../hooks/useAvatarUpdate";

const PREVIEW_MAX = 280;
/** 弹窗遮罩 p-6 + 卡片 p-6 的左右总留白，与 dialog.styles.ts 保持一致。 */
const DIALOG_HORIZONTAL_INSET = 96;
/** 卡片 max-w-[440px] 减去卡片左右内边距后的内容区上限。 */
const DIALOG_CONTENT_MAX = 440 - 48;

type AvatarPreviewDialogProps = {
    preview: AvatarPreviewState | null;
    savedSource?: ImageSourcePropType;
    onClose: () => void;
    onRechoose: () => void;
    onConfirm: () => void;
};

/**
 * 查看已保存头像，或确认待上传头像。待确认时点遮罩不关闭，
 * 上传中遮罩与系统返回均不响应。
 */
export function AvatarPreviewDialog({
    preview,
    savedSource,
    onClose,
    onRechoose,
    onConfirm,
}: AvatarPreviewDialogProps) {
    const pending = preview?.mode === "pending" ? preview : null;
    const uploading = pending?.uploading ?? false;
    const source = pending ? { uri: pending.avatar } : savedSource;
    const { width: windowWidth } = useWindowDimensions();
    // 边长与半径取自同一数值，保证任何屏宽下都是正圆。
    const size = Math.max(
        0,
        Math.min(
            PREVIEW_MAX,
            DIALOG_CONTENT_MAX,
            windowWidth - DIALOG_HORIZONTAL_INSET,
        ),
    );
    const radius = size / 2;

    return (
        <DraftDialog
            visible={preview !== null}
            title={pending ? "确认新头像" : "查看头像"}
            onClose={onClose}
            closeOnScrimTap={!pending}
        >
            <View className="items-center">
                <View
                    accessible
                    accessibilityLabel={pending ? "待上传的新头像" : "当前头像"}
                    className="items-center justify-center overflow-hidden bg-hyper-card-selected"
                    style={{
                        width: size,
                        height: size,
                        borderRadius: radius,
                    }}
                >
                    {source ? (
                        <Image
                            className="h-full w-full"
                            style={{ borderRadius: radius }}
                            source={source}
                            resizeMode="cover"
                        />
                    ) : (
                        <UserRound size={64} color={colors.primary} />
                    )}
                    {uploading ? (
                        <View className="absolute inset-0 items-center justify-center bg-overlay">
                            <ActivityIndicator color={colors.surfaceFull} />
                        </View>
                    ) : null}
                </View>
            </View>

            {pending?.error ? (
                <Text
                    accessibilityRole="alert"
                    className="mt-3 text-sm text-hyper-error"
                >
                    {pending.error}
                </Text>
            ) : null}

            {pending ? (
                <View className="mt-3 flex-row gap-2.5">
                    <DialogButton
                        label="重新选择"
                        variant="secondary"
                        className="flex-1"
                        disabled={uploading}
                        onPress={onRechoose}
                    />
                    <DialogButton
                        label={uploading ? "上传中…" : "使用此头像"}
                        variant="primary"
                        className="flex-1"
                        disabled={uploading}
                        onPress={onConfirm}
                        leading={
                            uploading ? (
                                <ActivityIndicator
                                    color={colors.surfaceFull}
                                    size="small"
                                />
                            ) : undefined
                        }
                    />
                </View>
            ) : (
                <DialogButton
                    label="关闭"
                    variant="secondary"
                    className="mt-3"
                    onPress={onClose}
                />
            )}
        </DraftDialog>
    );
}
