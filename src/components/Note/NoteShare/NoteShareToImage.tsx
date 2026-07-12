import { type ShareableNote } from "@/components/Note/NoteShare/CopyNoteToClipboard";
import { forwardRef } from "react";
import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

const TARGET_IMAGE_WIDTH = 1080;
const MAX_CONTENT_LENGTH = 900;
const getImageCardWidth = () => TARGET_IMAGE_WIDTH / PixelRatio.get();

const formatImageContent = (content: string | null) => {
  const normalizedContent = content?.trim() ?? "";
  if (normalizedContent.length <= MAX_CONTENT_LENGTH) return normalizedContent;
  return `${normalizedContent.slice(0, MAX_CONTENT_LENGTH).trimEnd()}…`;
};

type NoteShareImageCardProps = { note: ShareableNote };

export const NoteShareImageCard = forwardRef<View, NoteShareImageCardProps>(
  function NoteShareImageCard({ note }, ref) {
    const title = note.title.trim() || "未命名笔记";
    const content = formatImageContent(note.content);
    return (
      <View
        ref={ref}
        collapsable={false}
        style={[styles.card, { width: getImageCardWidth() }]}
      >
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>IRisNote</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.divider} />
        <Text style={styles.content}>
          {content || "这篇笔记暂时没有正文。"}
        </Text>
        <Text style={styles.footer}>记录此刻，留住思考</Text>
      </View>
    );
  },
);

export const captureNoteShareImage = async (view: View) =>
  captureRef(view, { format: "png", quality: 1, result: "tmpfile" });

const styles = StyleSheet.create({
  captureHost: { position: "absolute", left: -10000, top: 0 },
  card: {
    minHeight: 480,
    paddingHorizontal: 32,
    paddingTop: 34,
    paddingBottom: 28,
    backgroundColor: "#F8F5EE",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 30,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#6D7F63",
  },
  brand: {
    color: "#6D7F63",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: { color: "#272822", fontSize: 28, fontWeight: "700", lineHeight: 38 },
  divider: {
    width: 38,
    height: 3,
    marginTop: 20,
    marginBottom: 22,
    borderRadius: 2,
    backgroundColor: "#A9B39F",
  },
  content: { flexGrow: 1, color: "#45463F", fontSize: 17, lineHeight: 29 },
  footer: { marginTop: 34, color: "#8C8C82", fontSize: 12, letterSpacing: 0.5 },
});

export const noteShareImageHostStyle = styles.captureHost;
