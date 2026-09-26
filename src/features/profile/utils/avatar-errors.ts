export type AvatarErrorDescription = {
    title: string;
    message: string;
};

const PICKER_MESSAGES: Record<string, string> = {
    "Media library permission is required.": "需要相册权限才能选择头像",
    "Camera permission is required.": "需要相机权限才能拍摄头像",
    "Avatar image must be 2MB or smaller.": "图片需不超过 2MB，请重新选择",
    "Avatar base64 data was not returned.": "无法读取所选图片，请重新选择",
};

/** 将选图、云授权与上传错误统一转换为面向用户的中文提示。 */
export function describeAvatarError(error: unknown): AvatarErrorDescription {
    const value =
        typeof error === "object" && error !== null
            ? (error as {
                  code?: unknown;
                  message?: unknown;
                  response?: { data?: { error?: unknown } };
              })
            : {};

    if (value.code === "CLOUD_STORAGE_PERMISSION_REQUIRED") {
        return {
            title: "需要开启云存储",
            message: "请先在「同步与备份」中开启云存储，再更换头像",
        };
    }

    const pickerMessage =
        typeof value.message === "string"
            ? PICKER_MESSAGES[value.message]
            : undefined;
    if (pickerMessage) {
        return { title: "无法使用所选图片", message: pickerMessage };
    }

    const serverMessage = value.response?.data?.error;
    if (typeof serverMessage === "string" && serverMessage.trim()) {
        return { title: "头像更新失败", message: serverMessage };
    }

    return { title: "头像更新失败", message: "头像更新失败，请稍后再试" };
}
