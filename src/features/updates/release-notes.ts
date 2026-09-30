import type { MarkdownOptions } from "@/shared/utils/markdown";

/** Compatibility with release notes already published as plain text. */
export const releaseNotesMarkdownOptions = {
    plainTextHeadings: ["新增功能", "体验优化", "问题修复", "升级提醒"],
} satisfies MarkdownOptions;
