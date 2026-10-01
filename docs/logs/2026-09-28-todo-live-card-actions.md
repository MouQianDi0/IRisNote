# 2026-09-28 待办动态卡片三操作按钮（取消通知/+30分钟/完成）

> 基点：`HEAD`（本篇改动均未提交，与原代码对比基于 `git diff HEAD` 实测）。
> 修订：2026-09-29 按用户确认，原「延迟30分钟」（开始/结束整体后移、跨午夜滚 dateId）改为「+30分钟」——仅结束时间后移 30 分钟，开始时间不动；无结束时间的卡不下发该按钮；+30 分钟跨过午夜按无效废弃。本文已按修订后现状描述。
> 关联：`docs/架构指南/系统通知模块负责说明.md`（已同步回写）、`CHANGELOG.md` 同日条目。

## 一、改动清单（按层）

### modules/irisnote-system（原生模块）

| 文件 | 改动 |
|---|---|
| `android/.../live/LiveTodoTimeline.kt`（修改） | `LiveTodoTimelineCard` 与 `LiveTodoSummaryItem` 新增可空字段 `ownerKey`/`clientId`；`fromJson` 解析（缺省 null 兼容旧快照）、`LiveTodoTimelineStore.save` 序列化均补两字段 |
| `android/.../live/LiveTodoActionStore.kt`（新增，约 100 行） | 动作标记持久化：SharedPreferences `irisnote_live_todo_actions` + JSON 数组；`append`（同 action+ownerKey+clientId 去重覆盖）、`load`（坏条目跳过）、`removeAll(ids)` |
| `android/.../live/LiveTodoActionReceiver.kt`（新增，约 150 行） | 动作广播接收器：`applyCancel`（移除逐条卡）、`applySnooze`（仅把逐条卡与聚合 item 的 endAt +30min，startAt 不动，无 endAt 不产生变更）、`applyComplete`（移除逐条卡 + 聚合 item 置 completed/completedAt）；统一撤卡、`applyDesired` 原生重算 + `armNext` 续排、写标记、`emitCardAction` |
| `android/.../live/LiveTodoNotifier.kt`（修改） | `buildExplicitNotification` 新增可选 `notificationId`/`ownerKey`/`clientId` 参数；`addTodoActions` 按身份下发按钮（[取消通知][+30分钟][完成]，单色图标，PendingIntent→接收器，请求码混入通知 ID+动作+clientId 防覆盖；+30分钟仅在非 indeterminate 即有结束时间时下发）；逐条卡 `buildNotification` 透传卡身份，聚合卡不下发 |
| `android/.../IrisNoteSystemModule.kt`（修改） | `Events("onDynamicCardAction")` + `OnCreate/OnDestroy` 装卸 companion 事件桥 `cardActionSink`（`sendEvent` 失败静默，标记兜底）；`postProgressNotification` 透传可选 `ownerKey`/`clientId` 与 `notificationId`；新增 `consumePendingTodoActions()`（读标记 JSON 串，不消费）与 `clearPendingTodoActions(payload)`（按 id 清除） |
| `android/.../AndroidManifest.xml`（修改） | 声明 `.live.LiveTodoActionReceiver`（exported=false） |
| `res/drawable/ic_action_todo_cancel.xml` 等 3 个（新增） | 24dp 单色（白）矢量：X、时钟、对勾，供通知按钮自动着色 |

### src/features/todos（业务域）

| 文件 | 改动 |
|---|---|
| `services/todo-live-update.service.ts`（修改） | `TodoLiveUpdateCard`/`TodoLiveTimelineCard` 新增可选 `ownerKey`/`clientId`；`desiredTodoLiveUpdate`/`desiredTodoLiveTimeline` 从实体填充（演示卡不带） |
| `services/todo-aggregate-live.service.ts`（修改） | `TodoSummaryItem` 新增必填 `ownerKey`/`clientId`；`todoSummaryTimeline` 填充 |
| `services/todo-card-action.service.ts`（新增，约 350 行） | 消费例程核心：`parsePendingCardActions`（严格解析，坏条目丢弃）、`postponeTodoEndTime`（仅 `endTime` +30min；无结束或跨午夜抛 TodoError.validation——数据模型要求同日结束≥开始，调用方按不可恢复错误丢弃）、`LiveTodoCardSuppressions`（AsyncStorage 抑制表 + 内存缓存 + 按 clientId 存在性修剪）、`consumePendingCardActions`（读取→逐条应用→成功按 id 清除；applied/discarded 清标记，kept 留存）、`applyWithConflictRetry`（TodoError.conflict 重读一次再试，再冲突/校验无效废弃，其余失败留存） |
| `state/todo-live-update-coordinator.ts`（修改） | 构造器新增可选 `options.isSuppressed`；`visibleTodos` 过滤仅作用于逐条卡（`run()` 的 `desiredTodoLiveUpdates` 与 `nativeTimelines` 的 details，聚合卡统计不过滤）；`toNativeTimeline` 透传身份字段 |

### src/core/system-notifications

| 文件 | 改动 |
|---|---|
| `system-notification-native-provider.tsx`（修改） | 引入 `NativeSystem`；新增 `cardActionPort`（native 空实现降级/`findTodo` 三态/更新与完成委托仓库/dismiss 写抑制表）与 `runCardActionConsumption`（防重入 + 抑制表修剪）；`refresh()` 在 reconcile 前消费标记；`AppState=background` 先消费再 `handoff()`；注册 `onDynamicCardAction` 监听（卸载移除） |

### modules/irisnote-system/index.ts（JS 绑定）

| 文件 | 改动 |
|---|---|
| `index.ts`（修改） | `NativeProgressNotification`/`NativeLiveTodoTimelineCard`/`NativeTodoSummaryItem` 加身份字段类型；新增 `NativePendingCardAction`/`NativeCardActionEvent` 类型；模块类声明 `consumePendingTodoActions`/`clearPendingTodoActions` 与 `NativeModule<{ onDynamicCardAction: ... }>` 事件泛型 |

### tests

| 文件 | 改动 |
|---|---|
| `tests/todos/todo-card-actions.test.cjs`（新增，15 用例） | 标记解析过滤、+30 分钟字段（仅结束/无结束抛校验/跨午夜拒绝）、消费例程（取消+抑制持久、完成落库/已完成/已删/账号不匹配保留/冲突重读重试/重试仍冲突废弃、+30 应用仅改 endTime 且开始不动/已完成废弃/无结束废弃/意外失败留存） |
| `tests/todos/todo-live-update.test.cjs`（修改） | 模拟卡移交快照断言补充 `ownerKey: null, clientId: null`（新字段，模拟卡无身份不下发按钮） |

### docs

| 文件 | 改动 |
|---|---|
| `docs/架构指南/系统通知模块负责说明.md` | 回写动作链路（§2.3/§2.4 文件表、§3.1 展示方式、新增 §4.3.3、快速索引） |
| `CHANGELOG.md`、`docs/logs/2026-09-28-todo-live-card-actions.md` | 同日记录 |

## 二、与原代码对比（基点 HEAD）

| 点 | 原来 | 现在 |
|---|---|---|
| 动态卡交互 | 逐条卡仅 `contentIntent`（点正文开主界面），无任何按钮 | 逐条卡带[取消通知][+30分钟][完成]按钮，点击不打开应用；无结束时间的卡只有[取消通知][完成] |
| 快照身份 | `LiveTodoTimelineCard`/聚合 item 只有 FNV 整型卡 ID，无法反查待办 | 携带 `ownerKey`/`clientId`（旧快照 null 兼容），原生可精确定位待办 |
| 卡片生命周期 | 仅由 JS 差量（前台）与原生节拍（后台）按仓库状态驱动 | 新增"用户取消"维度：抑制表让被取消的待办不再参与逐条卡构建（前台与移交同口径） |
| 原生侧数据变更能力 | 无（快照只读展示） | 接收器可直接改快照（+30分钟仅平移 endAt、完成置 completed），聚合计数原生自愈 |
| 原生→JS 通知 | 无（模块无 Events） | `onDynamicCardAction` 事件桥 + SharedPreferences 操作标记双通道（事件丢失/进程死亡由标记兜底） |
| +30 分钟语义 | 无 | 真实数据变更：`end_time` +30 分钟（开始与 dateId 不动；无结束不下发按钮；跨午夜按无效废弃），走 `todoRepository.update`（表单保存同链路）同步服务端 |
| 行为反转项 | 无开关、无默认值反转；新增能力默认启用（有身份字段的逐条卡即带按钮） | — |

## 三、改动原因

1. 用户明确需求：动态卡上提供三个不打开应用即可用的操作；「+30分钟」要求只把结束时间后移（开始不动），「取消」要求真取消（不自动复活）。
2. 动态卡由双引擎（前台 JS 30 秒差量、后台原生闹钟节拍）按仓库状态反复重建，任何"撤卡"若不落状态都会在 30 秒内复活——因此取消必须有持久抑制表，+30分钟必须真实改数据（快照仅平移 endAt，为进程死亡时的即时反馈与 JS 到场前的续算）。
3. 完成/+30分钟需写库与同步，原生无法替代 JS；进程死亡时 JS 不在场，故采用"原生即时反馈 + 操作标记 + JS 最终落库"的最终一致结构，标记"成功才清除"保证不静默丢失。
4. 数据模型限制：待办要求同日结束≥开始，end +30 分钟跨午夜无法表达，按无效废弃（记录诊断），不静默改数据。
5. 旧快照无身份字段，直接加字段并对缺省容错，避免迁移与旧数据崩溃。

## 四、完整调用链路

```
[按钮点击]（通知栏/提升式岛上，任意进程状态）
  └─ PendingIntent → LiveTodoActionReceiver.onReceive（exported=false，进程死被系统拉起）
      ├─ ① 原生即时反馈（改 LiveTodoTimelineStore 快照 + NotificationManager.cancel）
      │     取消：逐条卡移除
      │     +30分钟：逐条卡与聚合 item endAt +30min（SNOOZE_MS=30*60_000，与 JS TODO_CARD_SNOOZE_MINUTES 一致；startAt 不动）
      │     完成：逐条卡移除；聚合 item completed=true/completedAt=now
      │     changed → LiveTodoNotifier.applyDesired（聚合卡 LiveTodoSummary 纯原生重算计数自愈）
      │              → LiveTodoScheduler.armNext（含 completedAt+10min 结束撤卡事件）
      ├─ ② LiveTodoActionStore.append（标记：id/action/ownerKey/clientId/at，同键去重覆盖）
      └─ ③ IrisNoteSystemModule.emitCardAction（companion 桥）
            ├─ React 上下文存活 → sendEvent("onDynamicCardAction")
            │     └─ SystemNotificationProvider 监听 → runCardActionConsumption（防重入）
            └─ 进程死亡/上下文不可达 → 静默（标记留存）

[JS 消费例程] consumePendingCardActions（三处触发：原生事件 / refresh(reconcile 前) / 退后台移交前）
  ├─ native.consumePendingTodoActions() 读标记 JSON（不消费）→ parsePendingCardActions（坏条目丢弃）
  ├─ 逐条 applyCardAction：
  │     账号不匹配 → kept（标记保留）
  │     cancel → port.dismissCard → 抑制表 suppress（AsyncStorage 持久）→ applied
  │     complete/snooze → findTodo 三态（owner-mismatch=kept / missing=discarded / current）
  │        complete → todoRepository.complete（TodoError.conflict 时重读一次再试；
  │                    再冲突/校验无效 → discarded；其余失败 → kept）
  │        snooze → postponeTodoEndTime（仅 endTime +30min；无结束/跨午夜抛校验）
  │                    → assertValidTodo 合并校验 → todoRepository.update（表单保存同链路，冲突策略同上）
  │     applied/discarded → 待清除；kept/异常 → 标记留存
  └─ native.clearPendingTodoActions(ids)（成功才清）→ 仓库 broadcast
        └─ Provider 订阅 → TodoReminderCoordinator.reconcile（提醒绑定随数据变化重排/取消）
                         → TodoLiveUpdateCoordinator.refresh（逐条卡按抑制表+新数据差量对账）

[30 秒例行/退后台]
  前台 tick：run() 以 visibleTodos（抑制过滤）构建期望集 → 差量发卡/撤卡
  退后台：runCardActionConsumption 先行 → handoff() 把已应用状态写进原生快照（含身份字段）
  后台节拍：LiveTodoAlarmReceiver 从快照续算（+30 卡按新 endAt 重算进度、完成卡已移除、取消卡不在快照）
```

唯一入口约束：动作按钮只经 `LiveTodoActionReceiver`（原生反馈+标记）与 `consumePendingCardActions`（JS 落库）两个口；抑制表单例 `liveTodoCardSuppressions` 为协调器同步过滤的唯一来源；无门控降级分支新增（Expo Go 下 `NativeSystem=null`，端口 `native:null` 整链短路，与动态通知既有降级一致）。

## 五、验证情况

| 检查 | 结果 |
|---|---|
| `npm run typecheck`（改前基线） | 0 错误 |
| `npm run typecheck`（改后，含 09-29 语义修订） | 0 错误 |
| `:irisnote-system:compileReleaseKotlin`（09-28 初版与 09-29 修订后各一次） | 均 BUILD SUCCESSFUL（仅 `addAction(int,...)` 弃用警告，属模块既有兼容风格） |
| `node --test tests/todos/todo-card-actions.test.cjs` | 15/15 通过（含修订后 +30 语义：仅改 endTime、开始不动、无结束/跨午夜废弃） |
| `node --test tests/todos/todo-live-update.test.cjs` | 34/34 通过 |
| `npm run check`（修订后全量） | 全过：lint 0 错误 1 既有警告（`PermissionSettingsScreen` 的 `liveUpdateCapable`，非本次文件）；node --test 637/637 |
| 真机（staging 包） | 未执行。待验收：按钮渲染与着色、被杀进程点三按钮、无结束卡不下发 +30分钟、提升式岛上按钮布局、取消后 30 秒/重启均不复活、聚合卡计数自愈 |

## 六、已知边界（与用户确认的语义一致）

1. 进程死亡时点「+30分钟」：旧时刻的到点提醒仍会响一次（expo 排程原生侧无法取消），下次进前台 reconcile 对账清理；前台/后台存活时点则即时重排，无此问题。
2. 「+30分钟」跨过午夜：按无效废弃并记诊断（数据模型要求同日结束≥开始），待办数据不变；无结束时间的待办同样废弃（按钮本就不下发）。
3. 「取消通知」无恢复入口：仅待办完成/删除后抑制项随修剪失效（真取消）。
4. 消费例程的 kept（账号不匹配）标记长期保留直到账号切回；删除待办后抑制项由 prune 清理。
5. 演示卡（7001）与聚合卡无身份字段，天然无按钮；旧快照缺字段不下发按钮，下次移交补齐。
