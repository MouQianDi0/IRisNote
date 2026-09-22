import { useApplicationDatabase } from "@/core/database";
import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SettingsPageHeader } from "@/features/settings/components/SettingsPageHeader";
import { colors } from "@/shared/theme";
import { InlineHint, Screen } from "@/shared/ui";
import { Redirect, router, useIsFocused } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Check, CloudOff, Inbox, Trash2 } from "lucide-react-native";
import { useCallback } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DialogButton } from "../components/editor/draft-dialog";
import { listNewNoteDrafts } from "../data/new-note-draft.repository";
import { useDraftManager } from "../hooks/use-draft-manager";

export default function DraftsScreen() {
    const { user, loading } = useAuth();
    if (loading)
        return (
            <Screen variant="centeredMuted">
                <ActivityIndicator color={colors.primary} />
            </Screen>
        );
    if (!user) return <Redirect href="/auth/welcome" />;
    return <DraftsContent key={user.id} owner={user.id} />;
}

function DraftsContent({ owner }: { owner: number }) {
    const db = useApplicationDatabase();
    const insets = useSafeAreaInsets();
    const focused = useIsFocused();
    const navigate = useDebouncedNavigation();
    const load = useCallback(() => listNewNoteDrafts(db, owner), [db, owner]);
    const manager = useDraftManager({ db, owner, visible: focused, load });
    const {
        entries,
        selected,
        loading,
        error,
        deleting,
        checked,
        counting,
        busy,
        message,
    } = manager;

    // Android 返回与 iOS 返回手势遵循同样的规则：先取消倒计时/退出管理。
    usePreventRemove(deleting || counting || busy, () => {
        manager.handleBack();
    });
    const goBack = () => {
        if (manager.handleBack()) return;
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/user");
    };

    return (
        <Screen className="bg-app-background">
            <View style={{ paddingHorizontal: 16 }}>
                <SettingsPageHeader
                    title="草稿箱"
                    backLabel="返回我的页面"
                    onBack={goBack}
                />
            </View>
            <FlatList
                data={entries}
                keyExtractor={(entry) => entry.key}
                extraData={deleting ? checked : selected}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={manager.cancelCountdown}
                contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 12 }}
                ListHeaderComponent={
                    <View style={{ gap: 12 }}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "space-between",
                                minHeight: 44,
                                gap: 12,
                            }}
                        >
                            <Text
                                selectable
                                className="text-sm text-hyper-text-secondary"
                                style={{ fontVariant: ["tabular-nums"] }}
                            >
                                {loading
                                    ? "正在读取草稿…"
                                    : error
                                      ? "暂时无法读取草稿"
                                      : deleting
                                        ? `已选 ${checked.size} 份`
                                        : `共 ${entries.length} 份`}
                            </Text>
                            {manager.listReady && !deleting && (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="管理草稿"
                                    onPress={manager.enterDeleting}
                                    disabled={busy}
                                    style={{
                                        minHeight: 44,
                                        minWidth: 44,
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Text className="text-sm text-primary">
                                        管理
                                    </Text>
                                </Pressable>
                            )}
                        </View>
                        <InlineHint
                            icon={deleting ? Trash2 : CloudOff}
                            message={
                                deleting
                                    ? "删除草稿不可恢复"
                                    : "草稿仅本机保存，不会同步到云端。"
                            }
                            tone={deleting ? "important" : undefined}
                        />
                        {!!error && (
                            <View style={{ gap: 4 }}>
                                <Text
                                    selectable
                                    accessibilityRole="alert"
                                    className="text-sm text-hyper-error"
                                >
                                    {error}
                                </Text>
                                <DialogButton
                                    variant="text"
                                    label="重试"
                                    onPress={manager.retry}
                                />
                            </View>
                        )}
                        {!!message && (
                            <Text
                                selectable
                                accessibilityRole="alert"
                                className="text-sm text-hyper-error"
                            >
                                {message}
                            </Text>
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <View
                        style={{
                            flex: 1,
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 32,
                            gap: 12,
                        }}
                    >
                        {loading ? (
                            <ActivityIndicator
                                accessibilityLabel="正在加载草稿"
                                color={colors.primary}
                            />
                        ) : (
                            !error && (
                                <>
                                    <Inbox size={36} color={colors.textMuted} />
                                    <Text className="text-text-primary text-[17px]">
                                        暂无草稿
                                    </Text>
                                    <Text className="text-sm text-hyper-text-secondary">
                                        未完成的新笔记会保存在这里。
                                    </Text>
                                </>
                            )
                        )}
                    </View>
                }
                renderItem={({ item }) => {
                    const isSelected = deleting
                        ? checked.has(item.key)
                        : selected === item.key;
                    const title = item.row.title.trim() || "未命名草稿";
                    const color = isSelected
                        ? deleting
                            ? colors.hyperError
                            : colors.primary
                        : colors.textPrimary;
                    return (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${title}，${item.kind === "saved" ? "主动保存的草稿" : "自动恢复内容"}`}
                            accessibilityState={{
                                selected: isSelected,
                                disabled: busy,
                            }}
                            disabled={busy}
                            onPress={() =>
                                deleting
                                    ? manager.toggleChecked(item.key)
                                    : manager.selectEntry(item.key)
                            }
                            className={
                                isSelected && !deleting
                                    ? "rounded-hyper-card bg-hyper-card-selected"
                                    : "rounded-hyper-card bg-white"
                            }
                            style={{ padding: 16, borderCurve: "continuous" }}
                        >
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    gap: 8,
                                }}
                            >
                                <Text
                                    numberOfLines={2}
                                    style={{ flex: 1, fontSize: 17, color }}
                                >
                                    {title}
                                </Text>
                                {isSelected && (
                                    <Check size={20} color={color} />
                                )}
                            </View>
                            <Text
                                numberOfLines={2}
                                className="text-sm leading-5 text-hyper-text-secondary"
                                style={{ marginTop: 8 }}
                            >
                                {item.row.content.trim() || "暂无正文"}
                            </Text>
                            <Text
                                className="text-xs text-hyper-text-secondary"
                                style={{ marginTop: 12 }}
                            >
                                {item.kind === "saved"
                                    ? "主动保存"
                                    : "自动恢复"}{" "}
                                ·{" "}
                                {new Date(item.row.updated_at).toLocaleString(
                                    "zh-CN",
                                )}
                            </Text>
                        </Pressable>
                    );
                }}
            />
            <View
                style={{
                    paddingHorizontal: 16,
                    paddingTop: 12,
                    paddingBottom: Math.max(insets.bottom, 16),
                    flexDirection: "row",
                    gap: 12,
                }}
            >
                {deleting ? (
                    <>
                        <DialogButton
                            variant="secondary"
                            className="flex-1"
                            label="退出删除"
                            disabled={busy}
                            onPress={manager.exitDeleting}
                        />
                        <DialogButton
                            variant="danger"
                            className="flex-1"
                            label={counting || busy ? "删除中…" : "确认删除"}
                            leading={
                                counting || busy ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={colors.surface}
                                    />
                                ) : undefined
                            }
                            disabled={
                                !counting &&
                                (busy ||
                                    loading ||
                                    !!error ||
                                    checked.size === 0)
                            }
                            onPress={() =>
                                counting
                                    ? manager.cancelCountdown()
                                    : manager.startCountdown()
                            }
                        />
                    </>
                ) : (
                    <DialogButton
                        className="flex-1"
                        label="继续编辑"
                        disabled={loading || busy || !!error || !selected}
                        onPress={() => {
                            if (selected)
                                navigate({
                                    pathname: "/pages/note/create",
                                    params: { draftKey: selected },
                                });
                        }}
                    />
                )}
            </View>
        </Screen>
    );
}
