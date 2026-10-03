# 阶段 3B：笔记历史版本气泡与事务恢复

## 最容易出 bug 的边界（先看这里）

| 边界 | 本次实现与应保持的约束 | 已执行证据 / 剩余验收 |
| --- | --- | --- |
| 恢复覆盖未提交输入 | 确认恢复先使用既有 beginSave 锁定并排空草稿；事务中按正常正式保存的 trim 规则比较内容。有变化才先创建 local-save，再创建 restore，不能只写旧快照后删除草稿 | SQLite 回归覆盖“先留当前输入”、空标题拒绝、恢复节点插入故障回滚；原生即时回显尚未验收 |
| 版本、草稿、上传任务只成功一部分 | local_notes 更新、版本创建、旧草稿条件删除、enqueueNoteUpload 都在同一 SQLite 事务；任何失败必须整体回滚 | 上传任务写入故障与 restore 插入故障注入通过，未留下半份版本或丢失草稿 |
| 旧草稿会话迟到补写 | 删除条件包含账号、draft_key、session_id、sequence；成功调用 endSave(true) abandon 旧会话并重新读取 SQLite，不能沿用恢复前内存值建立新会话 | 接管/序号/基础版本过期、旧会话补写拒绝、新会话读取恢复正文通过；真机重启/生命周期未验收 |
| 打开列表后当前版本变化 | 恢复时检查当前指针等于列表快照的 expectedRevisionId；草稿基础版本也要一致，不能仅依赖按钮禁用 | 并发恢复仅一次成功，基础版本过期拒绝；不自动覆盖并发内容，提示刷新 |
| 先留草稿触发 50 版本裁剪 | 两次插入均临时保护所选 revisionId；原有最新 50 + 引用及上一版保护仍生效，总行数允许超过 50 | 所选最旧版本位于裁剪边界的回归通过；保护仅属于本次事务，并非永久固定该历史 |
| 旧上传回执 / 旧队列任务完成 | 既有上传成功/失败回写有版本条件；enqueue 复用去重键但生成新 task_id，旧 complete 按旧 task_id 删除，不能清掉新恢复任务 | 新增成功回执、失败回执、旧任务完成三种回归通过；真实服务器并发回执未验收 |
| 云端删除 / 新建结果未知被意外解除 | 恢复保留“云端笔记已删除”错误保护；无 server_id 且 unknown 的新建保持 unknown 及原错误，不能强改 pending 后重复 POST | 两种保护回归通过；队列仍沿已有未知新建确认与云授权规则处理 |
| 账号在事务末尾切换 | service 捕获本机存储身份检查，事务开头和入队后再校验；读历史也核验归属。提交后身份已失效时不发布旧账号内容 | 跨账号读/恢复拒绝、末尾切号回滚且不发 Notes 事件通过；不绕过云授权 |
| 提交后订阅者抛错 | 数据提交成功后缓存/事件异常单独处理，不能回到“恢复失败、事务已回滚”的反馈分支 | Notes 订阅故障注入通过；此时只保证 SQLite 已成功，事件未送达时相关界面可能等待再次读取 |
| 分类、垃圾桶、正文淘汰与同步中 | 有效历史分类保留；分类已删除/不存在回退 null 默认分类；拒绝垃圾桶/清除标记、evicted 正文和 syncing 状态 | 有效/无效分类、flags/order/server_id 保留及受限状态拒绝回归通过 |
| 气泡关闭、重复点击与迟到读取 | 恢复期间 busyRef 同步锁定并拒绝关窗；关闭后 300ms 冷却；generation 使关闭/重选/卸载后的旧结果失效 | 实际组件/Hook 9 项状态回归通过；300dp/520dp 布局、大字、滚动、返回手势与键盘定位尚未真机验收 |

当前明确边界：历史只保存在本机；“历史内容 / 当前编辑”是切换查看两份内容，不是逐行差异。查看本身不正式保存，也不请求云端。恢复成功不代表已经同步到服务器。正式留版沿用 trim 规则，草稿自动落盘仍保留原始输入。

## 1. 时间、需求与基点

- 记录时间：2026-10-01 00:09:00 +00:00；本次代码实施及主要自动化检查发生在 2026-09-30 UTC，文档/提交收尾在 2026-10-01 UTC。
- 用户要求：完成编辑器阶段 3B；历史版本复用气泡组件；较大改动须详细中文日志、易出 bug 处置顶、中文提交并推送。补充说明：不需要 Web 包。
- 修改基点：`042f26e98132fbf964babdec8c951d8dfca686bb`（原提交 `fix(excerpts): retain save button alongside stash autosave`）。
- 实施前工作区干净；分支 `kroos_todo`，本次未合并 master，未带入其他任务的改动。
- 对比依据：实际读取基点文件并检查 `git diff 042f26e98132fbf964babdec8c951d8dfca686bb` 的工作区差异；新增文件逐个读取。最终提交可通过 `git diff 042f26e98132fbf964babdec8c951d8dfca686bb..HEAD` 复核同一范围。
- 用户先纠正独立面板方案；实施方案已改为同一 AnchoredPopover 内完成列表 → 详情/当前编辑对比 → 恢复确认，确认后实施。
- 本次没有新增页面、依赖、迁移、原生模块、后端接口或历史版本同步协议。

## 2. 改动清单（按层）

### 2.1 src/features

| 文件 | 改动与职责 | 与基点比较 |
| --- | --- | --- |
| `src/features/notes/components/viewer/NoteViewer.tsx` | 挂载历史入口；打开收键盘并请求草稿补写；恢复经 beginSave → service → endSave，传入当前内存编辑值和冲突禁用原因 | 修改，+48 / -1 行 |
| `src/features/notes/components/viewer/NoteViewerHeader.tsx` | 可选 actions 插槽承载历史图标，调用方负责业务 | 修改，+7 / -1 行 |
| `src/features/notes/components/viewer/note-history-popover.tsx` | 复用 AnchoredPopover/IconButton/DialogButton，管理列表、详情切换、恢复确认、错误/重试/防重复/关闭冷却与卸载保护 | 新增，413 行 |
| `src/features/notes/hooks/use-note-history.ts` | 封装历史摘要/全文异步读取；刷新、重选和 invalidate 使用 generation，丢弃旧结果 | 新增，67 行 |
| `src/features/notes/services/note-history.service.ts` | 本机身份门控；同事务读当前指针/摘要/分类；校验全文归属和结构；传入恢复保护参数，提交后刷新缓存/事件 | 新增，81 行 |
| `src/features/notes/data/note-revision.repository.ts` | 新增不含 content 的摘要类型/查询；InsertRevisionInput 支持恢复事务的 keepRevisionIds | 修改，+24 / -0 行 |
| `src/features/notes/data/note-local.repository.ts` | 增强已有恢复事务，保留旧无 options 调用兼容；校验版本/草稿/账号、留当前输入、回退分类、原子清理/入队与保留同步保护；纯读取参数可接受事务端口 | 修改，+91 / -7 行 |

既有 `useNoteDraft.ts`、草稿会话调度器、分类仓储、缓存/事件及上传队列实现均直接复用，未另建第二套保存或同步逻辑。

### 2.2 src/core

本次无修改。使用已有：

- `core/database` 的 ApplicationDatabase / ApplicationDatabaseTransaction 公共端口与事务边界。
- `core/cloud-storage/cloud-storage-policy.ts` 的 captureLocalStorageAccess；恢复只要求有效本机账号，不要求云上传授权。
- `core/sync/upload-queue.repository.ts` 的事务入队与 task_id 替换语义；`upload-queue-coordinator.ts` 的账号/云授权/网络/运行会话门控。
- 已有迁移清单、Revision 裁剪规则和 cloud 请求权限保持原职责；本次无表结构变化。

### 2.3 src/shared

本次无修改。直接复用公共 AnchoredPopover、IconButton、DialogButton、semanticColors 和现有主题类。气泡定位、遮罩、系统关闭请求及动画仍由共享组件实现，Notes 只控制业务内容和恢复期间的关闭拒绝。

### 2.4 modules/

本次无修改，没有新增 Android/iOS 原生桥接、权限或原生依赖。

### 2.5 tests

| 文件 | 行数与职责 |
| --- | --- |
| `tests/editor/history.test.cjs` | 新增 707 行，24 项回归；Node 内置 SQLite 内存库执行当前全量迁移，事务替身执行真实 BEGIN IMMEDIATE / COMMIT / ROLLBACK，运行实际仓储/服务/队列代码并注入故障 |
| `tests/editor/history-ui.test.cjs` | 新增 380 行，9 项回归；编译运行实际气泡组件和 Hook，React/原生宿主、计时器及历史读取端口使用替身，检查交互状态及异步竞态，不模拟真机布局 |

测试不发真实网络请求。UI 测试不能证明原生布局、动画、手势或设备上输入法验收。

### 2.6 docs

- `docs/进度与验证/项目编辑器进度.md`：文档 0.4.21 / 实施 0.7.0，更新当前状态、3B 全链路、文件职责与阶段/倒序版本记录；实施编号不等于应用发布版本。
- `docs/进度与验证/IRisNote编辑器阶段3保存版本边界验证清单.md`：3B.1，保留 3A 历史证据，新增 3B 自动化、失败路径和外部验收项，纠正不限量/无正文哈希等过时现状。
- `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md`：0.4.2，标明制定时基线与当前实现不同，更新 3B 状态和“正式提交才创建历史”的实际边界；SDK 56 链接保留为当时依据，当前项目为 SDK 57。
- `docs/logs/2026-10-01-note-history-3b.md`：本次新增 297 行全链路日志；风险边界置顶，记录基点、逐层改动、真实链路和验证。
- `CHANGELOG.md`：按既有最新置顶格式新增功能条目，记录范围、机制、实际检查及未执行项。

## 3. 与原代码对比及原因

| 原来（基点已核对） | 现在 | 修改原因 |
| --- | --- | --- |
| 3A 已有完整本地版本表与恢复函数，详情页没有历史 UI 入口 | Header 右侧挂载历史气泡，查看/确认都在原详情页内 | 完成 3B，同时满足用户复用气泡要求；打开历史不会触发详情页退出保存 |
| listNoteRevisions 返回整篇历史正文，适合原测试/数据调用 | UI 新增 listNoteRevisionSummaries，只选择元信息与 LENGTH(content)；选中才读全文；原查询仍保留 | 避免每次开窗把所有历史正文送入组件内存，兼容旧调用 |
| restoreLocalNoteToRevision 直接读目标、创建 restore、覆盖当前稳定内容并置 pending；不处理当前草稿或持久队列 | UI 经 service 传 options，先验证并留当前有变化的草稿，恢复/草稿清理/队列在同一事务 | 恢复不能吞掉详情页未提交输入，也不能留下“已恢复但无上传任务”的半状态 |
| 恢复函数未检查列表打开时的当前版本、草稿 session/sequence、未知结构等 UI 场景 | 校验 expectedRevisionId 与 assertDraftCommit，并检查笔记归属/结构/状态/空标题 | 气泡打开期间可能并发变更，不能凭旧列表执行覆盖 |
| 旧恢复全部清 last_sync_error、统一 pending | 普通恢复仍 pending；云端删除错误保留，未知新建状态与错误保留 | 不绕过现有删除传播保护，不触发结果未知的新建重复 POST；这是本次显式状态分支改变 |
| insertNoteRevision 只临时保护新节点及 parent，已有裁剪会执行 | 添加可选 keepRevisionIds，恢复的两次插入都传所选目标 | 保存当前草稿会新增版本，可能在恢复前裁掉刚选择的最旧节点 |
| 恢复没有详情编辑会话的结束/重建编排 | beginSave 排空当前写入，成功 endSave(true) abandon 并 reload；失败 endSave(false) 恢复原会话 | 旧会话不得迟到把已恢复内容覆盖回去；失败必须继续保留输入 |
| 历史节点保留 category_id，不能保证其分类仍存在 | 有效本地分类保留，不存在/已删除回退默认分类 | 与现有本机分类生命周期一致，不写失效分类引用 |
| 没有历史气泡的异步读取与重复操作边界 | generation 失效旧结果；busyRef 防重复恢复；关闭冷却 300ms；卸载时清计时器/忽略迟到状态 | 开关/选版本/恢复速度与异步读取不同，防止旧结果覆盖新选择和关闭中重开 |
| 进度文档仍写 3B 未开始 | 记录 3B 功能及自动化已完成，明确原生/服务器仍待验收 | 让项目阶段与真实代码一致，保留既有 3A 证据而不冒充本次验收 |

未修改全局默认开关、云上传授权或历史保留限额；上表的 unknown/云删除分支与分类回退是本次特定恢复行为变化。

## 4. 完整调用链路

### 4.1 打开与读取

```text
NoteDetailScreen -> NoteViewer / NoteViewerSession
  -> NoteViewerHeader.actions -> NoteHistoryPopover 的 History IconButton
  -> onOpen: blur 标题/正文 -> Keyboard.dismiss -> draft.requestFlush
     （只补写草稿，不导航、不创建版本、不访问 API）
  -> useNoteHistory.refresh
     -> readNoteHistory
        -> captureLocalStorageAccess(owner)
        -> database.transaction
           -> 读 local_notes 当前指针
           -> listNoteRevisionSummaries(owner, clientId)
           -> 读该账号 local_categories 的有效名称
           -> 末尾再核验账号
        -> Hook generation 一致才发布 snapshot/loading/error

点击某历史条目
  -> useNoteHistory.select(revisionId)
     -> readHistoryRevision
        -> 按 owner 读取 note_revisions 全文
        -> 检查 client_id 与 schema_version=1
     -> generation 一致才发布 selected
  -> “历史内容 / 当前编辑”切换
     -> 历史来自 selected 快照；当前来自 NoteViewer 的内存 value
```

列表的 created_at / revision_id 倒序与原查询一致；SQLite LENGTH 返回正文字符数用于显示，不是文件字节数/容量计量。分类名称取当前本地表，版本不保存历史分类名称。

### 4.2 确认恢复与原子事务

```text
详情“恢复此版本” -> 同气泡 confirm
  -> “确认恢复” -> busyRef 锁定
  -> NoteViewerSession.restoreHistory(targetRevisionId, expectedRevisionId)
     -> useNoteDraft.beginSave
        -> 既有 NoteDraftSession 保存锁 / 排空写入
        -> 读取该会话草稿并生成 DraftCommit(key/sessionId/sequence)
     -> restoreNoteFromHistory
        -> 捕获本机账号检查
        -> restoreLocalNoteToRevision(database, owner, clientId, target, options)
           BEGIN
           1. 核验本机身份、目标归属/结构、垃圾桶/清除状态
           2. 读当前 note/Revision，拒绝当前目标、过期 expectedRevisionId
           3. 拒绝 syncing/evicted，assertDraftCommit 校验会话/序号/基础版本
           4. 校验草稿 key/note_id，校验当前 trim 后标题非空
           5. 当前草稿有变化 -> 插入 local-save，parent=原当前版本
              keepRevisionIds 保护所选历史
           6. 核验历史分类是否仍有效；失效则 null 默认分类
           7. 插入 restore，parent=留存输入版本或原当前版本
              title/content 来自历史，category_id 使用核验结果
           8. 更新 local_notes 的正文/标题/分类/版本指针/同步信息
           9. DELETE 旧草稿 WHERE owner/key/session/sequence，必须恰好一行
          10. enqueueNoteUpload(tx, owner, 恢复后的 note)，不带已删除的旧草稿
          11. 再次核验本机身份
           COMMIT（任一步出错 ROLLBACK）
        -> 已提交：身份仍有效才 setCachedNote / notifyNotesChanged(upsert)
           通知异常单独处理，不把成功冒充回滚
     -> endSave(true)：abandon 旧会话 -> resource 清空/reload
        -> 从 SQLite 读取恢复后 note -> 新会话
        -> NoteViewerSession 按新 sessionId 重挂并显示恢复内容

任何提交前失败
  -> 整体 ROLLBACK -> endSave(false) 解除原保存锁
  -> 气泡保留确认与错误，可刷新列表/重试；当前输入与草稿保留
```

版本节点示例：

```text
恢复前：V1 -> V2（当前稳定版本），内存/草稿还有 D
D 有变化：V1 -> V2 -> V3(local-save, D) -> V4(restore, V1 的内容)
D 无变化：V1 -> V2 -> V3(restore, V1 的内容)
```

V1 的正文、标题与分类快照不被改写；若历史分类已失效，新 restore 节点使用默认分类。裁剪保留规则继续生效，不保证所有历史永久存在。

### 4.3 既有上传消费者（本次复用）

```text
同一恢复事务 enqueueNoteUpload
  -> enqueueUploadTask(kind=note-sync, dedupeKey=note:<clientId>)
     payload={ clientId, revisionId }；不附旧草稿提交标识
     ON CONFLICT 替换 payload 并生成新的 task_id，状态 queued
  -> upload-queue-coordinator
     队列变更 / 网络恢复 / 既有调度
     -> 当前账号 + 云授权 + 网络 + 运行会话门控
  -> upload-task-adapters.executeNoteTask
     -> 未知新建：沿 uncertainCreatePolicy 确认/阻止重试
     -> uploadNoteNow / note-save.service
        -> 沿既有 createNote 或 updateNote/API
        -> accepted/failed 按当前 Revision 条件回写
     -> completeUploadTask(本次 task_id)，旧 task_id 无法删新任务
```

本次恢复在 SQLite 提交时即成功；离线/未云授权时任务持久等待。云端删除、旧版未知新建等保护状态可能令任务阻塞，需要沿原同步处理，不承诺无条件上传。服务端仍只接收既有笔记接口内容，本次没有双端镜像历史代码或服务器迁移。

## 5. 具体数据变化与兼容性

- `note_revisions`：通常新增 1 个 restore；当前草稿 trim 后有变化则额外新增 1 个 local-save。自动草稿本身不会混入列表。
- `local_notes`：更新标题/正文/分类/指针与同步字段；保留 server_id、置顶、星标、local_order、pinned_order、创建时间等身份与排序字段。正文/标题变化时沿已有 nextEditTime 更新 local_updated_at。
- `note_drafts`：仅成功事务条件删除当前会话行；失败不删除；随后使用既有 Hook 从恢复内容重建新会话。
- `upload_queue_tasks`：同账号/笔记去重任务变为恢复后的 Revision，新 task_id 隔离旧完成回执。旧草稿已在本地事务清理，云端回执不再需要负责删除它。
- `local_categories`：只读校验，不创建、删除或修改分类。
- 云端：本地确认阶段无 HTTP；后续现有队列可能上传恢复后的整篇当前内容，完整历史不上传。
- 无迁移：已有表及字段足够，旧资料不进行不可逆转换。
- 旧 restoreLocalNoteToRevision 无 options 调用继续可用，不自动入队/清理草稿；实际 UI 恢复唯一调用路径是本次 service，并传入完整保护参数。
- 原 listNoteRevisions 未删除；纯读取 getLocalNoteByClientId 接受事务端口，既有 ApplicationDatabase 调用仍兼容。

## 6. 实际验证与处理结果

### 6.1 基线与最终全量检查

| 检查 | 实际结果 |
| --- | --- |
| 修改前 `npm run typecheck` | 通过，未发现既有 TypeScript 错误 |
| 修改前沙箱内 `npm run check` | 类型/Lint/主题通过；63 个测试文件结果 59 通过、4 失败，错误为本地监听/子进程 EPERM，不能算功能回归成功 |
| 获准环境单独执行 `node tests/releases/source.test.cjs` | 1/1 通过；确认当前发布源测试并非本次业务失败 |
| 本次 SQLite/服务 `node --test tests/editor/history.test.cjs` | 24/24 通过，0 跳过 |
| 本次组件/Hook `node --test tests/editor/history-ui.test.cjs` | 9/9 通过，0 跳过 |
| 最终获准环境 `npm run check` | TypeScript 通过、Lint 0 错误/1 既有警告、主题一致性通过；748 项测试，746 通过、2 跳过、0 失败 |
| `git diff --check` | 通过，最终提交前再次核对 |
| 原生视觉/手势、真实服务器恢复同步 | 未执行 |
| 最终 Web export / Web 包 | 按用户要求未执行 |
| Android JS export | 较早源码快照导出成功，最终源码未重导出；不作为最终提交的包验证 |
| Android APK / iOS 原生构建 | 未执行 |

既有 Lint 警告为 `PermissionSettingsScreen.tsx:171` 的 liveUpdateCapable 未使用，不在本次修改文件。两个跳过用例是当前环境的实际 JDK Selector 验证与 Windows batch 查找，不是历史恢复测试。

本次首轮检查曾发现事务读取参数类型和主题颜色属性引用错误，以及新测试中同步状态夹具不符合业务状态的断言问题；均已修正，并对最终代码重新执行目标与全量检查。最终结论依据最新成功轮次，不把失败归因给无证据的既有问题。

全量检查完成之后只补充上述 Markdown 文档和变更记录，没有再修改已验证业务源码/测试；不因纯文档收尾重复无关应用检查。

### 6.2 24 项真实 SQLite / 服务回归

1. 列表按账号/笔记隔离，不带正文，草稿不列为历史。
2. 选中后读完整快照；跨笔记/账号、已清理、未知结构拒绝。
3. 当前登录另一账号时拒绝读取或恢复前一账号历史。
4. 有效历史分类保留，显示本地分类名称。
5. 未云授权/离线仍完成本地恢复、删旧草稿并入队。
6. 未提交输入先留独立版本，新 restore 链接它，旧会话不能补写。
7. 当前指针变化/并发重复恢复只提交一次。
8. 当前版本不能恢复，输入与版本数量不变。
9. 草稿被接管时拒绝，不清理新会话。
10. 草稿序号/基础版本过期拒绝，保留输入。
11. 草稿不属于当前笔记拒绝。
12. 上传任务写入失败，版本/笔记/草稿全部回滚。
13. restore 节点写入失败，不单独留下 local-save。
14. 事务末尾切账号回滚且不发布旧账号事件。
15. 提交后订阅抛错仍返回本地成功。
16. 失效分类回退默认，置顶/星标/排序/server_id 保留。
17. 旧上传成功回执不改恢复后的同步状态/正文。
18. 云端删除保护保留。
19. 新建 unknown 防重复保护保留。
20. 旧上传失败不将新恢复版本标失败。
21. 旧任务完成不删除替换后的恢复上传任务。
22. syncing / evicted / 清除标记拒绝。
23. 空标题/未知结构拒绝且不删除草稿。
24. 50 版本裁剪边界上，先留当前输入时不误裁所选最旧节点。

### 6.3 9 项组件 / Hook 回归

1. 防重复打开、返回/外部关闭及关闭动画冷却。
2. 查看含未保存输入的当前编辑，取消只回详情不提交。
3. 恢复期间拒绝重复/关闭，失败保留确认并可重试。
4. 草稿冲突与当前版本禁用恢复。
5. 恢复期间卸载，迟到结果不写组件状态。
6. 成功关闭并失效旧读取，冷却后可重开。
7. 关闭后丢弃迟到列表，重新打开只接受新读取。
8. 快速选版本，旧读取失败不覆盖最新选择。
9. Hook 卸载后忽略迟到结果和错误。

### 6.4 本机会话证据路径

- `/tmp/irisnote-3b-baseline-check.log`：沙箱基线及 EPERM 证据。
- `/tmp/irisnote-3b-history-tests.log`：24 项目标回归。
- `/tmp/irisnote-3b-history-ui-tests.log`：9 项目标回归。
- `/tmp/irisnote-3b-final-check.log`：最终完整 TypeScript/Lint/主题/测试输出。
- `/tmp/irisnote-3b-android-export.log`：较早源码快照 Android JS export，不是最终包验收。

这些是当前会话的临时检查输出，不提交生成包或测试临时数据；可持续审查证据为同提交源码、测试和本日志中的实际结果。

## 7. 仍需用户设备验收的内容

- 气泡位于详情页顶部历史图标附近，窄屏、大字模式与不同系统栏尺寸下限高/滚动正常；按钮可见并能点击。
- 长正文选择复制、当前/历史切换、关闭/重开、恢复过程系统返回与外部点击、关闭冷却体验。
- 恢复后立即显示正确内容，重新编辑正常；切后台/杀进程/冷启动后版本、草稿及队列一致。
- 网络恢复、云授权切换、真实服务器拒绝/超时/成功回执下的最终同步结果。

本次不主动连接真机。阶段 4 块数据模型没有启动；没有 APK 或 Web 包发布。

## 8. 提交与恢复改动的边界

- 本次只提交清单内 14 个文件；初始工作区无用户未提交修改，提交前再次核对暂存区和冲突标记。
- 当前环境未找到 git-commit-command 技能，按真实 Git 状态降级编写中文提交标题与正文，使用提交正文文件保留换行。
- 用户已明确授权中文 commit 和远端 push；目标为 origin 的 kroos_todo，不强推、不改写其他分支。
- 提交后检查基点到提交的范围、工作区状态和远端同分支 SHA；提交号在完成汇报中给出，避免在本日志中嵌入自身 SHA。
- 回退代码不能撤销已经由用户执行的本地恢复事务。数据采用新增版本而非改写旧快照，用户可以在仍保留的历史中再次恢复；不执行删除真实数据、重置数据库或不可逆迁移。
