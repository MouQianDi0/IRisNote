import { colors } from "@/shared/theme";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import * as Application from "expo-application";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import {
    cancelUpdate,
    checkForUpdate,
    downloadUpdate,
    hideUpdateDialog,
    installUpdate,
    observeUpdateLifecycle,
    useUpdateStore,
} from "./update-store";
import { isFullPackageRequired, isRequiredUpdate } from "./release";

export function UpdateDialog() {
    const state = useUpdateStore();
    const required = isRequiredUpdate(state.release);
    useEffect(() => {
        const stopObserving = observeUpdateLifecycle();
        void checkForUpdate();
        return stopObserving;
    }, []);
    const close = hideUpdateDialog;
    const processing = [
        "checking",
        "verifying",
        "merging",
        "installing",
        "saving",
    ].includes(state.phase);
    const backgroundWork =
        state.phase === "verifying" || state.phase === "merging";
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!state.visible || !backgroundWork) return;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [state.visible, backgroundWork]);
    const stageLabels = {
        base: "正在校验当前版本",
        patch: "正在校验更新文件",
        merge: "正在合并更新",
        target: "正在校验安装包",
        targetMetadata: "正在核对安装包信息",
        install: "正在进行安装前校验",
        installMetadata: "正在核对安装信息",
    };
    const delivery = state.release?.delivery;
    const canDownload = !!delivery && delivery.mode !== "unavailable";
    const title =
        state.phase === "latest"
            ? "已是最新版本"
            : state.phase === "checking"
              ? "正在检查更新"
              : state.release
                ? `发现新版本 ${state.release.version}`
                : "检查更新";
    const primary =
        state.phase === "permission"
            ? "前往授权"
            : state.phase === "ready"
              ? "立即安装"
              : canDownload
                ? "下载并安装"
                : "重新检查";
    const act = () => {
        void (state.phase === "ready" || state.phase === "permission"
            ? installUpdate()
            : canDownload
              ? downloadUpdate()
              : checkForUpdate(true));
    };
    return (
        <AppModal
            visible={state.visible}
            transparent
            animationType="fade"
            onRequestClose={close}
        >
            <View
                style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 24,
                    backgroundColor: colors.overlay,
                }}
            >
                <View
                    accessibilityViewIsModal
                    style={{
                        width: "100%",
                        maxWidth: 400,
                        maxHeight: "85%",
                        padding: 24,
                        borderRadius: 24,
                        backgroundColor: colors.surface,
                    }}
                >
                    <Text
                        accessibilityRole="header"
                        style={{
                            fontSize: 21,
                            fontWeight: "600",
                            color: colors.textPrimary,
                        }}
                    >
                        {title}
                    </Text>
                    <Text style={{ marginTop: 8, color: colors.textSecondary }}>
                        当前版本 {Application.nativeApplicationVersion ?? "—"}
                    </Text>
                    {delivery && (
                        <Text
                            style={{
                                marginTop: 8,
                                color: colors.textSecondary,
                            }}
                        >
                            {delivery.mode === "unavailable"
                                ? delivery.reason
                                : `${delivery.mode === "delta" ? "差量更新" : isFullPackageRequired(state.release) ? "完整更新（需完整安装包）" : "完整更新"} · ${(delivery.size / 1048576).toFixed(1)} MB`}
                        </Text>
                    )}
                    {state.release && (
                        <ScrollView style={{ marginTop: 16, flexShrink: 1 }}>
                            <Text
                                style={{
                                    color: colors.textPrimary,
                                    fontSize: 16,
                                    lineHeight: 24,
                                }}
                            >
                                本次更新{"\n"}
                                {state.release.notes}
                            </Text>
                        </ScrollView>
                    )}
                    {!!state.error && (
                        <Text
                            accessibilityRole="alert"
                            style={{ marginTop: 16, color: colors.danger }}
                        >
                            {state.error}
                        </Text>
                    )}
                    {processing && (
                        <View
                            style={{
                                marginTop: 16,
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            {(!backgroundWork ||
                                state.stageProgress === null) && (
                                <ActivityIndicator color={colors.primary} />
                            )}
                            <Text style={{ color: colors.textSecondary }}>
                                {backgroundWork && state.stage
                                    ? `${stageLabels[state.stage]}${state.stageProgress === null ? "…" : ` ${Math.floor(state.stageProgress * 100)}%`}`
                                    : state.phase === "saving"
                                      ? "正在保存当前草稿…"
                                      : state.phase === "installing"
                                        ? "等待系统安装界面…"
                                        : "正在查询…"}
                            </Text>
                            {backgroundWork && state.stageProgress !== null && (
                                <View
                                    accessibilityRole="progressbar"
                                    accessibilityValue={{
                                        min: 0,
                                        max: 100,
                                        now: Math.floor(
                                            state.stageProgress * 100,
                                        ),
                                    }}
                                    style={{
                                        width: "100%",
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: colors.surfaceMuted,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: `${state.stageProgress * 100}%`,
                                            height: 6,
                                            borderRadius: 3,
                                            backgroundColor: colors.primary,
                                        }}
                                    />
                                </View>
                            )}
                            {backgroundWork && (
                                <Text style={{ color: colors.textSecondary }}>
                                    本阶段已用时{" "}
                                    {Math.max(
                                        0,
                                        Math.floor(
                                            (now - state.stageStartedAt) / 1000,
                                        ),
                                    )}{" "}
                                    秒
                                </Text>
                            )}
                        </View>
                    )}
                    {state.phase === "downloading" && (
                        <View style={{ marginTop: 16, gap: 8 }}>
                            <Text
                                accessibilityLiveRegion="polite"
                                style={{ color: colors.textSecondary }}
                            >
                                正在下载 {Math.floor(state.progress * 100)}% ·{" "}
                                {(state.received / 1048576).toFixed(1)} MB /{" "}
                                {(
                                    (delivery && delivery.mode !== "unavailable"
                                        ? delivery.size
                                        : 0) / 1048576
                                ).toFixed(1)}{" "}
                                MB
                            </Text>
                            <View
                                accessibilityRole="progressbar"
                                accessibilityValue={{
                                    min: 0,
                                    max: 100,
                                    now: Math.floor(state.progress * 100),
                                }}
                                style={{
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: colors.surfaceMuted,
                                }}
                            >
                                <View
                                    style={{
                                        height: 6,
                                        borderRadius: 3,
                                        width: `${state.progress * 100}%`,
                                        backgroundColor: colors.primary,
                                    }}
                                />
                            </View>
                        </View>
                    )}
                    {(backgroundWork ||
                        state.phase === "downloading" ||
                        state.phase === "available") &&
                        canDownload && (
                            <Text
                                style={{
                                    marginTop: 8,
                                    color: colors.textSecondary,
                                }}
                            >
                                {required
                                    ? "更新后方可继续使用；返回或取消安装将退出应用。"
                                    : "可在后台继续处理并记笔记。完成后将打开安装器；未授权时将打开安装权限设置。"}
                            </Text>
                        )}
                    <View
                        style={{ flexDirection: "row", gap: 12, marginTop: 16 }}
                    >
                        {!required && (
                            <Pressable
                                accessibilityRole="button"
                                onPress={close}
                                style={{
                                    flex: 1,
                                    minHeight: 48,
                                    padding: 8,
                                    justifyContent: "center",
                                    alignItems: "center",
                                    borderRadius: 12,
                                    backgroundColor: backgroundWork
                                        ? colors.primary
                                        : colors.surfaceMuted,
                                }}
                            >
                                <Text
                                    style={{
                                        color: backgroundWork
                                            ? "white"
                                            : colors.textPrimary,
                                    }}
                                >
                                    {backgroundWork ||
                                    state.phase === "downloading"
                                        ? "后台继续"
                                        : state.phase === "permission"
                                          ? "稍后安装"
                                          : state.phase === "latest"
                                            ? "知道了"
                                            : "稍后再说"}
                                </Text>
                            </Pressable>
                        )}
                        {(required || !processing) &&
                            state.phase !== "latest" && (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={
                                        required &&
                                        (processing ||
                                            state.phase === "downloading")
                                    }
                                    accessibilityState={{
                                        disabled:
                                            required &&
                                            (processing ||
                                                state.phase === "downloading"),
                                    }}
                                    onPress={
                                        !required &&
                                        state.phase === "downloading"
                                            ? () => void cancelUpdate()
                                            : act
                                    }
                                    style={{
                                        flex: 1,
                                        minHeight: 48,
                                        padding: 8,
                                        justifyContent: "center",
                                        alignItems: "center",
                                        borderRadius: 12,
                                        backgroundColor: colors.primary,
                                    }}
                                >
                                    <Text style={{ color: "white" }}>
                                        {required &&
                                        (processing ||
                                            state.phase === "downloading")
                                            ? state.phase === "downloading"
                                                ? "正在下载…"
                                                : "正在处理…"
                                            : state.phase === "downloading"
                                              ? "取消下载"
                                              : primary}
                                    </Text>
                                </Pressable>
                            )}
                    </View>
                </View>
            </View>
        </AppModal>
    );
}
