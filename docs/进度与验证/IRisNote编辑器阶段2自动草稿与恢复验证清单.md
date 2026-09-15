# IRisNote 编辑器阶段 2 自动草稿与恢复验证清单

> 版本：0.4.1
> 更新：2026-09-08 10:18:00 +08:00
> 状态：Node/Web 验证通过；Android 实机数据链路部分通过，但原生按钮文本渲染失败；真实服务端仍待验证

## 1. 已实现范围

- 数据库结构 2 → 3：新增 `note_drafts`，保留现有迁移和正式笔记数据；不使用删除笔记时的级联删除。
- 草稿按账户和草稿键隔离；每账户一个 `new` 槽，已有笔记使用 `note:<clientId>`。
- 会话 ID、单调写入序号、完整基础内容快照；新会话接管后旧会话不得覆盖或删除。
- 750ms 防抖、5 秒最长等待；串行补写最新输入；失败每 3 秒重试及手动重试。
- 输入失焦、路由失焦、返回、AppState、Web 隐藏/pagehide/卸载请求补写；正常路由返回等待写入完成，失败留在页面。
- 恢复读取完成前不挂载输入；继续草稿、已保存内容对照、草稿原文复制、二次确认放弃。
- 新建和编辑共用 Notes 适配层，草稿允许空标题/空正文并保留原始空白；正式保存沿用裁剪及校验规则。
- 保存排空并锁定输入；本地事务校验草稿和基础快照，提交笔记并关联草稿 ID；云端拒绝/未知保留草稿，成功条件清理。
- 新建草稿已关联笔记后恢复更新同一客户端 ID；结果未知不自动重复 POST。
- 账户切换重新挂载编辑页和会话，拒绝账户不匹配的 Note；卸载后的保存响应不触发当前页面跳转。

## 2. 自动化证据

运行：

```powershell
node --test tests/editor/drafts.test.cjs
```

18 项检查通过（含 SQLite 关闭/重开子检查）：

- 防抖临界时间、连续输入最长等待、原始空白/Unicode。
- 写入中合并最新快照、不并行覆盖、失败保留 dirty 并重试。
- 保存前排空、同步锁定防重复提交、离开失败可观测。
- 迁移重复执行与 v2 数据保留。
- 账户隔离、新建草稿、仅标题输入、草稿恢复不生成正式笔记。
- 旧会话和旧序号写入/删除被拒绝。
- 新建事务关联与重复创建阻止；关联故障使整个提交回滚。
- 基础内容变化后阻止覆盖、保留草稿。
- 云端结果未知保留关联且恢复不重复 POST。
- 云端接受清理本次草稿；上传时新会话草稿不被旧请求清理。
- 真实 Node SQLite 文件关闭重开后恢复 30,000 字正文。

这些测试使用 Node 内置 SQLite 和云端替身，不等于原生 Expo SQLite 真机验证。

## 3. 可见浏览器证据

工具安装在忽略目录，不修改项目依赖：

```powershell
npm install --prefix .expo/phase2-tools --no-save --no-package-lock playwright
npx expo export --platform web --output-dir .expo/phase2-web-export
node tests/editor/browser-drafts.cjs --headed --persistent
```

可选 `--keep-open` 保留验证浏览器与本地服务器。脚本使用独立 Edge 持久配置目录，要求同时传入 `--headed --persistent`，以 `headless: false` 和 `launchPersistentContext` 实际实现；中途关闭并重开同一配置验证持久化。

SDK 56 导出分为 client/server；测试服务器提供 WASM MIME、COEP 和 COOP。所有外网请求被拦截，认证与 Notes 接口使用虚构数据，无真实账户/云端写入。

9 项流程通过：

1. 新建输入自动落盘，未调用云端保存。
2. 刷新后恢复原始正文。
3. 快速返回补写后恢复最后输入。
4. 关闭并重启浏览器后恢复 SQLite 草稿。
5. 正式保存只创建一次笔记。
6. 保存成功后新建入口为空，不恢复已提交草稿。
7. 编辑草稿对照、取消放弃及确认放弃。
8. 云端结果未知后恢复保存，不重复 POST。
9. 页面无未捕获错误。

最终复核使用 `IRISNOTE_TEST_EXPORT=phase2-final-export`、`IRISNOTE_TEST_PROFILE=phase2-browser-final-profile` 指向最终三平台构建及独立持久目录，再次执行上述脚本，9 项全部通过；结果未知的完成界面同时断言没有进度条且输入不可编辑。

证据：`.expo/phase2-browser-results/report.json`、`recovery.png`、`completed.png`。截图已人工查看，内容与按钮可读，无遮挡。

## 4. 静态与构建结果

- Web、Android、iOS 生产 Bundle 已通过；最终账户隔离与保存状态调整后使用 `.expo/phase2-final-export` 重新构建，并复跑 Web 流程通过。
- TypeScript：全量未通过，`src/features/notes/screens/NotesScreen.tsx:128` 的 TS2454（request 使用前未赋值）。该文件本轮未修改。（该错误已于 2026-09-09 修复，全量检查归零，见第 9 节。）
- ESLint：仓库无根配置，显式使用已安装的 `node_modules/eslint-config-expo/flat.js`。目标文件仅 `EditNoteScreen` 的原有 `react-hooks/set-state-in-effect` 错误；同规则检查 HEAD 原文也存在，其他目标文件通过。（该错误及后续复验发现的同规则问题已于 2026-09-09 修复，见第 9 节。）
- 标准 `git diff --check` 已通过。必须使用仓库原有换行配置，避免将 Windows CRLF 误报为整文件尾随空白。

## 5. 原生与外部待验收

- [ ] Android 真机输入法组合文本、硬件返回、手势返回、后台暂停、进程异常终止。
- [ ] iOS 真机键盘、交互式返回和后台行为。
- [ ] 低端 Android 长文本输入/750ms 与 5 秒参数的性能实测。
- [ ] Web 多标签页/多窗口抢占会话、原生多编辑入口的手动体验。
- [ ] 实际磁盘满、权限失败、数据库连接关闭时的界面反馈。
- [x] 真实服务端接受响应：2026-09-09 用户实机验证新建/编辑更新/置顶/标星真实落库并正常回显，杀进程重开不回滚（服务端 PUT 已修复部署，irisapi-1 aa4172b）。
- [ ] 真实服务端拒绝/超时响应、账户切换中的请求身份。
- [ ] 一阶段原生数据库故障诊断与阶段 0 外部基线遗留项。
- [ ] 微任务化后缓存命中与退出登录清空的展示时序在 Web 与原生实机目视验收。

## 6. 能力边界和恢复说明

- 基础内容快照不是正式 Revision，不能宣称已具备服务端 baseRevision 条件更新或多设备冲突解决。
- 草稿写入不生成历史或块数据；本阶段仍是完整纯文本快照。
- 本地内容冲突时保留草稿，提供查看/复制并阻止直接提交；用户可复制后放弃旧草稿，基于当前内容重新编辑。
- 旧会话失去写入权后，内存中的未落盘输入不能自动写入新会话，界面提示先复制保留。
- 异常终止可能丢失最后尚未落盘的一小段输入；后台/pagehide/卸载事件不保证异步写入完成。
- SQLite 迁移失败应事务回滚并停止启动，不删除用户数据库；旧应用版本不能降级读取结构版本 3。
- 新建云端结果未知时保留关联和状态，不自动重试 POST；每账户的新建草稿槽需处理后才能开始另一篇新草稿。

## 7. Android 实机补充 — 2026-09-08 11:23:12 +08:00

- 设备：M2012K11AC（alioth），Android 16；现有开发版与 Metro 8081，通过 ADB 测试。
- 数据结果：标题/正文/换行自动落盘、后台返回、快速返回重入、终止应用后冷启动恢复均保留测试内容。
- 操作逻辑：根据源码及 UI 层级定位的继续恢复、取消放弃、确认放弃已执行；测试内容清理完成。按钮没有文字，不能据此认定界面可用性合格。
- 未通过：`NoteEditor.tsx` 的 `@expo/ui Button` 直接使用字符串 children，Android 产生 Text 包裹错误，恢复及确认按钮文字缺失。安装包源码证明 label 路径才自动创建原生 Text。
- 当次后续方案：统一改用 label 属性并复测；已于 2026-09-08 12:42:11 按用户确认实施，按钮实机复测由用户执行，结果待补充。
- 未测试：正式保存/真实云端响应、iOS、中文组合输入、磁盘故障、低端性能和防抖窗口内强杀。
- 报告与截图：`.expo/phase2-device-results/report.md`、`02-native-error.png`、`04-return-recovery.png`、`05-cold-recovery.png`、`06-test-cleaned.png`。

## 8. 按钮修复与存档日志 — 2026-09-08 12:42:11 +08:00

- NoteEditor 的 11 处 Button 统一使用 label，包括动态的查看/收起文字；事件处理、禁用条件、保存和放弃逻辑保持原样。用户负责按钮复测，尚未确认原生界面验收通过。
- 已连接 Android 开发版的实际数据库：`/data/user/0/com.mouqiandi.irisNote/files/SQLite/irisnote.db`（通过 ADB run-as 的工作目录及 files/SQLite 列表核实）。草稿表 `note_drafts`；正式本地笔记表 `local_notes`。同目录 WAL/SHM 文件属于 SQLite 工作文件，不能仅凭主库文件大小判断最新内容是否落盘。
- 代码变更存档：项目根目录 `D:\IRisNote\CHANGELOG.md`，时间倒序；实机历史证据：`D:\IRisNote\.expo\phase2-device-results\report.md`。
- 运行日志：Metro 调试终端 / React Native 调试控制台筛选 `[Note draft]`。本轮不新增持久 `.log` 文件，控制台日志不能代替数据库备份。
- `write_start`：开始调用草稿写入；`write_success`：数据库写入返回且恰好更新一行；`write_failure`：写入失败，不视为存档成功。`database_write_failed` 表示数据库操作异常，`session_or_sequence_mismatch` 表示会话/序号条件未匹配。
- 每条写入日志包含 ISO UTC 时间戳、数据库/表名、账户 ID、草稿键、会话 ID、输入序号和耗时毫秒。关联同一会话和序号追踪写入；日志不包含标题、正文、SQL 参数或异常原文。日志输出失败不改变数据库操作结果。
- `write_success` 仅表示本地草稿写入成功，不表示云端同步成功；自动保存时间窗仍为停输 750ms、连续输入最长 5 秒。
- 2026-09-08 12:43:33 验证：19 项 Node 测试通过，含日志成功时机、失败分类、原异常保留与内容隐私；本次两个业务源码文件 ESLint 通过，标准 git diff --check 通过。全量 TypeScript 仍报原有 NotesScreen.tsx:128 TS2454，本轮未修改该文件。未重跑 UI 自动化或三平台导出，按钮实机复测待用户反馈。

## 9. 静态阻塞清除 — 2026-09-09 01:49:05 +08:00

- 按用户确认方案修复：`NotesScreen.tsx` 的 fetchNotes 请求守卫变量声明补充 `undefined` 联合类型（TS2454，本分支阶段 2A 请求去重逻辑引入）；`EditNoteScreen.tsx` 与 `NoteDetailScreen.tsx` 的初始加载 effect、`NotesScreen.tsx` 的退出登录清空 effect 改为 `Promise.resolve().then` 微任务调度。前两处为 HEAD 原有错误；NotesScreen 清空 effect 为本分支新增，复验时发现并按同方案一并修复。
- 复验结果：全量 `npx tsc --noEmit` 通过；三个 Screen 目标 ESLint 0 错误，仅存原有 `loading` 未使用警告（死状态，本轮未修改）；`git diff --check` 通过。
- 时序影响：缓存命中与退出登录清空的 setState 推迟到 effect 返回后的微任务执行，快路径观感与原生运行待目视验收（已加入第 5 节）。
- 本轮未执行 Bundle、浏览器流程或实机测试；按钮实机复测、真实服务端与 iOS 验收状态不变。

## 10. 实机与服务端事故闭环 — 2026-09-09 03:20:38 +08:00

- 事故：编辑保存返回 200 但内容"丢失"。根因链：线上旧版 `PUT /api/notes/:id` 仅更新 is_pinned/is_starred，正文字段被静默忽略并返回旧行 → 客户端误标 synced → 列表对账用服务器旧值回滚本地。
- 修复：客户端 acceptServerNote 不再用响应正文覆盖正文字段（进度文档 0.4.5）；服务端 PUT 重写为事务内字段级部分更新并对齐 GET/POST/batch-delete，已部署 pm2 irisapi 并提交 irisapi-1 aa4172b；部署前完成 PostgreSQL 全量备份。
- 用户实机验证通过：编辑保存即时回显、杀进程冷启动不回滚、置顶/标星重启保持；受影响笔记内容已手动恢复。第 5 节"真实服务端接受响应"已勾选，拒绝/超时路径仍待验证。
