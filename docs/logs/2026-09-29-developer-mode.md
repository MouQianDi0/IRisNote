# 新增开发者模式：连点版本号开启，集中运行环境、诊断日志查看与通知测试

- 日期：2026-09-29
- 基点：`bb23729`（HEAD，改前工作区干净）→ 结果：工作区未提交改动
- 提交前变基：改动先 stash，本地 `Timmi` 快进到 `origin/Timmi`（`f361cb8`，含迁移 0019、本地云解耦、Markdown 公共组件），再 pop 回来。只有 `CHANGELOG.md` 冲突，已手动合并；`docs/架构指南/项目架构与文件索引.md` 自动合并。本文的「原来」对比仍以 `bb23729` 为准，这 5 个远端提交没有碰本次改动的代码文件。
- 关联：CHANGELOG「2026-09-29 04:32:49 | 新增功能：开发者模式」

## 一、改动清单（按层）

### src/features/settings

- `data/system-preferences.repository.ts`（修改）：新增键 `developer_mode_enabled` 及 `developerModeEnabled()` / `setDeveloperModeEnabled()`，复用已有私有 `read` / `write`（UPSERT）。**默认值：未写入即关闭。**
- `state/developer-mode-store.ts`（新增，49 行）：Zustand 存 `ready` / `enabled`；`loadDeveloperMode(database)` 按数据库实例去重读取，读取失败按关闭处理并允许下次重试；`setDeveloperMode` 先写库、成功后才改状态。
- `hooks/use-developer-mode.ts`（新增，31 行）：`useDeveloperMode()` 挂载时触发读取；`useDeveloperModeGuard()` 在 `ready && !enabled` 时 `router.back()`，无历史时 `replace("/pages/user/settings")`。
- `utils/developer-unlock.ts`（新增，48 行）：连点计数纯函数 `tapDeveloperUnlock`（7 次开启、两次间隔 > 1500ms 重新计数）与 `developerUnlockHint`（剩 3 次及以内才返回提示文字）。
- `services/developer-environment.ts`（新增，90 行）：`collectDeveloperEnvironment()` 采集版本、构建号、包名、运行模式（`__DEV__` / Expo Go）、API 地址、更新服务地址（与 `update-store` 同一回退规则）、云存储状态（`cloudStorageStatusLabel`）、系统与机型、两个本地原生模块链接状态；通知类读数仅在 `systemNotificationsAvailable` 时动态 import service 读取（通知权限、精确闹钟、动态通知能力位、`irisnote.todo.` 前缀的已排程提醒数），Expo Go 下显示「不可用」。
- `utils/developer-environment-report.ts`（新增，85 行）：环境展示行顺序、复制文本格式、精确闹钟与动态通知标签；快照类型只含设备与构建字段。
- `utils/diagnostic-log-view.ts`（新增，43 行）：日志级别筛选、计数、本地时间 `MM-DD HH:mm:ss`、详情 `key=value` 拼接。
- `hooks/use-notification-test-tools.ts`（新增，168 行）：`sendTestNotification` / `startLiveDemo` 及卸载时取消模拟待办的 effect，**逐行自 `HelpFeedbackScreen` 迁出**，诊断 scope/事件名不变；新增 `testNotificationReady`（原先内联在 ListRow `disabled` 条件里）。
- `screens/DeveloperOptionsScreen.tsx`（新增，294 行）：运行环境卡（可复制）、诊断分组（日志查看器入口 + 条数、发送测试通知、测试待办动态通知）、关闭开发者模式按钮；focus 时重新采集环境与日志条数，以自增序号丢弃过期结果。
- `screens/DiagnosticLogScreen.tsx`（新增，271 行）：FlatList 展示诊断事件（最新在前），全部/信息/警告/错误筛选带计数，空态与读取失败重试，底部「清空诊断日志」经 `DraftDialog` 确认后调用 `clearDiagnosticLog()`。
- `screens/AboutScreen.tsx`（修改）：版本号改为可点击 `Pressable`，下方预留 20dp 提示行；新增页内 `useDeveloperUnlock()`，开启成功弹横幅并带「前往」动作。
- `screens/SettingsScreen.tsx`（修改）：开发者模式开启时，在「支持」与「退出登录」之间渲染「开发者」分组（单行「开发者选项」）。
- `screens/HelpFeedbackScreen.tsx`（修改）：删除两个测试按钮、对应 state/ref/effect 与多余 import；「诊断与排障」只剩「导出诊断日志」（改为 `last`）。

### src/core

- `diagnostics/diagnostic-log.ts`（修改）：导出 `DiagnosticLevel` / `DiagnosticEvent` 类型；新增纯函数 `parseDiagnosticLines`（逐行 JSON 解析，跳过损坏行、缺字段与非法级别，倒序返回）与 `readDiagnosticEvents()`（先 `await writeQueue` 再读）。
- `diagnostics/index.ts`（修改）：追加导出 `clearDiagnosticLog`、`readDiagnosticEvents` 与两个类型。

### src/app

- `pages/user/developer/index.tsx`、`pages/user/developer/logs.tsx`（新增，各 1 行）：转发两个 Screen。
- `_layout.tsx`（修改）：注册 `pages/user/developer/index` 与 `pages/user/developer/logs`，`headerShown: false`。

### src/shared / modules

- 无改动。

### tests

- `tests/settings/developer-mode.test.cjs`（新增，166 行，9 项）：连点计数与超时重置、提示阈值、环境行覆盖与复制文本无敏感字段、闹钟/动态通知标签、日志解析容错与倒序、筛选计数、详情与时间格式。

### docs

- `架构指南/系统通知模块负责说明.md`：总览图、文件职责表、链路 C 与 4.3.1 的入口由帮助与反馈页改为开发者选项页，新增测试工具 hook 条目。
- `UI/通知渠道适配.md`：「设置页演示」入口路径更新。
- `架构指南/项目架构与文件索引.md`：路由表、路由文件说明与 Settings 文件表补充新增文件。
- `UI/IRisNote视觉设计规范.md`：设置页新增「开发者」分组出现条件与解锁提示规范。

## 二、与原代码对比

| 项 | 原来（bb23729） | 现在 |
| --- | --- | --- |
| 开发者模式 | 不存在 | 设备级开关，**默认关闭**；关于页连点 7 次开启，开发者选项页关闭 |
| 「发送测试通知」「测试待办动态通知」 | 在帮助与反馈页，所有用户可见（`HelpFeedbackScreen` 诊断与排障卡的第 2、3 行） | 移到开发者选项页，**普通用户不再可见**；处理逻辑与诊断事件名不变 |
| 「导出诊断日志」 | 帮助与反馈页 | 位置不变 |
| 诊断日志 | 只能导出文件（`createDiagnosticExport`），App 内不可查看 | 新增 `readDiagnosticEvents` 与查看器页；清空复用原 `clearDiagnosticLog`（同时删除缓存目录中的导出副本，与数据与存储页清理语义一致） |
| 关于页版本号 | 纯文本 | 可点击；提示行常驻占位 20dp，版本区整体下移约 24dp |
| 设置页 | 支持分组后直接是退出登录 | 开发者模式开启时插入「开发者」分组 |
| `core/diagnostics` 类型 | `DiagnosticEvent` 为模块私有 | 导出供查看器使用；写入逻辑、脱敏规则、400 条上限不变 |

## 三、改动原因

- **测试工具移出帮助页**：发送测试通知、模拟待办动态通知是排障工具，对普通用户是噪音，误触还会产生真实系统通知；「导出诊断日志」是用户反馈问题时要用的，所以保留在原处。
- **连点版本号而非仅开发包可见**：需要在正式包真机上排查问题（正式包无 `__DEV__`，staging 为独立包名但也非 debuggable）；连点方式无需重新构建即可进入，且普通用户不易误触。用户确认不需要密码（前端密码可从包中提取，防护意义有限）。
- **存 `system_preferences` 而非 AsyncStorage/SecureStore**：沿用剪贴板检测等设备级开关的既有存储，无需迁移；不随账号切换，符合"这台设备处于开发者模式"的语义。
- **先写库再改状态**：写入失败时入口保持不变，避免界面显示已开启但重启后消失的不一致。
- **关闭时由页面守卫统一返回**：关闭按钮只改状态，`useDeveloperModeGuard` 监听到 `enabled=false` 后返回，避免按钮与守卫各返回一次造成双重后退；守卫也覆盖了直接访问路由的情况。
- **连点提示用页内文字而不是横幅**：横幅队列对相同 id 直接忽略、不同 id 会排队（`notification.store.ts` 的 `show`），连点会堆积多条；页内文字可随每次点击原地替换。提示行常驻占位，避免出现/消失时版本区跳动。
- **环境读取在 focus 时刷新并用序号丢弃过期结果**：从系统设置改完通知/闹钟权限返回时能看到最新状态；快速进出不会让旧结果覆盖新结果。
- **通知读数走动态 import 并按 `systemNotificationsAvailable` 门控**：与帮助页、Provider 的既有做法一致，Expo Go 下不加载 expo-notifications。
- **复制文本不含账号信息**：遵守 AGENTS §14 诊断隐私要求；快照类型本身不含 user id / 邮箱 / 令牌，测试断言兜底。
- **日志列表用 FlatList 而非计划中的 FlashList**：实施时核实 `src/` 目前没有任何 FlashList 使用，同类列表（`SyncQueueScreen`）使用 FlatList；400 条上限下 FlatList 足够，保持与现有页面一致。

## 四、完整调用链路

```
开启
AboutScreen 版本号 onPress
  └─ useDeveloperUnlock.tap（页内）
      ├─ enabled=true → 页内提示「开发者模式已开启」，1.5s 后清除
      └─ tapDeveloperUnlock(counter, Date.now())        utils/developer-unlock.ts（纯函数）
          ├─ 未满 7 次 → developerUnlockHint(remaining) → 页内提示（剩 ≤3 次才显示）
          └─ 满 7 次 → setDeveloperMode(database, true)  state/developer-mode-store.ts
                ├─ SystemPreferencesRepository.setDeveloperModeEnabled → SQLite system_preferences UPSERT
                ├─ 成功 → store.enabled=true → 横幅「开发者模式已开启」[前往 → /pages/user/developer]
                └─ 失败 → 横幅「开发者模式开启失败」，状态不变

入口
SettingsScreen → useDeveloperMode → loadDeveloperMode(database)（按库实例去重，失败按关闭）
  └─ store.enabled → 渲染「开发者」分组 → router.push(/pages/user/developer)

开发者选项页
DeveloperOptionsScreen
  ├─ useDeveloperModeGuard：ready && !enabled → back / replace(settings)（唯一返回出口）
  ├─ useFocusEffect（序号防过期）
  │   ├─ collectDeveloperEnvironment()                 services/developer-environment.ts
  │   │   ├─ expo-application / expo-constants / expo-device / Platform / API_BASE_URL
  │   │   ├─ getCloudStorageSnapshot → cloudStorageStatusLabel
  │   │   ├─ NativeSystem / NativeUpdater 是否链接
  │   │   └─ systemNotificationsAvailable ?
  │   │        动态 import system-notification.service →
  │   │        applicationNotificationPermission / exactAlarmAccess / systemNotifications.scheduled
  │   │        / liveUpdateSupported / liveUpdateCompatSupported
  │   │      : 全部显示「不可用」（Expo Go 降级）
  │   └─ readDiagnosticEvents() → 条数
  ├─ [复制] → formatDeveloperEnvironment → expo-clipboard → 横幅
  ├─ 测试通知 / 模拟待办 → useNotificationTestTools（原帮助页逻辑）
  │     → requestApplicationNotificationPermission → sendDiagnosticTestNotification
  │     → Provider.startTodoLiveDemo（原动态通知链路，ID 7001，不写 SQLite）
  └─ [关闭开发者模式] → setDeveloperMode(false) → store.enabled=false → 守卫返回设置页 → 分组消失

诊断日志页
DiagnosticLogScreen（同一守卫）
  └─ useFocusEffect → readDiagnosticEvents()           core/diagnostics/diagnostic-log.ts
        └─ await writeQueue → readPersistentLines（原生读 Paths.document/irisnote-diagnostics.jsonl；
           非原生读内存）→ parseDiagnosticLines（跳过损坏行，倒序）
     → filterDiagnosticEvents / countDiagnosticLevels → FlatList
  └─ [清空] → DraftDialog 确认 → clearDiagnosticLog()（排在写入队列之后；删日志文件与导出副本）
        → 成功/失败横幅 → 重新读取
```

- 不发起任何网络请求；不改笔记、待办、同步队列数据。
- 无 JS/Kotlin 双端镜像逻辑；未改原生模块。

## 五、验证情况

- 改动前 `npm run typecheck`：0 错误；改动后：0 错误。
- `node --test tests/settings/developer-mode.test.cjs`：9/9 通过。
- `npm run check`：
  - typecheck 通过；lint 0 错误、1 警告（`PermissionSettingsScreen.tsx:171` 未使用变量，既有，本次未改该文件）；`theme:check` 通过。
  - 测试 641 项：638 通过、2 跳过、1 失败——`tests/releases/source.test.cjs` 的 ENAMETOOLONG（中文长文件名超过 Linux 255 字节上限）。已用 `git stash -u` 在基点干净代码上复跑，同样失败，与本次改动无关。
- 快进到 `f361cb8` 后重跑 `npm run check`：typecheck 0 错误；lint 0 错误、1 个既有警告；`theme:check` 通过；测试 655 项，652 通过、2 跳过、1 失败（同一个 ENAMETOOLONG）。冲突标记扫描通过。
- Android 构建：未执行（纯 JS 改动，未改原生模块与 Manifest）。
- 真机验证：未执行（连点解锁、页面布局、通知测试、日志查看均未在设备上验证）。
