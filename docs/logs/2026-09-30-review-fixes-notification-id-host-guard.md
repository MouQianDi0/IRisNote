# 审查修复：摘录卡通知 ID 迁移 7004 与捕获宿主运行时兜底

## 基点与范围

- 基点：f3e371b（摘录会话卡「保存剪贴板」按钮提交后的 kroos_todo HEAD），工作区干净。
- 来源：两个独立审查子代理对合并 378052c 与 7285493 的审查报告。合并一结论 Yes（仅 Minor）；合并二结论 With fixes——两条 Important 均为存量问题（两侧父提交各自引入，非本次合并新引入），用户确认「Important+Minor 一起修」。

## 一、改动清单（按层）

### modules/irisnote-system（3 个文件）

- `excerpt/ExcerptSessionNotifications.kt`（+30/−14 左右，实测以 diff 为准）：
  - **Important ①（ID 双占）**：`ID` 7003 → 7004，附保留段注释（7001 演示、7002 聚合卡、7003 前台停机占位）；新增 `LEGACY_ID = 7003`，`post()` 发卡前 `manager.cancel(LEGACY_ID)` 清理升级过渡期残留旧卡（取消幂等，不影响停机占位的短暂存在）。
  - **Important ②（宿主缺类崩溃）**：新增 `CAPTURE_HOST_CLASS` 常量与 `captureHostResolvable()`（`packageManager.getActivityInfo(ComponentName, 0)`，NameNotFound 视为缺失）；`post()` 发卡前校验：宿主可解析时行为不变；缺失时卡主体 `contentIntent` 降级为 `getLaunchIntentForPackage` 主应用入口、`savePendingIntent` 置 null 不提供「保存剪贴板」按钮；停止/划除/到期链路不变。
  - **Minor ③**：`captureRemaining` 的 `entryVersion==2` 与 120 分钟上限补注释（须与 JS 侧 `EXCERPT_SESSION_DURATIONS` 最大档一致）。
- `excerpt/ExcerptCaptureActivity.kt`（+1 注释行）：`take(40_002)` 补魔数来源（20000 字域上限 → 40000 UTF-16 单元 +2 余量）。
- `live/LiveTodoForegroundService.kt`（+1 注释行）：停机占位注释补全保留段清单并标注「勿复用 7004」。

### src/core（1 个文件）

- `system-notifications/system-notification.types.ts`（+4/−1）：`EXCERPT_SESSION_NOTIFICATION_ID` 7003 → 7004，注释说明保留段与迁移背景。

### modules/irisnote-system 根（1 个文件）

- `IrisNoteSystemModule.kt`（+3 注释行）：`cancelProgressNotification` 补保留段 7001–7004 路由说明与待办卡 ≥10000 无交集说明（审查一 Minor-2）。

### tests（2 个文件）

- `tests/excerpts/excerpt-capture.test.cjs`：源码契约用例扩展——断言 `ID = 7004`、`LEGACY_ID = 7003`、`manager.cancel(LEGACY_ID)`、`captureHostResolvable`/`getActivityInfo`/`getLaunchIntentForPackage` 降级、`if (savePendingIntent != null)` 条件按钮。
- `tests/todos/system-notifications.test.cjs`：摘录状态卡用例字面量 7003 → 7004（postStateCard 为透传语义，断言不受值影响，随真实身份更新）。

### docs（3 个文件）

- `docs/架构指南/系统通知模块负责说明.md`：§十「通知」更新 ID=7004 与双占迁移背景；「原生展示」补宿主校验与降级行为。
- `docs/logs/2026-09-29-note-status-write-coalescing.md`（审查一 Minor-1）：顶部加「已被 Timmi 合并部分推翻」指引，指向现行日志。
- `CHANGELOG.md`：新增本条目。

## 二、与原代码对比

- **ID 双占（原来 → 现在）**：原来 `ExcerptSessionNotifications.ID` 与 `LiveTodoForegroundService.PLACEHOLDER_NOTIFICATION_ID` 同为 7003——前台服务每次停机 `startForeground(7003, 占位)` 再 `STOP_FOREGROUND_REMOVE`，若摘录卡正在展示会被顶掉并连带移除，且摘录侧 `active` 标记仍在、需等下次对账才恢复入口；现在摘录卡用 7004，停机占位独占 7003，互不触碰，旧 7003 残留卡在下次发卡时清理（系统 `setTimeoutAfter` 本身也兜底）。
- **宿主缺类（原来 → 现在）**：原来 Manifest 声明的 `ExcerptCaptureHostActivity` 仅由 prebuild 生成，漏跑 prebuild 的安装包编译正常，点通知 `ClassNotFoundException` 崩溃；现在发卡前校验宿主可解析，缺失时主体降级为主应用入口、无捕获按钮，停止与倒计时保留，不再崩溃。
- 无默认值/开关反转；`captureReady=true` 路径与改动前逐字节等价（同请求码、同 flag、同按钮），降级仅在宿主缺失这一异常环境生效。

## 三、改动原因

- 审查二 Important-1：占位通知 ID 冲突是「停机瞬间顶掉摘录入口卡」的真实用户可见缺陷，且修复窗口就在本次按钮功能之后、真机构建之前，成本最低。
- 审查二 Important-2：崩溃类问题优先于一切体验项；构建文档的流程护栏（「不能只更新 JS」）保留，代码兜底使漏步后果从崩溃降级为功能退化。
- Minor 项均为注释/文档，防止后续维护踩同类坑（硬编码耦合、被推翻日志误导、保留段边界不清）。

## 四、完整调用链路

- 正常路径（captureReady=true）：JS `postStateCard(id=7004)` → 原生摘录分支校验 id/渠道 → `captureHostResolvable` 通过 → 卡主体/「保存剪贴板」按钮 → `ExcerptCaptureHostActivity`（7004 请求码 + 7005 按钮请求码）→ 捕获窗口；与基线行为一致。
- 降级路径（宿主缺失）：同上至校验失败 → 主体 PendingIntent 指向主应用 launcher intent → 点卡打开应用（等同 A 档可用性）→ 无捕获按钮 → 「停止」广播链路照常可停会话。
- ID 链：发新卡（7004）→ `manager.cancel(7003)` 清残留 → `manager.notify(7004)`；前台服务停机占位仍用 7003，两侧永不互踩。
- 保留段总览：7001 演示、7002 聚合卡、7003 停机占位、7004 摘录卡；待办动态卡 ≥10000（hash 取模 +10000），零交集。

## 五、验证情况

- 修改前基线：工作区干净于 f3e371b，typecheck 0 错误（上一提交前已验证，本次改动前未重复运行全量基线，targeted 验证见下）。
- 目标测试：`node --test` excerpt-capture + excerpt-session + system-notifications 共 **35/35 通过**。
- `npm run typecheck` 0 错误；`npm run check` 全过（node --test **684/684**，typecheck/lint/theme:check 通过）。
- `:irisnote-system:compileReleaseKotlin` BUILD SUCCESSFUL（1m 15s；2 个 `Notification.Action.Builder` 构造器弃用警告，与模块既有风格一致）。
- 未执行：staging 包真机验证（审查建议的两项复现：①旧 android/ 不 prebuild 构建点通知表现——现应有降级卡而非崩溃；②会话期间触发待办卡清空观察摘录卡不再被顶掉）；完整 APK 构建与合并 Manifest 未生成。
