import api from "@/shared/http/client";
import type {
    AuthResponse,
    CheckVerificationCodePayload,
    CheckVerificationCodeResponse,
    LoginPayload,
    LoginWithCodePayload,
    RegisterPayload,
    SendVerificationCodePayload,
    SendVerificationCodeResponse,
} from "@/features/auth/auth.types";

/** Authentication and verification API calls. */

export type {
    AuthResponse,
    CheckVerificationCodePayload,
    CheckVerificationCodeResponse,
    LoginPayload,
    LoginWithCodePayload,
    RegisterPayload,
    SendVerificationCodePayload,
    SendVerificationCodeResponse,
    VerificationType,
} from "@/features/auth/auth.types";

export async function sendVerificationCode(
    payload: SendVerificationCodePayload,
): Promise<SendVerificationCodeResponse> {
    const { data } = await api.post<SendVerificationCodeResponse>(
        "/verify/send",
        payload,
    );
    return data;
}

export async function checkVerificationCode(
    payload: CheckVerificationCodePayload,
): Promise<CheckVerificationCodeResponse> {
    const { data } = await api.post<CheckVerificationCodeResponse>(
        "/verify/check",
        payload,
    );
    return data;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/register", payload);
    return data;
}

export async function loginWithPassword(
    payload: LoginPayload,
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login", payload);
    return data;
}

export async function loginWithCode(
    payload: LoginWithCodePayload,
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login-code", payload);
    return data;
}
