import { colors } from "@/shared/theme";
import type { UserGender } from "@/shared/types/user";
import { Input } from "@/shared/ui";
import { DialogButton, DraftDialog } from "@/shared/ui/Dialog/dialog";
import { draftRowStyles, draftTitleStyles } from "@/shared/ui/Dialog/dialog.styles";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
    GENDER_CUSTOM_MAX,
    checkGenderCustom,
    codePointLength,
} from "../utils/profile-validation";

type Choice = UserGender | "unset";

const CHOICES: { key: Choice; label: string }[] = [
    { key: "unset", label: "不设置" },
    { key: "male", label: "男" },
    { key: "female", label: "女" },
    { key: "custom", label: "自定义" },
];

export type GenderSelection = {
    gender: UserGender | null;
    gender_custom: string | null;
};

type GenderPickerDialogProps = {
    visible: boolean;
    gender: UserGender | null | undefined;
    genderCustom: string | null | undefined;
    saving: boolean;
    error: string | null;
    onClose: () => void;
    onSave: (selection: GenderSelection) => void;
};

/**
 * 性别单选；选择仅在弹窗内暂存，点“保存”才提交。保存中锁定遮罩与返回。
 * 调用方以 `key={`gender-${visible}`}` 挂载，每次打开都从已保存资料重新开始。
 */
export function GenderPickerDialog({
    visible,
    gender,
    genderCustom,
    saving,
    error,
    onClose,
    onSave,
}: GenderPickerDialogProps) {
    const initialChoice: Choice = gender ?? "unset";
    const initialCustom = gender === "custom" ? (genderCustom ?? "") : "";
    const [choice, setChoice] = useState<Choice>(initialChoice);
    const [custom, setCustom] = useState(initialCustom);

    const customCheck = checkGenderCustom(custom);
    const changed =
        choice !== initialChoice ||
        (choice === "custom" && customCheck.value !== initialCustom.trim());
    const canSave =
        !saving && changed && (choice !== "custom" || !customCheck.error);
    const close = () => {
        if (!saving) onClose();
    };

    return (
        <DraftDialog
            visible={visible}
            title="性别"
            onClose={close}
            closeOnScrimTap={!saving}
        >
            <View className="overflow-hidden rounded-hyper-card bg-hyper-list">
                {CHOICES.map((item) => {
                    const selected = choice === item.key;
                    return (
                        <Pressable
                            key={item.key}
                            accessibilityRole="radio"
                            accessibilityLabel={item.label}
                            accessibilityState={{ selected, disabled: saving }}
                            disabled={saving}
                            onPress={() => setChoice(item.key)}
                            className={draftRowStyles({ selected })}
                        >
                            <Text
                                className={`flex-1 ${draftTitleStyles({
                                    tone: selected ? "selected" : "default",
                                })}`}
                                numberOfLines={1}
                            >
                                {item.label}
                            </Text>
                            {selected ? (
                                <Check size={20} color={colors.primary} />
                            ) : null}
                        </Pressable>
                    );
                })}
            </View>

            {choice === "custom" ? (
                <View className="mt-3">
                    <Input
                        accessibilityLabel="自定义性别"
                        placeholder="输入自定义性别"
                        value={custom}
                        onChangeText={setCustom}
                        disabled={saving}
                        invalid={!!custom.trim() && !!customCheck.error}
                        maxLength={GENDER_CUSTOM_MAX * 2}
                        returnKeyType="done"
                    />
                    <Text className="mt-2 self-end text-[13px] text-hyper-text-secondary">
                        {codePointLength(custom.trim())}/{GENDER_CUSTOM_MAX}
                    </Text>
                </View>
            ) : null}

            {error ? (
                <Text
                    accessibilityRole="alert"
                    className="mt-3 text-sm text-hyper-error"
                >
                    {error}
                </Text>
            ) : null}

            <View className="mt-3 flex-row gap-2.5">
                <DialogButton
                    label="取消"
                    variant="secondary"
                    className="flex-1"
                    disabled={saving}
                    onPress={close}
                />
                <DialogButton
                    label={saving ? "保存中…" : "保存"}
                    variant="primary"
                    className="flex-1"
                    disabled={!canSave}
                    onPress={() =>
                        onSave(
                            choice === "unset"
                                ? { gender: null, gender_custom: null }
                                : choice === "custom"
                                  ? {
                                        gender: "custom",
                                        gender_custom: customCheck.value,
                                    }
                                  : { gender: choice, gender_custom: null },
                        )
                    }
                    leading={
                        saving ? (
                            <ActivityIndicator
                                color={colors.surfaceFull}
                                size="small"
                            />
                        ) : undefined
                    }
                />
            </View>
        </DraftDialog>
    );
}
