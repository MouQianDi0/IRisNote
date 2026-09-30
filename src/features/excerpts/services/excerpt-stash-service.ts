import type { ExcerptLocalRepository } from "../data/excerpt-local.repository";
import type {
    ExcerptStashItem,
    ExcerptStashRepository,
} from "../data/excerpt-stash.repository";
import { newExcerptId } from "./excerpt-service";

type Scope = Pick<ExcerptLocalRepository, "assertSession">;

/** 主动粘贴到暂存：仅一次读取，读取前后校验账号代次，重复内容交仓库去重。 */
export async function pasteClipboardToStash(
    stash: Pick<ExcerptStashRepository, "add">,
    scope: Scope,
    readText: () => Promise<string>,
    ownerKey: string,
    generation: number,
) {
    scope.assertSession(ownerKey, generation);
    const text = await readText();
    scope.assertSession(ownerKey, generation);
    return stash.add(ownerKey, text);
}

/** 先保存摘录，再清理未修改的合并快照；清理失败不能报告成摘录保存失败。 */
export async function saveMergedStash(
    repository: Scope & Pick<ExcerptLocalRepository, "save">,
    stash: Pick<ExcerptStashRepository, "removeMerged">,
    items: readonly ExcerptStashItem[],
    ownerKey: string,
    generation: number,
    text: string,
): Promise<{ kind: "duplicate" } | { kind: "saved"; cleanupFailed: boolean }> {
    repository.assertSession(ownerKey, generation);
    const receipt = await repository.save(
        ownerKey,
        newExcerptId(),
        text,
        "manual",
        new Date(),
    );
    if (receipt.duplicated) return { kind: "duplicate" };
    try {
        await stash.removeMerged(ownerKey, items);
        return { kind: "saved", cleanupFailed: false };
    } catch {
        return { kind: "saved", cleanupFailed: true };
    }
}
