import {
    isCloudStoragePermissionError,
    isCloudStorageRequestDispatched,
} from "@/core/cloud-storage/cloud-storage-policy";
import { getApiErrorData, getApiErrorMessage } from "@/shared/http/errors";

export const cloudRequiredMessage = (action: string) =>
    `${action}需要开启云存储，请先在「同步与备份」中开启`;
export const CLOUD_REQUIRED_MESSAGE = cloudRequiredMessage("修改密码");

export type PasswordErrorDescription = {
    /** unknown：请求可能已到达服务端，密码是否已修改无法确认。 */
    kind: "cloud" | "unknown" | "failed";
    message: string;
    /** 服务端要求等待的秒数（限流或错误次数过多）。 */
    retryAfter?: number;
};

export function formatWait(seconds: number): string {
    return seconds < 60 ? `${Math.ceil(seconds)} 秒` : `${Math.ceil(seconds / 60)} 分钟`;
}

/**
 * 修改/重设密码、修改邮箱与发送验证码的错误分类。`unknownMessage` 为空时，
 * 未收到响应按普通失败处理（如发送验证码，重试没有副作用）。
 */
export function describePasswordError(
    error: unknown,
    fallback: string,
    unknownMessage?: string,
    cloudMessage = CLOUD_REQUIRED_MESSAGE,
): PasswordErrorDescription {
    const dispatched = isCloudStorageRequestDispatched(error);
    if (!dispatched && isCloudStoragePermissionError(error)) {
        return { kind: "cloud", message: cloudMessage };
    }
    const data = getApiErrorData(error);
    const hasResponse =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        !!(error as { response?: unknown }).response;
    if (unknownMessage && (dispatched || !hasResponse)) {
        return { kind: "unknown", message: unknownMessage };
    }
    if (!hasResponse) {
        return { kind: "failed", message: "网络异常，请检查网络后重试" };
    }
    const retryAfter =
        typeof data?.retryAfter === "number" && data.retryAfter > 0
            ? data.retryAfter
            : undefined;
    if (retryAfter !== undefined && data?.error) {
        // 验证码限流文案已包含等待时间，不再重复拼接
        const message = data.error.includes("后再试")
            ? data.error
            : `${data.error}，请 ${formatWait(retryAfter)}后再试`;
        return { kind: "failed", message, retryAfter };
    }
    return { kind: "failed", message: getApiErrorMessage(error, fallback) };
}

/** 修改邮箱的凭据已过期、已使用，或账号邮箱在此期间发生变化：需要从第 1 步重新验证。 */
export function isEmailChangeExpired(error: unknown): boolean {
    const data: unknown = getApiErrorData(error);
    return (
        typeof data === "object" &&
        data !== null &&
        (data as { code?: unknown }).code === "EMAIL_CHANGE_EXPIRED"
    );
}
