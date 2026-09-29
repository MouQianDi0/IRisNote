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
import { saveDetectedOffer } from "./excerpt-service";

export type CaptureOffer = {
    ownerKey: string;
    generation: number;
    content: string;
    hash: string;
};

export type ExcerptCapturePorts = {
    readSession: () => Promise<ExcerptSession | null>;
    readOwner: () => Promise<string>;
    active: () => Promise<boolean>;
    activate: (ownerKey: string) => Promise<void>;
    repository: Pick<
        ExcerptLocalRepository,
        "generation" | "assertSession" | "save" | "list"
    >;
    clipboard: Pick<
        ClipboardDetectionSources,
        "hasText" | "readText" | "isHandled" | "lastWrittenHash"
    >;
    markHandled: (hash: string) => Promise<void>;
    consumed: (offer: CaptureOffer) => void;
    now: () => number;
};

/** 独立窗口只消费当前会话；冷启动与热启动经过同一检测/保存服务。 */
export class ExcerptCaptureController {
    private offer: CaptureOffer | null = null;
    private closed = false;
    private saving: ReturnType<typeof saveDetectedOffer> | null = null;

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

    async detect(): Promise<ClipboardDetectionResult> {
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
            savedHashes: () =>
                new Set(
                    this.ports.repository
                        .list(ownerKey)
                        .map((item) => item.contentHash),
                ),
        });
        await valid();
        if (result.kind === "offer")
            this.offer = { ...result, ownerKey, generation };
        else if (result.hash)
            await this.ports.markHandled(result.hash).catch(() => undefined);
        return result;
    }

    save() {
        if (this.saving) return this.saving;
        const pending = this.saveOnce();
        this.saving = pending;
        const clear = () => {
            if (this.saving === pending) this.saving = null;
        };
        void pending.then(clear, clear);
        return pending;
    }

    private async saveOnce() {
        const offer = this.offer;
        if (!offer) throw new Error("没有待保存的摘录");
        if ((await this.owner()) !== offer.ownerKey)
            throw new Error("账号已变化，请重新开启快速摘录");
        const receipt = await saveDetectedOffer(
            this.ports.repository,
            offer,
            this.ports.markHandled,
        );
        this.offer = null;
        this.ports.consumed(offer);
        return receipt;
    }

    async ignore() {
        if (this.saving) return;
        const offer = this.offer;
        if (!offer) return;
        if ((await this.owner()) !== offer.ownerKey)
            throw new Error("账号已变化，请重新开启快速摘录");
        this.ports.repository.assertSession(offer.ownerKey, offer.generation);
        await this.ports.markHandled(offer.hash).catch(() => undefined);
        this.offer = null;
        this.ports.consumed(offer);
    }

    dispose() {
        this.closed = true;
        this.offer = null;
    }
}
