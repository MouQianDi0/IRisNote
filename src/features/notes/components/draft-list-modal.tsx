import { useApplicationDatabase } from "@/core/database";
import { Button, Column, Host } from "@expo/ui";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { listNewNoteDrafts, type DraftEntry } from "../data/new-note-draft.repository";
import { DraftChoices, DraftDialog, DraftLocalNotice } from "./editor/draft-dialog";

export default function DraftListModal({ owner, onClose }: { owner: number; onClose: () => void }) {
    const db = useApplicationDatabase();
    const [entries, setEntries] = useState<DraftEntry[]>([]);
    const [selected, setSelected] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reload, setReload] = useState(0);
    useEffect(() => {
        let active = true;
        void listNewNoteDrafts(db, owner).then((items) => {
            if (active) { setEntries(items); setSelected(items[0]?.key); }
        }).catch(() => { if (active) setError("读取草稿失败，原内容已保留，请重试"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [db, owner, reload]);
    return <DraftDialog visible title="草稿" onClose={onClose}>
        <DraftLocalNotice />
        {loading ? <ActivityIndicator /> : <DraftChoices entries={entries} selected={selected} onSelect={setSelected} />}
        {!loading && !error && entries.length === 0 && <Text style={{ marginBottom: 16 }}>暂无草稿</Text>}
        {!!error && <Text accessibilityRole="alert">{error}</Text>}
        <Host matchContents><Column spacing={8}>
            {!!error && <Button label="重试" onPress={() => { setError(""); setLoading(true); setReload((n) => n + 1); }} />}
            {!!selected && <Button label="继续编辑" disabled={loading} onPress={() => {
                onClose(); router.push({ pathname: "/pages/note/create", params: { draftKey: selected } });
            }} />}
            <Button label="关闭" variant="text" onPress={onClose} />
        </Column></Host>
    </DraftDialog>;
}
