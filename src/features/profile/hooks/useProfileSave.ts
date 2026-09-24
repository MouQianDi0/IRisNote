import {
    isCloudStoragePermissionError,
    isCloudStorageRequestDispatched,
} from "@/core/cloud-storage/cloud-storage-policy";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { User } from "@/shared/types/user";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import { useRef, useState } from "react";
import { updateUserProfile } from "../api/profile.api";
import type { ProfileChanges } from "../profile.types";

export type ProfileSaveResult =
    | { status: "saved" }
    | { status: "conflict"; message: string }
    | { status: "failed"; message: string };

type ResponseError = {
    response?: { status?: number; data?: { error?: unknown; user?: User } };
};

/**
 * 单项保存普通资料：以 profile_version 做条件更新，成功或冲突时都用服务端资料
 * 回写共享账户状态；结果未知时重新读取资料，不宣称成功也不诱导盲目重试。
 */
export function useProfileSave() {
    const { user, applyUser, syncProfile } = useAuth();
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);

    const save = async (changes: ProfileChanges): Promise<ProfileSaveResult> => {
        if (!user) return { status: "failed", message: "登录状态已失效，请重新登录" };
        if (savingRef.current) return { status: "failed", message: "正在保存，请稍候" };
        savingRef.current = true;
        setSaving(true);
        try {
            const updated = await updateUserProfile({
                ...changes,
                expected_version: user.profile_version ?? 1,
            });
            await applyUser(updated).catch(() => false);
            return { status: "saved" };
        } catch (error) {
            const response = (error as ResponseError).response;
            const dispatched = isCloudStorageRequestDispatched(error);
            if (!dispatched && isCloudStoragePermissionError(error)) {
                return {
                    status: "failed",
                    message: "需要开启云存储后才能保存资料",
                };
            }
            if (dispatched || !response) {
                // 请求可能已到达服务端：先核对最新资料，再由用户决定是否重试
                await syncProfile().catch(() => undefined);
                return {
                    status: "failed",
                    message: "网络异常，保存结果未确认，已重新读取资料，请核对后再保存",
                };
            }
            if (response.status === 409 && response.data?.user) {
                const latest = response.data.user;
                await applyUser({
                    ...latest,
                    avatar: normalizeAvatarUrl(latest.avatar),
                }).catch(() => false);
                return {
                    status: "conflict",
                    message: "资料已在其他设备修改，已载入最新内容，请确认后再保存",
                };
            }
            if (response.status === 404 && !response.data?.error) {
                return {
                    status: "failed",
                    message: "服务器暂不支持修改资料，请稍后再试",
                };
            }
            const serverMessage = response.data?.error;
            return {
                status: "failed",
                message:
                    typeof serverMessage === "string" && serverMessage.trim()
                        ? serverMessage
                        : "保存失败，请稍后再试",
            };
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    return { save, saving };
}
