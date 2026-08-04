export {
    DEFAULT_NOTE_STATISTICS_OPTIONS,
    getCachedNoteTextLength,
    getCachedNoteTextStatistics,
    NOTE_STATISTICS_RULE_VERSION,
} from "./noteTextLength";
export { clearNoteStatisticsCache } from "./cache/noteStatisticsCache";
export type {
    ChineseSegmentationMode,
    NoteStatisticsOptions,
    NoteTextStatistics,
} from "./types";
