import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (userId: number) => `irisnote:notes:last-cloud-sync:${userId}`;

export async function readNoteSyncTime(userId: number): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const timestamp = Number(raw);
    return raw &&
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      timestamp <= Date.now()
      ? timestamp
      : null;
  } catch {
    return null;
  }
}

export async function saveNoteSyncTime(
  userId: number,
  timestamp: number,
): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), String(timestamp));
  } catch {
    // History is optional metadata: a storage failure must not fail note sync.
    console.warn("无法保存上次云同步时间");
  }
}

export function formatNoteSyncTime(
  timestamp: number | null,
  now = new Date(),
): string {
  if (timestamp === null) return "尚未同步";
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  // Compare local calendar dates via UTC ordinals to avoid DST-length days.
  const days = Math.max(1, Math.floor((
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  ) / 86400000));
  if (days >= 365) return `${Math.floor(days / 365)}年前`;
  if (days >= 30) return `${Math.floor(days / 30)}月前`;
  if (days >= 7) return `${Math.floor(days / 7)}周前`;
  return `${days}日前`;
}
