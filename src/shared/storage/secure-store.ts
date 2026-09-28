export type SecureKeyValueStore = {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
};

const isNativeRuntime =
    typeof navigator !== "undefined" && navigator.product === "ReactNative";

/**
 * SecureStore 的按需加载封装：只在原生运行时可用，Web 与 Node 测试环境为 null，调用方据此退回。
 * 键名只允许字母数字与 . - _。
 */
export const nativeSecureStore: SecureKeyValueStore | null = isNativeRuntime
    ? {
          getItemAsync: async (key) =>
              (await import("expo-secure-store")).getItemAsync(key),
          setItemAsync: async (key, value) =>
              (await import("expo-secure-store")).setItemAsync(key, value),
          deleteItemAsync: async (key) =>
              (await import("expo-secure-store")).deleteItemAsync(key),
      }
    : null;
