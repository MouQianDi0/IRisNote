import {
    EXCERPT_CONTENT_LIMIT,
    excerptLength,
    hashExcerptContent,
    normalizeExcerptContent,
} from "./excerpt-validation";

export type ClipboardDetectionSkip =
    "disabled" | "noText" | "empty" | "tooLong" | "stashed" | "self" | "saved";

/** 跳过结果只用于本次显示，不持久化任何已处理标记。 */
export type ClipboardDetectionResult =
    | { kind: "skip"; reason: ClipboardDetectionSkip; hash: string | null }
    | { kind: "offer"; content: string; hash: string };

export type ClipboardDetectionSources = {
    /** 开关已开启且仍可检测（调用方可一并判断页面焦点、账号）；读取正文前会再次确认。 */
    enabled: () => Promise<boolean>;
    /** 只判断有无文字，不读取内容；Android 上不会触发系统读取提示。 */
    hasText: () => Promise<boolean>;
    readText: () => Promise<string>;
    lastWrittenHash: () => string | null;
    savedHashes: () => ReadonlySet<string>;
    stashedHashes: () => Promise<ReadonlySet<string>>;
};

/** 纯判断：规范化后为空、超长、已暂存、本应用复制、已存为摘录时都不提示。 */
export function evaluateClipboardText(
    text: string,
    context: {
        stashedHashes: ReadonlySet<string>;
        lastWrittenHash: string | null;
        savedHashes: ReadonlySet<string>;
    },
): ClipboardDetectionResult {
    const content = normalizeExcerptContent(text);
    if (!content) return { kind: "skip", reason: "empty", hash: null };
    const hash = hashExcerptContent(content);
    if (excerptLength(content) > EXCERPT_CONTENT_LIMIT)
        return { kind: "skip", reason: "tooLong", hash };
    if (hash === context.lastWrittenHash)
        return { kind: "skip", reason: "self", hash };
    if (context.savedHashes.has(hash))
        return { kind: "skip", reason: "saved", hash };
    if (context.stashedHashes.has(hash))
        return { kind: "skip", reason: "stashed", hash };
    return { kind: "offer", content, hash };
}

/** 依次检查：开关 → 有无文字 → 再确认开关 → 读取内容 → 纯判断；任何一步不满足即停止。 */
export async function detectClipboard(
    sources: ClipboardDetectionSources,
): Promise<ClipboardDetectionResult> {
    if (!(await sources.enabled()))
        return { kind: "skip", reason: "disabled", hash: null };
    if (!(await sources.hasText()))
        return { kind: "skip", reason: "noText", hash: null };
    // 等待「有无文字」期间可能已离开页面或关闭开关，读取正文前必须再确认。
    if (!(await sources.enabled()))
        return { kind: "skip", reason: "disabled", hash: null };
    const text = await sources.readText();
    return evaluateClipboardText(text, {
        stashedHashes: await sources.stashedHashes(),
        lastWrittenHash: sources.lastWrittenHash(),
        savedHashes: sources.savedHashes(),
    });
}
