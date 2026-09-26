import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { SystemPreferencesRepository } from "@/features/settings/data/system-preferences.repository";
import {
    nativeSecureStore,
    type SecureKeyValueStore,
} from "@/shared/storage/secure-store";

const KEY_NAME = "irisnote.clipboard.mark-key";
const KEY_BYTES = 32;
const HEX_KEY = /^[0-9a-f]{64}$/;

export type HandledMarkStorage = {
    read(): Promise<string | null>;
    write(mark: string): Promise<void>;
};

export type ClipboardHandledStore = {
    isHandled(hash: string): Promise<boolean>;
    markHandled(hash: string): Promise<void>;
};

/**
 * 「已处理的剪贴板内容」只以 HMAC 形式落盘，密钥存 SecureStore（不进系统备份）：
 * 只拿到数据库或备份无法枚举出短验证码等原文。
 * 取不到密钥（Web、密钥库异常）时只记在内存里，重启后同一内容会再提示一次。
 */
export function createClipboardHandledStore(
    marks: HandledMarkStorage,
    secure: SecureKeyValueStore | null,
    randomBytes: (length: number) => Promise<Uint8Array>,
): ClipboardHandledStore {
    let memory: string | null = null;
    let key: Promise<Uint8Array | null> | null = null;

    const loadKey = async () => {
        if (!secure) return null;
        try {
            const stored = await secure.getItemAsync(KEY_NAME);
            if (stored && HEX_KEY.test(stored)) return hexToBytes(stored);
            const created = await randomBytes(KEY_BYTES);
            if (created.length !== KEY_BYTES) return null;
            await secure.setItemAsync(KEY_NAME, bytesToHex(created));
            return created;
        } catch {
            return null;
        }
    };

    const markOf = async (hash: string) => {
        key ??= loadKey();
        const secret = await key;
        return secret
            ? bytesToHex(hmac(sha256, secret, utf8ToBytes(hash)))
            : null;
    };

    return {
        async isHandled(hash) {
            if (memory === hash) return true;
            const mark = await markOf(hash);
            if (!mark) return false;
            return (await marks.read().catch(() => null)) === mark;
        },
        async markHandled(hash) {
            memory = hash;
            const mark = await markOf(hash);
            if (mark) await marks.write(mark);
        },
    };
}

const stores = new WeakMap<ApplicationDatabase, ClipboardHandledStore>();

/** 每个数据库一个实例；首次创建时顺带删除旧版不带密钥的哈希。 */
export function clipboardHandledStoreFor(database: ApplicationDatabase) {
    let store = stores.get(database);
    if (!store) {
        const preferences = new SystemPreferencesRepository(database);
        void preferences.clearLegacyClipboardHash().catch(() => undefined);
        store = createClipboardHandledStore(
            {
                read: () => preferences.clipboardLastHandledMark(),
                write: (mark) => preferences.setClipboardLastHandledMark(mark),
            },
            nativeSecureStore,
            async (length) => (await import("expo-crypto")).getRandomBytes(length),
        );
        stores.set(database, store);
    }
    return store;
}
