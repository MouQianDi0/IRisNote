import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { getCloudStorageSnapshot } from "@/core/cloud-storage/cloud-storage-policy";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SettingsPageHeader } from "@/features/settings/components/SettingsPageHeader";
import { getApiErrorMessage } from "@/shared/http/errors";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import { router, useFocusEffect } from "expo-router";
import { Trash2, Undo2 } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    AppState,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { remainingTrashTime } from "../api/notes-trash.types";
import {
    listNoteTrash,
    trashPreview,
    type TrashRow,
} from "../data/note-trash.repository";
import {
    restoreTrashedNote,
    synchronizeNoteTrash,
} from "../services/note-trash.service";

const summary = (content: string | null) =>
    content
        ?.replace(/!\[[^\]]*\]\([^)]*\)/g, "[图片]")
        .replace(/[#*>`~_]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160) || "暂无正文";

export default function TrashScreen() {
    const db = useApplicationDatabase();
    const { user } = useAuth();
    const { enabled, generation } = useCloudStorage();
    const insets = useSafeAreaInsets();
    const [rows, setRows] = useState<TrashRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [now, setNow] = useState(() => Date.now());
    const [offset, setOffset] = useState(0);
    const active = useRef(false);
    const serial = useRef(0);
    const loadingRef = useRef<string | null>(null);
    const owner = user?.id;
    const load = useCallback(
        async (remote: boolean) => {
            const loadKey = `${owner}:${generation}`;
            if (!owner || loadingRef.current === loadKey) return;
            const request = ++serial.current;
            const valid = () =>
                active.current &&
                request === serial.current &&
                getCloudStorageSnapshot().ownerUserId === owner &&
                getCloudStorageSnapshot().generation === generation;
            loadingRef.current = loadKey;
            setRefreshing(true);
            const read = async () => {
                const data = await listNoteTrash(db, owner);
                const clock = await db.getFirst<{ offset_ms: number }>(
                    "SELECT offset_ms FROM note_trash_clock WHERE owner_user_id=?",
                    [owner],
                );
                if (valid()) {
                    setRows(data);
                    setOffset(clock?.offset_ms ?? 0);
                    setNow(Date.now());
                    setLoading(false);
                }
            };
            try {
                await read();
                if (remote) {
                    setError("");
                    await synchronizeNoteTrash(db, owner);
                    await read();
                }
            } catch (cause) {
                if (valid())
                    setError(
                        getApiErrorMessage(
                            cause,
                            "暂时无法连接，显示本机垃圾桶",
                        ),
                    );
            } finally {
                if (
                    loadingRef.current === loadKey &&
                    request === serial.current
                )
                    loadingRef.current = null;
                if (valid()) {
                    setLoading(false);
                    setRefreshing(false);
                }
            }
        },
        [db, owner, generation],
    );

    useFocusEffect(
        useCallback(() => {
            active.current = true;
            setRows([]);
            setBusy(null);
            setError("");
            setLoading(Boolean(owner));
            void load(true);
            const timer = setInterval(() => {
                if (AppState.currentState === "active") void load(true);
            }, 60_000);
            const subscription = AppState.addEventListener(
                "change",
                (state) => {
                    if (state === "active") void load(true);
                },
            );
            return () => {
                active.current = false;
                serial.current++;
                loadingRef.current = null;
                clearInterval(timer);
                subscription.remove();
            };
        }, [load, owner]),
    );

    const restore = async (row: TrashRow) => {
        if (!owner || busy !== null) return;
        const currentGeneration = generation;
        setBusy(row.client_id);
        setError("");
        try {
            await restoreTrashedNote(db, owner, row.client_id);
        } catch (cause) {
            if (
                active.current &&
                getCloudStorageSnapshot().generation === currentGeneration
            )
                setError(
                    getApiErrorMessage(
                        cause,
                        cause instanceof Error
                            ? cause.message
                            : "恢复失败，请检查网络后重试",
                    ),
                );
        } finally {
            if (
                active.current &&
                getCloudStorageSnapshot().generation === currentGeneration
            ) {
                setBusy(null);
                await load(false);
            }
        }
    };
    const expired = (row: TrashRow) =>
        row.expires_at !== null &&
        Date.parse(row.expires_at) <=
            now + (row.state === "local" ? 0 : offset);
    const visible = rows.filter((row) => !expired(row));
    const pending = rows.length - visible.length;
    return (
        <Screen className="bg-app-background">
            <View style={{ paddingHorizontal: 16 }}>
                <SettingsPageHeader
                    title="垃圾桶"
                    backLabel="返回我的页面"
                    onBack={() => router.back()}
                />
            </View>
            <FlatList
                data={visible}
                keyExtractor={(row) => `${row.owner_user_id}:${row.client_id}`}
                refreshing={refreshing}
                onRefresh={() => void load(true)}
                contentContainerStyle={{
                    flexGrow: 1,
                    padding: 16,
                    paddingBottom: Math.max(insets.bottom, 16),
                    gap: 12,
                }}
                ListHeaderComponent={
                    <View style={{ gap: 8, paddingBottom: 4 }}>
                        <Text className="text-sm text-hyper-text-secondary">
                            删除的笔记保留 15 天，到期后自动清理。
                        </Text>
                        {!enabled && (
                            <Text className="text-sm text-hyper-text-secondary">
                                云存储已关闭，云端笔记需开启后恢复与清理。
                            </Text>
                        )}
                        {!!error && (
                            <Text
                                selectable
                                accessibilityRole="alert"
                                className="text-sm text-hyper-error"
                            >
                                {error}
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
                                accessibilityLabel="正在加载垃圾桶"
                                color={colors.primary}
                            />
                        ) : (
                            <>
                                <Trash2 size={36} color={colors.textMuted} />
                                <Text className="text-text-primary text-[17px]">
                                    垃圾桶是空的
                                </Text>
                                <Text className="text-sm text-hyper-text-secondary">
                                    最近 15 天删除的笔记会显示在这里。
                                </Text>
                            </>
                        )}
                    </View>
                }
                ListFooterComponent={
                    pending > 0 ? (
                        <Text className="py-3 text-sm text-hyper-text-secondary">
                            {pending} 篇笔记已到期，等待联网清理。
                        </Text>
                    ) : null
                }
                renderItem={({ item }) => {
                    const preview = trashPreview(item);
                    const remaining = item.expires_at
                        ? Date.parse(item.expires_at) -
                          now -
                          (item.state === "local" ? 0 : offset)
                        : Infinity;
                    const disabled =
                        busy !== null || (item.server_id !== null && !enabled);
                    return (
                        <Card
                            style={{
                                padding: 16,
                                borderRadius: 16,
                                borderCurve: "continuous",
                            }}
                        >
                            <Text
                                selectable
                                numberOfLines={2}
                                className="text-text-primary text-[17px]"
                            >
                                {preview.title || "无标题笔记"}
                            </Text>
                            <Text
                                numberOfLines={2}
                                style={{ marginTop: 8 }}
                                className="text-sm leading-5 text-hyper-text-secondary"
                            >
                                {summary(preview.content)}
                            </Text>
                            <View
                                style={{
                                    marginTop: 12,
                                    flexDirection: "row",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 12,
                                }}
                            >
                                <Text
                                    style={{
                                        flex: 1,
                                        fontSize: 13,
                                        fontVariant: ["tabular-nums"],
                                        color:
                                            remaining < 86400000
                                                ? colors.hyperError
                                                : colors.hyperTextSecondary,
                                    }}
                                >
                                    {item.state === "deleting"
                                        ? "删除待联网确认"
                                        : remainingTrashTime(
                                              item.expires_at,
                                              now +
                                                  (item.state === "local"
                                                      ? 0
                                                      : offset),
                                          )}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`恢复${preview.title}`}
                                    accessibilityState={{
                                        disabled,
                                        busy: busy === item.client_id,
                                    }}
                                    disabled={disabled}
                                    onPress={() => void restore(item)}
                                    className="min-h-11 flex-row items-center justify-center gap-2 rounded-hyper-control bg-primary px-4 active:opacity-[0.85]"
                                    style={{ opacity: disabled ? 0.5 : 1 }}
                                >
                                    {busy === item.client_id ? (
                                        <ActivityIndicator
                                            color="white"
                                            size="small"
                                        />
                                    ) : (
                                        <Undo2 size={16} color="white" />
                                    )}
                                    <Text className="text-sm text-white">
                                        {busy === item.client_id
                                            ? "恢复中…"
                                            : "恢复"}
                                    </Text>
                                </Pressable>
                            </View>
                            {!!item.last_error && (
                                <Text
                                    selectable
                                    style={{ marginTop: 8 }}
                                    className="text-sm text-hyper-error"
                                >
                                    {item.last_error}
                                </Text>
                            )}
                        </Card>
                    );
                }}
            />
        </Screen>
    );
}
