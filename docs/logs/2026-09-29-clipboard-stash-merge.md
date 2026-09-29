# 剪贴板摘录编辑保存与暂存合并

## 基点与取证

- 修改基点：`64824777558699fbcbc6db532415a6cd9177bbfa`（当前分支改前 HEAD）。逐项对比使用 `git diff 64824777558699fbcbc6db532415a6cd9177bbfa -- <路径>`；新增文件另以 `wc -l` 核对。未合并其他分支。
- 修改前 `npm run typecheck`：0 错误。修改前工作区干净。

## 改动清单（按层）

### src/features

- `excerpts/data/excerpt-stash.repository.ts`（新增 125 行）：本机暂存的列映射、账号代次断言、列表/哈希、增删改移和清空；重复正文返回 duplicate。
- `excerpts/domain/excerpt-stash-merge.ts`（新增 9 行）：按 local_order 拼接，支持空行和单换行。
- `excerpts/domain/clipboard-detection.ts`：移除 handled 判断，改按暂存哈希跳过，保留本应用写入和已保存判断。
- `excerpts/services/clipboard-handled.ts`（删除原 94 行）：退役 HMAC 已处理标记服务。
- `excerpts/services/excerpt-service.ts`：检测候选可传编辑后的正文，以 manual 来源保存，不再标记处理。
- `excerpts/services/excerpt-capture-controller.ts`：移除 ignore/markHandled，增加暂存查询和操作、最终正文保存与合并保存；继续校验会话和账号。
- `excerpts/services/excerpt-capture.ts`：捕获端口改接暂存仓储，不再接已处理服务。
- `excerpts/hooks/useClipboardDetection.ts`：检测接入暂存哈希，移除直接保存与忽略回调。
- `excerpts/hooks/useExcerptStash.ts`（新增 18 行）：摘录页聚焦时读取本机暂存。
- `excerpts/state/clipboard-offer-store.ts`：候选 Store 仅保存候选，不再挂直接保存/忽略动作。
- `excerpts/components/ExcerptFormDialog.tsx`：预填、委托保存、合并分隔开关、超限禁用与表单内重复提示；普通新建/编辑路径仍走原仓储。
- `excerpts/components/ExcerptStashPanel.tsx`（新增 32 行）：两处共用排序、编辑、删除、清空与合并入口。
- `excerpts/components/ClipboardDetectedCard.tsx`：删忽略按钮，保留保存按钮，✕ 与横向划除都只清内存。
- `excerpts/components/ExcerptSessionDialog.tsx`：会话说明改为暂存或编辑后保存。
- `excerpts/screens/ExcerptCaptureScreen.tsx`：捕获主面板、暂存面板、表单及无新内容状态；取消/遮罩/返回不写标记。
- `excerpts/screens/ExcerptsScreen.tsx`：暂存找回卡片、共用面板、候选预填与合并表单；清空或合并后刷新。
- `settings/data/system-preferences.repository.ts`：删除已处理键和清理方法；旧键不迁移，读取时自然忽略。

### src/core

- `database/migrations/0020-create-excerpt-stash.ts`（新增 21 行）：建立按账号主键、哈希唯一的暂存表，可重复执行。
- `database/migrations/index.ts`：登记 0020，数据库版本升为 20。

### src/shared

- 无改动。

### modules/

- 无改动。

### tests

- `tests/excerpts/clipboard-detection.test.cjs`：替换 handled 用例，验证 stashed 跳过与偏好设置。
- `tests/excerpts/clipboard-handled.test.cjs`（删除原 119 行）：退役服务不再测试。
- `tests/excerpts/excerpt-capture.test.cjs`：验证暂存、最终正文保存、并发去重与账号/会话拒绝。
- `tests/excerpts/excerpt-local.test.cjs`：验证编辑后的候选以 manual 来源保存。
- `tests/excerpts/excerpt-stash.test.cjs`（新增 81 行）：真实 SQLite fake port 验证迁移重复执行、增删改移、账号隔离与拼接。

### docs

- `docs/架构指南/业务模块与运行逻辑.md`：更新摘录检测、暂存和合并现状。
- `docs/架构指南/系统通知模块负责说明.md`：更新捕获窗口负责链路与失败语义；原生通知代码未修改。
- `CHANGELOG.md`：新增本次记录。
- `docs/logs/2026-09-29-clipboard-stash-merge.md`（新增 78 行）：本全链路日志。

## 与原代码对比及原因

1. 原来检测候选先查设备级 HMAC 已处理标记，忽略或保存后写标记，因而未保存的内容可能不再提示；现在只排除已保存、已暂存及本应用复制内容。用户关闭候选只清内存，下次可再提示。原因是取消不应永久丢掉用户输入。
2. 原来捕获窗口“保存”直接以 auto 来源写一条摘录；现在打开全文预填表单，用户编辑后以 manual 来源写一条。应用内检测卡也采用同一路径。原因是保存前需要修改正文。`paste` 入口保持原行为。
3. 原来没有暂存表或合并入口；现在 0020 表以 `(owner_key, client_id)` 隔离账号，以 `(owner_key, content_hash)` 防重复，顺序由 local_order 保存。原因是跨会话找回多条剪贴板内容，并在一个表单内合并成一条摘录。
4. 原来表单预填仅来自既有摘录，也未对预填超限主动禁用保存；现在支持 initialText、委托提交、超限提示和合并分隔开关。默认值单独标注：合并开关首次打开为“开”，条目间为 `\n\n`；关时为 `\n`。每次切换按暂存顺序重生成正文，覆盖表单中手动修改；这符合已确认交互。
5. 原来暂存无入口；现在捕获窗口可完整操作暂存，摘录页在检测卡/提示条下方显示暂存找回卡。原因是用户回到主应用后仍能找到未合并内容。
6. 原来普通新建/编辑表单在遮罩关闭时可按既有逻辑保存；现在该路径保留，新增委托表单的取消、遮罩和返回只关闭表单。原因是捕获与合并操作取消时必须保留候选或暂存。

## 完整调用链路

- 通知捕获：通知主体/按钮 → 原生捕获 Activity（现有链路）→ `ExcerptCaptureScreen` → `createExcerptCapture` → controller 核验会话、ownerKey、generation 和窗口身份 → `detectClipboard`（空白/超长/本应用写入/已保存/已暂存门控）→ 主面板。保存：预填 `ExcerptFormDialog` → `saveDetectedOffer` → `excerptRepository.save(manual)` → 本机 `local_excerpts` → Store 快照 → 关窗；失败留在表单供重试。暂存：controller.stash → `ExcerptStashRepository.add` → 本机 `local_excerpt_stash` → 提示并关窗。暂存面板：列表 → 排序/编辑/删除/清空写同一表；合并 → `mergeStashContents` → 表单分隔开关/整体编辑 → 保存一条摘录 → 成功后清暂存 → 关窗。重复摘录留在表单并保留暂存。
- 主应用：根布局唯一 `useClipboardDetectionController` → `detectClipboard` → 内存 offer Store → `ExcerptsScreen` 检测卡 → `ExcerptFormDialog` → `saveDetectedOffer` → 摘录仓库/SQLite/Store；关闭卡仅清内存。摘录页聚焦 → `useExcerptStash` 读 SQLite → 暂存卡 → 共用 `ExcerptStashPanel` → 同样的合并表单和本机保存。两端通过同一 SQLite 表共享暂存，不要求跨窗口实时订阅。
- 降级：无通知捕获宿主时沿既有应用内检测链路；剪贴板读取失败时捕获窗给出可关闭错误；保存/暂存写入失败保留表单或候选供重试。此链路不发 HTTP 请求、不进入云同步队列。

## 验证情况

- `npm run typecheck`：修改前 0 错误；修改后 0 错误。
- `node --test tests/excerpts/*.test.cjs`：摘录测试通过。
- `npm run check`：TypeScript、lint（仅既有 `PermissionSettingsScreen.tsx` 未使用变量 warning）、theme:check 通过；全仓测试未全过。`tests/todos/todo-local.test.cjs` 固定断言版本 19，本次登记 0020 后实际 20，属于本次迁移触发的旧断言；其余失败发生在发布/待办无关测试，现有沙箱对本地监听与子进程报 `EPERM`，发布源码用例报 `ENAMETOOLONG`。测试文件范围限制在 `tests/excerpts/**`，未改这些无关测试。
- `git diff --check`：通过。Android 构建、APK 和真机验收未执行（无原生改动）。
