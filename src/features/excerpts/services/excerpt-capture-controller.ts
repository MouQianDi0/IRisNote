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
import { newExcerptId, saveDetectedOffer } from "./excerpt-service";
import type { ExcerptStashRepository } from "../data/excerpt-stash.repository";

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
    stash: Pick<ExcerptStashRepository, "list" | "hashes" | "add" | "move" | "update" | "remove" | "clear">;
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
            stashedHashes: () => this.ports.stash.hashes(ownerKey),
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
        return result;
    }

    currentOffer() {
        return this.offer;
    }

    async scope() {
        const ownerKey = await this.owner();
        return { ownerKey, generation: this.ports.repository.generation };
    }

    async listStash() {
        const ownerKey = await this.owner();
        return this.ports.stash.list(ownerKey);
    }

    async stash() {
        const offer = this.offer;
        if (!offer) throw new Error("没有待暂存的摘录");
        if ((await this.owner()) !== offer.ownerKey) throw new Error("账号已变化，请重新开启快速摘录");
        this.ports.repository.assertSession(offer.ownerKey, offer.generation);
        const result = await this.ports.stash.add(offer.ownerKey, offer.content);
        this.offer = null;
        this.ports.consumed(offer);
        return result;
    }

    async moveStash(clientId: string, direction: "up" | "down") {
        const ownerKey = await this.owner();
        await this.ports.stash.move(ownerKey, clientId, direction);
    }

    async updateStash(clientId: string, text: string) {
        const ownerKey = await this.owner();
        return this.ports.stash.update(ownerKey, clientId, text);
    }

    async removeStash(clientId: string) {
        const ownerKey = await this.owner();
        await this.ports.stash.remove(ownerKey, clientId);
    }

    async clearStash() {
        const ownerKey = await this.owner();
        await this.ports.stash.clear(ownerKey);
    }

    async saveMerged(text: string): Promise<"saved" | "duplicate"> {
        const ownerKey = await this.owner();
        const generation = this.ports.repository.generation;
        this.ports.repository.assertSession(ownerKey, generation);
        const receipt = await this.ports.repository.save(ownerKey, newExcerptId(), text, "manual", new Date());
        if (receipt.duplicated) return "duplicate";
        await this.ports.stash.clear(ownerKey);
        return "saved";
    }

    save(text?: string) {
        if (this.saving) return this.saving;
        const pending = this.saveOnce(text);
        this.saving = pending;
        const clear = () => {
            if (this.saving === pending) this.saving = null;
        };
        void pending.then(clear, clear);
        return pending;
    }

    private async saveOnce(text?: string) {
        const offer = this.offer;
        if (!offer) throw new Error("没有待保存的摘录");
        if ((await this.owner()) !== offer.ownerKey)
            throw new Error("账号已变化，请重新开启快速摘录");
        const receipt = await saveDetectedOffer(
            this.ports.repository,
            offer,
            text,
        );
        if (!receipt.duplicated) {
            this.offer = null;
            this.ports.consumed(offer);
        }
        return receipt;
    }

    dispose() {
        this.closed = true;
        this.offer = null;
    }
}
