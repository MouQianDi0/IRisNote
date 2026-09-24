import { banner } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { AppButton, Card, Input, PageHeader, Screen } from "@/shared/ui";
import { Check, ChevronRight, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UnsavedProfileDialog } from "../components/UnsavedProfileDialog";
import { getRegionIndex } from "../data/region-index";
import { useProfileSave } from "../hooks/useProfileSave";
import { useUnsavedLeaveGuard } from "../hooks/useUnsavedLeaveGuard";
import type { RegionEntry } from "../utils/region-dictionary";

const cardStyle = { borderCurve: "continuous" as const };

type Selection = { code: string; label: string } | null;

type Row =
    | { kind: "unset" }
    | { kind: "self"; entry: RegionEntry }
    | { kind: "entry"; entry: RegionEntry; meta?: string };

function RowSeparator() {
    return <View className="mx-4 h-px bg-hyper-divider" />;
}

const rowKey = (row: Row) =>
    row.kind === "unset" ? "unset" : `${row.kind}:${row.entry.code}`;

function RegionListRow({
    title,
    meta,
    selected,
    navigable,
    onPress,
}: {
    title: string;
    meta?: string;
    selected: boolean;
    navigable: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={[title, meta].filter(Boolean).join("，")}
            accessibilityState={{ selected }}
            onPress={onPress}
            className={
                selected
                    ? "min-h-14 flex-row items-center gap-3 bg-hyper-card-selected px-4 py-3"
                    : "min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted active:opacity-[0.85]"
            }
        >
            <View className="min-w-0 flex-1">
                <Text
                    className={
                        selected
                            ? "text-[17px] text-primary"
                            : "text-text-primary text-[17px]"
                    }
                    numberOfLines={1}
                >
                    {title}
                </Text>
                {meta ? (
                    <Text
                        className="mt-1 text-[13px] text-hyper-text-secondary"
                        numberOfLines={1}
                    >
                        {meta}
                    </Text>
                ) : null}
            </View>
            {selected ? (
                <Check size={20} color={colors.primary} />
            ) : navigable ? (
                <ChevronRight size={18} color={colors.textMuted} />
            ) : null}
        </Pressable>
    );
}

/** 地区选择：国家/地区 → 省/州，支持搜索；选择只在页面内暂存，点保存才提交。 */
export default function SelectRegionScreen() {
    const { user, loading } = useAuth();
    const insets = useSafeAreaInsets();
    const index = useMemo(() => getRegionIndex(), []);
    const { save, saving } = useProfileSave();

    const savedCode = user?.region_code ?? null;
    const savedEntry = index.resolve(savedCode);
    const staleLabel = savedCode && !savedEntry ? user?.region_label : null;

    const [selection, setSelection] = useState<Selection>(
        savedCode
            ? { code: savedCode, label: savedEntry?.label ?? user?.region_label ?? savedCode }
            : null,
    );
    const [country, setCountry] = useState<string | null>(() =>
        savedEntry && savedEntry.code !== savedEntry.countryCode
            ? savedEntry.countryCode
            : null,
    );
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    const dirty = (selection?.code ?? null) !== savedCode;
    const guard = useUnsavedLeaveGuard(dirty, saving);
    const searching = query.trim().length > 0;
    const countryEntry = country ? index.resolve(country) : null;

    const rows: Row[] = useMemo(() => {
        if (searching) {
            return index.search(query).map((entry) => ({
                kind: "entry" as const,
                entry,
                meta:
                    entry.code === entry.countryCode
                        ? undefined
                        : index.resolve(entry.countryCode)?.name,
            }));
        }
        if (countryEntry) {
            return [
                { kind: "self" as const, entry: countryEntry },
                ...index
                    .listSubdivisions(countryEntry.code)
                    .map((entry) => ({ kind: "entry" as const, entry })),
            ];
        }
        return [
            { kind: "unset" as const },
            ...index
                .listCountries()
                .map((entry) => ({ kind: "entry" as const, entry })),
        ];
    }, [countryEntry, index, query, searching]);

    const choose = (next: Selection) => {
        setSelection(next);
        setError(null);
    };

    const onRowPress = (row: Row) => {
        if (row.kind === "unset") return choose(null);
        const { entry } = row;
        if (row.kind === "entry" && !searching && !country && entry.hasChildren) {
            setCountry(entry.code);
            return;
        }
        choose({ code: entry.code, label: entry.label });
    };

    const submit = async () => {
        if (!dirty || saving) return;
        setError(null);
        const outcome = await save({
            region: selection
                ? {
                      code: selection.code,
                      label: selection.label,
                      version: index.version,
                  }
                : null,
        });
        if (outcome.status === "saved") {
            banner.show({ title: "已保存", type: "success" });
            guard.leaveAfterSave();
            return;
        }
        setError(outcome.message);
    };

    if (loading || !user) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载地区"
                    color={colors.primary}
                />
            </Screen>
        );
    }

    return (
        <Screen className="bg-app-background">
            <View className="w-full max-w-[560px] flex-1 self-center px-4">
                <PageHeader
                    title="设置地区"
                    backLabel="返回个人资料"
                    onBack={guard.goBack}
                />
                <Input
                    accessibilityLabel="搜索地区"
                    containerClassName="mt-4"
                    placeholder="搜索国家或省州"
                    value={query}
                    onChangeText={setQuery}
                    clearable
                    returnKeyType="search"
                    leading={<Search size={20} color={colors.textMuted} />}
                />

                {!searching && countryEntry ? (
                    <View className="mt-3 min-h-11 flex-row items-center">
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="返回全部国家和地区"
                            hitSlop={{ top: 12, bottom: 12 }}
                            onPress={() => setCountry(null)}
                            className="active:opacity-[0.85]"
                        >
                            <Text className="text-sm text-primary">全部</Text>
                        </Pressable>
                        <ChevronRight size={14} color={colors.textMuted} />
                        <Text
                            className="text-text-primary min-w-0 flex-1 text-sm"
                            numberOfLines={1}
                        >
                            {countryEntry.name}
                        </Text>
                    </View>
                ) : null}

                {staleLabel ? (
                    <Text className="mt-3 text-sm leading-5 text-hyper-text-secondary">
                        原地区「{staleLabel}」已调整，请重新选择
                    </Text>
                ) : null}

                <Card
                    className="mt-3 flex-1 overflow-hidden rounded-hyper-card"
                    style={cardStyle}
                >
                    <FlatList
                        data={rows}
                        keyExtractor={rowKey}
                        keyboardShouldPersistTaps="handled"
                        initialNumToRender={20}
                        ItemSeparatorComponent={RowSeparator}
                        ListEmptyComponent={
                            <Text className="py-6 text-center text-sm text-hyper-text-secondary">
                                没有找到匹配的地区
                            </Text>
                        }
                        renderItem={({ item }) =>
                            item.kind === "unset" ? (
                                <RegionListRow
                                    title="不设置"
                                    selected={selection === null}
                                    navigable={false}
                                    onPress={() => onRowPress(item)}
                                />
                            ) : (
                                <RegionListRow
                                    title={
                                        item.kind === "self"
                                            ? `选择「${item.entry.name}」，不再细分`
                                            : item.entry.name
                                    }
                                    meta={item.kind === "entry" ? item.meta : undefined}
                                    selected={selection?.code === item.entry.code}
                                    navigable={
                                        item.kind === "entry" &&
                                        !searching &&
                                        !country &&
                                        item.entry.hasChildren
                                    }
                                    onPress={() => onRowPress(item)}
                                />
                            )
                        }
                    />
                </Card>
            </View>

            <View
                className="w-full max-w-[560px] self-center px-4 pt-3"
                style={{ paddingBottom: insets.bottom + 16 }}
            >
                <Text
                    className="text-[13px] text-hyper-text-secondary"
                    numberOfLines={1}
                >
                    已选：{selection?.label ?? "不设置"}
                </Text>
                {error ? (
                    <Text
                        accessibilityRole="alert"
                        className="mt-2 text-sm text-hyper-error"
                    >
                        {error}
                    </Text>
                ) : null}
                <AppButton
                    label="保存"
                    loading={saving}
                    loadingLabel="保存中…"
                    disabled={!dirty}
                    className="mt-2"
                    onPress={() => void submit()}
                />
            </View>

            <UnsavedProfileDialog
                visible={guard.confirmVisible}
                onDiscard={guard.discardAndLeave}
                onContinue={guard.continueEditing}
            />
        </Screen>
    );
}
