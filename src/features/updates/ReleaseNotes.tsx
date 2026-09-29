import { colors } from "@/shared/theme";
import { Markdown } from "@/shared/utils/markdown";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { releaseNotesMarkdownOptions } from "./release-notes";

export const ReleaseNotes = memo(function ReleaseNotes({
    notes,
}: {
    notes: string;
}) {
    return (
        <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.label}>
                本次更新
            </Text>
            {notes.trim() ? (
                <Markdown
                    source={notes}
                    options={releaseNotesMarkdownOptions}
                />
            ) : (
                <Text style={styles.body}>暂无更新说明。</Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create({
    content: { gap: 8 },
    label: { fontSize: 13, lineHeight: 20, color: colors.textSecondary },
    body: { color: colors.textPrimary, fontSize: 16, lineHeight: 25 },
});
