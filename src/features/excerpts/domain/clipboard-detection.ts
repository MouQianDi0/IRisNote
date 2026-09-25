import {
    EXCERPT_CONTENT_LIMIT,
    excerptLength,
    hashExcerptContent,
    normalizeExcerptContent,
} from "./excerpt-validation";

export type ClipboardDetectionSkip =
    "disabled" | "noText" | "empty" | "tooLong" | "handled" | "self" | "saved";

/** hash 非空的跳过结果需要记为「已处理」，避免同一内容每次进入都重新判断。 */
export type ClipboardDetectionResult =
    | { kind: "skip"; reason: ClipboardDetectionSkip; hash: string | null }
    | { kind: "offer"; content: string; hash: string };

export type ClipboardDetectionSources = {
    enabled: () => Promise<boolean>;
    /** 只判断有无文字，不读取内容；Android 上不会触发系统读取提示。 */
    hasText: () => Promise<boolean>;
    readText: () => Promise<string>;
    lastHandledHash: () => Promise<string | null>;
    lastWrittenHash: () => string | null;
    savedHashes: () => ReadonlySet<string>;
};

/** 纯判断：规范化后为空、超长、已处理、本应用复制、已存为摘录时都不提示。 */
export function evaluateClipboardText(
    text: string,
    context: {
        lastHandledHash: string | null;
        lastWrittenHash: string | null;
        savedHashes: ReadonlySet<string>;
    },
): ClipboardDetectionResult {
    const content = normalizeExcerptContent(text);
    if (!content) return { kind: "skip", reason: "empty", hash: null };
    const hash = hashExcerptContent(content);
    if (hash === context.lastHandledHash)
        return { kind: "skip", reason: "handled", hash: null };
    if (excerptLength(content) > EXCERPT_CONTENT_LIMIT)
        return { kind: "skip", reason: "tooLong", hash };
    if (hash === context.lastWrittenHash)
        return { kind: "skip", reason: "self", hash };
    if (context.savedHashes.has(hash))
        return { kind: "skip", reason: "saved", hash };
    return { kind: "offer", content, hash };
}

/** 依次检查：开关 → 有无文字 → 读取内容 → 纯判断；任何一步不满足即停止。 */
export async function detectClipboard(
    sources: ClipboardDetectionSources,
): Promise<ClipboardDetectionResult> {
    if (!(await sources.enabled()))
        return { kind: "skip", reason: "disabled", hash: null };
    if (!(await sources.hasText()))
        return { kind: "skip", reason: "noText", hash: null };
    const text = await sources.readText();
    return evaluateClipboardText(text, {
        lastHandledHash: await sources.lastHandledHash(),
        lastWrittenHash: sources.lastWrittenHash(),
        savedHashes: sources.savedHashes(),
    });
}
