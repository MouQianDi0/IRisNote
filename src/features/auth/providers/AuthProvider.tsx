import { getUserProfile } from "@/features/auth/api/session.api";
import type { User } from "@/shared/types/user";
import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
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
import { setCloudStorageSession } from "@/core/cloud-storage/cloud-storage-policy";

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
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
