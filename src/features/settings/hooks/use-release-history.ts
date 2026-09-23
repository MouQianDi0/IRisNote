import { API_BASE_URL } from "@/shared/http/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    parseReleaseHistory,
    type ReleaseHistoryItem,
} from "../data/release-history";

const CACHE_KEY = "settings.release-history.v1";
const FETCH_TIMEOUT_MS = 12000;

type HistoryState =
    | { kind: "loading" }
    | {
          kind: "ready";
          releases: readonly ReleaseHistoryItem[];
          stale: boolean;
      }
    | { kind: "error"; message: string };

function historyEndpoint(): string {
    const configured = process.env.EXPO_PUBLIC_RELEASE_API_URL?.trim();
    const base = configured
        ? configured.replace(/\/$/, "").replace(/\/latest$/, "")
        : `${API_BASE_URL.replace(/\/$/, "")}/releases`;
    return `${base}/history`;
}

/**
 * 关于页版本记录：优先拉取服务端已发布历史；失败时回退 AsyncStorage 缓存；
 * 无缓存时进入错误态并可重试。缓存只在成功拉取后写入，保证不会持久化坏数据。
 * 初始状态即 loading；所有 setState 都发生在异步边界之后，避免级联渲染。
 */
export function useReleaseHistory() {
    const [state, setState] = useState<HistoryState>({ kind: "loading" });

    const load = useCallback(async () => {
        // 异步前置：确保不在 focus 回调同步阶段调用 setState。
        await Promise.resolve();
        try {
            const controller = new AbortController();
            const timer = setTimeout(
                () => controller.abort(),
                FETCH_TIMEOUT_MS,
            );
            let data: unknown;
            try {
                const response = await fetch(historyEndpoint(), {
                    signal: controller.signal,
                });
                if (!response.ok)
                    throw new Error(`版本服务返回 HTTP ${response.status}`);
                const body = (await response.json()) as {
                    releases?: unknown;
                };
                data = body.releases;
            } finally {
                clearTimeout(timer);
            }
            const releases = parseReleaseHistory(data);
            if (!releases) throw new Error("版本记录格式不符合预期");
            const payload = JSON.stringify(releases);
            try {
                await AsyncStorage.setItem(CACHE_KEY, payload);
            } catch {
                // 缓存写入失败只影响下次离线兜底，不影响本次展示。
            }
            setState({ kind: "ready", releases, stale: false });
        } catch {
            try {
                const cached = await AsyncStorage.getItem(CACHE_KEY);
                const releases = parseReleaseHistory(
                    cached ? (JSON.parse(cached) as unknown) : null,
                );
                if (releases) {
                    setState({ kind: "ready", releases, stale: true });
                    return;
                }
            } catch {
                // 缓存损坏视同无缓存。
            }
            setState({
                kind: "error",
                message: "暂时无法加载版本记录，请检查网络后重试",
            });
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void load();
        }, [load]),
    );

    const retry = useCallback(() => {
        setState({ kind: "loading" });
        void load();
    }, [load]);

    return { state, retry };
}
