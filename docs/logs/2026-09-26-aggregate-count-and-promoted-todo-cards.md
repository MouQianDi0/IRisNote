# 聚合卡计数化与逐条待办卡独立升级动态大卡

日期：2026-09-26。基点：修改前工作区（HEAD 为 2026-09-26 04:23:39 的 handoff JSON 参数修复之后状态），对比经 git diff 实测：7 文件，+73/-41。

## 1. 改动清单（按层）

- src/features/todos/services/todo-aggregate-live.service.ts（修改）
  - active/near/today 三场景标题与正文统一计数口径：标题「进行中 N」，nearCount>0 时追加「·临近 N」；正文统一「今日 N 条待办」（N 为今日全部条目，含已完成）。
  - 删除 chronometer 输出：active 场景不再计算 remaining/duration，chronoAt 恒为 null、chronoCountdown 恒 false、secondsEligible 恒 false（base 已含）。
  - smoothSeconds 参数保留但不再影响聚合卡（保持协调器调用兼容）。
- src/features/todos/services/todo-live-update.service.ts（修改）
  - TodoLiveUpdateCard 新增 promoted: boolean 字段。
  - desiredTodoLiveUpdate（前台进行中卡）有/无结束时间两分支均 promoted: true。
  - desiredTodoLiveTimeline（退后台时间线快照）promoted: true。
  - createTodoLiveDemoTimeline（60 秒模拟卡）promoted: true；desiredTodoLiveDemoUpdate 透传 timeline.promoted。
- src/features/todos/state/todo-live-update-coordinator.ts（修改）
  - cardEquals 增加 promoted 字段比较：形态变化触发原位更新。
- src/core/system-notifications/system-notification-native-provider.tsx（修改）
  - 协调器端口 post 由写死 promoted: false 改为透传 card.promoted。
- tests/todos/todo-live-update.test.cjs（修改）
  - 聚合卡用例：标题/正文断言改为新计数口径，删除「剩余 mm:ss」断言，新增 chronoAt=null、secondsEligible=false 断言。
  - 逐条卡用例：时间线快照与前台卡断言 promoted=true；handoff promoted 计数 1→2（真实卡+聚合卡）；模拟卡断言 promoted=true。
- docs/架构指南/系统通知模块负责说明.md（修改）：§2.2、§3.1、§4.3.1、§4.3.2 与原生契约表同步新现状。

## 2. 与原代码对比

- 聚合卡标题：原「待办 N·进行中 M / 待办 N·临近 M / 待办 N·重要 M」→ 现「进行中 N[·临近 M]」（三场景统一）。
- 聚合卡正文：原活动场景「待办标题 · 剩余 mm:ss」（近 1 小时且前台秒级模式为秒级 mm:ss）→ 现「今日 N 条待办」静态文案。
- 聚合卡计时：原 chronoAt=active.endAt + chronoCountdown=true（系统 chronometer 每秒自动刷新）→ 现 chronoAt=null 不走 chronometer；前台服务秒级刷新因 secondsEligible=false 自动停止（行为反转：胶囊不再有秒跳倒计时）。
- 逐条待办卡提升：原 JS 发送写死 promoted=false、时间线快照 promoted=false（仅聚合卡与原生占位卡提升）→ 现有时间的待办卡全链路 promoted=true（行为反转：Android 16.1+ 上逐条卡独立上岛）。
- 模拟卡：原 promoted=false → 现 promoted=true（与真实卡一致）。

## 3. 改动原因

- 用户需求：聚合卡倒计时信息量低，改为「进行中/临近计数 + 今日总量」；逐条待办事件需独立升级为动态大卡，不再只依赖聚合卡。
- chronometer 秒跳倒计时在胶囊位依赖系统渲染且 36.0/36.1 表现不一，静态计数无该兼容风险。

## 4. 完整调用链路

- 聚合卡：TodoLiveUpdateCoordinator.run() → desiredTodoSummary（todo-aggregate-live.service）计数生成 title/text → port.postSummary → postStateCard → postLiveUpdate → 原生 postProgressNotification（promoted=true，chronoAt=null 不设 chronometer）。退后台：nativeTimelines → persistLiveTodoTimelines（JSON 字符串）→ 原生 LiveTodoSummary/LiveTodoScheduler 按快照重算（与 JS 同口径，chronoAt=null 不启用计时）。
- 逐条卡：run() → desiredTodoLiveUpdate（promoted=true）→ port.post → postLiveUpdate（promoted 透传）→ 原生 buildExplicitNotification → requestPromotedOngoingCompat 反射请求上岛；API<36 / 36.0 静默退化普通进度卡。退后台：desiredTodoLiveTimelines（promoted=true）→ handoff/persistLiveTodoTimelines → 原生闹钟节拍/前台服务用 LiveTodoNotifier.buildNotification（promoted=card.promoted）重建。

## 5. 验证情况

- 已执行：npm run typecheck（修改后 0 错误）、npm run check（TypeScript、Lint、theme:check、node --test 506 项全部通过）。
- 未执行：真机验收（Android 16.1 提升式大卡、胶囊计数渲染、低版本退化表现需真机观察）；未执行 Android 构建与 Kotlin 编译（本轮无原生代码改动）。

## 6. 补充修复：原生后台镜像文案同步（同日追加）

- 问题：上一轮只改了 JS 前台文案，退后台由 Kotlin `LiveTodoSummary.scene` 重算的聚合卡仍是旧口径（「待办 N·进行中 M」+「剩余 mm:ss」 chronometer）。
- 修改文件：modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoSummary.kt
  - scene()：改为与 JS desiredTodoSummary 同口径——标题「进行中 N[·临近 N]」、副标题「今日 N 条待办」；chronoAt 不再输出（Scene 默认 null），secondsEligible 恒 false；smoothSeconds 参数保留但标 @Suppress("UNUSED_PARAMETER")。
  - nextEventAt()：移除「进行中剩余分钟文案」的分钟级兜底节拍（静态文案无需刷新）；临近/开始/结束/保留终点节拍保留。
  - 移除不再使用的 java.util.Locale import。
- 验证：:irisnote-system:compileReleaseKotlin BUILD SUCCESSFUL（原生改动已编译验证）；npm run check 复跑见 CHANGELOG；真机后台文案以真机验收为准。

## 7. 补充优化：聚合卡移除进度条（同日追加）

- 改动：聚合卡原走「不定进度条」形态（indeterminate=true），与纯计数文案不符。buildExplicitNotification 新增 hideProgress 参数（默认 false）——hideProgress=true 时不设置 ProgressStyle 也不 setProgress，通知为纯文本状态卡。
- 透传链路：JS postStateCard 置 hideProgress=true → postLiveUpdate → 原生 postProgressNotification（input["hideProgress"]）→ buildExplicitNotification；后台重建走 LiveTodoNotifier.buildNotification 聚合分支，同样 hideProgress=true。逐条待办卡不传该参数，进度条保持不变。
- 涉及文件：LiveTodoNotifier.kt、IrisNoteSystemModule.kt、modules/irisnote-system/index.ts（NativeProgressNotification.hideProgress）、system-notification.service.ts（LiveUpdateContent.hideProgress、postStateCard）。
- 验证：:irisnote-system:compileReleaseKotlin BUILD SUCCESSFUL；npm run check 全部通过；tests/todos/system-notifications.test.cjs 新增 payload.hideProgress=true 断言；真机展示未验收。

## 8. 补充优化：副标题分段统计（同日追加）

- 改动：聚合卡副标题由「今日 N 条待办」改为「今日 N 条待办 | N条重要 | N条待完成 | N条进行中 | N条已完成」（" | " 连接）。口径：重要 = 未完成且 is_starred；待完成 = 未完成数；进行中 = 已开始且未过结束的有时间待办；已完成 = 今日已完成数。
- 文件：todo-aggregate-live.service.ts（text 拼接）、LiveTodoSummary.kt（listOf + joinToString 同口径）、todo-live-update.test.cjs（四处 text 断言）。
- 验证：npm run check 通过（506/0 失败）；:irisnote-system:compileReleaseKotlin BUILD SUCCESSFUL；真机未验收。

## 9. 补充调整：逐条卡按重要度（priority）提升（同日追加）

- 规则反转：逐条待办卡 promoted 由「恒 true」改为「创建时 priority=high 才 true」，普通事件降级为非提升动态通知；聚合卡自身提升不变；60 秒模拟卡保持 promoted=true（演示效果）。
- 重要口径统一：TodoSummaryItem/NativeTodoSummaryItem/LiveTodoSummaryItem 的 starred 字段全部替换为 priority（"low"|"normal"|"high"，Kotlin JSON 解析缺省回落 "normal"）；聚合副标题「N条重要」= 未完成且 priority=high（原为 is_starred 口径）。
- 与原代码对比：原全量 promoted=true → 现仅 priority=high；原聚合重要数 = isStarred → 现 = priority high。
- 链路：desiredTodoLiveUpdate/desiredTodoLiveTimeline 按 todo.priority 计算 promoted → Provider 透传 → 原生 buildExplicitNotification（promoted 分支不变）；退后台快照 JSON 带 priority 字段，LiveTodoSummary.scene 用同一口径重算。
- 验证：npm run check 通过（506/0 失败）；:irisnote-system:compileReleaseKotlin BUILD SUCCESSFUL；真机未验收。政策提醒：用户在系统设置手动降级过提升通知后，同类内容不可重发提升式，加星/改优先级切换可能不上岛，属系统约束。
