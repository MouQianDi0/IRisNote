import { type ShareableNote } from "./CopyNoteToClipboard";
import { createSafeFileName } from "./NoteShareToTxt";
import { File, Paths } from "expo-file-system";

const DEFAULT_MARKDOWN_TITLE = "未命名笔记";

export const formatNoteAsMarkdown = (note: ShareableNote) => {
  const title = note.title.trim().replace(/\s+/g, " ") || DEFAULT_MARKDOWN_TITLE;
  const content = note.content?.trim() ?? "";

  return content ? `# ${title}\n\n${content}` : `# ${title}`;
};

export const createMarkdownNoteFile = (note: ShareableNote) => {
  const file = new File(Paths.cache, createSafeFileName(note.title, "md"));
  file.create({ overwrite: true });
  file.write(formatNoteAsMarkdown(note));

  return file.uri;
};
