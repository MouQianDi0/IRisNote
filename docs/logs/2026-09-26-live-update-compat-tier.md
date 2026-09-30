# 动态通知全版本前后台保卡（API 26–35 兼容档）

- 日期：2026-09-26
- 基点：合并 `f2e84e8`（kroos_todo 工作区，含聚合动态通知）→ 结果：本工作区改动（待提交）
- 关联：CHANGELOG 2026-09-26 条目；`docs/logs/2026-09-26-todo-aggregate-live-update.md`（聚合卡链路）

## 一、改动清单（按层）

### modules/irisnote-system（Android，Kotlin）
- `IrisNoteSystemModule.kt`：新增 `requireLiveUpdateSupport()` 门禁（`SDK_INT ≥ 26`，抛"需要 Android 8.0"）；`postProgressNotification` / `scheduleLiveTodoCards` / `updateLiveTodoCards` / `cancelScheduledLiveTodoCards` 四个入口从 `requireProgressNotificationSupport()`（36）切换到该门禁；`startLiveTodoForegroundService` / `stopLiveTodoForegroundService` 保留 36 门禁（前台服务秒级仍仅 Android 16+）。
- `live/LiveTodoNotifier.kt`：`buildExplicitNotification` 增加 SDK 版本分支——API 36+ 维持 `Notification.ProgressStyle`；API 26–35 返回 `style = null`，走 `builder.setProgress(progress, max, indeterminate)` 平台普通进度条；promoted 反射兼容逻辑不变（低版本无符号静默退化）。同步更新方法注释。

### src/core/system-notifications
- `system-notification.service.ts`：新增 `liveUpdateCompatSupported()`（Android && API ≥ 26 && 原生模块）；`liveUpdateSupported()`（36 档）语义不变。门禁切换：`liveTodoNotificationPermission` / `liveTodoSummaryNotificationPermission` / `postLiveUpdate`（错误文案改"需要 Android 8.0"）/ `cancelLiveUpdate` / `handoffLiveTodoTimelines` / `persistLiveTodoTimelines` / `reclaimLiveTodoTimelines` / `clearStaleLiveUpdates` → compat 档；`startLiveTodoForegroundService` / `stopLiveTodoForegroundService` → 保持 36 档。`promoted` 字段注释补充低版本退化说明。
- `system-notification-native-provider.tsx`：端口 `supported` 改为 compat 档，新增 `progressStyleSupported`（36 档）；context 新增 `liveUpdateProgressCapable`；`startTodoLiveDemo` 门禁与文案改 compat 档；导入 `liveUpdateCompatSupported`。
- `system-notification-context.ts`：类型与 fallback 新增 `liveUpdateProgressCapable`。
- `system-notification-provider.tsx`：两个降级 state（pending/expo-go）补 `liveUpdateProgressCapable: false`。

### src/features
- `todos/state/todo-live-update-coordinator.ts`：端口类型新增 `progressStyleSupported()`；`applyForegroundService` 判定从 `port.supported()` 改为 `port.progressStyleSupported()`（低版本档位退后台只走方案 A 闹钟链分钟级）。`start/refresh/handoff/stop` 入口仍用 compat 档 `supported()`。
- `settings/screens/PermissionSettingsScreen.tsx`：「后台实时刷新」行的描述/禁用改用 `liveUpdateProgressCapable`（36 档）；动态通知入口行继续用 `liveUpdateCapable`（现为 compat 档，Android 8+ 可用）。

### tests
- `tests/todos/system-notifications.test.cjs`：`service()` 桩新增 `version` 参数（默认 android=36）；原生桩补 `scheduleLiveTodoCards` / FGS start/stop；新增测试"兼容档 Android 8.0 可发卡/移交，前台服务仍要求 Android 16"（26 档发卡/移交成功、FGS 拒绝；25 档权限 false、postLiveUpdate 抛"Android 8.0"）。
- `tests/todos/todo-live-update.test.cjs`：`portStub` 补 `progressStyleSupported: () => true`。

### docs
- `docs/架构指南/系统通知模块负责说明.md`：§2.2 能力函数表新增 compat 行、postProgressNotification 契约更新、降级矩阵与排查提示更新。
- `docs/UI/通知渠道适配.md`：版本升 1.5，§6.2 原生层与边界描述更新（26–35 兼容档、双能力位）。

## 二、与原代码对比（基点 f2e84e8 工作区）

| 点 | 原来 | 现在 |
|---|---|---|
| 动态通知最低系统 | `liveUpdateSupported()` 要求 API ≥ 36 + 原生模块；API < 36 入口禁用、卡片不发 | 新增 `liveUpdateCompatSupported()`：API ≥ 26 即可发卡（行为反转，能力下限 36 → 26） |
| 退后台行为（API < 36） | `handoffLiveTodoTimelines` 直接 return → 协调器按移交失败清场 `cancelTimeline()`，**退后台即撤卡** | compat 档照常移交时间线快照，原生闹钟链保卡续算（退后台保留卡片） |
| 卡片形态（API 26–35） | 无（不发卡） | 普通进度条 ongoing 通知（`setProgress`），不请求提升式；聚合卡退化为普通卡 |
| 原生 `postProgressNotification` 等四入口门禁 | `SDK_INT < 36` 抛"需要 Android 16" | 改 `SDK_INT ≥ 26` 抛"需要 Android 8.0"；`ProgressStyle` 实例化移入 36+ 分支（原低版本即使绕过门禁也会因 API 36 类崩溃） |
| 前台服务秒级（方案 B） | `liveUpdateSupported()`（36）门禁 | 不变——JS 函数与原生 FGS 入口均保持 36 档，设置页开关行改用新增 `liveUpdateProgressCapable` 判定 |
| context 能力位 | 仅 `liveUpdateCapable`（=36 档） | `liveUpdateCapable` 语义变为 compat 档（8.0+），新增 `liveUpdateProgressCapable`（36 档）；两个降级 provider 补默认 false |

## 三、改动原因

- **用户需求**：真实设备观察"退后台就撤卡"。根因是能力门禁绑死 API 36：低版本（含大量 Android 10–15 设备）`handoff` 变 no-op，协调器按失败清场撤卡——需要"前后台都能运行发送通知卡片"。
- **复用而非新建**：原生 `LiveTodoScheduler` 闹钟链、`LiveTodoTimelineStore` 持久化、`applyDesired` 差量、冷启动清理本来就是版本无关实现（M+/Q 有兜底），唯一阻碍是入口门禁与 `ProgressStyle` 类引用；拆档位即可复用整条后台链路，不新增通知通道与 ID。
- **ProgressStyle 崩溃防护**：`Notification.ProgressStyle()` 是 API 36 类，`buildExplicitNotification` 原来无条件实例化，若仅放开门禁会在低版本 `NoClassDefFoundError`；故版本分支必须做在 Notifier 内部。
- **开关语义不变**：前台服务秒级刷新依赖 `specialUse` FGS 与 36+ 行为，维持原"仅 Android 16+ 可用"的用户开关承诺，避免低版本耗电与 Android 12+ 后台 FGS 限制风险；低版本退后台接受分钟级文案（闹钟链兜底）。

## 四、完整调用链路

```
                        ┌─ API ≥ 36（ProgressStyle 档，原链路不变：提升式/上岛/FGS 秒级）
设置页入口 liveUpdateCapable ─┤
（compat 档 8.0+）        └─ API 26–35（compat 档，本次新增路径）
        │
        ▼
SystemNotificationProvider（AppState 驱动，与原链路共用）
  ├─ 前台 active → coordinator.start() → run() 30s 节拍
  │     ├─ port.post/postSummary → postLiveUpdate → native postProgressNotification
  │     │     └─ LiveTodoNotifier.buildExplicitNotification
  │     │           ├─ 36+: ProgressStyle + promoted 反射
  │     │           └─ 26–35: builder.setProgress 普通进度条（promoted 反射静默 no-op）
  │     └─ applyForegroundService → port.progressStyleSupported()=false → 跳过 FGS
  ├─ 退后台 background → coordinator.handoff()
  │     ├─ nativeTimelines：逐条卡 + 聚合卡快照
  │     └─ port.handoff → scheduleLiveTodoCards（门禁 26+）
  │           └─ LiveTodoScheduler.schedule：快照写 SharedPreferences → 立即刷一次卡
  │                 → 单闹钟链（setAndAllowWhileIdle）按 nextEventAt 续排
  │                       └─ LiveTodoAlarmReceiver → applyDesired 差量原位更新
  │                             （26–35 同样走 buildExplicitNotification 普通进度条）
  │                             → 全部结束自动撤卡停摆
  └─ 回前台 active → start() → reclaim（cancelScheduledLiveTodoCards，门禁 26+）
        → JS 差量对账接管
冷启动 clearStaleLiveUpdates（compat 档）：live-todo/live-todo-summary 渠道整清 + 撤 7001/7002
```

唯一入口不变：发卡收口仍是 `postLiveUpdate`/`postStateCard`；门控：通知权限 + 渠道重要性独立检查；降级分支：36 以下无提升式、无 FGS 秒级，均为静默视觉退化。

## 五、验证情况

- `npm run typecheck`：通过（0 错误）。
- `node --test tests/todos/system-notifications.test.cjs tests/todos/todo-live-update.test.cjs`：49/49 通过（含新增 compat 档测试）。
- `npm run gradle -- :irisnote-system:compileReleaseKotlin`（aliyun init）：BUILD SUCCESSFUL。
- `npm run check` 全量、Android 真机（26–35 设备退后台保卡、36 设备回归）：**未执行**。
