import { banner } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { AppButton, Card, Input, PageHeader, Screen } from "@/shared/ui";
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
import { useProfileSave } from "../hooks/useProfileSave";
import { useUnsavedLeaveGuard } from "../hooks/useUnsavedLeaveGuard";
import type { ProfileChanges } from "../profile.types";
import { codePointLength, type FieldCheck } from "../utils/profile-validation";
import { UnsavedProfileDialog } from "./UnsavedProfileDialog";

const cardStyle = { borderCurve: "continuous" as const };

type ProfileTextEditorProps = {
    title: string;
    label: string;
    hint: string;
    placeholder: string;
    maxLength: number;
    multiline?: boolean;
    /** 允许清空（显示“清空”入口，空值也可保存）。 */
    clearable?: boolean;
    /** 从当前用户读取已保存的值。 */
    savedValue: string;
    check: (input: string) => FieldCheck;
    toChanges: (value: string | null) => ProfileChanges;
};

/** 用户名与简介共用的单字段编辑页：单项保存，未保存离开时二次确认。 */
export function ProfileTextEditor({
    title,
    label,
    hint,
    placeholder,
    maxLength,
    multiline = false,
    clearable = false,
    savedValue,
    check,
    toChanges,
}: ProfileTextEditorProps) {
    const { user, loading } = useAuth();
    const insets = useSafeAreaInsets();
    const { save, saving } = useProfileSave();
    const [value, setValue] = useState(savedValue);
    const [touched, setTouched] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const result = check(value);
    const saved = check(savedValue).value;
    const dirty = result.value !== saved;
    const length = codePointLength(result.value ?? "");
    const canSave = !saving && dirty && !result.error;
    const showError = touched && !!result.error;

    const guard = useUnsavedLeaveGuard(dirty, saving);

    const submit = async () => {
        setTouched(true);
        if (!canSave) return;
        setSubmitError(null);
        const outcome = await save(toChanges(result.value));
        if (outcome.status === "saved") {
            banner.show({ title: "已保存", type: "success" });
            guard.leaveAfterSave();
            return;
        }
        setSubmitError(outcome.message);
    };

    if (loading || !user) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel={`正在加载${title}`}
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
                            title={title}
                            backLabel="返回个人资料"
                            onBack={guard.goBack}
                        />

                        <Card
                            className="mt-4 rounded-hyper-card p-4"
                            style={cardStyle}
                        >
                            <View className="flex-row items-center justify-between">
                                <Text className="text-sm text-hyper-text-secondary">
                                    {label}
                                </Text>
                                {clearable && value.length > 0 ? (
                                    <Pressable
                                        accessibilityLabel={`清空${label}`}
                                        accessibilityRole="button"
                                        disabled={saving}
                                        hitSlop={{ top: 12, bottom: 12 }}
                                        className="active:opacity-[0.85]"
                                        onPress={() => {
                                            setValue("");
                                            setTouched(true);
                                        }}
                                    >
                                        <Text className="text-sm text-primary">
                                            清空
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                            <Input
                                accessibilityLabel={label}
                                containerClassName="mt-2"
                                placeholder={placeholder}
                                value={value}
                                onChangeText={(next) => {
                                    setValue(next);
                                    setSubmitError(null);
                                }}
                                onBlur={() => setTouched(true)}
                                disabled={saving}
                                invalid={showError}
                                multiline={multiline}
                                size={multiline ? "body" : "standard"}
                                maxLength={maxLength * 2}
                                returnKeyType={multiline ? "default" : "done"}
                                onSubmitEditing={
                                    multiline ? undefined : () => void submit()
                                }
                            />
                            <View className="mt-2 flex-row items-start justify-between gap-3">
                                <Text
                                    accessibilityRole={
                                        showError ? "alert" : undefined
                                    }
                                    className={
                                        showError
                                            ? "min-w-0 flex-1 text-sm text-hyper-error"
                                            : "min-w-0 flex-1 text-[13px] text-hyper-text-secondary"
                                    }
                                >
                                    {showError ? result.error : hint}
                                </Text>
                                <Text className="text-[13px] text-hyper-text-secondary">
                                    {length}/{maxLength}
                                </Text>
                            </View>
                        </Card>

                        {submitError ? (
                            <Text
                                accessibilityRole="alert"
                                className="mt-3 text-sm text-hyper-error"
                            >
                                {submitError}
                            </Text>
                        ) : null}

                        <AppButton
                            label="保存"
                            loading={saving}
                            loadingLabel="保存中…"
                            disabled={!canSave}
                            className={submitError ? "mt-3" : "mt-6"}
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
