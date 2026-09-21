import { banner } from "@/core/notifications";
import { systemNotificationsAvailable } from "@/core/system-notifications/system-notification-provider";
import { ANDROID_PACKAGE } from "@/features/updates/release";
import { Card, Screen } from "@/shared/ui";
import * as ImagePicker from "expo-image-picker";
import * as IntentLauncher from "expo-intent-launcher";
import { router, useFocusEffect } from "expo-router";
import {
    Bell,
    Camera,
    Image as ImageIcon,
    PackageCheck,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import {
    AppState,
    Linking,
    Platform,
    ScrollView,
    Text,
    View,
} from "react-native";
import NativeUpdater from "../../../../modules/irisnote-updater";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { SettingsRow } from "../components/SettingsRow";

type PermissionItemState = {
    label: string;
    granted: boolean;
    canAskAgain: boolean;
    supported: boolean;
};

type PermissionSnapshot = {
    notifications: PermissionItemState;
    camera: PermissionItemState;
    photos: PermissionItemState;
    updates: PermissionItemState;
};

const readingState: PermissionItemState = {
    label: "读取中",
    granted: false,
    canAskAgain: false,
    supported: true,
};

const unavailableState = (label: string): PermissionItemState => ({
    label,
    granted: false,
    canAskAgain: false,
    supported: false,
});

async function readPermissionSnapshot(): Promise<PermissionSnapshot> {
    const mobile = Platform.OS === "android" || Platform.OS === "ios";
    const [notifications, camera, photos, updates] = await Promise.all([
        systemNotificationsAvailable
            ? import("@/core/system-notifications/system-notification.service")
                  .then(({ systemNotifications }) =>
                      systemNotifications.permission(),
                  )
                  .then((value) => ({
                      label: value.granted ? "已开启" : "未开启",
                      granted: value.granted,
                      canAskAgain: value.canAskAgain,
                      supported: true,
                  }))
                  .catch(() => ({ ...readingState, label: "暂时无法读取" }))
            : Promise.resolve(unavailableState("Expo Go 中不可用")),
        mobile
            ? ImagePicker.getCameraPermissionsAsync()
                  .then((value) => ({
                      label: value.granted ? "已允许" : "未允许",
                      granted: value.granted,
                      canAskAgain: value.canAskAgain,
                      supported: true,
                  }))
                  .catch(() => ({ ...readingState, label: "暂时无法读取" }))
            : Promise.resolve(unavailableState("当前平台不可用")),
        mobile
            ? ImagePicker.getMediaLibraryPermissionsAsync()
                  .then((value) => ({
                      label:
                          value.accessPrivileges === "limited"
                              ? "部分允许"
                              : value.granted
                                ? "已允许"
                                : "未允许",
                      granted: value.granted,
                      canAskAgain: value.canAskAgain,
                      supported: true,
                  }))
                  .catch(() => ({ ...readingState, label: "暂时无法读取" }))
            : Promise.resolve(unavailableState("当前平台不可用")),
        Platform.OS === "android"
            ? NativeUpdater
                ? NativeUpdater.canInstallPackages()
                      .then((granted) => ({
                          label: granted ? "已允许" : "未允许",
                          granted,
                          canAskAgain: false,
                          supported: true,
                      }))
                      .catch(() => ({ ...readingState, label: "暂时无法读取" }))
                : Promise.resolve(unavailableState("正式安装包中可用"))
            : Promise.resolve(unavailableState("仅 Android 需要")),
    ]);
    return { notifications, camera, photos, updates };
}

async function openApplicationSettings() {
    if (Platform.OS !== "android" && Platform.OS !== "ios")
        throw new Error("当前平台不支持应用权限设置");
    await Linking.openSettings();
}

export default function PermissionSettingsScreen() {
    const [snapshot, setSnapshot] = useState<PermissionSnapshot>({
        notifications: readingState,
        camera: readingState,
        photos: readingState,
        updates:
            Platform.OS === "android"
                ? readingState
                : unavailableState("仅 Android 需要"),
    });

    const refresh = useCallback(async () => {
        setSnapshot(await readPermissionSnapshot());
    }, []);

    useFocusEffect(
        useCallback(() => {
            let active = true;
            const load = async () => {
                const next = await readPermissionSnapshot();
                if (active) setSnapshot(next);
            };
            void load();
            const appState = AppState.addEventListener("change", (state) => {
                if (state === "active") void load();
            });
            return () => {
                active = false;
                appState.remove();
            };
        }, []),
    );

    const showOpenError = (name: string) => {
        banner.show({
            title: `无法打开${name}设置`,
            message: "请在手机系统设置中找到 IRisNote 后手动调整",
            type: "neutral",
        });
    };

    const handleNotifications = async () => {
        try {
            const { openSystemNotificationSettings } =
                await import("@/core/system-notifications/system-notification.service");
            await openSystemNotificationSettings();
            await refresh();
        } catch {
            showOpenError("通知权限");
        }
    };

    const handleImagePermission = async (kind: "camera" | "photos") => {
        try {
            await openApplicationSettings();
            await refresh();
        } catch {
            showOpenError(kind === "camera" ? "相机权限" : "照片权限");
        }
    };

    const handleUpdatePermission = async () => {
        try {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
                { data: `package:${ANDROID_PACKAGE}` },
            );
            await refresh();
        } catch {
            showOpenError("安装应用更新授权");
        }
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <SettingsPageHeader
                        title="权限设置"
                        backLabel="返回设置"
                        onBack={() => router.back()}
                    />
                    <Text className="mb-3 ml-1 text-sm leading-5 text-hyper-text-secondary">
                        管理 IRisNote
                        使用的手机权限。进入页面只读取状态，点击对应项目可直接打开系统设置。
                    </Text>
                    <Card
                        className="overflow-hidden rounded-hyper-card"
                        style={{ borderCurve: "continuous" }}
                    >
                        <SettingsRow
                            icon={Bell}
                            label="通知"
                            value={snapshot.notifications.label}
                            description="用于待办事项到时提醒"
                            disabled={!snapshot.notifications.supported}
                            onPress={handleNotifications}
                        />
                        <SettingsRow
                            icon={Camera}
                            label="相机"
                            value={snapshot.camera.label}
                            description="用于拍摄头像"
                            disabled={!snapshot.camera.supported}
                            onPress={() => void handleImagePermission("camera")}
                        />
                        <SettingsRow
                            icon={ImageIcon}
                            label="照片访问"
                            value={snapshot.photos.label}
                            description="用于从照片中选择头像"
                            disabled={!snapshot.photos.supported}
                            onPress={() => void handleImagePermission("photos")}
                        />
                        <SettingsRow
                            icon={PackageCheck}
                            label="安装应用更新"
                            value={snapshot.updates.label}
                            description="用于安装 IRisNote 下载的更新包"
                            disabled={!snapshot.updates.supported}
                            onPress={() => void handleUpdatePermission()}
                            last
                        />
                    </Card>
                    <View className="mt-4 rounded-hyper-control bg-hyper-card-selected p-4">
                        <Text className="text-sm leading-5 text-text-secondary">
                            权限由手机系统管理。关闭权限不会删除已有数据，但对应功能可能暂时不可用。
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}
