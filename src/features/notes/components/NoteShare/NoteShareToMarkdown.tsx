import { type ShareableNote } from "./CopyNoteToClipboard";
import { createShareCacheFile } from "@/core/storage/share-cache";
import { createSafeFileName } from "./NoteShareToTxt";

const DEFAULT_MARKDOWN_TITLE = "未命名笔记";

export const formatNoteAsMarkdown = (note: ShareableNote) => {
    const title =
        note.title.trim().replace(/\s+/g, " ") || DEFAULT_MARKDOWN_TITLE;
    const content = note.content?.trim() ?? "";

    return content ? `# ${title}\n\n${content}` : `# ${title}`;
};

export const createMarkdownNoteFile = (note: ShareableNote) => {
    const file = createShareCacheFile(
        "md",
        createSafeFileName(note.title, "md"),
    );
    file.create({ overwrite: true });
    file.write(formatNoteAsMarkdown(note));

    return file.uri;
};
