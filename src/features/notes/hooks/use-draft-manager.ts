import type { ApplicationDatabase } from "@/core/database";
import { captureNotificationSession } from "@/core/notifications";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
    deleteNewNoteDrafts,
    type DraftDeleteResult,
    type DraftEntry,
} from "../data/new-note-draft.repository";

function deleteMessage(
    result: DraftDeleteResult,
    entries: readonly DraftEntry[],
) {
    if (!result.failed.length) return "";
    const summary = `已删除 ${result.deleted.length} 份，${result.failed.length} 份未完成。请核对列表后重新选择。`;
    return (
        summary +
        result.failed
            .map((item) => {
                const title =
                    entries
                        .find((entry) => entry.key === item.key)
                        ?.row.title.trim() || "无标题草稿";
                return `${title}：${item.message}`;
            })
            .join("；")
    );
}

/** 页面与编辑器弹窗共用草稿选择、删除倒计时和失败恢复规则。 */
export function useDraftManager({
    db,
    owner,
    visible,
    load,
}: {
    db: ApplicationDatabase;
    owner: number;
    visible: boolean;
    load: () => Promise<DraftEntry[]>;
}) {
    const [entries, setEntries] = useState<DraftEntry[]>([]);
    const [selected, setSelected] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const [checked, setChecked] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const [counting, setCounting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const deletingRef = useRef(false);
    const countdown = useRef<ReturnType<typeof setTimeout> | null>(null);
    const current = useRef<() => boolean>(() => false);

    useEffect(() => {
        if (!visible) return;
        let alive = true;
        const sessionCurrent = captureNotificationSession();
        const valid = () => alive && sessionCurrent();
        current.current = valid;
        void Promise.resolve().then(async () => {
            if (!valid()) return;
            setLoading(true);
            setError("");
            setEntries([]);
            setSelected(undefined);
            setDeleting(false);
            setCounting(false);
            setChecked(new Set());
            try {
                const items = await load();
                if (valid()) setEntries(items);
            } catch {
                if (valid()) setError("读取草稿失败，原内容已保留，请重试");
            } finally {
                if (valid()) setLoading(false);
            }
        });
        return () => {
            alive = false;
            if (countdown.current) clearTimeout(countdown.current);
            countdown.current = null;
        };
    }, [visible, load, owner, reload]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (state) => {
            if (state === "active") return;
            if (countdown.current) clearTimeout(countdown.current);
            countdown.current = null;
            setCounting(false);
        });
        return () => subscription.remove();
    }, []);

    const cancelCountdown = () => {
        if (countdown.current) clearTimeout(countdown.current);
        countdown.current = null;
        setCounting(false);
    };
    const selectEntry = (key: string) => {
        if (!current.current() || deletingRef.current) return;
        setSelected((previous) => (previous === key ? undefined : key));
    };
    const toggleChecked = (key: string) => {
        cancelCountdown();
        if (!current.current() || deletingRef.current) return;
        setChecked((previous) => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };
    const confirm = async () => {
        const valid = current.current;
        if (
            !valid() ||
            deletingRef.current ||
            loading ||
            error ||
            checked.size === 0
        )
            return;
        deletingRef.current = true;
        setBusy(true);
        setMessage("");
        try {
            const result = await deleteNewNoteDrafts(
                db,
                owner,
                entries.filter((entry) => checked.has(entry.key)),
            );
            if (valid()) setMessage(deleteMessage(result, entries));
        } catch {
            if (valid()) setMessage("删除未完成，请刷新列表核对后重试");
        } finally {
            deletingRef.current = false;
            setBusy(false);
            // 即使弹窗在异步删除期间关闭，下一次打开也重新读取真实结果。
            setReload((value) => value + 1);
        }
    };
    const startCountdown = () => {
        if (
            !current.current() ||
            countdown.current ||
            deletingRef.current ||
            loading ||
            error ||
            checked.size === 0
        )
            return;
        setCounting(true);
        countdown.current = setTimeout(() => {
            countdown.current = null;
            setCounting(false);
            void confirm();
        }, 2000);
    };
    const enterDeleting = () => {
        if (
            !current.current() ||
            deletingRef.current ||
            loading ||
            error ||
            entries.length === 0
        )
            return;
        setMessage("");
        setChecked(new Set(selected ? [selected] : []));
        setSelected(undefined);
        setDeleting(true);
    };
    const exitDeleting = () => {
        cancelCountdown();
        if (deletingRef.current) return;
        setDeleting(false);
        setChecked(new Set());
    };
    const handleBack = () => {
        if (countdown.current) {
            cancelCountdown();
            return true;
        }
        if (deletingRef.current) return true;
        if (deleting) {
            exitDeleting();
            return true;
        }
        return false;
    };
    const retry = () => {
        if (deletingRef.current) return;
        cancelCountdown();
        setError("");
        setLoading(true);
        setReload((value) => value + 1);
    };

    return {
        entries,
        selected,
        loading,
        error,
        deleting,
        checked,
        counting,
        busy,
        message,
        listReady: !loading && !error && entries.length > 0,
        selectEntry,
        toggleChecked,
        cancelCountdown,
        startCountdown,
        enterDeleting,
        exitDeleting,
        handleBack,
        retry,
    };
}
