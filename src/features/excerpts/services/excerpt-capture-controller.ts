import {
    detectClipboard,
    type ClipboardDetectionSources,
    type ClipboardDetectionResult,
} from "../domain/clipboard-detection";
import {
    sessionIsActive,
    type ExcerptSession,
} from "../domain/excerpt-session";
import type { ExcerptLocalRepository } from "../data/excerpt-local.repository";
import type { ExcerptStashRepository } from "../data/excerpt-stash.repository";
import { saveDetectedOffer } from "./excerpt-service";

export type CaptureOffer = {
    ownerKey: string;
    generation: number;
    content: string;
    hash: string;
};
export type ExcerptCaptureResult =
    | Extract<ClipboardDetectionResult, { kind: "skip" }>
    | { kind: "saved"; duplicated: boolean };

export type ExcerptCapturePorts = {
    readSession: () => Promise<ExcerptSession | null>;
    readOwner: () => Promise<string>;
    active: () => Promise<boolean>;
    activate: (ownerKey: string) => Promise<void>;
    stash: Pick<ExcerptStashRepository, "hashes">;
    repository: Pick<
        ExcerptLocalRepository,
        "generation" | "assertSession" | "save" | "list"
    >;
    clipboard: Pick<
        ClipboardDetectionSources,
        "hasText" | "readText" | "lastWrittenHash"
    >;
    consumed: (offer: CaptureOffer) => void;
    now: () => number;
};

/** 一次通知点击只有一次检测/保存；同一窗口重复调用共享最终 Promise，包括失败。 */
export class ExcerptCaptureController {
    private closed = false;
    private pending: Promise<ExcerptCaptureResult> | null = null;

    constructor(
        private readonly sessionId: string,
        private readonly ports: ExcerptCapturePorts,
    ) {}

    private async owner() {
        const [session, ownerKey, active] = await Promise.all([
            this.ports.readSession(),
            this.ports.readOwner(),
            this.ports.active(),
        ]);
        if (
            this.closed ||
            !active ||
            session?.sessionId !== this.sessionId ||
            !sessionIsActive(session, ownerKey, this.ports.now())
        )
            throw new Error("快速摘录会话已失效，请回到 IRisNote 重新开启");
        return ownerKey;
    }

    capture(): Promise<ExcerptCaptureResult> {
        if (!this.pending) this.pending = this.captureOnce();
        return this.pending;
    }

    private async captureOnce(): Promise<ExcerptCaptureResult> {
        const ownerKey = await this.owner();
        await this.ports.activate(ownerKey);
        const generation = this.ports.repository.generation;
        const valid = async () => {
            if ((await this.owner()) !== ownerKey)
                throw new Error("账号已变化，请重新开启快速摘录");
            this.ports.repository.assertSession(ownerKey, generation);
            return true;
        };
        const result = await detectClipboard({
            ...this.ports.clipboard,
            enabled: valid,
            stashedHashes: () => this.ports.stash.hashes(ownerKey),
            savedHashes: () =>
                new Set(
                    this.ports.repository
                        .list(ownerKey)
                        .map((item) => item.contentHash),
                ),
        });
        await valid();
        if (result.kind === "skip") return result;
        const offer = { ...result, ownerKey, generation };
        // 写入受理后沿用仓库账号租约，不因退出窗口回滚已受理的事务。
        const receipt = await saveDetectedOffer(
            this.ports.repository,
            offer,
            offer.content,
            "paste",
        );
        this.ports.consumed(offer);
        return { kind: "saved", duplicated: receipt.duplicated };
    }

    dispose() {
        this.closed = true;
    }
}
