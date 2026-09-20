import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "axios";
import {
    publishConnectionEvent,
    requestConnectionStamp,
} from "./connection-events";

const connectionStamps = new WeakMap<
  object,
  ReturnType<typeof requestConnectionStamp>
>();

const DEFAULT_API_BASE_URL = "https://tech-mou.top/api"; //https://tech-mou.top/api  http://localhost:3001/api

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
  connectionStamps.set(config, requestConnectionStamp());
  if (config.method === "get" && !config.timeout) config.timeout = 15000;
  const token = await AsyncStorage.getItem(storageKeys.authToken);
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (shouldAttachDeviceId(config.url)) {
    config.headers["X-Device-Id"] = await getDeviceId();
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    const stamp = connectionStamps.get(response.config);
    if (stamp) publishConnectionEvent({ ...stamp, outcome: "success" });
    return response;
  },
  (error: unknown) => {
    const failure = error as {
      config?: object;
      code?: string;
      response?: { status: number };
    };
    const stamp = failure.config && connectionStamps.get(failure.config);
    if (stamp && failure.code !== "ERR_CANCELED") {
      const status = failure.response?.status;
      const unavailable =
        status === 502 ||
        status === 503 ||
        status === 504 ||
        (!status &&
          ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(
            failure.code ?? "",
          ));
      publishConnectionEvent({
        ...stamp,
        outcome: unavailable ? "unavailable" : "reachable",
      });
    }
    return Promise.reject(error);
  },
);

export default api;
