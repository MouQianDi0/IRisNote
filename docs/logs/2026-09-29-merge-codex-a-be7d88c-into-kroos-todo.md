# 合并 codex-a（be7d88c，摘录通知透明确认保存 B 档）到 kroos_todo

## 基点与范围

- 用户要求「拉取 codex 分支合并到本地」，经确认把 `origin/kroos_vps/codex-a` 合并进当前分支 `kroos_todo`。
- 合并前 kroos_todo HEAD 为 8445270（上次 codex-a 合并后的文档提交）；`origin/kroos_vps/codex-a` 自 ffe8828 前进 1 个提交到 be7d88c（`feat(excerpts): 实现 B 档通知透明确认保存`），merge-base 为 ffe8828（`git merge-base` 实测）。
- 净带入 1 个提交、26 个文件 +1146/−17（`git diff --numstat ffe8828..be7d88c` 实测）；对 kroos_todo 的净差异与该提交一致，其余路径自动合并。
- 冲突 2 处（试合并 `git merge-tree --write-tree` 预判与实际一致）：
  - `CHANGELOG.md`：双方都在顶部追加条目。解决为按时间倒序交织：本地侧 22:12:44 / 19:21:29 / 17:52:40 三条在前，codex 侧 14:54:26（B 档）条目插入本地 14:39:55 条目之前，双方条目全文保留、内容未改写。
  - `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/IrisNoteSystemModule.kt`：仅 import 区冲突。解决为两条 import 并存：本地侧 `expo.modules.irisnotesystem.live.LiveTodoActionStore`（待办动态卡动作标记）+ codex 侧 `expo.modules.kotlin.functions.Queues`（摘录捕获宿主回调队列）。双方其余代码由 Git 自动合并，实测各自使用点均在（`Queues` 于 4 处 `runOnQueue(Queues.MAIN)`，`LiveTodoActionStore` 于读取/清理两处）。
- 对比依据：`git diff --numstat ffe8828..be7d88c`、`git diff --check`、`git grep -n -E "^(<{7}|={7}|>{7})"`（仅命中 `docs/架构指南/GitHub团队开发指南.md` 的教程示例代码与字体 zip 二进制误报，均为合并前已存在内容，本次合并未触碰）。

## 一、改动清单（按层）

### 根目录配置

- `package.json`（+1/−1）：版本号随发布节奏推进。
- `app.json`（+1）：注册摘录捕获 config plugin（`with-excerpt-capture`）。
- `index.js`（新增 3 行）：注册摘录捕获入口模块。

### modules/irisnote-system（8 个文件）

- `android/build.gradle`（+4）：补充摘录捕获 Activity 所需构建配置。
- `android/src/main/AndroidManifest.xml`（+8）：声明非导出的 `ExcerptCaptureActivity`（独立任务、不建历史），权限清单无新增。
- `IrisNoteSystemModule.kt`（+14，冲突解决文件）：新增摘录捕获窗口身份/焦点校验与保存确认回传方法，宿主回调走 `Queues.MAIN`。
- `excerpt/ExcerptCaptureActivity.kt`（新增 112 行）：透明捕获 Activity——冷启动复用数据库租约、本机账号核验、读取剪贴板候选并呈现确认。
- `excerpt/ExcerptSessionNotifications.kt`（+25/−6）：通知主体 PendingIntent 改为打开捕获窗口（B 档），停止/到期路径保持既有 A 档语义。
- `res/values/excerpt-capture-styles.xml`（新增 15 行）：透明主题样式。
- `index.ts`（+11）：导出捕获宿主相关类型与事件（自动合并，本地待办字段不受影响）。

### plugins（2 个文件，均新增）

- `plugins/with-excerpt-capture.js`（21 行）：Expo config plugin，prebuild 时自动生成宿主配置。
- `plugins/android/ExcerptCaptureHostActivity.kt`（11 行）：生成的宿主 Activity 模板，避免原生模块反向依赖 Expo。

### src/features/excerpts（7 个文件）

- `excerpt-capture-entry.ts`（新增 7 行）：捕获窗口 JS 入口注册。
- `screens/ExcerptCaptureScreen.tsx`（新增 187 行）：透明确认界面，展示候选并提交保存/忽略。
- `services/excerpt-capture-controller.ts`（新增 135 行）：窗口生命周期控制（焦点、超时、停止、返回）。
- `services/excerpt-capture.ts`（新增 106 行）：保存链路复用 `detectClipboard`/`saveDetectedOffer` 与本机 SQLite，失败保留候选、重复保存去重。
- `services/excerpt-session-notifications.ts`（+11/−1）：通知点击目标切换到捕获窗口。
- `hooks/useClipboardDetection.ts`（+5/−2）：主应用检测器在捕获窗口存在时让出检测权。
- `components/ExcerptSessionDialog.tsx`（+4/−1）：确认卡复用公共弹窗与主题 Token 的适配。

### tests（2 个文件，均新增）

- `tests/excerpts/excerpt-capture.test.cjs`（264 行，8 项用例）：冷启动账号核验、停止/到期/切账号拒绝、失败保留候选、双击保存共用一次写入等。
- `tests/excerpts/excerpt-capture-build.test.cjs`（38 行）：干净 prebuild 生成 Expo 捕获宿主且幂等。

### docs 与 CHANGELOG（6 个文件）

- `docs/logs/2026-09-29-excerpt-capture.md`（新增 113 行）：B 档功能的全链路日志（随合并带入，功能链路细节以该日志为准）。
- `docs/架构指南/系统通知模块负责说明.md`（+31/−5）、`docs/UI/IRisNote视觉设计规范.md`（+3/−1）、`docs/构建发布/本地测试包构建.md`（+7）：与带入代码同步的现状文档。
- `CHANGELOG.md`（+9）：codex 侧 B 档条目；合并时与本地条目按时间倒序交织（见上）。

## 二、与原代码对比

- 基点：合并前 kroos_todo HEAD 8445270（含 2026-09-29 22:12:44 记录的一期 A 档与待办动态卡动作按钮等内容）；带入内容为 be7d88c 相对 ffe8828 的 26 文件差异， kroos_todo 侧此前没有这些代码（merge-base 即 ffe8828）。
- 行为变化（全部来自 be7d88c 带入）：快速摘录通知主体从「打开应用」改为「打开独立透明捕获窗口，取焦后检测、确认保存后返回原应用」；应用内检测链路保留，仅在捕获窗口存在时让出检测权。
- 无默认值/开关反转：合并与冲突解决未改动任何既有开关默认值；B 档依赖既有摘录会话（A 档）开启，通知仍是会话期独立 HIGH 静默卡。
- 冲突解决的对比：`IrisNoteSystemModule.kt` 原（kroos_todo 侧）仅 `LiveTodoActionStore` import、原（codex 侧）仅 `Queues` import，现两者并存；`CHANGELOG.md` 原（两侧各自）只有本侧条目在顶部，现两侧条目按时间倒序共存。

## 三、改动原因

- codex-a 分支完成了摘录二期 B 档（通知透明确认保存），用户要求把该进展合入本地开发分支 kroos_todo，使待办动态卡功能线与摘录功能线在同一分支上继续演进。
- 冲突解决原则：双方功能都保留（待办动作按钮与摘录捕获互不依赖、身份字段并存），CHANGELOG 遵循「最新在顶、时间倒序」的既有格式，不丢失任何一侧的历史记录。

## 四、完整调用链路（合并视角）

- 合并后模块内两条既有链路共存于 `IrisNoteSystemModule.kt`，互不改写对方路径：
  - 待办动态卡：`LiveTodoNotifier` 发卡（含动作按钮）→ `LiveTodoActionReceiver` → `LiveTodoActionStore` 标记 → JS 消费例程（`todo-card-action.service.ts`，本地侧已有）。
  - 摘录捕获（本次带入）：通知主体点击 → 非导出 `ExcerptCaptureActivity`（独立任务，原生严格校验焦点）→ 冷启动复用数据库租约与本机账号核验 → `detectClipboard` 取候选 → 用户确认 → `saveDetectedOffer` 落本机 SQLite → 关闭返回原应用；主应用侧 `useClipboardDetection` 在窗口存在时让出检测权。唯一入口与降级分支以随合并带入的 `docs/logs/2026-09-29-excerpt-capture.md` 为准。
- 合并自身不新增运行时入口：入口只有上述两条，config plugin 仅影响 prebuild 产物。

## 五、验证情况

- 合并前基线：kroos_todo 上一次全量检查（2026-09-29 22:12:44 记录）为 npm run check 全过（typecheck 0 错误、测试 675/675），此后工作区无代码改动（`git status` 干净）。
- 试合并：`git merge-tree --write-tree` 预判冲突 2 处，与实际合并一致。
- 冲突解决后：`git diff --check` 通过（退出码 0）；`git grep` 冲突标记扫描仅命中合并前已存在的教程示例与二进制误报。
- `npm run check` 全过：node --test 683/683（本地基线 675 + 带入 excerpt-capture 新增用例；codex 侧报告的 1 个发布归档 ENAMETOOLONG 失败在本机未复现），typecheck、lint、theme:check 前置阶段均 0 退出。
- `npm run gradle -- :irisnote-system:compileReleaseKotlin --init-script "$PWD/.expo/gradle-aliyun-init.gradle"` BUILD SUCCESSFUL（1m 20s），仅 2 个既有风格弃用警告（`ExcerptSessionNotifications.kt` 的 `Notification.Action.Builder` 构造器、`LiveTodoNotifier.kt` 的 `addAction`，与模块既有写法一致）。
- 未执行：完整 APK 构建、真机验证（B 档透明确认保存的冷/热启动、返回原应用、双 Surface 表现需 staging 包实测）；合并结果未推送远端。
