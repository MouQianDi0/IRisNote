export const storageKeys = {
    /** 旧版明文令牌（AsyncStorage）；原生端迁入 SecureStore 后删除，Web 端继续使用。 */
    authToken: "token",
    /** SecureStore 键名只允许字母数字与 . - _。 */
    secureAuthToken: "irisnote.auth.token",
    authUser: "user",
    deviceId: "irisnote.deviceId",
} as const;
