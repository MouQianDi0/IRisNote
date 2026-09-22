import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { getCloudStorageSnapshot } from "@/core/cloud-storage/cloud-storage-policy";
import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SettingsPageHeader } from "@/features/settings/components/SettingsPageHeader";
import { colors } from "@/shared/theme";
import { Screen } from "@/shared/ui";
import { Redirect, router, useFocusEffect } from "expo-router";
import { FileText, Pin, Star } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocalNotes } from "../data/note-local.repository";
import { onNotesChanged, onNotesRemovedByCategory } from "../notes.events";
import { sortNotesByPinned, withLocalOrder } from "../notes.selectors";
import type { Note } from "../notes.types";
import { syncNotes } from "../services/note-sync-coordinator";

type CollectionView = "all" | "starred";

const preview = (content: string | null) =>
    content
        ?.replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]")
        .replace(/[#*>`~_]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || "暂无正文";

export default function NoteCollectionScreen({
    view,
}: {
    view: CollectionView;
}) {
    const { user, loading } = useAuth();
    const { enabled, generation } = useCloudStorage();
    if (loading)
        return (
            <Screen variant="centeredMuted">
                <ActivityIndicator color={colors.primary} />
            </Screen>
        );
    if (!user) return <Redirect href="/auth/welcome" />;
    return (
        <NoteCollection
            key={`${user.id}:${generation}`}
            owner={user.id}
            view={view}
            cloudEnabled={enabled}
            generation={generation}
        />
    );
}

function NoteCollection({
    owner,
    view,
    cloudEnabled,
    generation,
}: {
    owner: number;
    view: CollectionView;
    cloudEnabled: boolean;
    generation: number;
}) {
    const db = useApplicationDatabase();
    const insets = useSafeAreaInsets();
    const navigate = useDebouncedNavigation();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const refreshRef = useRef<(() => Promise<void>) | null>(null);
    const title = view === "starred" ? "星标笔记" : "全部笔记";

    useFocusEffect(
        useCallback(() => {
            let active = true;
            let readVersion = 0;
            let refreshingNow = false;
            const sessionCurrent = captureNotificationSession();
            const valid = () =>
                active &&
                sessionCurrent() &&
                getCloudStorageSnapshot().ownerUserId === owner &&
                getCloudStorageSnapshot().generation === generation;
            const readLocal = async () => {
                const request = ++readVersion;
                const result = await getLocalNotes(db, owner);
                if (valid() && request === readVersion) {
                    setNotes(withLocalOrder(result));
                    setLoading(false);
                }
            };
            const refresh = async () => {
                if (!valid() || refreshingNow) return;
                refreshingNow = true;
                setRefreshing(true);
                setError("");
                let localLoaded = false;
                try {
                    await readLocal();
                    localLoaded = true;
                    if (valid() && cloudEnabled) {
                        await syncNotes(db, owner);
                        if (valid()) await readLocal();
                    }
                } catch {
                    if (valid())
                        setError(
                            localLoaded
                                ? "暂时无法同步，当前显示本机笔记，请稍后重试。"
                                : "读取笔记失败，请重试。",
                        );
                } finally {
                    refreshingNow = false;
                    if (valid()) {
                        setLoading(false);
                        setRefreshing(false);
                    }
                }
            };
            const reloadLocal = () => {
                void readLocal().catch(() => {
                    if (valid()) setError("读取笔记失败，请重试。");
                });
            };
            refreshRef.current = refresh;
            const unsubscribe = onNotesChanged((event) => {
                const eventOwner = event.ownerUserId ?? event.note?.user_id;
                if (eventOwner === owner) reloadLocal();
            });
            const unsubscribeCategory = onNotesRemovedByCategory(reloadLocal);
            void refresh();
            return () => {
                active = false;
                refreshRef.current = null;
                unsubscribe();
                unsubscribeCategory();
            };
        }, [cloudEnabled, db, generation, owner]),
    );

    const visible = useMemo(
        () =>
            sortNotesByPinned(
                view === "starred"
                    ? notes.filter((note) => note.is_starred)
                    : notes,
            ),
        [notes, view],
    );

    return (
        <Screen className="bg-app-background">
            <View style={{ paddingHorizontal: 16 }}>
                <SettingsPageHeader
                    title={title}
                    backLabel="返回我的页面"
                    onBack={() => {
                        if (router.canGoBack()) router.back();
                        else router.replace("/(tabs)/user");
                    }}
                />
            </View>
            <FlatList
                data={visible}
                keyExtractor={(note) => String(note.id)}
                refreshing={refreshing}
                onRefresh={() => void refreshRef.current?.()}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 16,
                    paddingBottom: Math.max(insets.bottom, 16),
                    gap: 12,
                }}
                ListHeaderComponent={
                    <View style={{ gap: 8 }}>
                        <Text
                            selectable
                            className="text-sm text-hyper-text-secondary"
                            style={{ fontVariant: ["tabular-nums"] }}
                        >
                            {loading
                                ? "正在读取笔记…"
                                : `共 ${visible.length} 篇`}
                        </Text>
                        {!!error && (
                            <View style={{ gap: 4 }}>
                                <Text
                                    selectable
                                    accessibilityRole="alert"
                                    className="text-sm text-hyper-error"
                                >
                                    {error}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="重试加载笔记"
                                    onPress={() => void refreshRef.current?.()}
                                    style={{
                                        minHeight: 44,
                                        justifyContent: "center",
                                        alignSelf: "flex-start",
                                    }}
                                >
                                    <Text className="text-sm text-primary">
                                        重试
                                    </Text>
                                </Pressable>
                            </View>
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
                                accessibilityLabel="正在加载笔记"
                                color={colors.primary}
                            />
                        ) : (
                            !error && (
                                <>
                                    {view === "starred" ? (
                                        <Star size={36} color={colors.star} />
                                    ) : (
                                        <FileText
                                            size={36}
                                            color={colors.textMuted}
                                        />
                                    )}
                                    <Text className="text-text-primary text-[17px]">
                                        {view === "starred"
                                            ? "暂无星标笔记"
                                            : "暂无笔记"}
                                    </Text>
                                    <Text className="text-sm text-hyper-text-secondary">
                                        {view === "starred"
                                            ? "给笔记加上星标后，会显示在这里。"
                                            : "保存后的笔记会显示在这里。"}
                                    </Text>
                                </>
                            )
                        )}
                    </View>
                }
                renderItem={({ item }) => (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`打开笔记：${item.title.trim() || "无标题笔记"}`}
                        onPress={() =>
                            navigate({
                                pathname: "/pages/note/[id]",
                                params: { id: String(item.id) },
                            })
                        }
                        className="rounded-hyper-card bg-white active:opacity-[0.85]"
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
                                className="text-text-primary text-[17px]"
                                style={{ flex: 1 }}
                            >
                                {item.title.trim() || "无标题笔记"}
                            </Text>
                            {item.is_pinned && (
                                <Pin
                                    accessibilityLabel="已置顶"
                                    size={18}
                                    color={colors.pin}
                                />
                            )}
                            {item.is_starred && (
                                <Star
                                    accessibilityLabel="已星标"
                                    size={18}
                                    color={colors.star}
                                    fill={colors.star}
                                />
                            )}
                        </View>
                        <Text
                            numberOfLines={2}
                            className="text-sm leading-5 text-hyper-text-secondary"
                            style={{ marginTop: 8 }}
                        >
                            {preview(item.content)}
                        </Text>
                        <Text
                            className="text-xs text-hyper-text-secondary"
                            style={{ marginTop: 12 }}
                        >
                            {new Date(
                                item.updated_at ||
                                    item.local_updated_at ||
                                    item.created_at,
                            ).toLocaleString("zh-CN")}
                        </Text>
                    </Pressable>
                )}
            />
        </Screen>
    );
}
