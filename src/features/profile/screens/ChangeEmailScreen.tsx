import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { banner } from "@/core/notifications";
import { AuthField } from "@/features/auth/components/AuthField";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useEmailValidation } from "@/features/auth/hooks/useEmailValidation";
import { colors } from "@/shared/theme";
import { AppButton, Card, InlineHint, PageHeader, Screen } from "@/shared/ui";
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
import {
    useEmailChange,
    type EmailChangeResult,
    type IdentityMethod,
} from "../hooks/useEmailChange";
import type { SendCodeResult } from "../hooks/usePasswordChange";
import { useUnsavedLeaveGuard } from "../hooks/useUnsavedLeaveGuard";
import { cloudRequiredMessage } from "../utils/password-errors";
import { maskEmail } from "../utils/profile-validation";

const cardStyle = { borderCurve: "continuous" as const };
const CLOUD_MESSAGE = cloudRequiredMessage("修改邮箱");

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

/** 修改邮箱：第 1 步验证身份（原邮箱验证码或当前密码），第 2 步验证新邮箱并提交。 */
export default function ChangeEmailScreen() {
    const { user, loading } = useAuth();
    const { enabled: cloudEnabled } = useCloudStorage();
    const insets = useSafeAreaInsets();
    const flow = useEmailChange();

    const [method, setMethod] = useState<IdentityMethod>("code");
    const [currentCode, setCurrentCode] = useState("");
    const [password, setPassword] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newCode, setNewCode] = useState("");
    /** 新邮箱验证码发往的地址；新邮箱被修改后需要重新发送。 */
    const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
    const [codeFieldKey, setCodeFieldKey] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const emailCheck = useEmailValidation(newEmail);
    const normalizedNewEmail = newEmail.trim().toLowerCase();
    const step = flow.step;
    const dirty =
        step === 2 || !!(currentCode || password || newEmail || newCode);
    const guard = useUnsavedLeaveGuard(dirty, flow.busy);

    const canVerify =
        cloudEnabled &&
        !flow.busy &&
        (method === "code" ? currentCode.trim().length > 0 : !!password);
    const canConfirm =
        cloudEnabled &&
        !flow.busy &&
        codeSentTo !== null &&
        codeSentTo === normalizedNewEmail &&
        newCode.trim().length > 0;

    const edit = (setter: (value: string) => void) => (value: string) => {
        setter(value);
        setError(null);
    };

    const restartStepTwo = () => {
        setNewEmail("");
        setNewCode("");
        setCodeSentTo(null);
        setCodeFieldKey((key) => key + 1);
    };

    const showResult = (result: EmailChangeResult | SendCodeResult) => {
        if (result.status === "expired") {
            setCurrentCode("");
            setPassword("");
            restartStepTwo();
        }
        if (result.status === "failed" || result.status === "expired") {
            setError(result.message);
        }
    };

    const switchMethod = (next: IdentityMethod) => {
        setMethod(next);
        setCurrentCode("");
        setPassword("");
        setError(null);
    };

    const onSendCurrent = async () => {
        setError(null);
        const result = await flow.sendCurrentCode();
        if (result.status === "sent") return 60;
        showResult(result);
        return "retryAfter" in result ? (result.retryAfter ?? null) : null;
    };

    const onSendNew = async () => {
        setError(null);
        const target = normalizedNewEmail;
        const result = await flow.sendNewCode(newEmail);
        if (result.status === "sent") {
            setCodeSentTo(target);
            return 60;
        }
        showResult(result);
        return "retryAfter" in result ? (result.retryAfter ?? null) : null;
    };

    const onChangeNewEmail = (value: string) => {
        setNewEmail(value);
        setError(null);
        if (codeSentTo !== null) {
            // 换了新邮箱：旧验证码作废，发送按钮倒计时一并重置
            setCodeSentTo(null);
            setNewCode("");
            setCodeFieldKey((key) => key + 1);
        }
    };

    const submitStepOne = async () => {
        if (!canVerify) return;
        setError(null);
        const result = await flow.verify(
            method,
            method === "code" ? currentCode : password,
        );
        if (result.status === "done") {
            setCurrentCode("");
            setPassword("");
            return;
        }
        showResult(result);
    };

    const submitStepTwo = async () => {
        if (!canConfirm) return;
        setError(null);
        const result = await flow.confirm(newCode);
        if (result.status === "done") {
            banner.show({
                title: "邮箱已修改",
                message: "请用新邮箱登录",
                type: "success",
            });
            guard.leaveAfterSave();
            return;
        }
        showResult(result);
    };

    if (loading || !user) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载修改邮箱"
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
                            title="修改邮箱"
                            backLabel="返回个人资料"
                            onBack={guard.goBack}
                        />

                        {cloudEnabled ? null : (
                            <InlineHint
                                icon={CloudOff}
                                message={CLOUD_MESSAGE}
                                className="mt-4"
                            />
                        )}

                        <Text
                            className={`${cloudEnabled ? "mt-4" : "mt-3"} text-[13px] text-hyper-text-secondary`}
                        >
                            第 {step} 步，共 2 步
                        </Text>

                        <Card
                            className="mt-2 rounded-hyper-card p-4"
                            style={cardStyle}
                        >
                            {step === 1 ? (
                                <>
                                    <Text className="text-text-primary text-[17px]">
                                        验证身份
                                    </Text>
                                    <Text className="mt-1 text-[13px] text-hyper-text-secondary">
                                        {method === "code"
                                            ? `验证码将发送到 ${maskEmail(user.email)}`
                                            : "输入当前账号密码以确认是您本人"}
                                    </Text>
                                    <View className="mt-4">
                                        {method === "code" ? (
                                            <VerificationCodeField
                                                value={currentCode}
                                                onChangeText={edit(setCurrentCode)}
                                                editable={!flow.busy}
                                                sendDisabled={!cloudEnabled}
                                                sending={flow.sendingCode}
                                                onSend={onSendCurrent}
                                            />
                                        ) : (
                                            <AuthField
                                                label="当前密码"
                                                placeholder="请输入当前密码"
                                                password
                                                value={password}
                                                editable={!flow.busy}
                                                onChangeText={edit(setPassword)}
                                                autoComplete="current-password"
                                            />
                                        )}
                                    </View>
                                    <TextLink
                                        label={
                                            method === "code"
                                                ? "改用密码验证"
                                                : "改用邮箱验证码"
                                        }
                                        disabled={flow.busy}
                                        onPress={() =>
                                            switchMethod(
                                                method === "code"
                                                    ? "password"
                                                    : "code",
                                            )
                                        }
                                    />
                                </>
                            ) : (
                                <>
                                    <AuthField
                                        label="新邮箱"
                                        placeholder="name@example.com"
                                        value={newEmail}
                                        editable={!flow.busy}
                                        onChangeText={onChangeNewEmail}
                                        keyboardType="email-address"
                                        autoComplete="email"
                                        error={emailCheck.error || undefined}
                                    />
                                    <View className="mt-4">
                                        <VerificationCodeField
                                            key={codeFieldKey}
                                            value={newCode}
                                            onChangeText={edit(setNewCode)}
                                            editable={!flow.busy}
                                            sendDisabled={
                                                !cloudEnabled ||
                                                !emailCheck.isValid
                                            }
                                            sending={flow.sendingCode}
                                            onSend={onSendNew}
                                        />
                                    </View>
                                    <Text className="mt-2 text-[13px] text-hyper-text-secondary">
                                        修改后请用新邮箱登录，已登录的设备不受影响。
                                    </Text>
                                </>
                            )}
                        </Card>

                        {error ? (
                            <Text
                                accessibilityRole="alert"
                                className="mt-3 text-sm text-hyper-error"
                            >
                                {error}
                            </Text>
                        ) : null}

                        {step === 1 ? (
                            <AppButton
                                label="下一步"
                                loading={flow.busy}
                                loadingLabel="验证中…"
                                disabled={!canVerify}
                                className="mt-6"
                                onPress={() => void submitStepOne()}
                            />
                        ) : (
                            <AppButton
                                label="确认修改"
                                loading={flow.busy}
                                loadingLabel="修改中…"
                                disabled={!canConfirm}
                                className="mt-6"
                                onPress={() => void submitStepTwo()}
                            />
                        )}
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
