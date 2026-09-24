import { getUserProfile } from "@/features/auth/api/session.api";
import type { User } from "@/shared/types/user";
import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect, type Href } from "expo-router";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PropsWithChildren,
} from "react";
import { AuthContext } from "../auth.context";
import { banner } from "@/core/notifications";
import { resetConnectionSession } from "@/shared/http/connection-events";
import { onSessionRejected } from "@/shared/http/session-events";
import { setCloudStorageSession } from "@/core/cloud-storage/cloud-storage-policy";

const welcomeRoute = "/auth/welcome" as Href;

async function readStoredSession() {
    const storedToken = await AsyncStorage.getItem(storageKeys.authToken);
    const storedUser = await AsyncStorage.getItem(storageKeys.authUser);
    return {
        token: storedToken,
        user: storedUser ? (JSON.parse(storedUser) as User) : null,
    };
}

export function AuthProvider({
    children,
}: PropsWithChildren): React.JSX.Element {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);

    const applySession = useCallback(
        (session: Awaited<ReturnType<typeof readStoredSession>>) => {
            setToken(session.token);
            setUser(session.user);
            setLoading(false);
        },
        [],
    );

    const load = useCallback(async () => {
        applySession(await readStoredSession());
    }, [applySession]);

    const syncProfile = useCallback(async () => {
        const storedToken = await AsyncStorage.getItem(storageKeys.authToken);
        if (!storedToken) return;
        try {
            const profile = await getUserProfile();
            await AsyncStorage.setItem(
                storageKeys.authUser,
                JSON.stringify(profile),
            );
            setUser(profile);
        } catch {
            // 服务端同步失败时保留本地数据
        }
    }, []);

    const applyAvatar = useCallback(
        async (userId: number, avatar: string) => {
            const { user: storedUser } = await readStoredSession();
            if (!storedUser || storedUser.id !== userId) return false;
            try {
                await AsyncStorage.setItem(
                    storageKeys.authUser,
                    JSON.stringify({ ...storedUser, avatar }),
                );
            } catch {
                // 缓存写入失败时仍以回执更新界面，后续资料同步会再次落盘
            }
            setUser((current) =>
                current?.id === userId ? { ...current, avatar } : current,
            );
            return true;
        },
        [],
    );

    const applyUser = useCallback(async (next: User) => {
        const { user: storedUser } = await readStoredSession();
        if (!storedUser || storedUser.id !== next.id) return false;
        try {
            await AsyncStorage.setItem(
                storageKeys.authUser,
                JSON.stringify(next),
            );
        } catch {
            // 缓存写入失败时仍以服务端回执更新界面，后续资料同步会再次落盘
        }
        setUser((current) => (current?.id === next.id ? next : current));
        return true;
    }, []);

    const applyToken = useCallback(async (nextToken: string, next: User) => {
        const { user: storedUser } = await readStoredSession();
        if (!storedUser || storedUser.id !== next.id) return false;
        // 令牌必须落盘：写入失败时本机仍持有已被撤销的旧令牌，交由调用方提示重新登录。
        await AsyncStorage.setItem(storageKeys.authToken, nextToken);
        try {
            await AsyncStorage.setItem(
                storageKeys.authUser,
                JSON.stringify(next),
            );
        } catch {
            // 资料缓存写入失败时仍以回执更新界面，后续资料同步会再次落盘
        }
        setToken(nextToken);
        setUser((current) => (current?.id === next.id ? next : current));
        return true;
    }, []);

    useEffect(() => {
        let active = true;
        void readStoredSession().then((session) => {
            if (!active) return;
            applySession(session);
            if (!initialLoadDone.current) {
                initialLoadDone.current = true;
                syncProfile();
            }
        });
        return () => {
            active = false;
        };
    }, [applySession, syncProfile]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load]),
    );

    const logout = useCallback(async () => {
        setCloudStorageSession(null, false, false);
        banner.clearSession();
        resetConnectionSession();
        await AsyncStorage.removeItem(storageKeys.authToken);
        await AsyncStorage.removeItem(storageKeys.authUser);
        setUser(null);
        setToken(null);
    }, []);

    // 只有被拒绝的令牌仍是本机当前令牌才退出：旧账号或换新令牌前发出的迟到请求不影响当前登录。
    const expiring = useRef(false);
    useEffect(
        () =>
            onSessionRejected((rejected) => {
                void (async () => {
                    if (expiring.current) return;
                    const current = await AsyncStorage.getItem(
                        storageKeys.authToken,
                    );
                    if (!current || current !== rejected || expiring.current)
                        return;
                    expiring.current = true;
                    try {
                        await logout();
                        banner.show({
                            title: "登录已失效",
                            message: "请重新登录，本机数据不受影响",
                            type: "important",
                        });
                        router.replace(welcomeRoute);
                    } finally {
                        expiring.current = false;
                    }
                })();
            }),
        [logout],
    );

    return (
        <AuthContext.Provider
            value={{
                isLoggedIn: !!token && !!user,
                user,
                token,
                loading,
                logout,
                refresh: load,
                syncProfile,
                applyAvatar,
                applyUser,
                applyToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
