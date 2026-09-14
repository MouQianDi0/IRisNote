import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";

export async function openDeviceNetworkSettings() {
    if (process.env.EXPO_OS === "android") {
        try {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.PANEL_INTERNET_CONNECTIVITY,
            );
            return;
        } catch {
            await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.WIRELESS_SETTINGS,
            );
            return;
        }
    }
    await Linking.openSettings();
}
