import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { tv } from "tailwind-variants";
import { AppButton, AppText } from "@/shared/ui";
import { DraftDialog } from "@/shared/ui/Dialog/dialog";
import {
    EXCERPT_SESSION_DURATIONS,
    type ExcerptSessionDuration,
} from "../domain/excerpt-session";
import { useExcerptSessionStore } from "../state/excerpt-session-store";
import { excerptCaptureSupported } from "../services/excerpt-session-notifications";

const durationStyle = tv({
    base: "min-h-11 min-w-[60px] flex-1 items-center justify-center rounded-hyper-control px-1",
    variants: {
        state: {
            selected: "bg-hyper-card-selected active:opacity-85",
            default: "bg-hyper-card active:opacity-85",
            disabled: "bg-hyper-secondary-disabled",
        },
    },
});

/** AppModal 外壳；说明 14sp、间距 12dp，动作等宽 48dp/10dp。 */
export function ExcerptSessionDialog({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    const state = useExcerptSessionStore();
    const [duration, setDuration] = useState<ExcerptSessionDuration>(
        state.lastDuration,
    );
    const [now, setNow] = useState(Date.now);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pending = busy || state.pending;
    const active = state.session && state.session.endsAt > now;
    useEffect(() => {
        if (!visible) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [visible]);

    const submit = async () => {
        if (pending) return;
        setBusy(true);
        setError(null);
        try {
            if (active) await state.stop();
            else await state.start(duration);
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "请重试");
        } finally {
            setBusy(false);
        }
    };
    const close = () => {
        if (!pending) onClose();
    };
    const end = state.session ? new Date(state.session.endsAt) : null;
    const endTime = end
        ? `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`
        : "";
    return (
        <DraftDialog
            visible={visible}
            title={active ? "快速摘录进行中" : "快速摘录"}
            onClose={close}
            closeOnScrimTap={!pending}
        >
            <ScrollView style={{ maxHeight: 300 }}>
                <Text className="text-sm leading-5 text-hyper-text-secondary">
                    {active && state.session
                        ? `剩余约 ${Math.ceil((state.session.endsAt - now) / 60_000)} 分钟（至 ${endTime}）`
                        : excerptCaptureSupported()
                          ? "在设定时间内，从其他应用复制内容后点通知，即可确认保存并返回原应用；回到 IRisNote 也会自动提示保存。不会自动保存或上传。"
                          : "在设定时间内，从其他应用复制的内容回到 IRisNote 时会自动提示保存，不会自动保存或上传。"}
                </Text>
                {!active && (
                    <View
                        accessibilityRole="radiogroup"
                        accessibilityLabel="快速摘录时长"
                        className="mt-3 flex-row flex-wrap gap-2"
                    >
                        {EXCERPT_SESSION_DURATIONS.map((value) => (
                            <Pressable
                                key={value}
                                accessibilityRole="radio"
                                accessibilityLabel={`${value}分钟`}
                                accessibilityState={{
                                    checked: duration === value,
                                    disabled: pending,
                                }}
                                disabled={pending}
                                onPress={() => setDuration(value)}
                                className={durationStyle({
                                    state: pending
                                        ? "disabled"
                                        : duration === value
                                          ? "selected"
                                          : "default",
                                })}
                            >
                                <AppText
                                    variant="helper"
                                    tone={
                                        pending
                                            ? "disabled"
                                            : duration === value
                                              ? "brand"
                                              : "primary"
                                    }
                                    numberOfLines={1}
                                >
                                    {value}分钟
                                </AppText>
                            </Pressable>
                        ))}
                    </View>
                )}
                {error && (
                    <Text
                        accessibilityRole="alert"
                        className="mt-3 text-sm text-hyper-error"
                    >
                        {error}
                    </Text>
                )}
            </ScrollView>
            <View className="mt-3 flex-row gap-2.5">
                <AppButton
                    className="flex-1"
                    label={active ? "停止会话" : "取消"}
                    variant="secondary"
                    disabled={pending}
                    onPress={active ? () => void submit() : close}
                />
                <AppButton
                    className="flex-1"
                    label={active ? "继续保持" : "开启"}
                    disabled={!state.ready || pending}
                    onPress={active ? close : () => void submit()}
                />
            </View>
        </DraftDialog>
    );
}
