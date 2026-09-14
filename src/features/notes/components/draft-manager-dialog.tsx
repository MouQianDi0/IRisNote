import type { ApplicationDatabase } from "@/core/database";
import { CloudOff, Trash2, Inbox } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "@/shared/theme";
import { InlineHint } from "@/shared/ui";
import { deleteNewNoteDrafts, type DraftDeleteResult, type DraftEntry } from "../data/new-note-draft.repository";
import { DialogButton, DraftChoices, DraftDeleteChoices, DraftDialog } from "./editor/draft-dialog";

/**
 * 草稿选择弹窗的唯一实现：笔记页草稿箱与新建笔记编辑器共用。
 * 浏览态默认无选中、限单选（再点已选行取消）；垃圾桶切换到删除模式，
 * 浏览态的选中项带入为默认勾选，退出删除模式回到草稿箱时一律无选中。
 * 删除态保留 2 秒旋转倒计时，期间任何交互打断即取消且勾选保留。
 * 加载/错误重试/空态全部收敛在这里，调用方只提供数据读取与动作回调。
 */

/** 删除草稿入口：弹窗标题行右侧垃圾桶（28dp 触控区、图标 20dp），浏览态始终可点。 */
function DeleteDraftsEntry({ onPress }: { onPress: () => void }) {
    return <Pressable
        accessibilityRole="button"
        accessibilityLabel="删除草稿"
        onPress={onPress}
        className="h-7 w-7 shrink-0 items-center justify-center rounded-full"
    >
        <Trash2 size={20} color={colors.hyperTextSecondary} />
    </Pressable>;
}

function deleteMessage(result: DraftDeleteResult, entries: readonly DraftEntry[]) {
    if (!result.failed.length) return "";
    const summary = `已删除 ${result.deleted.length} 份，${result.failed.length} 份未完成。请核对列表后重新选择。`;
    const details = result.failed.map((item) => {
        const title = entries.find((entry) => entry.key === item.key)?.row.title.trim() || "无标题草稿";
        return `${title}：${item.message}`;
    }).join("；");
    return summary + details;
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

export function DraftManagerDialog({ db, owner, visible, onClose, title, load, primaryLabel, onPrimary,
    primaryDisabled = false, primaryHint, secondaryLabel, onSecondary, externalError = "" }: Props) {
    const [entries, setEntries] = useState<DraftEntry[]>([]);
    // 浏览态单选：undefined = 无选中（打开弹窗的默认状态）。
    const [selected, setSelected] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
    // 二次确认弹窗已移除：点击「确认删除」后播放 2 秒旋转动画再执行，期间任何交互打断即取消。
    const [counting, setCounting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const deletingRef = useRef(false);
    const countdown = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (countdown.current) clearTimeout(countdown.current); }, []);

    useEffect(() => {
        if (!visible) return;
        let alive = true;
        // setState 放进微任务回调，避免在 effect 体内同步触发级联渲染（react-hooks/set-state-in-effect）。
        void Promise.resolve().then(() => {
            if (!alive) return;
            setLoading(true);
            setError("");
            // 每次打开或刷新列表都回到无选中的浏览态，不做默认选中。
            setSelected(undefined);
            setDeleting(false);
            setChecked(new Set());
            load().then((items) => {
                if (!alive) return;
                setEntries(items);
            }).catch(() => { if (alive) setError("读取草稿失败，原内容已保留，请重试"); })
                .finally(() => { if (alive) setLoading(false); });
        });
        return () => { alive = false; };
    }, [visible, load, reload]);

    // 单选语义：点已选行 = 取消选中，点其他行 = 切换选中。
    const selectEntry = (key: string) => setSelected((previous) => previous === key ? undefined : key);

    const toggleChecked = (key: string) => setChecked((previous) => {
        if (deletingRef.current) return previous;
        const next = new Set(previous);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const confirm = async () => {
        if (deletingRef.current || loading || error || checked.size === 0) return;
        deletingRef.current = true;
        setBusy(true);
        setMessage("");
        try {
            const result = await deleteNewNoteDrafts(db, owner, entries.filter((entry) => checked.has(entry.key)));
            setMessage(deleteMessage(result, entries));
        } catch {
            setMessage("删除未完成，请刷新列表核对后重试");
        } finally {
            deletingRef.current = false;
            setBusy(false);
            setDeleting(false);
            setChecked(new Set());
            setError("");
            setReload((n) => n + 1);
        }
    };

    const cancelCountdown = () => {
        if (countdown.current) { clearTimeout(countdown.current); countdown.current = null; }
        setCounting(false);
    };

    const startCountdown = () => {
        if (counting || busy || loading || error || checked.size === 0) return;
        setCounting(true);
        countdown.current = setTimeout(() => {
            countdown.current = null;
            setCounting(false);
            void confirm();
        }, 2000);
    };

    // 进入删除模式：浏览态选中项带入为默认勾选，浏览态选中随即清空。
    const enterDeleting = () => {
        if (deletingRef.current) return;
        setMessage("");
        setChecked(new Set(selected ? [selected] : []));
        setSelected(undefined);
        setDeleting(true);
    };

    // 退出删除模式：勾选清空，回到草稿箱时浏览态无选中。
    const exitDeleting = () => {
        cancelCountdown();
        if (deletingRef.current) return;
        setDeleting(false);
        setChecked(new Set());
    };

    const listReady = !loading && !error && entries.length > 0;
    return <DraftDialog
        visible={visible}
        title={deleting ? "选择要删除的草稿" : title(entries.length)}
        leading={<Inbox size={24} color={colors.textPrimary} />}
        onClose={() => {
            // 倒计时中点遮罩/返回键只打断删除，不关闭弹窗。
            if (counting) { cancelCountdown(); return; }
            if (busy) return;
            if (deleting) { exitDeleting(); return; }
            onClose();
        }}
        headerExtra={listReady && !deleting ? <DeleteDraftsEntry onPress={enterDeleting} /> : undefined}
    >
        {loading
            ? <ActivityIndicator className="my-8" color={colors.primary} />
            : deleting
                ? <DraftDeleteChoices entries={entries} checked={checked}
                    onToggle={(key) => { cancelCountdown(); toggleChecked(key); }} />
                : <DraftChoices entries={entries} selected={selected} onSelect={selectEntry} />}
        {!loading && !error && entries.length === 0 && (
            <View className="my-6 items-center gap-2">
                <Inbox size={28} color={colors.hyperTextSecondary} />
                <Text className="text-sm text-hyper-text-secondary">暂无草稿</Text>
            </View>
        )}
        {!!error && (
            <View className="my-4 items-center gap-1">
                <Text accessibilityRole="alert" className="text-sm text-hyper-error">{error}</Text>
                <DialogButton variant="text" label="重试" onPress={() => { setError(""); setLoading(true); setReload((n) => n + 1); }} />
            </View>
        )}
        {!!message && <Text accessibilityRole="alert" className="my-3 text-sm text-hyper-error">{message}</Text>}
        {deleting
            ? <InlineHint icon={Trash2} message="删除草稿不可恢复" tone="important" className="mt-3" />
            : <InlineHint icon={CloudOff} message="草稿仅本机保存，不会同步到云端。" className="mt-3" />}
        {!deleting && primaryHint && (
            <Text numberOfLines={1} className="mt-3 text-[13px] leading-[18px] text-hyper-text-secondary">{primaryHint}</Text>
        )}
        {!deleting && !!externalError && (
            <Text accessibilityRole="alert" numberOfLines={1} className="mt-3 text-sm text-hyper-error">{externalError}</Text>
        )}
        <View className="mt-3 flex-row gap-2.5">
            {deleting ? (
                <>
                    <DialogButton variant="secondary" className="flex-1" label="退出删除" disabled={busy} onPress={exitDeleting} />
                    <DialogButton
                        variant="danger"
                        className="flex-1"
                        label={counting || busy ? "删除中…" : "确认删除"}
                        leading={counting || busy ? <ActivityIndicator size="small" color="white" /> : undefined}
                        disabled={!counting && (busy || loading || !!error || checked.size === 0)}
                        onPress={() => { if (counting) cancelCountdown(); else startCountdown(); }}
                    />
                </>
            ) : (
                <>
                    <DialogButton variant="secondary" className="flex-1" label={secondaryLabel} onPress={onSecondary} />
                    {entries.length > 0 && <DialogButton className="flex-1" label={primaryLabel}
                        disabled={loading || !!error || !selected || primaryDisabled}
                        onPress={() => { if (selected) onPrimary(selected); }} />}
                </>
            )}
        </View>
    </DraftDialog>;
}
