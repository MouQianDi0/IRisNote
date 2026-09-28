import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { banner } from "@/core/notifications";
import { AuthField } from "@/features/auth/components/AuthField";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import {
    AppButton,
    AppText,
    Card,
    InlineHint,
    PageHeader,
    Screen,
} from "@/shared/ui";
import {
    checkNewPassword,
    PASSWORD_HINT,
} from "@/shared/utils/password-policy";
import { router, type Href } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnsavedProfileDialog } from "../components/UnsavedProfileDialog";
import { VerificationCodeField } from "../components/VerificationCodeField";
import { usePasswordChange } from "../hooks/usePasswordChange";
import { useUnsavedLeaveGuard } from "../hooks/useUnsavedLeaveGuard";
import { CLOUD_REQUIRED_MESSAGE } from "../utils/password-errors";
import { maskEmail } from "../utils/profile-validation";

const cardStyle = { borderCurve: "continuous" as const };
const welcomeRoute = "/auth/welcome" as Href;

type Mode = "current" | "reset";

function TextLink({
    label,
    disabled,
    onPress,
}: {
    label: string;
    disabled: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPress}
            className="mt-2 min-h-11 justify-center self-end active:opacity-[0.85]"
        >
            <Text className="text-sm text-primary">{label}</Text>
        </Pressable>
    );
}

/** 修改密码（当前密码）与已登录重设密码（邮箱验证码）共用一页。 */
export default function ChangePasswordScreen() {
    const { user, loading, logout } = useAuth();
    const { enabled: cloudEnabled } = useCloudStorage();
    const insets = useSafeAreaInsets();
    const { submitChange, submitReset, sendCode, submitting, sendingCode } =
        usePasswordChange();

    const [mode, setMode] = useState<Mode>("current");
    const [currentPassword, setCurrentPassword] = useState("");
    const [code, setCode] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [newTouched, setNewTouched] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const dirty = !!(currentPassword || code || newPassword || confirmPassword);
    const guard = useUnsavedLeaveGuard(dirty, submitting);

    const policyError = newPassword ? checkNewPassword(newPassword) : null;
    const sameAsCurrent =
        mode === "current" && !!newPassword && newPassword === currentPassword;
    const newError =
        policyError ?? (sameAsCurrent ? "新密码不能与当前密码相同" : null);
    const confirmError =
        confirmPassword && confirmPassword !== newPassword
            ? "两次输入不一致"
            : undefined;
    const proofReady =
        mode === "current" ? !!currentPassword : code.trim().length > 0;
    const canSubmit =
        cloudEnabled &&
        !submitting &&
        proofReady &&
        !!newPassword &&
        !newError &&
        confirmPassword === newPassword;

    const edit = (setter: (value: string) => void) => (value: string) => {
        setter(value);
        setSubmitError(null);
    };

    const switchMode = (next: Mode) => {
        setMode(next);
        setCurrentPassword("");
        setCode("");
        setNewPassword("");
        setConfirmPassword("");
        setNewTouched(false);
        setSubmitError(null);
    };

    const onSendCode = async () => {
        setSubmitError(null);
        const result = await sendCode();
        if (result.status === "sent") return 60;
        setSubmitError(result.message);
        return result.retryAfter ?? null;
    };

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitError(null);
        const outcome =
            mode === "current"
                ? await submitChange(currentPassword, newPassword)
                : await submitReset(code.trim(), newPassword);
        if (outcome.status === "failed") {
            setSubmitError(outcome.message);
            return;
        }
        if (outcome.relogin) {
            // 服务端已吊销旧令牌而新令牌未能保存：主动退出，避免后续请求逐个报错。
            guard.allowLeave();
            await logout();
            banner.show({
                title: "密码已修改",
                message: "请使用新密码重新登录",
                type: "important",
            });
            router.replace(welcomeRoute);
            return;
        }
        banner.show({
            title: mode === "current" ? "密码已修改" : "密码已重设",
            message: "其他设备需要重新登录",
            type: "success",
        });
        guard.leaveAfterSave();
    };

    if (loading || !user) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载修改密码"
                    color={colors.primary}
                />
            </Screen>
        );
    }

    return (
        <Screen className="bg-app-background">
            <KeyboardAvoidingView
                className="flex-1"
                behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{
                        paddingBottom: insets.bottom + 32,
                    }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View className="w-full max-w-[560px] self-center px-4">
                        <PageHeader
                            title={mode === "current" ? "修改密码" : "重设密码"}
                            backLabel="返回个人资料"
                            onBack={guard.goBack}
                        />

                        {cloudEnabled ? null : (
                            <InlineHint
                                icon={CloudOff}
                                message={CLOUD_REQUIRED_MESSAGE}
                                className="mt-4"
                            />
                        )}

                        <Card
                            className={`${cloudEnabled ? "mt-4" : "mt-3"} rounded-hyper-card p-4`}
                            style={cardStyle}
                        >
                            {mode === "current" ? (
                                <>
                                    <AuthField
                                        label="当前密码"
                                        placeholder="请输入当前密码"
                                        password
                                        value={currentPassword}
                                        editable={!submitting}
                                        onChangeText={edit(setCurrentPassword)}
                                        autoComplete="current-password"
                                    />
                                    <TextLink
                                        label="忘记当前密码？"
                                        disabled={submitting}
                                        onPress={() => switchMode("reset")}
                                    />
                                </>
                            ) : (
                                <>
                                    <Text className="mb-2 text-sm text-hyper-text-secondary">
                                        验证码将发送到 {maskEmail(user.email)}
                                    </Text>
                                    <VerificationCodeField
                                        value={code}
                                        onChangeText={edit(setCode)}
                                        editable={!submitting}
                                        sendDisabled={!cloudEnabled}
                                        sending={sendingCode}
                                        onSend={onSendCode}
                                    />
                                    <TextLink
                                        label="改用当前密码"
                                        disabled={submitting}
                                        onPress={() => switchMode("current")}
                                    />
                                </>
                            )}

                            <View className="mt-4">
                                <AuthField
                                    label="新密码"
                                    placeholder="请输入新密码"
                                    password
                                    value={newPassword}
                                    editable={!submitting}
                                    onChangeText={edit(setNewPassword)}
                                    onBlur={() => setNewTouched(true)}
                                    autoComplete="new-password"
                                    error={newError ?? undefined}
                                />
                                {newTouched && newError ? null : (
                                    <AppText
                                        variant="helper"
                                        tone="secondary"
                                        className="mt-1.5"
                                    >
                                        {PASSWORD_HINT}
                                        {mode === "current"
                                            ? "，不能与当前密码相同"
                                            : ""}
                                    </AppText>
                                )}
                            </View>

                            <View className="mt-4">
                                <AuthField
                                    label="确认新密码"
                                    placeholder="请再次输入新密码"
                                    password
                                    value={confirmPassword}
                                    editable={!submitting}
                                    onChangeText={edit(setConfirmPassword)}
                                    autoComplete="new-password"
                                    error={confirmError}
                                />
                            </View>
                        </Card>

                        <Text className="mt-3 text-[13px] text-hyper-text-secondary">
                            修改后本机保持登录，其他设备需要重新登录。
                        </Text>

                        {submitError ? (
                            <Text
                                accessibilityRole="alert"
                                className="mt-3 text-sm text-hyper-error"
                            >
                                {submitError}
                            </Text>
                        ) : null}

                        <AppButton
                            label={mode === "current" ? "确认修改" : "重设密码"}
                            loading={submitting}
                            loadingLabel="修改中…"
                            disabled={!canSubmit}
                            className="mt-6"
                            onPress={() => void submit()}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <UnsavedProfileDialog
                visible={guard.confirmVisible}
                onDiscard={guard.discardAndLeave}
                onContinue={guard.continueEditing}
            />
        </Screen>
    );
}
