import AsyncStorage from "@react-native-async-storage/async-storage";
import NativeSystem from "@modules/irisnote-system";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { authTokenStorage } from "@/shared/storage/token-storage";
import { storageKeys } from "@/shared/storage/storage.keys";
import { ExcerptSessionRepository } from "../data/excerpt-session.repository";
import { EXCERPT_GUEST_OWNER_KEY } from "../data/excerpt-local.repository";
import { excerptRepository } from "../state/excerpt-store";
import { useClipboardOfferStore } from "../state/clipboard-offer-store";
import { ExcerptStashRepository } from "../data/excerpt-stash.repository";
import { clipboardService } from "./clipboard.service";
import { ExcerptCaptureController } from "./excerpt-capture-controller";

/** 只读本机登录身份；捕获页不挂 AuthProvider，不发资料或同步网络请求。 */
async function readOwner() {
    const [token, raw] = await Promise.all([
        authTokenStorage.read(),
        AsyncStorage.getItem(storageKeys.authUser),
    ]);
    if (!token || !raw) return EXCERPT_GUEST_OWNER_KEY;
    const user: unknown = JSON.parse(raw);
    if (
        !user ||
        typeof user !== "object" ||
        !("id" in user) ||
        typeof user.id !== "number" ||
        !Number.isSafeInteger(user.id) ||
        user.id <= 0
    )
        throw new Error("账号状态不可用，请回到 IRisNote 重试");
    return `user:${user.id}`;
}

export async function excerptCaptureOpen() {
    return (
        typeof NativeSystem?.getExcerptCaptureState === "function" &&
        !!(await NativeSystem.getExcerptCaptureState(null))
    );
}

export function createExcerptCapture(
    sessionId: string,
    captureId: string,
    database: ApplicationDatabase,
) {
    const native = NativeSystem;
    if (!native || typeof native.getExcerptCaptureState !== "function")
        throw new Error("当前安装包不支持通知快速摘录");
    const sessions = new ExcerptSessionRepository(database);
    const stash = new ExcerptStashRepository(database, excerptRepository);
    return new ExcerptCaptureController(sessionId, {
        readSession: async () => (await sessions.read()).session,
        readOwner,
        active: async () => {
            const state = await native.getExcerptCaptureState(captureId);
            return (
                state?.sessionId === sessionId &&
                state.captureId === captureId &&
                (await native.getStoppedExcerptSession()) !== sessionId
            );
        },
        activate: async (ownerKey) => {
            // 已有主窗口的账号代次必须一致；不能借透明窗口切换另一个账号的仓库。
            if (
                excerptRepository.ownerKey &&
                excerptRepository.ownerKey !== ownerKey
            )
                throw new Error("账号已变化，请回到 IRisNote 重新开启");
            await excerptRepository.activate(ownerKey, database);
        },
        repository: excerptRepository,
        stash,
        clipboard: {
            hasText: async () => {
                const deadline = Date.now() + 5000;
                while (Date.now() < deadline) {
                    const state = await native.getExcerptCaptureState(captureId);
                    if (
                        state?.sessionId !== sessionId ||
                        state.captureId !== captureId
                    )
                        throw new Error("捕获窗口已关闭");
                    if (state.focused)
                        return native.hasExcerptCaptureText(captureId);
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, 100),
                    );
                }
                throw new Error("未能取得窗口焦点，请重新点通知");
            },
            readText: () => native.readExcerptCaptureText(captureId),
            lastWrittenHash: clipboardService.lastWrittenHash,
        },
        consumed: (offer) => {
            const current = useClipboardOfferStore.getState().offer;
            if (
                current?.hash === offer.hash &&
                current.ownerKey === offer.ownerKey &&
                current.generation === offer.generation
            )
                useClipboardOfferStore.setState({ offer: null });
        },
        now: Date.now,
    });
}
