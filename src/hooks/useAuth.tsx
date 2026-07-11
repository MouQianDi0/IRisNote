import { getUserProfile } from "@/api/user";
import type { AuthState } from "@/features/auth/auth.types";
import type { User } from "@/shared/types/user";
import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type PropsWithChildren,
} from "react";

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
    children,
}: PropsWithChildren): React.JSX.Element {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const initialLoadDone = useRef(false);

    const load = useCallback(async () => {
        const storedToken = await AsyncStorage.getItem(storageKeys.authToken);
        const storedUser = await AsyncStorage.getItem(storageKeys.authUser);
        setToken(storedToken);
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            setUser(null);
        }
        setLoading(false);
    }, []);

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
        load().then(() => {
            if (!initialLoadDone.current) {
                initialLoadDone.current = true;
                syncProfile();
            }
        });
    }, [load, syncProfile]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load]),
    );

    const logout = useCallback(async () => {
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

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within an <AuthProvider>");
    }
    return ctx;
}
