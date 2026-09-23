import type { ApplicationDatabase } from "@/core/database";
import { CloudOff, Trash2, Inbox } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "@/shared/theme";
import { InlineHint } from "@/shared/ui";
import type { DraftEntry } from "../data/new-note-draft.repository";
import { useDraftManager } from "../hooks/use-draft-manager";
import {
    DialogButton,
    DraftChoices,
    DraftDeleteChoices,
    DraftDialog,
} from "./editor/draft-dialog";

/**
 * 草稿选择弹窗的唯一实现：笔记页草稿箱与新建笔记编辑器共用。
 * 浏览态默认无选中、限单选（再点已选行取消）；垃圾桶切换到删除模式，
 * 浏览态的选中项带入为默认勾选，退出删除模式回到草稿箱时一律无选中。
 * 删除态保留 2 秒旋转倒计时，期间任何交互打断即取消且勾选保留。
 * 状态与操作由 useDraftManager 统一管理，本组件保留原弹窗布局。
 */

/** 删除草稿入口：弹窗标题行右侧垃圾桶（28dp 触控区、图标 20dp），浏览态始终可点。 */
function DeleteDraftsEntry({ onPress }: { onPress: () => void }) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="删除草稿"
            onPress={onPress}
            className="h-7 w-7 shrink-0 items-center justify-center rounded-full"
        >
            <Trash2 size={20} color={colors.hyperTextSecondary} />
        </Pressable>
    );
}

type Props = {
    db: ApplicationDatabase;
    owner: number;
    visible: boolean;
    onClose: () => void;
    /** 浏览态标题（参数为当前草稿数）；删除态固定为「选择要删除的草稿」。 */
    title: (count: number) => string;
    /** 弹窗打开、重试与删除完成后重新读取草稿列表。 */
    load: () => Promise<DraftEntry[]>;
    primaryLabel: string;
    onPrimary: (key: string) => void;
    /** 主操作附加禁用条件（如编辑器已有输入），禁用时在页脚上方展示 primaryHint。 */
    primaryDisabled?: boolean;
    primaryHint?: string | null;
    secondaryLabel: string;
    onSecondary: () => void;
    /** 调用方自己的错误（如恢复失败），随弹窗错误区展示，仅浏览态。 */
    externalError?: string;
};

export function DraftManagerDialog({
    db,
    owner,
    visible,
    onClose,
    title,
    load,
    primaryLabel,
    onPrimary,
    primaryDisabled = false,
    primaryHint,
    secondaryLabel,
    onSecondary,
    externalError = "",
}: Props) {
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
        listReady,
        selectEntry,
        toggleChecked,
        cancelCountdown,
        startCountdown,
        enterDeleting,
        exitDeleting,
        handleBack,
        retry,
    } = useDraftManager({ db, owner, visible, load });
    return (
        <DraftDialog
            visible={visible}
            title={deleting ? "选择要删除的草稿" : title(entries.length)}
            leading={<Inbox size={24} color={colors.textPrimary} />}
            onClose={() => {
                if (!handleBack()) onClose();
            }}
            headerExtra={
                listReady && !deleting ? (
                    <DeleteDraftsEntry onPress={enterDeleting} />
                ) : undefined
            }
        >
            {loading ? (
                <ActivityIndicator className="my-8" color={colors.primary} />
            ) : deleting ? (
                <DraftDeleteChoices
                    entries={entries}
                    checked={checked}
                    onToggle={(key) => {
                        cancelCountdown();
                        toggleChecked(key);
                    }}
                />
            ) : (
                <DraftChoices
                    entries={entries}
                    selected={selected}
                    onSelect={selectEntry}
                />
            )}
            {!loading && !error && entries.length === 0 && (
                <View className="my-6 items-center gap-2">
                    <Inbox size={28} color={colors.hyperTextSecondary} />
                    <Text className="text-sm text-hyper-text-secondary">
                        暂无草稿
                    </Text>
                </View>
            )}
            {!!error && (
                <View className="my-4 items-center gap-1">
                    <Text
                        accessibilityRole="alert"
                        className="text-sm text-hyper-error"
                    >
                        {error}
                    </Text>
                    <DialogButton variant="text" label="重试" onPress={retry} />
                </View>
            )}
            {!!message && (
                <Text
                    accessibilityRole="alert"
                    className="my-3 text-sm text-hyper-error"
                >
                    {message}
                </Text>
            )}
            {deleting ? (
                <InlineHint
                    icon={Trash2}
                    message="删除草稿不可恢复"
                    tone="important"
                    className="mt-3"
                />
            ) : (
                <InlineHint
                    icon={CloudOff}
                    message="草稿仅本机保存，不会同步到云端。"
                    className="mt-3"
                />
            )}
            {!deleting && primaryHint && (
                <Text
                    numberOfLines={1}
                    className="mt-3 text-[13px] leading-[18px] text-hyper-text-secondary"
                >
                    {primaryHint}
                </Text>
            )}
            {!deleting && !!externalError && (
                <Text
                    accessibilityRole="alert"
                    numberOfLines={1}
                    className="mt-3 text-sm text-hyper-error"
                >
                    {externalError}
                </Text>
            )}
            <View className="mt-3 flex-row gap-2.5">
                {deleting ? (
                    <>
                        <DialogButton
                            variant="secondary"
                            className="flex-1"
                            label="退出删除"
                            disabled={busy}
                            onPress={exitDeleting}
                        />
                        <DialogButton
                            variant="danger"
                            className="flex-1"
                            label={counting || busy ? "删除中…" : "确认删除"}
                            leading={
                                counting || busy ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="white"
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
                            onPress={() => {
                                if (counting) cancelCountdown();
                                else startCountdown();
                            }}
                        />
                    </>
                ) : (
                    <>
                        <DialogButton
                            variant="secondary"
                            className="flex-1"
                            label={secondaryLabel}
                            onPress={onSecondary}
                        />
                        {entries.length > 0 && (
                            <DialogButton
                                className="flex-1"
                                label={primaryLabel}
                                disabled={
                                    loading ||
                                    !!error ||
                                    !selected ||
                                    primaryDisabled
                                }
                                onPress={() => {
                                    if (selected) onPrimary(selected);
                                }}
                            />
                        )}
                    </>
                )}
            </View>
        </DraftDialog>
    );
}
