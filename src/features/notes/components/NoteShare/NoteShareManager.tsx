import { type ShareableNote } from "./CopyNoteToClipboard";
import { createMarkdownNoteFile } from "./NoteShareToMarkdown";
import { createNotePdfFile } from "./NoteShareToPdf";
import { createTxtNoteFile } from "./NoteShareToTxt";
import * as Sharing from "expo-sharing";
import { withSharedFile } from "@/core/storage/share-cache";

export type NoteShareFormat = "txt" | "markdown" | "pdf";

type NoteShareConfig = {
  createFile: (note: ShareableNote) => string | Promise<string>;
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
  pdf: {
    createFile: createNotePdfFile,
    dialogTitle: "分享 PDF 笔记",
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
  },
};

export class NoteShareUnavailableError extends Error {
  constructor() {
    super("当前设备不支持文件分享");
    this.name = "NoteShareUnavailableError";
  }
}

export class NoteShareFileGenerationError extends Error {
  readonly cause: unknown;

  constructor(format: NoteShareFormat, cause: unknown) {
    super(`生成 ${format.toUpperCase()} 笔记文件失败`);
    this.name = "NoteShareFileGenerationError";
    this.cause = cause;
  }
}

export class NoteSharePresentationError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("打开系统分享面板失败");
    this.name = "NoteSharePresentationError";
    this.cause = cause;
  }
}

const ensureSharingAvailable = async () => {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new NoteShareUnavailableError();
    }
  } catch (error) {
    if (error instanceof NoteShareUnavailableError) throw error;
    throw new NoteSharePresentationError(error);
  }
};

export const shareNote = async (
  note: ShareableNote,
  format: NoteShareFormat,
) => {
  const config = SHARE_CONFIGS[format];

  await ensureSharingAvailable();

  let fileUri: string;
  try {
    fileUri = await config.createFile(note);
  } catch (error) {
    throw new NoteShareFileGenerationError(format, error);
  }

  try {
    await withSharedFile(fileUri, () => Sharing.shareAsync(fileUri, {
      dialogTitle: config.dialogTitle,
      mimeType: config.mimeType,
      UTI: config.UTI,
    }));
  } catch (error) {
    throw new NoteSharePresentationError(error);
  }

  return fileUri;
};

export const shareNoteImage = async (fileUri: string) => {
  await ensureSharingAvailable();

  try {
    await withSharedFile(fileUri, () => Sharing.shareAsync(fileUri, {
      dialogTitle: "分享图片笔记",
      mimeType: "image/png",
      UTI: "public.png",
    }));
  } catch (error) {
    throw new NoteSharePresentationError(error);
  }

  return fileUri;
};
