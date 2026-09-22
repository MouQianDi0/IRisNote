import {
  formatNoteText,
  type ShareableNote,
} from "./CopyNoteToClipboard";
import { createShareCacheFile } from "@/core/storage/share-cache";

const DEFAULT_FILE_NAME = "未命名笔记";
const MAX_FILE_NAME_LENGTH = 60;

const createSafeFileName = (title: string, extension: "txt" | "md") => {
  const safeTitle = title
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH);

  return `${safeTitle || DEFAULT_FILE_NAME}.${extension}`;
};

export const formatNoteAsTxt = (note: ShareableNote) => formatNoteText(note);

export const createTxtNoteFile = (note: ShareableNote) => {
  const file = createShareCacheFile("txt", createSafeFileName(note.title, "txt"));
  file.create({ overwrite: true });
  file.write(formatNoteAsTxt(note));

  return file.uri;
};

export { createSafeFileName };
