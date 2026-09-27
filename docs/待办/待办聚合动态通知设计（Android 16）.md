# 待办聚合动态通知设计（Android 16）

> 状态：设计决策存档。代码已接入，原生编译与 Android 真机验收待完成；实际代码现状见 `docs/架构指南/系统通知模块负责说明.md`。
>
> 前置阅读：`docs/架构指南/系统通知模块负责说明.md`（现有 Live Updates 链路）、`docs/UI/通知渠道适配.md`（渠道政策边界）。

## 一、背景与目标

现有 Android 16 动态通知是逐条待办卡片：前台协调器为当日进行中待办最多发 3 张 ProgressStyle 卡（上限 `LIVE_TODO_MAX_CARDS = 3`），promoted 提升式展示，退后台移交原生时间线由 AlarmManager 续算。

新增目标：一条聚合动态卡，向用户直观展示待办模块的总状态（今日待办 / 临近 / 进行中 / 结束四个场景），应用不在前台时也能在锁屏与提升位看到。

**已确认的核心决策：聚合卡优先、逐条卡保留非提升展示。**

- 聚合卡是唯一的 promoted（提升式/上岛）卡，占用 `setRequestPromotedOngoing(true)` 名额。
- 逐条进度卡保留，但 promoted 降为 false：仍走 ProgressStyle 原位更新、退后台原生续算，只是不再请求提升式展示。
- 提升名额竞争、同一内容重复上岛的问题由此一次性消除；模拟待办演示卡（ID 7001）同步降为非提升，避免演示期间抢占聚合卡的提升位。

## 二、状态机与展示规范

聚合卡按当日待办集合推导唯一场景，优先级：进行中 > 临近 > 今日待办 > 结束。判定基于与逐条卡同源的待办实体字段（`date_id`、`start_time`、`end_time`、`reminder_enabled`、`is_completed`、`is_starred`），不引入新字段。

| 场景 | 判定条件 | 标题 | 左侧图标 | 内容 |
| --- | --- | --- | --- | --- |
| 今日待办 | 当日有未完成待办，但均未进入临近窗口 | 待办 N·重要 M | `list-tree` | 今日有 N 条待办，M 条重要 |
| 临近 | 存在开始时刻在 1 小时内的待办 | 待办 N·临近 M | `clock-arrow-right` | 最早开始的待办标题（脱敏摘要） |
| 进行中 | 存在已到开始、未过结束的待办 | 待办 N·进行中 M | `circle-dashed` | 最早开始的待办标题；标题区附剩余时间（见下） |
| 结束 | 当日待办全部结束/完成（当日曾有活动卡） | 待办结束 | `circle-dashed-check` | N·已完成；展示结束后保留一段短暂时间即撤卡 |

补充口径：

- 重要 = `is_starred === true`；不引入优先级字段。
- 临近阈值 = 开始时刻距今 ≤ 1 小时；多条临近时内容显示最早开始的一条。
- 进行中剩余时间：剩余 > 1 小时显示 `HH:mm`（分钟粒度，可退后台）；剩余 ≤ 1 小时显示 `mm:ss`（仅前台秒级驱动，见第四节）。
- 结束场景持续时间：最后一条待办 `end_time` 过后保留 10 分钟（可调），随后撤卡；当日 N=0 或当日尚无任何符合条件活动时不发卡（promoted 不应无内容常驻）。
- 聚合统计口径独立于逐条卡资格：今日待办总数统计当日全部未完成待办（含无提醒、无开始时间者）；逐条时间线资格（`todoTimelineEligibleTodo`）不复用、不改动。
- 标题在提升位/锁屏会被激进截断，采用上述短格式；完整描述只放 content text。

## 三、通知身份与渠道

| 项 | 值 |
| --- | --- |
| 渠道 | 新增独立渠道（建议 `irisnote.live-todo-summary.v1`，importance LOW、无声、无震动），与逐条卡的 `irisnote.live-todo.v1` 分开，用户可单独关闭聚合卡 |
| 通知 ID | 落在现有 0–9999 预留段（如 7002，常量入 `system-notification.types.ts`），与演示 ID 7001、逐条卡 FNV-1a 10000+ 段互不冲突 |
| ongoing | 恒为 true（promoted 硬性要求），撤卡只由应用状态机驱动 |
| 点击行为 | 启动应用主界面（与现有动态卡一致，无深链） |

普通待办到点提醒（HIGH 渠道）与日历事件仍禁入提升式通道，政策边界不变。

## 四、时间与更新节拍

- 前台：复用 `TodoLiveUpdateCoordinator` 的 30 秒例行 + 仓库变更即刷；进行中且剩余 ≤ 1 小时时走前台服务秒级模式（同现有 `smoothSeconds` 链路）更新 `mm:ss`。
- 退后台：聚合卡随现有 `handoffLiveTodoTimelines` 一并移交原生；原生凭持久化快照 + AlarmManager 节拍在场景切换时刻（进入临近窗口 / 开始 / 结束）补发或更新，分钟粒度兜底文案。
- `mm:ss` 秒级倒计时：退后台无法秒级唤醒；≤ 1 小时窗口退后台后接受分钟粒度退化，文案回落为 `HH:mm` 或静态描述。`setUsesChronometer` 方案在提升岛上的渲染以真机验收为准（现有“方案 C”已知 36.0/36.1 差异）。
- 冷启动：`clearStaleLiveUpdates` 兜底扩展为同时清理聚合卡渠道残留。

## 五、图标规范

四个状态图标（`list-tree`、`clock-arrow-right`、`circle-dashed`、`circle-dashed-check`）为应用内组件图标命名，通知 `smallIcon` 必须是 `modules/irisnote-system` 内新增的单色原生 drawable 资源，不能复用 JS 图标组件；状态栏仅渲染 alpha 通道，状态区分不得依赖颜色，靠标题文案 + 图标形状。原生聚合卡构建接口需支持传入图标资源名。

## 六、架构分层（通知系统独立设计，模块声明可调用）

```text
features/todos/services/todo-aggregate-live.service.ts   纯函数：待办集合 → 聚合卡快照（场景、计数、文案、图标名、锚点时刻）
features/todos/state/                                    聚合卡并入现有协调器节拍，不新起调度
core/system-notifications/                               通用“状态卡”发送协议：模块声明渠道 + 快照 payload → 统一 port 发送
modules/irisnote-system (Kotlin)                         聚合卡构建：图标资源名 + 场景快照；时间线持久化扩展聚合字段
```

- 纯函数放 feature 层、可被 `tests/**/*.test.cjs` 直接测试，风格与 `todo-live-update.service.ts` 一致。
- 其他模块（笔记、习惯等）未来接入时：声明自己的渠道常量 + 产出同构快照 + 调同一 port；禁止直接 import todo 的 service。
- 原生 `LiveTodoTimelineCard` 扩展聚合快照字段（或新增并行快照），沿用 SharedPreferences 持久化与进程被杀恢复链路。

## 七、诊断与隐私

聚合卡链路新增诊断事件（`live_update` scope）只记计数、场景名、通知 ID；不记待办正文、账号标识；文本沿用现有脱敏 + 截断规则。

## 八、降级矩阵（聚合卡维度）

| 环境 | 行为 |
| --- | --- |
| API ≥ 36 正式包 | 完整；上岛需 36.1+ 且系统未关闭“实时更新”，36.0 退化普通卡片 |
| API < 36 | 不发（与现有动态通知一致） |
| Expo Go / 模块缺失 | 不发，设置页入口禁用 |
| 通知权限拒绝 / 聚合渠道被关 | 不发，不影响逐条卡与到点提醒 |
| 逐条渠道被关 | 不影响聚合卡（渠道独立） |

## 九、实施顺序与验收

1. 本设计文档评审通过（当前步骤）。
2. `todo-aggregate-live.service.ts` 纯函数 + `tests/` 用例（场景判定、计数、截断确定性、N=0 不发）。
3. `system-notification.types.ts` 渠道/ID 常量；`core/system-notifications` 状态卡 port；同步 `tests/todos/system-notifications.test.cjs` 单一来源约束。
4. 原生 Kotlin：聚合卡构建、图标 drawable、时间线持久化扩展；验证 `:irisnote-system:compileReleaseKotlin`。
5. 真机验收：四场景切换、退后台续算、36.0/36.1 提升表现、`mm:ss` 退化行为、渠道单独开关。
6. 回写 `系统通知模块负责说明.md`、`通知渠道适配.md`（如涉及渠道决策）与 `CHANGELOG`。

## 十、待真机/实施期确认项

- `mm:ss` 在提升岛上的实际渲染（chronometer 兼容性）。
- 结束场景保留时长（暂定 10 分钟）是否符合体感。
- 国产 ROM 对 promoted 聚合卡的展示差异。
