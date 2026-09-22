import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { getCloudStorageSnapshot } from "@/core/cloud-storage/cloud-storage-policy";
import {
    clearStorageFiles,
    scanStorageFiles,
    type StorageScan,
} from "@/core/storage/storage-files";
import {
    defaultCleanupSelection,
    formatStorageBytes as formatBytes,
    type CleanupSelection,
} from "@/core/storage/storage-policy";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { readNoteCacheCandidates } from "@/features/notes/data/note-cache.repository";
import { clearNoteCache } from "@/features/notes/services/note-cache.service";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { useFocusEffect, router } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsPageHeader } from "../components/SettingsPageHeader";

const card = { borderRadius: 16, padding: 16 };
const hint = { color: colors.textSecondary, fontSize: 13, lineHeight: 20 };
const body = { color: colors.textPrimary, fontSize: 16 };
const labels = {
    updates: "更新缓存",
    shares: "分享临时文件",
    notes: "笔记缓存",
};
const keys: (keyof CleanupSelection)[] = ["updates", "shares", "notes"];
const causeMessage = (cause: unknown) =>
    cause instanceof Error ? cause.message : "操作失败，请重试";

function Detail({
    label,
    value,
    description,
}: {
    label: string;
    value: string;
    description?: string;
}) {
    return (
        <View style={{ paddingVertical: 14, gap: 4 }}>
            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                }}
            >
                <Text style={{ ...body, flexShrink: 1 }}>{label}</Text>
                <Text style={body}>{value}</Text>
            </View>
            {!!description && <Text style={hint}>{description}</Text>}
        </View>
    );
}

export default function DataStorageSettingsScreen() {
    const db = useApplicationDatabase();
    const { user } = useAuth();
    const owner = user?.id ?? null;
    const cloud = useCloudStorage();
    const insets = useSafeAreaInsets();
    const [scan, setScan] = useState<StorageScan | null>(null);
    const [notes, setNotes] = useState({ count: 0, bytes: 0 });
    const [selection, setSelection] = useState(defaultCleanupSelection);
    const [loading, setLoading] = useState(true);
    const [cleaning, setCleaning] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState("");
    const focused = useRef(false);
    const operation = useRef(false);
    const scanVersion = useRef(0);
    const currentOwner = useRef(owner);
    useLayoutEffect(() => {
        currentOwner.current = owner;
    }, [owner]);

    const refresh = useCallback(async () => {
        const version = ++scanVersion.current;
        setLoading(true);
        setError("");
        try {
            const files = await scanStorageFiles();
            let candidates: Awaited<
                ReturnType<typeof readNoteCacheCandidates>
            > = [];
            let noteError = "";
            try {
                if (owner !== null)
                    candidates = await readNoteCacheCandidates(db, owner);
            } catch {
                noteError = "笔记缓存暂未统计，请重试";
            }
            if (
                !focused.current ||
                version !== scanVersion.current ||
                currentOwner.current !== owner
            )
                return;
            setScan(files);
            setNotes({
                count: candidates.length,
                bytes: candidates.reduce((sum, row) => sum + row.bytes, 0),
            });
            setError(
                noteError ||
                    (files.errors ? "部分占用暂未统计，可重试读取" : ""),
            );
        } catch (cause) {
            if (focused.current && version === scanVersion.current) {
                setScan(null);
                setNotes({ count: 0, bytes: 0 });
                setError(causeMessage(cause));
            }
        } finally {
            if (focused.current && version === scanVersion.current)
                setLoading(false);
        }
    }, [db, owner]);

    useFocusEffect(
        useCallback(() => {
            focused.current = true;
            setSelection(defaultCleanupSelection());
            setConfirm(false);
            setResult("");
            void refresh();
            return () => {
                focused.current = false;
                scanVersion.current++;
            };
        }, [refresh]),
    );

    const available = {
        updates: (scan?.cleanable.updates ?? 0) > 0,
        shares: (scan?.cleanable.shares ?? 0) > 0,
        notes: !!scan?.supported && cloud.enabled && notes.count > 0,
    };
    const selected = Object.fromEntries(
        keys.map((key) => [key, selection[key] && available[key]]),
    ) as CleanupSelection;
    const count = keys.filter((key) => selected[key]).length;
    const fileBytes =
        (selected.updates ? (scan?.cleanable.updates ?? 0) : 0) +
        (selected.shares ? (scan?.cleanable.shares ?? 0) : 0);
    const disabled =
        loading ||
        cleaning ||
        !scan?.supported ||
        owner === null ||
        count === 0;
    const total = scan
        ? Object.values(scan.totals).reduce((sum, value) => sum + value, 0)
        : 0;
    const amount = (value: number | undefined) =>
        loading
            ? "正在计算…"
            : value === undefined
              ? "暂未统计"
              : formatBytes(value);
    const summaries = [
        {
            label: "本地数据",
            bytes: scan?.totals.database ?? 0,
            color: colors.primary,
        },
        {
            label: "草稿",
            bytes: scan?.totals.drafts ?? 0,
            color: colors.textSecondary,
        },
        {
            label: "缓存",
            bytes: (scan?.totals.updates ?? 0) + (scan?.totals.shares ?? 0),
            color: colors.hyperPrimaryFaded,
        },
        {
            label: "其他",
            bytes: scan?.totals.other ?? 0,
            color: colors.divider,
        },
    ];
    const descriptions = {
        updates: "已安装版本和更旧的更新文件；正在使用的文件会保留",
        shares: "已结束使用超过 24 小时的临时导出文件",
        notes: !cloud.enabled
            ? "需开启云存储并联网核实副本后清理"
            : "清理后需联网重新同步；未同步内容、草稿与历史记录保留",
    };
    const values = {
        updates: amount(scan?.cleanable.updates),
        shares: amount(scan?.cleanable.shares),
        notes: loading
            ? "正在计算…"
            : `${notes.count} 条 · 内容约 ${formatBytes(notes.bytes)}`,
    };

    const clean = async () => {
        if (operation.current || disabled || !scan || owner === null) return;
        operation.current = true;
        setCleaning(true);
        setConfirm(false);
        setError("");
        setResult("");
        const generation = getCloudStorageSnapshot().generation;
        const check = () => {
            if (
                !focused.current ||
                currentOwner.current !== owner ||
                getCloudStorageSnapshot().generation !== generation ||
                getCloudStorageSnapshot().ownerUserId !== owner
            )
                throw new Error("页面、账号或授权已变化，请重新操作");
        };
        let fileResult = {
            released: 0,
            failed: 0,
            skipped: 0,
            interrupted: false,
        };
        let noteCount = 0,
            skipped = 0;
        const errors: string[] = [];
        try {
            if (selected.notes) {
                try {
                    const cleared = await clearNoteCache(db, owner, check);
                    noteCount = cleared.ids.length;
                    skipped = cleared.skipped;
                } catch (cause) {
                    errors.push(`笔记缓存：${causeMessage(cause)}`);
                }
            }
            fileResult = await clearStorageFiles(scan, selected, check);
            if (fileResult.interrupted)
                errors.push("页面、账号或授权已变化，后续文件已跳过");
        } catch (cause) {
            errors.push(causeMessage(cause));
        } finally {
            operation.current = false;
            setCleaning(false);
            if (focused.current && currentOwner.current === owner) {
                await refresh();
                if (focused.current && currentOwner.current === owner) {
                    setResult(
                        `文件已释放 ${formatBytes(fileResult.released)}${selected.notes ? `；清理了 ${noteCount} 条笔记缓存，数据库空间可复用` : ""}。${fileResult.skipped + skipped ? `已跳过 ${fileResult.skipped + skipped} 项已变化或需要保留的内容。` : ""}`,
                    );
                    if (fileResult.failed)
                        errors.push(
                            `${fileResult.failed} 个文件未能清理，请重试`,
                        );
                    if (errors.length) setError(errors.join("；"));
                }
            }
        }
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 24 + insets.bottom,
                }}
                showsVerticalScrollIndicator={false}
            >
                <SettingsPageHeader
                    title="数据与存储"
                    backLabel="返回设置"
                    onBack={() =>
                        router.canGoBack()
                            ? router.back()
                            : router.replace("/pages/user/settings")
                    }
                />
                <Card style={card}>
                    <Text style={hint}>已统计本地占用</Text>
                    <Text style={{ ...body, fontSize: 32, marginTop: 8 }}>
                        {amount(scan ? total : undefined)}
                    </Text>
                    <View
                        style={{
                            height: 8,
                            flexDirection: "row",
                            borderRadius: 4,
                            overflow: "hidden",
                            marginVertical: 12,
                            backgroundColor: colors.divider,
                        }}
                    >
                        {total > 0 &&
                            summaries
                                .filter((item) => item.bytes > 0)
                                .map((item) => (
                                    <View
                                        key={item.label}
                                        style={{
                                            flex: item.bytes / total,
                                            backgroundColor: item.color,
                                        }}
                                    />
                                ))}
                    </View>
                    <Text style={hint}>本地数据 · 草稿 · 缓存 · 其他</Text>
                    <Text style={{ ...hint, marginTop: 12 }}>
                        {scan?.supported === false
                            ? "当前平台不支持应用文件占用统计与清理。"
                            : "统计本机应用内可读取的文件，可能包含其他账号的数据；不包含应用安装体积，与系统设置统计可能不同。"}
                    </Text>
                </Card>
                <Text style={{ ...hint, marginTop: 20, marginBottom: 8 }}>
                    本地数据
                </Text>
                <Card style={{ paddingHorizontal: 16, borderRadius: 16 }}>
                    <Detail
                        label="笔记与应用数据"
                        value={amount(scan?.totals.database)}
                        description="包含笔记、待办、历史版本和同步数据"
                    />
                    <View
                        style={{ height: 1, backgroundColor: colors.divider }}
                    />
                    <Detail
                        label="草稿与恢复副本"
                        value={amount(scan?.totals.drafts)}
                        description="此处为独立草稿文件；数据库内草稿计入上项，清理时均保留"
                    />
                </Card>
                <Text style={{ ...hint, marginTop: 20, marginBottom: 8 }}>
                    缓存清理
                </Text>
                <Card style={{ paddingHorizontal: 16, borderRadius: 16 }}>
                    {keys.map((key, index) => (
                        <View key={key}>
                            {index > 0 && (
                                <View
                                    style={{
                                        height: 1,
                                        backgroundColor: colors.divider,
                                    }}
                                />
                            )}
                            <Pressable
                                accessibilityRole="checkbox"
                                accessibilityLabel={labels[key]}
                                accessibilityHint={descriptions[key]}
                                accessibilityState={{
                                    checked: selected[key],
                                    disabled:
                                        loading || cleaning || !available[key],
                                }}
                                disabled={
                                    loading || cleaning || !available[key]
                                }
                                onPress={() =>
                                    setSelection((value) => ({
                                        ...value,
                                        [key]: !value[key],
                                    }))
                                }
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    minHeight: 48,
                                    paddingVertical: 14,
                                    gap: 12,
                                    opacity: available[key] ? 1 : 0.6,
                                }}
                            >
                                <View
                                    style={{
                                        width: 22,
                                        height: 22,
                                        borderWidth: 1.5,
                                        borderRadius: 6,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderColor: selected[key]
                                            ? colors.primary
                                            : colors.textSecondary,
                                        backgroundColor: selected[key]
                                            ? colors.primary
                                            : colors.surface,
                                    }}
                                >
                                    {selected[key] && (
                                        <Check
                                            size={16}
                                            color={colors.surface}
                                        />
                                    )}
                                </View>
                                <View style={{ flex: 1, gap: 4 }}>
                                    <Text style={body}>{labels[key]}</Text>
                                    <Text style={hint}>{values[key]}</Text>
                                    <Text style={hint}>
                                        {descriptions[key]}
                                    </Text>
                                </View>
                            </Pressable>
                        </View>
                    ))}
                </Card>
                <Text style={{ ...hint, marginTop: 12 }}>
                    已选择 {count} 项，文件预计释放 {formatBytes(fileBytes)}
                    {selected.notes
                        ? `；另清理最多 ${notes.count} 条笔记缓存`
                        : ""}
                </Text>
                <Text style={{ ...hint, marginTop: 8 }}>
                    笔记缓存仅处理当前账号可重新下载的副本，数据库文件不会立即缩小。仅本机笔记、草稿、历史记录、登录状态与待同步内容会保留。
                </Text>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="清理所选项目"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => setConfirm(true)}
                    style={{
                        height: 48,
                        marginTop: 16,
                        borderRadius: 12,
                        backgroundColor: colors.primary,
                        opacity: disabled ? 0.45 : 1,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                    }}
                >
                    {cleaning && <ActivityIndicator color={colors.surface} />}
                    <Text style={{ color: colors.surface, fontSize: 16 }}>
                        {cleaning
                            ? "正在核实并清理…"
                            : loading
                              ? "正在计算…"
                              : count
                                ? "清理所选项目"
                                : "暂无可清理内容或未选择项目"}
                    </Text>
                </Pressable>
                {!!result && (
                    <Text
                        accessibilityLiveRegion="polite"
                        style={{ ...hint, marginTop: 12 }}
                    >
                        {result}
                    </Text>
                )}
                {!!error && (
                    <Text
                        accessibilityRole="alert"
                        style={{ ...hint, color: colors.danger, marginTop: 12 }}
                    >
                        {error}
                    </Text>
                )}
                <Pressable
                    accessibilityRole="button"
                    disabled={loading || cleaning}
                    onPress={() => void refresh()}
                    style={{
                        minHeight: 48,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Text style={{ color: colors.primary }}>重新统计</Text>
                </Pressable>
                <Card style={card}>
                    <Detail
                        label="更新文件总计"
                        value={amount(scan?.totals.updates)}
                    />
                    <Detail
                        label="分享临时文件总计"
                        value={amount(scan?.totals.shares)}
                    />
                    <Detail
                        label="其他已统计文件"
                        value={amount(scan?.totals.other)}
                        description="来源不明确的文件保留，不自动清理"
                    />
                </Card>
            </ScrollView>
            <AppModal
                visible={confirm}
                transparent
                animationType="fade"
                onRequestClose={() => setConfirm(false)}
            >
                <View
                    style={{
                        flex: 1,
                        justifyContent: "center",
                        paddingHorizontal: 24,
                        backgroundColor: colors.overlay,
                    }}
                >
                    <View
                        accessibilityViewIsModal
                        style={{
                            padding: 20,
                            borderRadius: 16,
                            backgroundColor: colors.surface,
                        }}
                    >
                        <Text
                            accessibilityRole="header"
                            style={{ ...body, fontSize: 20 }}
                        >
                            清理所选项目？
                        </Text>
                        <Text style={{ ...hint, marginTop: 12 }}>
                            文件预计释放 {formatBytes(fileBytes)}。
                        </Text>
                        <Text style={{ ...body, marginTop: 12 }}>
                            将清理：
                            {keys
                                .filter((key) => selected[key])
                                .map((key) => labels[key])
                                .join("、")}
                        </Text>
                        <Text style={{ ...hint, marginTop: 12 }}>
                            {selected.notes
                                ? "笔记缓存清理后，相关笔记需要联网重新同步。仅本机笔记、未同步修改、草稿及历史记录会保留。"
                                : "仅清理可安全移除的临时文件，笔记、草稿与待同步内容会保留。"}
                        </Text>
                        <View
                            style={{
                                flexDirection: "row",
                                gap: 12,
                                marginTop: 20,
                            }}
                        >
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => setConfirm(false)}
                                style={{
                                    flex: 1,
                                    height: 44,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 12,
                                    backgroundColor: colors.appBackground,
                                }}
                            >
                                <Text style={body}>取消</Text>
                            </Pressable>
                            <Pressable
                                accessibilityRole="button"
                                disabled={disabled}
                                onPress={() => void clean()}
                                style={{
                                    flex: 1,
                                    height: 44,
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: 12,
                                    backgroundColor: colors.primary,
                                    opacity: disabled ? 0.45 : 1,
                                }}
                            >
                                <Text
                                    style={{ ...body, color: colors.surface }}
                                >
                                    清理
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </AppModal>
        </Screen>
    );
}
