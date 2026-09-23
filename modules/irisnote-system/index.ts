import { NativeModule, requireOptionalNativeModule } from "expo";

export type NativeExactAlarmAccess = "not-required" | "granted" | "denied";

export type SavedDiagnosticLog = {
  contentUri: string;
  displayPath: string;
};

/**
 * Android 16（API 36）ProgressStyle 进度式动态通知的原生入参。
 * 进度按 progress/max 折算为百分比；indeterminate 时显示不定进度条。
 * 不申请 promoted 提升式 Live Updates（Google 政策对"普通提醒/日历事件"禁入）。
 */
export type NativeProgressNotification = {
  id: number;
  channelId: string;
  title: string;
  text: string | null;
  progress: number;
  max: number;
  indeterminate: boolean;
  ongoing: boolean;
};

declare class IrisNoteSystemModule extends NativeModule {
  getExactAlarmAccess(): Promise<NativeExactAlarmAccess>;
  saveDiagnosticLog(
    sourceUri: string,
    fileName: string,
  ): Promise<SavedDiagnosticLog>;
  postProgressNotification(
    id: number,
    channelId: string,
    title: string,
    text: string | null,
    progress: number,
    max: number,
    indeterminate: boolean,
    ongoing: boolean,
  ): Promise<void>;
  cancelProgressNotification(id: number): Promise<void>;
  /** 按渠道清理本应用当前展示的全部通知（冷启动 reconcile 被杀残留的动态卡片）。 */
  cancelProgressNotificationsByChannel(channelId: string): Promise<void>;
}

export default requireOptionalNativeModule<IrisNoteSystemModule>(
  "IrisNoteSystem",
);
