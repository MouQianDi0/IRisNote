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
 * chronoAt/chronoCountdown 为系统 chronometer 秒级计时锚点（倒计时/正计时）。
 * hideProgress=true 时不设置任何进度形态（聚合卡纯文本状态卡）。
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
  chronoAt?: number | null;
  chronoCountdown?: boolean;
  iconResourceName?: string | null;
  hideProgress?: boolean;
  /** 逐条待办卡动作按钮身份：齐备时下发「取消通知/+30分钟/完成」按钮（+30分钟需有结束时间）。 */
  ownerKey?: string | null;
  clientId?: string | null;
  /** 摘录会话专用；深链、停止动作与到期撤卡共用会话身份。 */
  excerptSessionId?: string | null;
  expiresAt?: number | null;
};

/**
 * 待办动态卡片的时间线快照：退后台时移交原生，原生凭墙钟重算进度，
 * 无需 JS/数据库参与。startAt/endAt 为 epoch 毫秒；endAt 为 null 表示
 * 不定进度（文案直接使用 textStarted）；快照可含今日稍后开始的待办。
 */
export type NativeLiveTodoTimelineCard = {
  id: number;
  channelId: string;
  title: string;
  textStarted: string | null;
  startAt: number;
  endAt: number | null;
  promoted: boolean;
  summaryItems?: NativeTodoSummaryItem[];
  summarySeenActivity?: boolean;
  /** 逐条卡动作按钮身份；聚合卡与旧快照缺省。 */
  ownerKey?: string | null;
  clientId?: string | null;
};

export type NativeTodoSummaryItem = {
  title: string;
  startAt: number | null;
  endAt: number | null;
  completed: boolean;
  /** 创建时选择的重要度；high 视为「重要」。 */
  priority: "low" | "normal" | "high";
  completedAt: number | null;
  /** 动作按钮定位身份；旧快照缺省。 */
  ownerKey?: string | null;
  clientId?: string | null;
};

/** 动态卡动作标记（原生 LiveTodoActionStore 的 JSON 反序列化形态）。 */
export type NativePendingCardAction = {
  id: string;
  action: "cancel" | "snooze" | "complete";
  ownerKey: string;
  clientId: string;
  at: number;
};

export type NativeCardActionEvent = {
  action: "cancel" | "snooze" | "complete";
  ownerKey: string | null;
  clientId: string;
};

declare class IrisNoteSystemModule extends NativeModule<{
  onDynamicCardAction: (event: NativeCardActionEvent) => void;
}> {
  getExactAlarmAccess(): Promise<NativeExactAlarmAccess>;
  saveDiagnosticLog(
    sourceUri: string,
    fileName: string,
  ): Promise<SavedDiagnosticLog>;
  postProgressNotification(
    content: NativeProgressNotification,
  ): Promise<void>;
  cancelProgressNotification(id: number): Promise<void>;
  getStoppedExcerptSession(): Promise<string | null>;
  stopExcerptSession(sessionId: string): Promise<void>;
  acknowledgeStoppedExcerptSession(sessionId: string): Promise<void>;
  /** 按渠道清理本应用当前展示的全部通知（冷启动 reconcile 被杀残留的动态卡片）。 */
  cancelProgressNotificationsByChannel(channelId: string): Promise<void>;
  /** 方案 A：退后台移交时间线快照，原生闹钟节拍按墙钟差量刷新。
   *  入参为 JSON 字符串：Expo Modules 无法把 JS 嵌套对象数组转换为 Kotlin 泛型。 */
  scheduleLiveTodoCards(payload: string): Promise<void>;
  /** 方案 B 数据供给：仅更新时间线快照（不排闹钟），供前台服务每秒重算。 */
  updateLiveTodoCards(payload: string): Promise<void>;
  /** 回前台收回接管权：取消闹钟、清快照，不动已展示通知。 */
  cancelScheduledLiveTodoCards(): Promise<void>;
  /** 方案 B：启动前台服务秒级刷新（仅限应用前台调用）。 */
  startLiveTodoForegroundService(): Promise<void>;
  /** 停止前台服务。 */
  stopLiveTodoForegroundService(): Promise<void>;
  /** 动态卡动作标记快照（JSON 字符串）；读取不消费，成功应用后须调 clear。 */
  consumePendingTodoActions(): Promise<string>;
  /** 消费成功后按 id 清除动作标记（入参为 id JSON 数组字符串）。 */
  clearPendingTodoActions(payload: string): Promise<void>;
}

export default requireOptionalNativeModule<IrisNoteSystemModule>(
  "IrisNoteSystem",
);
