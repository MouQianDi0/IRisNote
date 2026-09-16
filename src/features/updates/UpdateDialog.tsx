import { colors } from "@/shared/theme";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import * as Application from "expo-application";
import { useEffect } from "react";
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
    installUpdate,
    openInstallSettings,
    useUpdateStore,
} from "./update-store";

export function UpdateDialog() {
    const state = useUpdateStore();
    useEffect(() => {
        void checkForUpdate();
    }, []);
    const close = () => useUpdateStore.setState({ visible: false });
    const processing = [
        "checking",
        "verifying",
        "merging",
        "installing",
    ].includes(state.phase);
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
        state.phase === "ready"
            ? "立即安装"
            : canDownload
              ? "下载更新"
              : "重新检查";
    const act = () => {
        void (state.phase === "ready"
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
                                : `${delivery.mode === "delta" ? "差量更新" : "完整更新"} · ${(delivery.size / 1048576).toFixed(1)} MB`}
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
                            <ActivityIndicator color={colors.primary} />
                            <Text style={{ color: colors.textSecondary }}>
                                {state.phase === "merging"
                                    ? "正在合并更新…"
                                    : state.phase === "verifying"
                                      ? "正在校验安装包…"
                                      : state.phase === "installing"
                                        ? "等待系统安装界面…"
                                        : "正在查询…"}
                            </Text>
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
                    {state.phase === "ready" && (
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => void openInstallSettings()}
                            style={{
                                minHeight: 44,
                                marginTop: 16,
                                justifyContent: "center",
                            }}
                        >
                            <Text style={{ color: colors.primary }}>
                                安装受阻？检查安装权限
                            </Text>
                        </Pressable>
                    )}
                    <View
                        style={{ flexDirection: "row", gap: 12, marginTop: 16 }}
                    >
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
                                backgroundColor: colors.surfaceMuted,
                            }}
                        >
                            <Text style={{ color: colors.textPrimary }}>
                                {state.phase === "latest"
                                    ? "知道了"
                                    : "稍后再说"}
                            </Text>
                        </Pressable>
                        {!processing && state.phase !== "latest" && (
                            <Pressable
                                accessibilityRole="button"
                                onPress={
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
                                    {state.phase === "downloading"
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
