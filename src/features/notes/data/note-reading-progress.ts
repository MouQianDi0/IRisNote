import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReadingProgressStore } from "../reading/reading-progress-store";

export const readingProgressStore = new ReadingProgressStore(AsyncStorage);
/** Compatibility facade for the note information popover. */
export async function readReadingProgress(
    owner: number,
    id: number,
): Promise<number | null> {
    try {
        const value = (await readingProgressStore.read(owner, id))?.percent;
        return value === undefined ? null : Math.round(value);
    } catch {
        return null;
    }
}
