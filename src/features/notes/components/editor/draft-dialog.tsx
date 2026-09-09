import { AppModal } from "@/shared/ui/Overlay/app-modal";
import { LocalOnlyText } from "@/shared/ui/local-only-text";
import { Button, Column, Host } from "@expo/ui";
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import type { DraftEntry } from "../../data/new-note-draft.repository";

export function DraftDialog({ visible, title, onClose, children }: {
    visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
    return <AppModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.4)", padding: 24 }}>
            <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 440, maxHeight: "85%", padding: 20, borderRadius: 20, backgroundColor: "white" }}>
                <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "600", marginBottom: 12 }}>{title}</Text>
                {children}
            </View>
        </View>
    </AppModal>;
}

export function DraftChoices({ entries, selected, onSelect, busy }: {
    entries: DraftEntry[]; selected?: string; onSelect: (key: string) => void; busy?: boolean;
}) {
    return <ScrollView style={{ maxHeight: 280 }}>
        <Host matchContents><Column spacing={8}>
            {entries.map((entry) => <Button key={entry.key} disabled={busy}
                variant={selected === entry.key ? "filled" : "outlined"}
                label={`${selected === entry.key ? "✓ " : ""}${entry.row.title.trim() || "未命名草稿"}\n${entry.kind === "saved" ? "主动保存的草稿" : "自动恢复内容"} · ${new Date(entry.row.updated_at).toLocaleString()}`}
                onPress={() => onSelect(entry.key)} />)}
        </Column></Host>
    </ScrollView>;
}

export function DraftLocalNotice() {
    return <Text style={{ fontSize: 14, color: "#555", marginVertical: 12 }}><LocalOnlyText>草稿和恢复内容仅本机保存，不会同步到云端。</LocalOnlyText></Text>;
}
