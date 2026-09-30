import type { ExcerptCaptureResult } from "../services/excerpt-capture-controller";

export type CaptureFeedback = {
    tone: "success" | "neutral" | "error";
    message: string;
    duration: number;
};

export function captureFeedback(result: ExcerptCaptureResult): CaptureFeedback {
    if (result.kind === "saved")
        return result.duplicated
            ? { tone: "neutral", message: "该内容已在摘录中", duration: 1000 }
            : {
                  tone: "success",
                  message: "已将剪贴板摘录完成",
                  duration: 1000,
              };
    if (result.reason === "saved")
        return { tone: "neutral", message: "该内容已在摘录中", duration: 1000 };
    if (result.reason === "stashed")
        return { tone: "neutral", message: "该内容已在暂存区", duration: 1000 };
    if (result.reason === "tooLong")
        return {
            tone: "error",
            message: "内容超过 20000 字，建议保存为笔记",
            duration: 2000,
        };
    return { tone: "neutral", message: "没有需要摘录的新内容", duration: 1000 };
}
