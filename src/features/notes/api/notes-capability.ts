/**
 * 后端是否已支持笔记同步第二期接口（幂等新建、按 ID 取单篇、元数据同步），三项同版本上线。
 * 每次启动只判断一次：新建响应带回执 meta 即确认支持，旧格式响应即确认不支持；
 * 需要提前知道时才探测。探测失败（离线、5xx）不记结果，留待下次判断。
 */
let supported: boolean | null = null;
let probing: Promise<boolean> | null = null;

export function notesServerV2(): boolean | null {
    return supported;
}

export function markNotesServerV2(value: boolean) {
    supported = value;
}

/** 探测器由调用方注入，本模块不依赖网络层。探测器缺失时视为暂时无法判断。 */
export async function ensureNotesServerV2(
    probe?: () => Promise<boolean>,
): Promise<boolean> {
    if (supported !== null) return supported;
    if (!probe) throw new Error("暂时无法确认服务器是否支持");
    probing ??= probe()
        .then((value) => {
            supported ??= value;
            return supported;
        })
        .finally(() => {
            probing = null;
        });
    return probing;
}

/** 仅供测试重置启动状态。 */
export function resetNotesServerV2ForTests() {
    supported = null;
    probing = null;
}
