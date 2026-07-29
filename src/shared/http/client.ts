import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "axios";

const DEFAULT_API_BASE_URL = "https://tech-mou.top/api";

const getBaseURL = () => {
    return process.env.EXPO_PUBLIC_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
};

export const API_BASE_URL = getBaseURL();
console.log("[API] 请求地址:", API_BASE_URL, "__DEV__:", __DEV__);

const api = create({
    baseURL: API_BASE_URL,
});

const shouldAttachDeviceId = (url?: string) => {
    if (!url) return false;

    return (
        url.startsWith("/verify/") ||
        url.startsWith("/auth/register") ||
        url.startsWith("/auth/login")
    );
};

const createDeviceId = () => {
    const randomUUID = globalThis.crypto?.randomUUID;
    const randomPart =
        typeof randomUUID === "function"
            ? randomUUID.call(globalThis.crypto)
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `irisnote-${randomPart}`;
}; //创建设备标识

const getDeviceId = async () => {
    const storedDeviceId = await AsyncStorage.getItem(storageKeys.deviceId);
    if (storedDeviceId) return storedDeviceId;

    const nextDeviceId = createDeviceId();
    await AsyncStorage.setItem(storageKeys.deviceId, nextDeviceId); //存储设备标识
    return nextDeviceId;
}; //获取设备标识

// 请求拦截器：自动附加 token，并为验证码链路附加设备标识
api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem(storageKeys.authToken);
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    if (shouldAttachDeviceId(config.url)) {
        config.headers["X-Device-Id"] = await getDeviceId();
    }

    return config;
});

export default api;
