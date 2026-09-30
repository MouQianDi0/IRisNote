import type { ExcerptLocalRepository } from "../data/excerpt-local.repository";
import { normalizeExcerptContent } from "../domain/excerpt-validation";
import { ExcerptError, type ExcerptSaveReceipt, type ExcerptSource } from "../excerpts.types";

/** 每次新建生成一次；该标识不参与鉴权。 */
export function newExcerptId(): string {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === "function")
        return randomUUID.call(globalThis.crypto);
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        return (char === "x" ? value : (value & 3) | 8).toString(16);
    });
}

type ExcerptWriter = Pick<ExcerptLocalRepository, "save" | "assertSession">;

/** 用户明确保存检测候选（表单或通知点击）；受理前核验账号代次，默认来源 manual。 */
export async function saveDetectedOffer(
    repository: ExcerptWriter,
    offer: {
        ownerKey: string;
        generation: number;
        content: string;
        hash: string;
    },
    text: string = offer.content,
    source: ExcerptSource = "manual",
): Promise<ExcerptSaveReceipt> {
    repository.assertSession(offer.ownerKey, offer.generation);
    const receipt = await repository.save(
        offer.ownerKey,
        newExcerptId(),
        text,
        source,
        new Date(),
    );
    return receipt;
}

/** 「粘贴一次」：由用户点击触发，读取一次剪贴板并保存为摘录。 */
export async function pasteClipboardAsExcerpt(
    repository: ExcerptWriter,
    readText: () => Promise<string>,
    ownerKey: string,
    generation: number,
    now: () => Date = () => new Date(),
): Promise<ExcerptSaveReceipt> {
    repository.assertSession(ownerKey, generation);
    const text = await readText();
    repository.assertSession(ownerKey, generation);
    if (!normalizeExcerptContent(text))
        throw new ExcerptError("empty", "剪贴板里没有文字");
    return repository.save(ownerKey, newExcerptId(), text, "paste", now());
}

/** 复制摘录正文；平台返回 false（写入未生效）时同样视为失败，不提示「已复制」。 */
export async function copyExcerptText(
    writeText: (text: string) => Promise<boolean>,
    content: string,
): Promise<void> {
    if (!(await writeText(content))) throw new Error("未能写入剪贴板，请重试");
}
