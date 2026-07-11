import { isAxiosError } from "axios";

/** Shared HTTP error normalization helpers. */

export type ApiErrorData = {
    error?: string;
    message?: string;
    retryAfter?: number;
    scope?: string;
    remainingAttempts?: number;
};

export function getApiErrorData(error: unknown): ApiErrorData | undefined {
    if (!isAxiosError<ApiErrorData>(error)) return undefined;
    return error.response?.data;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
    const data = getApiErrorData(error);
    const message = data?.error || data?.message;
    if (!message) return fallback;

    if (typeof data?.retryAfter === "number" && data.retryAfter > 0) {
        return `${message}，请 ${Math.ceil(data.retryAfter)} 秒后再试`;
    }

    if (
        typeof data?.remainingAttempts === "number" &&
        data.remainingAttempts >= 0
    ) {
        return `${message}，还可尝试 ${data.remainingAttempts} 次`;
    }

    return message;
}
