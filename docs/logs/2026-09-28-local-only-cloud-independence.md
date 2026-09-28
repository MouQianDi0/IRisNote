# 关闭云同步后的本机功能独立运行

- 日期：2026-09-28。
- 授权：用户确认修复方案后执行；本次未提交、构建或发布。
- 对比基点：`38e307d19806ab41190cd21352f58c7cc8e1d125`，结果为当前未提交工作区。通过 `git diff 38e307d19806ab41190cd21352f58c7cc8e1d125 -- src tests` 核对已有文件的原行为与实际修改；新增文件单独核对。没有虚构结果提交 SHA。
- 开始本轮执行时 `CHANGELOG.md` 已有用户改动，本次保留原文，仅前置本次记录。

## 问题与设计选择

关闭云授权后，HTTP 门控正确地阻止云请求，但部分本机操作复用了云授权检查或依赖 API 成功：笔记标星和置顶、分类管理、已有云笔记的回收站操作因此不可用。笔记正文保存、待办、摘录已有本地链路，本次沿用，不重写。

新增只检查当前账号会话的本地访问检查。本机操作先落 SQLite，再通过原有订阅更新界面；待同步元数据和删除/恢复意图持久保存。云请求仍经过原有授权与账号代次检查，关授权不放行上传；重新授权后再由协调器或上传队列处理。

默认云开关、首次授权要求、账号隔离规则均未反转。本次反转的是“本机功能依赖云授权”：本机标记、分类与有本地记录的回收站操作现在不要求云授权。回收站仍保留 15 天。正文已释放的笔记只能使用摘要，不能把空正文当成完整内容上传。

## 改动清单（按层）

### src/features

| 文件 | 实际改动与原因 |
| --- | --- |
| `src/features/notes/services/note-flags.service.ts`（新增，109 行） | 本地事务切换标星/置顶，单独持久化元数据意图；按版本确认同步，避免旧回执清除新操作；不创建正文版本。存在待同步记录时才动态加载 API，避免纯数据库调用加载原生 HTTP 环境。 |
| `src/features/notes/hooks/useNoteStar.ts` | 调用本地标记服务，以提交后的笔记更新列表，移除依赖服务端 ID、云授权和整列表网络失败回滚的流程。 |
| `src/features/notes/hooks/useNotePin.ts` | 同上；置顶顺序在 SQLite 中按当前最大值递增，避免依赖过期 UI 快照。 |
| `src/features/notes/services/note-sync-coordinator.ts` | 回收站同步后同步标记，之后重新记录写入代次，保持拉取过程的并发保护。 |
| `src/features/notes/categories/data/category-local.repository.ts`（新增，163 行） | 本机分类实体、旧缓存迁入、本地/云 ID 映射、远端列表合并；保留脏数据与删除墓碑，并用请求开始时版本拦截过期列表。 |
| `src/features/notes/categories/data/category-cache.ts` | 关闭授权直接读本机分类；授权后刷新并合并；普通请求失败返回本机数据。保留旧数据库测试场景的缓存兼容。 |
| `src/features/sync/category-upload-queue.ts` | 分类增改删先事务落本地和队列；本地新分类使用稳定负 ID，分类删除沿用笔记回收站归档。 |
| `src/features/sync/upload-task-adapters.ts` | 执行本机分类任务并记录云 ID；创建结果未知时阻止再次自动创建；分类删除先核对笔记删除意图，避免绕过冲突保护；笔记上传后同步标记。 |
| `src/features/sync/upload-task-cancellation.ts` | 本机分类变更不能只取消上传任务而丢失同步跟踪，提示在分类管理中修改或删除。 |
| `src/features/notes/data/note-local.repository.ts` | 全量笔记合并按分类映射使用本机 ID；云端缺失时保留尚待确认恢复的本机笔记。 |
| `src/features/notes/data/note-sync.repository.ts` | 元数据合并也使用同一分类映射与恢复保护，与全量链路保持一致。 |
| `src/features/notes/services/note-save.service.ts` | 上传时转换分类 ID；分类未创建或恢复未确认时保留本地并等待；禁止上传已释放的正文。 |
| `src/features/notes/data/note-trash.repository.ts` | 读取本机删除/恢复意图；阻止旧云删除覆盖待确认恢复；摘要笔记按缺失正文状态恢复，不生成空正文版本；已有 server_id 的恢复使用 update 而非 create。 |
| `src/features/notes/services/note-trash.service.ts` | 本地与云授权检查分离；关闭授权后归档和恢复本地记录，保存意图；重新授权校验云身份/版本，确认删除和恢复；记录删除已发出状态，处理撤权后恢复与迟到响应。 |
| `src/features/notes/categories/components/CategoryBar.tsx` | 分类加载和新建入口使用本地会话检查，关闭云授权仍可使用。 |
| `src/features/notes/categories/components/CreateCategoryModal.tsx` | 等待本地保存结果再清空并关闭，失败保留名称和图标并显示错误，保存期间防重复提交。 |
| `src/features/notes/screens/NotesScreen.tsx` | 分类加载不依赖云授权；新建失败传回表单；接入本地标记 Hook，清理旧参数。 |
| `src/features/notes/components/viewer/NoteViewerMeta.tsx` | 笔记分类信息使用本机分类，不把关闭云同步提示成不可用。 |
| `src/features/notes/screens/NoteDetailScreen.tsx` | 关闭云同步时缺失正文进入明确的正文未下载状态。 |
| `src/features/notes/components/viewer/NoteDetailStateView.tsx` | 正文未下载状态显示实际原因及已有兜底文案。 |
| `src/features/notes/services/note-body.service.ts` | 本机模式缺失正文提示说明已保留摘要，需要开启同步后下载。 |
| `src/features/settings/screens/CloudStorageSettingsScreen.tsx` | 关闭后的提示改为仅本机保存、主要本机功能继续使用、重新开启后按规则同步。 |

### src/core

| 文件 | 实际改动与原因 |
| --- | --- |
| `src/core/cloud-storage/cloud-storage-policy.ts` | 新增独立本地会话代次和 `captureLocalStorageAccess`；开关云授权不取消本地操作，切账号（包括 A→B→A）拒绝旧操作。 |
| `src/core/database/migrations/0019-local-cloud-independent.ts`（新增，41 行） | 新增账号隔离的 `local_categories`、`note_local_flags`、`note_trash_intents`；触发器保留尚未确认的标星/置顶值。表和触发器使用 IF NOT EXISTS。 |
| `src/core/database/migrations/index.ts` | 注册迁移 19。 |
| `src/core/sync/upload-queue.repository.ts` | 同 dedupe_key 新入队时替换 task_id；旧执行回执只能确认旧任务，不能误删新入队任务。 |

### src/shared、modules

未改动。统一 HTTP 云门控、服务端 API、原生权限及通知模块均沿用既有实现；本次不需要服务端 migration。

### tests

| 文件 | 实际改动 |
| --- | --- |
| `tests/sync/local-only.test.cjs`（新增，667 行） | 17 项真实 SQLite 回归测试，HTTP 使用 fake adapter，并断言没有意外网络请求。覆盖本机标记、摘要保护、账号代次、分类 CRUD/映射/未知创建/旧响应、队列旧回执、垃圾桶冲突和撤权竞态、数据库重开、事务失败。 |
| `tests/sync/notes-body-eviction.test.cjs` | 将摘要笔记的“无云正文拒绝恢复”断言改为“恢复摘要和缺失正文状态、不补空正文”。 |
| `tests/todos/todo-local.test.cjs` | 数据库版本断言更新到 19。 |

### docs

本日志记录完整链路和验证；根目录 `CHANGELOG.md` 前置本次条目，保留已有内容。

## 与原代码对比

1. 原标记切换要求云授权和远端 ID，通过 API 后处理结果，失败恢复列表快照；现在事务读取最新本机值后切换，持久保存元数据意图，网络失败不回滚用户的新操作。
2. 原分类主要来自服务端列表/缓存和队列叠加，入队也要求云授权；现在分类实体在本地可独立读写，授权后再解析云 ID。新建模态框原来不等待保存完成，现在失败保留输入。
3. 原已有云 ID 的笔记删除和恢复依赖云请求；现在关闭授权时先操作本机回收站，随后按记录的身份和版本同步。未发出的删除可以取消；已发出的删除必须确认恢复，不能简单丢弃意图。
4. 原摘要笔记没有云正文时无法恢复；现在恢复笔记的元数据和摘要，保持 body_state=evicted。完整正文尚不可离线读取和编辑。
5. 原去重入队保留 task_id，旧回执可能清掉新操作；现在新入队生成新 task_id，旧回执不能误确认。

## 完整调用链路

### 标星和置顶

列表 UI → useNoteStar / useNotePin → toggleLocalNoteFlag → 本地会话检查 → SQLite 事务（local_notes + note_local_flags）→ 笔记缓存与 notes 事件 → 列表更新。

授权打开后：note-sync-coordinator / 笔记上传完成 → syncLocalNoteFlags → 云会话检查 → notes API → 统一 axios 门控 → 仅按确认版本清除标记意图。正文版本与 updated_at 不因本机标记变化而重写；较新标记保留。失败保留意图，后续同步可重试。

### 分类及笔记归属

分类 UI → category-upload-queue → 本地会话检查 → local_categories + upload_queue_tasks 事务 → 分类事件 → loadCategories / 本地分类列表 → UI。

上传协调器 → executeLocalCategoryTask → 云授权检查 → 分类 API → 保存云 ID → 按本地版本确认。笔记保存继续先落本地；上传前 cloudCategoryId 把本机分类 ID 转为云 ID，未建立映射则等待。全量笔记合并、元数据合并、回收站恢复三条回读链路使用相同映射回本机 ID。

分类删除 → 现有笔记垃圾桶服务归档关联本地笔记 → 本地分类墓碑与队列 → 授权后先确认笔记删除意图，再执行既有云分类删除。分类中的笔记出现删除冲突时保留本地状态并阻止分类云删除，避免绕过版本保护。批量归档不是整批原子事务，中途失败时已经归档的笔记仍保留在垃圾桶。

### 删除、恢复及授权切换

笔记/垃圾桶 UI → note-trash.service → 本地账号会话检查 → 本地归档/恢复事务 + note_trash_intents → 缓存和列表事件。

重新授权 → synchronizeNoteTrash → 同步本地意图 → 云身份和版本核对 → 垃圾桶 API（统一门控）→ 条件确认本地意图 → 常规垃圾桶拉取。远端版本较新时不执行旧删除，保留本地归档及错误。请求已发出后撤权、随后本机恢复时保留待确认恢复；全量与元数据合并不会用旧删除覆盖该笔记。恢复确认前正文上传等待，避免把恢复误处理成新建。

### 已释放正文

详情页 → note-body.service → 本地正文状态判断 → 关闭云授权且正文缺失时显示“正文未下载”和摘要相关说明。标记走独立元数据链路；垃圾桶恢复保留 evicted 状态；正文上传入口拒绝 evicted，防止空内容覆盖云端。

## 风险与边界

- 分类创建接口没有新增服务端幂等协议。创建请求结果未知时保留本机分类并阻止自动重复创建，需核对云端后处理；本次不宣称所有未知创建能自动恢复。
- 云端较新修改与离线删除冲突时保留待处理状态，不宣称强行覆盖或自动合并成功。
- 尚未下载或曾释放的正文无法离线还原；已有本地正文、分类和标记持久保留。
- 未新增账号、匿名模式、服务端或原生接口；现有登录身份仍是本地账号隔离的基础。

## 验证情况

最终 `npm run check` 退出码 0：TypeScript 通过；Lint 0 错误、1 条既有警告（`PermissionSettingsScreen.tsx:171` 的 `liveUpdateCapable` 未使用，本次未修改该文件）；`theme:check` 通过；639/639 测试通过，无失败、跳过或取消。

- 修改前 `npm run typecheck`：通过，无既有类型错误。
- 新增专项 `node --test tests/sync/local-only.test.cjs`：17/17 通过。
- 修复测试模块加载后，`node --test tests/sync/notes-sync.test.cjs tests/sync/local-only.test.cjs`：当时 51/51 通过；随后新增第 17 项专项用例，最终以全量检查为准。
- Android 构建、安装包生成、真机交互和真实服务器联调：未执行。

- `git diff --check`：通过。源代码、测试及本日志扫描未发现 Git 冲突标记。最终全量检查后只补充文档记录，没有再修改代码。
