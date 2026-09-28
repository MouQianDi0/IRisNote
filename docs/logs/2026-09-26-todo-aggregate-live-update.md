# Android 16 待办聚合动态通知（合并自 codex-a）

- 日期：2026-09-26
- 基点：`cac0b44`（kroos_todo 与 codex-a 的 merge-base）→ 结果：合并提交 `f2e84e8`（来源 `83a114f feat(todos): add Android 16 aggregate live update`）
- 关联：CHANGELOG 2026-09-25 18:23:56 条目；分支 `kroos_vps/codex-a`

## 一、改动清单（按层）

共 18 个代码/测试文件，+632/-40 行，另有 2 篇文档与 CHANGELOG。实质改动为单一功能：待办聚合动态卡。

### src/features
- `services/todo-aggregate-live.service.ts`（新增，128 行）：聚合纯函数层。`todoSummaryTimeline` 提取当日快照；`desiredTodoSummary` 按优先级推导 active/near/today/ended 四场景卡；常量 `TODO_SUMMARY_NEAR_MS = 60min`、`TODO_SUMMARY_END_HOLD_MS = 10min`。
- `state/todo-live-update-coordinator.ts`（+167）：端口新增 `summaryPermissionGranted/postSummary`；双通道并行权限读取（`Promise.allSettled`）；`nativeTimelines` 在移交时间线后追加聚合卡；`run()` 聚合卡差量发/撤；`handedOffIds` 移交后对账；`summaryOwnerKey/summaryDateId` 跨账号/跨天重置 `seenActivity`；FGS 判定纳入 `summaryCard.secondsEligible`。
- `services/todo-live-update.service.ts`（2 处）：逐条真实卡与 60 秒模拟卡 `promoted: true → false`。

### src/core/system-notifications
- `system-notification.types.ts`：新增 `LIVE_TODO_SUMMARY_CHANNEL = "irisnote.live-todo-summary.v1"`、`LIVE_TODO_SUMMARY_NOTIFICATION_ID = 7002`。
- `system-notification.service.ts`（+55）：新建"待办总览"渠道（LOW/静音/无角标/锁屏 PRIVATE）；`liveTodoSummaryNotificationPermission`；通用状态卡协议 `postStateCard`/`StateCardPayload`；`clearStaleLiveUpdates` 增加 summary 渠道整清 + 撤 7002。
- `system-notification-native-provider.tsx`（+13）：端口注入 summary 权限与 `postSummary`；逐条卡 `post` 显式 `promoted: false`。

### modules/irisnote-system（Android）
- `live/LiveTodoSummary.kt`（新增，71 行）：`scene()` 为 JS `desiredTodoSummary` 的 Kotlin 镜像；`nextEventAt()` 收集场景边界事件作为下一闹钟点（含活动态分钟兜底）。
- `live/LiveTodoTimeline.kt`（+46）：`LiveTodoTimelineCard` 增加 `summaryItems/summarySeenActivity` 字段与序列化解析。
- `live/LiveTodoNotifier.kt`（+24）、`LiveTodoScheduler.kt`（+5）：通知支持 `iconResourceName` 状态图标；调度循环原生差量刷新聚合卡、按 `nextEventAt` 续排闹钟。
- `IrisNoteSystemModule.kt`（+14）：`scheduleLiveTodoCards` 解析 `summaryItems`（Map 风格入参）；状态卡入口支持 `iconResourceName`。
- `index.ts`（+12）：`NativeLiveTodoTimelineCard`/`NativeTodoSummaryItem` 类型。
- `res/drawable/ic_live_todo_{active,near,today,ended}.xml`（新增 ×4）：四场景状态图标。

### tests
- `todo-live-update.test.cjs`（+88）：四场景、`seenActivity` 门控、结束 10 分钟窗口、排序稳定性。
- `system-notifications.test.cjs`（+23）：summary 渠道独立性、`postLiveUpdate` 默认非提升、`postStateCard` 唯一提升入口（单一来源约束）。

### docs
- `docs/待办/待办聚合动态通知设计（Android 16）.md`（新增）、`docs/UI/通知渠道适配.md`（版本 1.4）、`docs/架构指南/系统通知模块负责说明.md`、`CHANGELOG.md`。

## 二、与原代码对比（基点 cac0b44）

| 点 | 原来 | 现在 |
|---|---|---|
| 提升式展示归属 | `postLiveUpdate` 的 `promoted` 默认 `true`，逐条卡与模拟卡均默认请求提升 | 默认改 `false`；逐条/模拟卡显式非提升；**仅 `postStateCard`（聚合卡）明确 `promoted: true`**（行为反转，唯一提升入口） |
| 通知渠道 | 仅 `irisnote.live-todo.v1` 一条动态通知渠道 | 新增独立 `irisnote.live-todo-summary.v1`（LOW/静默/无角标），用户可单独关闭 |
| 通知 ID | 动态通知仅 7001（模拟演示） | 新增 7002（聚合卡），均在 0–9999 保留段语义内 |
| 权限读取 | 协调器单读 `permissionGranted`，失败即整轮跳过 | `readPermissions` 双通道并行（`Promise.allSettled`），逐条卡与聚合卡互不阻塞 |
| 退后台移交 | 只移交逐条时间线 | 追加聚合卡（`endAt = 当日 24:00`，携带 `summaryItems` 快照），后台由原生重算场景 |
| 后台场景更新 | 无（逐条卡只有开始/结束边界） | `LiveTodoSummary.nextEventAt` 提供场景边界闹钟链（start-1h/start/end/+10min/分钟兜底） |
| 冷启动清理 | live-todo 渠道整清 + 撤 7001 | 增加 summary 渠道整清 + 撤 7002 |

## 三、改动原因

- **提升名额竞争**：Android 16 提升式（Live Updates/上岛）展示位有限，逐条卡与模拟卡默认提升会互相挤占；改为聚合卡独占提升位，逐条卡保留 ProgressStyle 普通展示。
- **权限独立性**：聚合卡与逐条卡分渠道，用户可只关聚合卡；权限读取互不阻塞，一路失败不拖垮另一路。
- **后台可用性**：退后台后 JS 不可靠，故把场景推导逻辑做成 JS/Kotlin 双端镜像纯函数（阈值 60min/10min、优先级、文案一致），后台由同一闹钟链按 `nextEventAt` 差量重算，进程被杀后从 SharedPreferences 恢复。
- **冷启动防护**：`seenActivity` 门控防止冷启动直接补发"结束"空卡；结束态仅在最后一个终止事件后保留 10 分钟即撤。
- **防文案跳动**：同时刻待办按脱敏标题排序，输入顺序变化不引起聚合文案抖动；诊断只记场景/数量/ID，不记待办正文（隐私约束）。

## 四、完整调用链路

```
Zustand todo store（ownerKey 隔离的当日待办实体）
  ▼
TodoLiveUpdateCoordinator（前台 30s 节拍 + focus/订阅驱动 run()）
  ├─ readPermissions()：应用通知权限 + live-todo 渠道 + live-todo-summary 渠道（独立可关）
  ├─ todoSummaryTimeline(entities, now, seenActivity)   ← 纯函数快照（只取今日、标题脱敏）
  ├─ desiredTodoSummary(timeline, now, fgsRunning)      ← active/near/today/ended 四场景
  ▼
SystemNotificationProvider 端口（core/system-notifications/native-provider）
  ├─ port.post(逐条卡)        → postLiveUpdate(promoted:false)
  ├─ port.postSummary(聚合卡)  → postStateCard(promoted:true ← 唯一提升入口)
  │     └─ IrisNoteSystemModule.postStateCard（iconResourceName + chrono 倒计时锚点）
  │           └─ NotificationManager → "待办总览"渠道，ID 7002
  │                 └─ Live Updates 提升式（36.1+ 上岛；36.0 退化普通进度卡）
  └─ port.handoff([逐条时间线…, 聚合卡])   ← 退后台移交
        └─ scheduleLiveTodoCards
              ├─ 快照写 SharedPreferences（进程被杀可恢复续算）
              ├─ LiveTodoNotifier 构建聚合卡（四场景图标）
              └─ LiveTodoScheduler 单一 AlarmManager 链（setAndAllowWhileIdle）
                    ├─ LiveTodoSummary.scene()：原生重算场景 → 差量原位更新（分钟级）
                    ├─ LiveTodoSummary.nextEventAt()：排下一场景边界闹钟
                    └─ 全部结束自动停摆；冷启动 clearStaleLiveUpdates 撤渠道+7002
  ▼
前台服务（方案 B 开关；当逐条卡存在或聚合卡 secondsEligible 时运行）
  └─ 最后一小时活动态每秒重算（mm:ss 平滑）；后台降为分钟文案
  ▼
诊断（core/diagnostics）：只记场景/数量/通知 ID
```

## 五、验证情况

- 本次合并后：`npm run typecheck` 通过；全仓冲突标记扫描通过（仅文档示例命中）；`npm run check` 全量、Android 编译与真机验收**未执行**。
- 功能原始验证（codex-a 提交时）：受影响待办/通知测试通过；`EXPO_NO_TELEMETRY=1 npm run check` 513/516 通过（1 失败为既有 `ENAMETOOLONG`）；`:irisnote-system:compileReleaseKotlin` 因环境无 JDK 未运行，真机展示未验收。
