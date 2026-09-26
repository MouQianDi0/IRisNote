import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReadingProgressStore } from "../reading/reading-progress-store";

export const readingProgressStore = new ReadingProgressStore(AsyncStorage);

const readingProgressListeners = new Set<(ownerUserId: number) => void>();

export function onReadingProgressChanged(listener: (ownerUserId: number) => void) {
    readingProgressListeners.add(listener);
    return () => {
        readingProgressListeners.delete(listener);
    };
}

export function notifyReadingProgressChanged(ownerUserId: number) {
    readingProgressListeners.forEach((listener) => listener(ownerUserId));
}

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
