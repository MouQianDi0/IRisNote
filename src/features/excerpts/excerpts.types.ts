/** paste：点「粘贴一次」；auto：自动检测后确认保存；manual：手动输入。 */
export type ExcerptSource = "paste" | "auto" | "manual";

export type ExcerptEntity = Readonly<{
    ownerKey: string;
    clientId: string;
    content: string;
    contentHash: string;
    source: ExcerptSource;
    isPinned: boolean;
    localVersion: number;
    createdAt: string;
    updatedAt: string;
}>;

export type ExcerptPatch = Partial<{ content: string; isPinned: boolean }>;

/** 保存回执：duplicated 表示内容已存在，原摘录被移到最前而没有新建。 */
export type ExcerptSaveReceipt = {
    entity: ExcerptEntity;
    duplicated: boolean;
};

export class ExcerptError extends Error {
    constructor(
        public readonly code:
            | "empty"
            | "tooLong"
            | "duplicate"
            | "owner"
            | "missing"
            | "conflict",
        message: string,
    ) {
        super(message);
        this.name = "ExcerptError";
    }
}
