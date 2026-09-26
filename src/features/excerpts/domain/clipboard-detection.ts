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
    /** 开关已开启且仍可检测（调用方可一并判断页面焦点、账号）；读取正文前会再次确认。 */
    enabled: () => Promise<boolean>;
    /** 只判断有无文字，不读取内容；Android 上不会触发系统读取提示。 */
    hasText: () => Promise<boolean>;
    readText: () => Promise<string>;
    /** 该内容是否已提示或已处理过；已处理记录只以带密钥的摘要落盘，比较由存储方完成。 */
    isHandled: (hash: string) => Promise<boolean>;
    lastWrittenHash: () => string | null;
    savedHashes: () => ReadonlySet<string>;
};

/** 纯判断：规范化后为空、超长、已处理、本应用复制、已存为摘录时都不提示。 */
export function evaluateClipboardText(
    text: string,
    context: {
        handled: boolean;
        lastWrittenHash: string | null;
        savedHashes: ReadonlySet<string>;
    },
): ClipboardDetectionResult {
    const content = normalizeExcerptContent(text);
    if (!content) return { kind: "skip", reason: "empty", hash: null };
    const hash = hashExcerptContent(content);
    if (context.handled) return { kind: "skip", reason: "handled", hash: null };
    if (excerptLength(content) > EXCERPT_CONTENT_LIMIT)
        return { kind: "skip", reason: "tooLong", hash };
    if (hash === context.lastWrittenHash)
        return { kind: "skip", reason: "self", hash };
    if (context.savedHashes.has(hash))
        return { kind: "skip", reason: "saved", hash };
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
    const content = normalizeExcerptContent(text);
    return evaluateClipboardText(text, {
        handled: content
            ? await sources.isHandled(hashExcerptContent(content))
            : false,
        lastWrittenHash: sources.lastWrittenHash(),
        savedHashes: sources.savedHashes(),
    });
}
