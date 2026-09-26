import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { nativeSecureStore, type SecureKeyValueStore } from "./secure-store";
import { storageKeys } from "./storage.keys";

export type SecureTokenStore = SecureKeyValueStore;

export type LegacyTokenStore = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
};

export type TokenStorage = {
    read(): Promise<string | null>;
    /** 写入失败时抛出：调用方据此判断新令牌没有保存下来。 */
    write(token: string): Promise<void>;
    clear(): Promise<void>;
};

const SECURE_KEY = storageKeys.secureAuthToken;
const LEGACY_KEY = storageKeys.authToken;

/**
 * 登录令牌存储。`secure` 为 null 时（Web、Node 测试）只用 AsyncStorage，与旧行为一致。
 * 原生端存 SecureStore（Android 默认不进系统备份）；旧版明文令牌在首次读取时迁入，读回一致后才删除。
 * SecureStore 写入失败时退回 AsyncStorage，保证仍能登录；此时旧存储里的令牌总是较新的那份。
 * 所有操作串行执行，读到的总是最近一次写入的结果。
 */
export function createTokenStorage(
    secure: SecureTokenStore | null,
    legacy: LegacyTokenStore,
    report: (event: string) => void = () => {},
): TokenStorage {
    let legacyCleared = false;
    let queue: Promise<unknown> = Promise.resolve();
    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
        const next = queue.then(task);
        queue = next.catch(() => undefined);
        return next;
    };

    const readSecure = async (store: SecureTokenStore) => {
        try {
            return await store.getItemAsync(SECURE_KEY);
        } catch {
            // 如密钥库在系统恢复后失效：按未登录处理，重新登录时会覆盖。
            report("secure_read_failed");
            return null;
        }
    };

    const read = async () => {
        if (!secure) return legacy.getItem(LEGACY_KEY);
        if (legacyCleared) return readSecure(secure);
        const legacyToken = await legacy.getItem(LEGACY_KEY);
        if (legacyToken === null) {
            legacyCleared = true;
            return readSecure(secure);
        }
        // 旧存储里仍有令牌：首次迁移，或上次写入 SecureStore 失败后退回了旧存储，两种情况下它都是最新值。
        try {
            await secure.setItemAsync(SECURE_KEY, legacyToken);
            if ((await secure.getItemAsync(SECURE_KEY)) !== legacyToken)
                throw new Error("令牌迁移校验失败");
            await legacy.removeItem(LEGACY_KEY);
            legacyCleared = true;
        } catch {
            report("migration_failed");
        }
        return legacyToken;
    };

    const write = async (token: string) => {
        if (secure) {
            let stored = false;
            try {
                await secure.setItemAsync(SECURE_KEY, token);
                stored = true;
            } catch {
                report("secure_write_failed");
            }
            if (stored) {
                if (legacyCleared) return;
                try {
                    await legacy.removeItem(LEGACY_KEY);
                    legacyCleared = true;
                    return;
                } catch {
                    // 旧值删不掉时改写成同一令牌，下次读取会同步后再删除。
                }
            }
        }
        await legacy.setItem(LEGACY_KEY, token);
        legacyCleared = false;
    };

    const clear = async () => {
        let failure: unknown = undefined;
        if (secure) {
            try {
                await secure.deleteItemAsync(SECURE_KEY);
            } catch (error) {
                failure = error;
            }
        }
        try {
            await legacy.removeItem(LEGACY_KEY);
            legacyCleared = true;
        } catch (error) {
            failure ??= error;
            legacyCleared = false;
        }
        if (failure !== undefined) throw failure;
    };

    return {
        read: () => enqueue(read),
        write: (token) => enqueue(() => write(token)),
        clear: () => enqueue(clear),
    };
}

export const authTokenStorage = createTokenStorage(
    nativeSecureStore,
    AsyncStorage,
    (event) =>
        void recordDiagnostic("auth", `token_${event}`, undefined, "warning"),
);
