import { useApplicationDatabase } from "@/core/database";
import { router } from "expo-router";
import { useCallback } from "react";
import { listNewNoteDrafts } from "../data/new-note-draft.repository";
import { DraftManagerDialog } from "./draft-manager-dialog";

/** 笔记页草稿箱：草稿选择弹窗（DraftManagerDialog）的浏览态封装，主操作为跳转编辑器。 */
export default function DraftListModal({
    owner,
    onClose,
}: {
    owner: number;
    onClose: () => void;
}) {
    const db = useApplicationDatabase();
    const load = useCallback(() => listNewNoteDrafts(db, owner), [db, owner]);
    const openEditor = (key: string) => {
        onClose();
        router.push({
            pathname: "/pages/note/create",
            params: { draftKey: key },
        });
    };
    return (
        <DraftManagerDialog
            db={db}
            owner={owner}
            visible
            onClose={onClose}
            title={() => "草稿箱"}
            load={load}
            primaryLabel="进入编辑"
            onPrimary={openEditor}
            secondaryLabel="关闭"
            onSecondary={onClose}
        />
    );
}
