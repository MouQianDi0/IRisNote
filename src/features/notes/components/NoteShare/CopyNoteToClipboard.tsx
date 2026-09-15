import * as Clipboard from "expo-clipboard";

export type ShareableNote = {
  title: string;
  content: string | null;
};

export const formatNoteText = (note: ShareableNote) => {
  const title = note.title.trim();
  const content = note.content?.trim() ?? "";

  return content ? `${title}\n\n${content}` : title;
};

export const copyNoteToClipboard = async (note: ShareableNote) => {
  return Clipboard.setStringAsync(formatNoteText(note));
};
