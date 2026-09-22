import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (userId: number) => `irisnote:todos:last-cloud-sync:${userId}`;

export async function readTodoSyncTime(userId: number): Promise<number | null> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (raw === null) return null;
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function saveTodoSyncTime(
  userId: number,
  timestamp: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), String(timestamp));
  } catch {
    // History is optional metadata: a storage failure must not fail Todo sync.
    console.warn("无法保存待办上次云同步时间");
  }
}
