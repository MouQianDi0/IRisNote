import {
    DEFAULT_NOTE_STATISTICS_OPTIONS,
    getCachedNoteTextStatistics,
    type NoteStatisticsOptions,
    type NoteTextStatistics,
} from "../../hooks/noteTextLength";
import { colors } from "@/shared/theme";
import { AnchoredPopover } from "@/shared/ui";
import {
    ChevronLeft,
    ChevronRight,
    Settings2,
    X,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    Pressable,
    ScrollView,
    Switch,
    Text,
    View,
    type TextStyle,
} from "react-native";

type StatisticsMenuLevel = "summary" | "composition" | "settings";

type NoteStatisticsPopoverProps = {
    noteId: number;
    content: string | null;
    trigger?: ReactNode;
};

type StatisticsRowProps = {
    label: string;
    value: string;
    emphasized?: boolean;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const tabularNumberStyle: TextStyle = { fontVariant: ["tabular-nums"] };
const OPEN_COOLDOWN_MS = 300;

const formatNumber = (value: number) => numberFormatter.format(value);

const formatReadingTime = (statistics: NoteTextStatistics) => {
    if (statistics.totalCharacters === 0) return "0 分钟";
    if (statistics.readingTimeMinutes < 1) return "少于 1 分钟";
    return `约 ${Math.ceil(statistics.readingTimeMinutes)} 分钟`;
};

function StatisticsRow({
    label,
    value,
    emphasized = false,
}: StatisticsRowProps) {
    return (
        <View className="flex-row items-center justify-between gap-4">
            <Text selectable className="flex-1 text-[13px] text-gray-500">
                {label}
            </Text>
            <Text
                selectable
                style={tabularNumberStyle}
                className={
                    emphasized
                        ? "text-[17px] font-semibold text-blue-500"
                        : "text-[13px] font-medium text-gray-800"
                }
            >
                {value}
            </Text>
        </View>
    );
}

function MenuHeader({
    title,
    canGoBack,
    onBack,
    onClose,
}: {
    title: string;
    canGoBack: boolean;
    onBack: () => void;
    onClose: () => void;
}) {
    return (
        <View className="flex-row items-center justify-between">
            {canGoBack ? (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="返回统计摘要"
                    onPress={onBack}
                    className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
                >
                    <ChevronLeft size={18} color={colors.textSecondary} />
                </Pressable>
            ) : (
                <View className="h-8 w-8" />
            )}

            <Text className="text-[16px] font-semibold text-gray-800">
                {title}
            </Text>

            <Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭统计详情"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted"
            >
                <X size={17} color={colors.textSecondary} />
            </Pressable>
        </View>
    );
}

function NavigationRow({
    label,
    icon,
    onPress,
}: {
    label: string;
    icon?: "settings";
    onPress: () => void;
}) {
    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            className="flex-row items-center justify-between rounded-control bg-surface-muted px-3 py-3"
        >
            <View className="flex-row items-center gap-2">
                {icon === "settings" && (
                    <Settings2 size={17} color={colors.textSecondary} />
                )}
                <Text className="text-[13px] font-medium text-gray-700">
                    {label}
                </Text>
            </View>
            <ChevronRight size={17} color={colors.textMuted} />
        </Pressable>
    );
}

function OptionRow({
    label,
    description,
    value,
    onValueChange,
}: {
    label: string;
    description: string;
    value: boolean;
    onValueChange: (nextValue: boolean) => void;
}) {
    return (
        <View className="flex-row items-center gap-3 rounded-control bg-surface-muted px-3 py-3">
            <View className="flex-1 gap-1">
                <Text className="text-[13px] font-medium text-gray-800">
                    {label}
                </Text>
                <Text className="text-[11px] leading-4 text-gray-400">
                    {description}
                </Text>
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{
                    false: colors.categoryButton,
                    true: colors.primary,
                }}
            />
        </View>
    );
}

export default function NoteStatisticsPopover({
    noteId,
    content,
    trigger,
}: NoteStatisticsPopoverProps) {
    const anchorRef = useRef<View>(null);
    const [visible, setVisible] = useState(false);
    const [openLocked, setOpenLocked] = useState(false);
    const openLockedRef = useRef(false);
    const closeStartedRef = useRef(false);
    const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [menuLevel, setMenuLevel] =
        useState<StatisticsMenuLevel>("summary");
    const [options, setOptions] = useState<NoteStatisticsOptions>(() => ({
        ...DEFAULT_NOTE_STATISTICS_OPTIONS,
    }));
    const statistics = useMemo(
        () => getCachedNoteTextStatistics(noteId, content, options),
        [content, noteId, options],
    );

    useEffect(
        () => () => {
            if (cooldownTimerRef.current !== null) {
                clearTimeout(cooldownTimerRef.current);
            }
        },
        [],
    );

    const handleOpen = () => {
        if (openLockedRef.current) return;

        openLockedRef.current = true;
        closeStartedRef.current = false;
        setOpenLocked(true);
        setMenuLevel("summary");
        setVisible(true);
    };

    const handleClose = () => {
        if (closeStartedRef.current) return;

        closeStartedRef.current = true;
        setVisible(false);
        setMenuLevel("summary");

        if (cooldownTimerRef.current !== null) {
            clearTimeout(cooldownTimerRef.current);
        }
        cooldownTimerRef.current = setTimeout(() => {
            cooldownTimerRef.current = null;
            openLockedRef.current = false;
            closeStartedRef.current = false;
            setOpenLocked(false);
        }, OPEN_COOLDOWN_MS);
    };

    const updateOption = (
        option: keyof NoteStatisticsOptions,
        nextValue: boolean,
    ) => {
        setOptions((currentOptions) => ({
            ...currentOptions,
            [option]: nextValue,
        }));
    };

    const chineseMetricLabel =
        statistics.chineseSegmentationMode === "word"
            ? "中文词汇数"
            : "中文字符数（兼容模式）";

    return (
        <>
            <Pressable
                ref={anchorRef}
                accessibilityRole="button"
                accessibilityLabel={`查看字数统计，共 ${statistics.totalCharacters} 个字符`}
                accessibilityState={{ disabled: openLocked, expanded: visible }}
                disabled={openLocked}
                onPress={handleOpen}
                className={trigger ? undefined : "rounded-full bg-blue-50 px-3 py-1"}
                hitSlop={trigger ? { top: 12, bottom: 12 } : undefined}
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
            >
                {trigger ?? <Text style={tabularNumberStyle} className="text-xs text-blue-500">
                    {formatNumber(statistics.totalCharacters)}字
                </Text>}
            </Pressable>

            <AnchoredPopover
                visible={visible}
                anchorRef={anchorRef}
                onClose={handleClose}
                width={320}
                maxHeight={540}
                accessibilityLabel="字数统计详情"
            >
                <ScrollView
                    style={{ maxHeight: 500 }}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    showsVerticalScrollIndicator={false}
                >
                    <MenuHeader
                        title={
                            menuLevel === "summary"
                                ? "统计详情"
                                : menuLevel === "composition"
                                  ? "内容构成"
                                  : "统计设置"
                        }
                        canGoBack={menuLevel !== "summary"}
                        onBack={() => setMenuLevel("summary")}
                        onClose={handleClose}
                    />

                    {menuLevel === "summary" && (
                        <>
                            <View className="gap-3 rounded-control bg-blue-50 px-4 py-4">
                                <StatisticsRow
                                    label="总字符数"
                                    value={`${formatNumber(statistics.totalCharacters)} 字符`}
                                    emphasized
                                />
                                <StatisticsRow
                                    label="有效正文"
                                    value={`${formatNumber(statistics.effectiveCharacters)} 字符`}
                                />
                            </View>

                            <View className="gap-3 px-1 py-1">
                                <StatisticsRow
                                    label={chineseMetricLabel}
                                    value={formatNumber(statistics.chineseWords)}
                                />
                                <StatisticsRow
                                    label="中文字符数"
                                    value={formatNumber(
                                        statistics.chineseCharacters,
                                    )}
                                />
                                <StatisticsRow
                                    label="英文单词数"
                                    value={formatNumber(statistics.englishWords)}
                                />
                                <StatisticsRow
                                    label="阅读时间"
                                    value={formatReadingTime(statistics)}
                                />
                            </View>

                            <NavigationRow
                                label="查看内容构成"
                                onPress={() => setMenuLevel("composition")}
                            />
                            <NavigationRow
                                label="统计设置"
                                icon="settings"
                                onPress={() => setMenuLevel("settings")}
                            />
                        </>
                    )}

                    {menuLevel === "composition" && (
                        <View className="gap-3">
                            <StatisticsRow
                                label="普通文本"
                                value={`${formatNumber(statistics.normalTextCharacters)} 字符`}
                            />
                            <StatisticsRow
                                label="链接"
                                value={`${formatNumber(statistics.links.count)} 个 · ${formatNumber(statistics.links.characters)} 字符`}
                            />
                            <StatisticsRow
                                label="链接实体"
                                value={`${formatNumber(statistics.linkEntities)} 个`}
                            />
                            <StatisticsRow
                                label="代码"
                                value={`${formatNumber(statistics.code.blockCount)} 块 · ${formatNumber(statistics.code.inlineCount)} 段`}
                            />
                            <StatisticsRow
                                label="代码字符"
                                value={`${formatNumber(statistics.code.characters)} 字符 · ${statistics.code.included ? "已包含" : "已排除"}`}
                            />
                            <StatisticsRow
                                label="Markdown 图片"
                                value={`${formatNumber(statistics.images.count)} 张`}
                            />
                            <StatisticsRow
                                label="表格"
                                value={`${formatNumber(statistics.tables.count)} 个 · ${formatNumber(statistics.tables.rows)} 行`}
                            />
                            <StatisticsRow
                                label="表格规模"
                                value={`最多 ${formatNumber(statistics.tables.maxColumns)} 列 · ${formatNumber(statistics.tables.characters)} 字符`}
                            />
                            <Text className="rounded-control bg-surface-muted px-3 py-3 text-[11px] leading-4 text-gray-400">
                                图片仅识别 Markdown 图片语法；当前笔记数据模型没有独立附件字段。
                            </Text>
                        </View>
                    )}

                    {menuLevel === "settings" && (
                        <View className="gap-3">
                            <OptionRow
                                label="包含代码"
                                description="影响有效正文、词数和阅读时间，不改变总字符数。"
                                value={options.includeCode}
                                onValueChange={(nextValue) =>
                                    updateOption("includeCode", nextValue)
                                }
                            />
                            <OptionRow
                                label="排除 Markdown 标记"
                                description="保留可读文字，但不把标题、列表和强调标记计入有效正文。"
                                value={options.excludeMarkdownSyntax}
                                onValueChange={(nextValue) =>
                                    updateOption(
                                        "excludeMarkdownSyntax",
                                        nextValue,
                                    )
                                }
                            />
                            <Text className="px-1 text-[11px] leading-4 text-gray-400">
                                设置会加入缓存键；切换设置不会覆盖其他统计结果。
                            </Text>
                        </View>
                    )}
                </ScrollView>
            </AnchoredPopover>
        </>
    );
}
