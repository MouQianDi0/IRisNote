import { storageKeys } from "@/shared/storage/storage.keys";
import { authTokenStorage } from "@/shared/storage/token-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    create,
    getAdapter,
    isAxiosError,
    type AxiosRequestConfig,
    type GenericAbortSignal,
} from "axios";
import {
    CloudStoragePermissionError,
    createCloudStorageRequest,
    isCloudStoragePermissionError,
    isEssentialAccountRequest,
    assertCloudStorageAllowed,
    getCloudStorageSnapshot,
} from "@/core/cloud-storage/cloud-storage-policy";
import {
    publishConnectionEvent,
    requestConnectionStamp,
} from "./connection-events";
import {
    publishSessionRejected,
    rejectedSessionToken,
} from "./session-events";

declare module "axios" {
    interface AxiosRequestConfig {
        cloudStorageContext?: { ownerUserId: number; generation: number };
    }
}

const connectionStamps = new WeakMap<
    object,
    ReturnType<typeof requestConnectionStamp>
>();

type CloudRequest = {
    permission: ReturnType<typeof createCloudStorageRequest>;
    originalSignal: GenericAbortSignal | undefined;
    abort: () => void;
    dispatched: boolean;
};
const cloudRequests = new WeakMap<object, CloudRequest>();
const releaseCloudRequest = (config: object) => {
    const request = cloudRequests.get(config);
    if (!request) return;
    request.permission.release();
    request.permission.signal.removeEventListener("abort", request.abort);
    request.originalSignal?.removeEventListener?.("abort", request.abort);
    cloudRequests.delete(config);
};
const finishCloudRequest = (config: object | undefined) => {
    if (!config) return;
    const request = cloudRequests.get(config);
    if (!request) return;
    try {
        request.permission.assertCurrent();
    } catch {
        const failure = new CloudStoragePermissionError(
            "云存储授权或账号已变化，本次传输已停止",
            request.dispatched,
        );
        failure.config = config;
        return failure;
    } finally {
        releaseCloudRequest(config);
    }
};

const DEFAULT_API_BASE_URL = "https://tech-mou.top/api"; //https://tech-mou.top/api  http://localhost:3001/api

const getBaseURL = () => {
    return process.env.EXPO_PUBLIC_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
};

export const API_BASE_URL = getBaseURL();
console.log("[API] 请求地址:", API_BASE_URL, "__DEV__:", __DEV__);

const transport = create({
    baseURL: API_BASE_URL,
});

function stampCloudRequest(
    config: AxiosRequestConfig,
    url?: string,
    method?: string,
): AxiosRequestConfig {
    const request = {
        ...config,
        ...(url === undefined ? {} : { url }),
        ...(method === undefined ? {} : { method }),
    };
    if (isEssentialAccountRequest(request.method, request.url)) return request;
    assertCloudStorageAllowed();
    const state = getCloudStorageSnapshot();
    return {
        ...request,
        cloudStorageContext: {
            ownerUserId: state.ownerUserId!,
            generation: state.generation,
        },
    };
}

function stampRequestArguments(args: unknown[]): unknown[] {
    return typeof args[0] === "string"
        ? [
              args[0],
              stampCloudRequest(
                  (args[1] as AxiosRequestConfig | undefined) ?? {},
                  args[0],
              ),
          ]
        : [
              stampCloudRequest(
                  (args[0] as AxiosRequestConfig | undefined) ?? {},
              ),
          ];
}

/** Capture the caller's account synchronously, before Axios schedules any interceptors.
 * Proxy retains the complete Axios callable and generic method types.
 */
const api = new Proxy(transport, {
    apply(target, thisArg, args) {
        try {
            return Reflect.apply(target, thisArg, stampRequestArguments(args));
        } catch (error) {
            return Promise.reject(error);
        }
    },
    get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== "string" || typeof value !== "function")
            return value;
        if (property === "request") {
            return (...args: unknown[]) => {
                try {
                    return Reflect.apply(
                        value,
                        target,
                        stampRequestArguments(args),
                    );
                } catch (error) {
                    return Promise.reject(error);
                }
            };
        }
        if (
            [
                "get",
                "delete",
                "head",
                "options",
                "post",
                "put",
                "patch",
                "postForm",
                "putForm",
                "patchForm",
            ].includes(property)
        ) {
            return (...args: unknown[]) => {
                try {
                    const method = property.replace("Form", "");
                    const configIndex = ["post", "put", "patch"].includes(
                        method,
                    )
                        ? 2
                        : 1;
                    const stamped = [...args];
                    stamped[configIndex] = stampCloudRequest(
                        (args[configIndex] as AxiosRequestConfig | undefined) ??
                            {},
                        args[0] as string,
                        method,
                    );
                    return Reflect.apply(value, target, stamped);
                } catch (error) {
                    return Promise.reject(error);
                }
            };
        }
        return value;
    },
});

const shouldAttachDeviceId = (url?: string) => {
    if (!url) return false;

    return (
        url.startsWith("/verify/") ||
        url.startsWith("/user/password-reset/") ||
        url.startsWith("/user/email-change/") ||
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
    try {
        if (!isEssentialAccountRequest(config.method, config.url)) {
            const context = config.cloudStorageContext;
            const state = getCloudStorageSnapshot();
            if (
                !context ||
                context.generation !== state.generation ||
                context.ownerUserId !== state.ownerUserId
            ) {
                throw new CloudStoragePermissionError(
                    "云存储授权或账号已变化，请重新操作",
                );
            }
            const permission = createCloudStorageRequest();
            const controller = new AbortController();
            const originalSignal = config.signal;
            const abort = () => controller.abort();
            permission.signal.addEventListener("abort", abort);
            originalSignal?.addEventListener?.("abort", abort);
            if (originalSignal?.aborted) controller.abort();
            config.signal = controller.signal;
            cloudRequests.set(config, {
                permission,
                originalSignal,
                abort,
                dispatched: false,
            });
        }
        connectionStamps.set(config, requestConnectionStamp());
        if (config.method === "get" && !config.timeout) config.timeout = 15000;
        const token = await authTokenStorage.read();
        // AxiosHeaders.get is case-insensitive; fall back for plain object headers.
        const existingAuthorization =
            typeof config.headers.get === "function"
                ? config.headers.get("Authorization")
                : config.headers.Authorization;
        if (token && !existingAuthorization) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (shouldAttachDeviceId(config.url)) {
            config.headers["X-Device-Id"] = await getDeviceId();
        }

        const cloudRequest = cloudRequests.get(config);
        if (cloudRequest) {
            cloudRequest.permission.assertCurrent();
            const adapter = getAdapter(config.adapter ?? api.defaults.adapter);
            config.adapter = async (requestConfig) => {
                try {
                    cloudRequest.permission.assertCurrent();
                    cloudRequest.dispatched = true;
                    return await adapter(requestConfig);
                } catch (error: unknown) {
                    if (isCloudStoragePermissionError(error))
                        error.config = requestConfig;
                    throw error;
                }
            };
        }

        return config;
    } catch (error: unknown) {
        releaseCloudRequest(config);
        if (isCloudStoragePermissionError(error)) error.config = config;
        throw error;
    }
});

api.interceptors.response.use(
    (response) => {
        const permissionFailure = finishCloudRequest(response.config);
        if (permissionFailure) return Promise.reject(permissionFailure);
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
        const permissionFailure = finishCloudRequest(failure.config);
        if (permissionFailure) return Promise.reject(permissionFailure);
        if (isCloudStoragePermissionError(error)) return Promise.reject(error);
        if (isAxiosError(error) && error.response?.status === 401) {
            const rejected = rejectedSessionToken(
                error.config?.url,
                error.config?.headers?.get("Authorization"),
            );
            if (rejected) publishSessionRejected(rejected);
        }
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
