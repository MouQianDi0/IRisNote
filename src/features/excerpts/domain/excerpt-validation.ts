import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { ExcerptError, type ExcerptEntity } from "../excerpts.types";

/** 与 local_excerpts.content 的 CHECK 一致；按 Unicode 码点计数。 */
export const EXCERPT_CONTENT_LIMIT = 20000;

/** 统一换行，去掉开头空行和末尾空白；保留首行缩进，避免破坏代码片段。 */
export function normalizeExcerptContent(text: string): string {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/^(?:[ \t]*\n)+/, "")
        .replace(/\s+$/, "");
}

export function excerptLength(content: string): number {
    return Array.from(content).length;
}

/** 返回可落库的规范化正文；空白或超长时抛出可展示的错误。 */
export function prepareExcerptContent(text: string): string {
    const content = normalizeExcerptContent(text);
    if (!content) throw new ExcerptError("empty", "摘录内容不能为空");
    if (excerptLength(content) > EXCERPT_CONTENT_LIMIT)
        throw new ExcerptError(
            "tooLong",
            `内容超过 ${EXCERPT_CONTENT_LIMIT} 字，建议保存为笔记`,
        );
    return content;
}

/** 去重键：只比较规范化后的正文，不落库原文以外的任何内容。 */
export function hashExcerptContent(content: string): string {
    return bytesToHex(sha256(utf8ToBytes(content)));
}

/** 置顶在前，其余按最近更新倒序；时间相同时按创建时间和 ID 保持稳定。 */
export function compareExcerpts(a: ExcerptEntity, b: ExcerptEntity): number {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
}

export function filterExcerpts(
    entities: readonly ExcerptEntity[],
    keyword: string,
): readonly ExcerptEntity[] {
    const needle = keyword.trim().toLocaleLowerCase();
    if (!needle) return entities;
    return entities.filter((entity) =>
        entity.content.toLocaleLowerCase().includes(needle),
    );
}
