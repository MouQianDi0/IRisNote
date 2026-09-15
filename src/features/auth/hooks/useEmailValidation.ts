import { useMemo } from "react";

/** Validates the email input shared by authentication screens. */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useEmailValidation(email: string) {
    return useMemo(() => {
        if (!email) return { isValid: false, error: "" };

        const trimmed = email.trim();

        if (!trimmed) return { isValid: false, error: "" };
        if (trimmed.length > 254) return { isValid: false, error: "邮箱过长" };
        if (!EMAIL_REGEX.test(trimmed))
            return { isValid: false, error: "邮箱格式不正确" };

        return { isValid: true, error: "" };
    }, [email]);
}
