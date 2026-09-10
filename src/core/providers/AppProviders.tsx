import { ApplicationDatabaseProvider } from "@/core/database";
import { NotificationProvider } from "@/core/notifications/notification-provider";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import type { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export function AppProviders({ children }: PropsWithChildren) {
    return (
        <ApplicationDatabaseProvider>
            <AuthProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <NotificationProvider>{children}</NotificationProvider>
                </GestureHandlerRootView>
            </AuthProvider>
        </ApplicationDatabaseProvider>
    );
}
