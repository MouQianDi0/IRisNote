import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (owner: number, id: number) => `irisnote:reading:${owner}:${id}`;
export async function readReadingProgress(owner: number, id: number): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(owner, id));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  } catch { return null; }
}
export async function saveReadingProgress(owner: number, id: number, progress: number) {
  try { await AsyncStorage.setItem(key(owner, id), String(Math.round(Math.max(0, Math.min(100, progress))))); }
  catch { console.warn("阅读位置保存失败"); }
}
