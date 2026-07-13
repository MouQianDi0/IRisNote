import { type ShareableNote } from "./CopyNoteToClipboard";
import { createMarkdownNoteFile } from "./NoteShareToMarkdown";
import { createTxtNoteFile } from "./NoteShareToTxt";
import * as Sharing from "expo-sharing";

export type NoteShareFormat = "txt" | "markdown";

type NoteShareConfig = {
  createFile: (note: ShareableNote) => string;
  dialogTitle: string;
  mimeType: string;
  UTI: string;
};

const SHARE_CONFIGS: Record<NoteShareFormat, NoteShareConfig> = {
  txt: {
    createFile: createTxtNoteFile,
    dialogTitle: "分享 TXT 笔记",
    mimeType: "text/plain",
    UTI: "public.plain-text",
  },
  markdown: {
    createFile: createMarkdownNoteFile,
    dialogTitle: "分享 Markdown 笔记",
    mimeType: "text/markdown",
    UTI: "net.daringfireball.markdown",
  },
};

export class NoteShareUnavailableError extends Error {
  constructor() {
    super("当前设备不支持文件分享");
    this.name = "NoteShareUnavailableError";
  }
}

export const shareNote = async (
  note: ShareableNote,
  format: NoteShareFormat,
) => {
  const config = SHARE_CONFIGS[format];
  const fileUri = config.createFile(note);

  if (!(await Sharing.isAvailableAsync())) {
    throw new NoteShareUnavailableError();
  }

  await Sharing.shareAsync(fileUri, {
    dialogTitle: config.dialogTitle,
    mimeType: config.mimeType,
    UTI: config.UTI,
  });

  return fileUri;
};

export const shareNoteImage = async (fileUri: string) => {
  if (!(await Sharing.isAvailableAsync()))
    throw new NoteShareUnavailableError();

  await Sharing.shareAsync(fileUri, {
    dialogTitle: "分享图片笔记",
    mimeType: "image/png",
    UTI: "public.png",
  });

  return fileUri;
};
