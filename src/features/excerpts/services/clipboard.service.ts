import * as Clipboard from "expo-clipboard";
import {
    hashExcerptContent,
    normalizeExcerptContent,
} from "../domain/excerpt-validation";

let lastWrittenHash: string | null = null;

/**
 * 摘录模块唯一的剪贴板入口。读取只在用户操作或已开启的自动检测中调用；
 * 写入时记下内容哈希，供自动检测跳过本应用自己复制出去的内容。
 */
export const clipboardService = {
    /** 只看剪贴板描述是否含文字，不读取内容。 */
    hasText(): Promise<boolean> {
        return Clipboard.hasStringAsync();
    },

    /** iOS 16+ 用户拒绝粘贴时也返回空串，调用方统一按「没有文字」处理。 */
    readText(): Promise<string> {
        return Clipboard.getStringAsync();
    },

    async writeText(text: string): Promise<boolean> {
        const written = await Clipboard.setStringAsync(text);
        if (written) {
            const normalized = normalizeExcerptContent(text);
            lastWrittenHash = normalized
                ? hashExcerptContent(normalized)
                : null;
        }
        return written;
    },

    /** 剪贴板内容变化时回调；Android 只在应用拥有焦点时收到。返回注销函数。 */
    onChange(listener: () => void): () => void {
        const subscription = Clipboard.addClipboardListener(() => listener());
        return () => subscription.remove();
    },

    lastWrittenHash(): string | null {
        return lastWrittenHash;
    },
};
