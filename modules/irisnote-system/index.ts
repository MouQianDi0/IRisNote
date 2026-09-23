import { NativeModule, requireOptionalNativeModule } from "expo";

export type NativeExactAlarmAccess = "not-required" | "granted" | "denied";

export type SavedDiagnosticLog = {
  contentUri: string;
  displayPath: string;
};

/**
 * Android 16（API 36）ProgressStyle 进度式动态通知的原生入参。
 * 进度按 progress/max 折算为百分比；indeterminate 时显示不定进度条。
 * promoted=true 请求 Live Updates 提升式展示（上岛）：原生经反射调用
 * setRequestPromotedOngoing（API 36.1 框架符号），36.0 设备退化为普通进度卡片；
 * 仅用于进行中任务/计时器，普通提醒类禁入（政策边界见通知渠道适配 §2.4）。
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
  promoted: boolean;
};

declare class IrisNoteSystemModule extends NativeModule {
  getExactAlarmAccess(): Promise<NativeExactAlarmAccess>;
  saveDiagnosticLog(
    sourceUri: string,
    fileName: string,
  ): Promise<SavedDiagnosticLog>;
  postProgressNotification(
    content: NativeProgressNotification,
  ): Promise<void>;
  cancelProgressNotification(id: number): Promise<void>;
  /** 按渠道清理本应用当前展示的全部通知（冷启动 reconcile 被杀残留的动态卡片）。 */
  cancelProgressNotificationsByChannel(channelId: string): Promise<void>;
}

export default requireOptionalNativeModule<IrisNoteSystemModule>(
  "IrisNoteSystem",
);
