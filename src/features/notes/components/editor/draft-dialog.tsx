import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { Check } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { colors } from "@/shared/theme";
import type { DraftEntry } from "../../data/new-note-draft.repository";
import {
    dialogButtonLabelStyles,
    dialogButtonStyles,
    dialogCard,
    dialogScrim,
    dialogTitle,
    draftRowStyles,
    draftSummaryStyles,
    draftTitleStyles,
    type DialogButtonVariant,
} from "./draft-dialog.styles";

export function DraftDialog({ visible, title, onClose, children, headerExtra, leading, closeOnScrimTap = true }: {
    visible: boolean; title: string; onClose: () => void; children: ReactNode;
    headerExtra?: ReactNode; leading?: ReactNode; closeOnScrimTap?: boolean;
}) {
    return <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View
            className={dialogScrim}
            onStartShouldSetResponder={closeOnScrimTap ? () => true : undefined}
            onResponderRelease={closeOnScrimTap ? onClose : undefined}
        >
            <View accessibilityViewIsModal className={dialogCard} onStartShouldSetResponder={() => true}>
                <View className="mb-3 flex-row items-center justify-between gap-3">
                    {leading}
                    <Text accessibilityRole="header" className={dialogTitle}>{title}</Text>
                    {headerExtra}
                </View>
                {children}
            </View>
        </View>
    </AppModal>;
}

/**
 * HyperOS 弹窗按钮。只接收 label 字符串，由内部渲染文字，
 * 避免原生按钮直接使用字符串 children 的渲染问题。
 * 交互态：按压整体 opacity 0.85；禁用为显式浅色 token 配色（规格 §6.1）。
 * leading：label 左侧的图标位（如删除倒计时的旋转圈），与文字间距 8dp。
 */
export function DialogButton({ label, variant = "primary", disabled = false, onPress, className, leading }: {
    label: string; variant?: DialogButtonVariant; disabled?: boolean; onPress: () => void; className?: string;
    leading?: ReactNode;
}) {
    const [pressed, setPressed] = useState(false);
    return <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        // 显式 dp 高度：h-12 类经 rem 换算在真机上渲染约 42dp，与原生 48dp 按钮不等高。
        style={{ height: variant === "text" ? 44 : 48 }}
        className={dialogButtonStyles({ variant, disabled, pressed, class: className })}
    >
        <View className="flex-row items-center gap-2">
            {leading}
            <Text numberOfLines={1} className={dialogButtonLabelStyles({ variant, disabled })}>{label}</Text>
        </View>
    </Pressable>;
}

function draftSummary(entry: DraftEntry) {
    const title = entry.row.title.trim() || "未命名草稿";
    const summary = `${entry.kind === "saved" ? "主动保存的草稿" : "自动恢复内容"} · ${new Date(entry.row.updated_at).toLocaleString()}`;
    return { title, summary };
}

/**
 * 浏览态单选列表：默认无选中；点行选中、再点已选行取消（取消/切换由 onSelect
 * 调用方处理）。选中行极浅蓝底 + 标题与摘要主色 + 行尾打勾（规格 §5）。
 */
export function DraftChoices({ entries, selected, onSelect, busy }: {
    entries: DraftEntry[]; selected?: string; onSelect: (key: string) => void; busy?: boolean;
}) {
    // 圆角与底色放在滚动视口的裁切容器上：内容超限时在圆角内滚动，
    // 容器 4 个圆角恒在；300 ≈ 3.7 行（每行约 80dp），半行露出提示可滚动。
    return <View className="overflow-hidden rounded-hyper-card bg-hyper-list">
        <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
            {entries.map((entry) => {
                const { title, summary } = draftSummary(entry);
                const isSelected = selected === entry.key;
                return <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}，${summary}`}
                    accessibilityState={{ selected: isSelected, disabled: !!busy }}
                    disabled={busy}
                    onPress={() => onSelect(entry.key)}
                    className={draftRowStyles({ selected: isSelected })}
                >
                    <View className="flex-1">
                        <Text className={draftTitleStyles({ tone: isSelected ? "selected" : "default" })} numberOfLines={1}>{title}</Text>
                        <Text className={draftSummaryStyles({ tone: isSelected ? "selected" : "default" })} numberOfLines={1}>{summary}</Text>
                    </View>
                    {isSelected && <Check size={20} color={colors.primary} />}
                </Pressable>;
            })}
        </ScrollView>
    </View>;
}

/** 删除态多选列表：勾选行标题与打勾变错误红，不加底色（规格 §5 删除态）。 */
export function DraftDeleteChoices({ entries, checked, onToggle }: {
    entries: DraftEntry[]; checked: ReadonlySet<string>; onToggle: (key: string) => void;
}) {
    return <View className="overflow-hidden rounded-hyper-card bg-hyper-list">
        <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
            {entries.map((entry) => {
                const { title, summary } = draftSummary(entry);
                const isChecked = checked.has(entry.key);
                return <Pressable
                    key={entry.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${title}，${summary}`}
                    accessibilityState={{ selected: isChecked }}
                    onPress={() => onToggle(entry.key)}
                    className={draftRowStyles({ selected: false })}
                >
                    <View className="flex-1">
                        <Text className={draftTitleStyles({ tone: isChecked ? "danger" : "default" })} numberOfLines={1}>{title}</Text>
                        <Text className={draftSummaryStyles({ tone: isChecked ? "danger" : "default" })} numberOfLines={1}>{summary}</Text>
                    </View>
                    {isChecked && <Check size={20} color={colors.hyperError} />}
                </Pressable>;
            })}
        </ScrollView>
    </View>;
}
