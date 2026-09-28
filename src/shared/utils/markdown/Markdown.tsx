import { colors } from "@/shared/theme";
import { memo, useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import {
    parseMarkdown,
    parseMarkdownInline,
    type MarkdownOptions,
} from "./parse-markdown";

function InlineMarkdown({ text }: { text: string }) {
    return parseMarkdownInline(text).map((span, index) => (
        <Text
            key={index}
            style={
                span.kind === "strong"
                    ? styles.strong
                    : span.kind === "code"
                      ? styles.code
                      : undefined
            }
        >
            {span.text}
        </Text>
    ));
}

export type MarkdownProps = {
    source: string;
    options?: MarkdownOptions;
};

/** Lightweight Markdown subset. Does not fetch links or render HTML/images. */
export const Markdown = memo(function Markdown({
    source,
    options,
}: MarkdownProps) {
    const blocks = useMemo(
        () => parseMarkdown(source, options),
        [source, options],
    );
    return (
        <View style={styles.content}>
            {blocks.map((block, index) => {
                if (block.kind === "item") {
                    return (
                        <View key={index} style={styles.item}>
                            <Text style={[styles.body, styles.marker]}>
                                {block.marker}
                            </Text>
                            <Text style={[styles.body, styles.itemText]}>
                                <InlineMarkdown text={block.text} />
                            </Text>
                        </View>
                    );
                }
                return (
                    <Text
                        key={index}
                        accessibilityRole={
                            block.kind === "heading" ? "header" : undefined
                        }
                        style={[
                            styles.body,
                            block.kind === "heading" && styles.heading,
                            block.kind === "heading" &&
                                block.level === 1 &&
                                styles.largeHeading,
                        ]}
                    >
                        {block.kind === "literal" ? (
                            block.text
                        ) : (
                            <InlineMarkdown text={block.text} />
                        )}
                    </Text>
                );
            })}
        </View>
    );
});

const styles = StyleSheet.create({
    content: { gap: 8, paddingBottom: 4 },
    body: { color: colors.textPrimary, fontSize: 16, lineHeight: 25 },
    heading: { fontSize: 17, lineHeight: 26, fontWeight: "600", marginTop: 8 },
    largeHeading: { fontSize: 19, lineHeight: 28 },
    strong: { fontWeight: "600" },
    code: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        backgroundColor: colors.surfaceMuted,
    },
    item: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    marker: { minWidth: 16 },
    itemText: { flex: 1, minWidth: 0 },
});
