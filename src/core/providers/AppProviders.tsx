import { ApplicationDatabaseProvider } from "@/core/database";
import { CloudStorageProvider } from "@/core/cloud-storage/cloud-storage-provider";
import { NotificationProvider } from "@/core/notifications/notification-provider";
import { SystemNotificationProvider } from "@/core/system-notifications/system-notification-provider";
import { TodoSyncProvider } from "@/features/todos/state/todo-sync-provider";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { UpdateDialog } from "@/features/updates/UpdateDialog";
import type { PropsWithChildren } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export function AppProviders({ children }: PropsWithChildren) {
    return (
        <ApplicationDatabaseProvider>
            <AuthProvider>
                <CloudStorageProvider>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                        <NotificationProvider>
                            <SystemNotificationProvider>
                                <TodoSyncProvider>
                                    {children}
                                    <UpdateDialog />
                                </TodoSyncProvider>
                            </SystemNotificationProvider>
                        </NotificationProvider>
                    </GestureHandlerRootView>
                </CloudStorageProvider>
            </AuthProvider>
        </ApplicationDatabaseProvider>
    );
}
