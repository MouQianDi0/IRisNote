import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export function AppProviders({ children }: PropsWithChildren) {
    return (
        <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
                {children}
            </GestureHandlerRootView>
        </AuthProvider>
    );
}
