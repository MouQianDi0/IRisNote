# 新建笔记幂等：固定请求、结果未知自动重发与按云端身份认领

- 日期：2026-09-27
- 基点：`3fb31f6`（merge: 合并 origin/Timmi）→ 结果：工作区（未提交）
- 关联：CHANGELOG 2026-09-27 12:02:18；后端 irisapi `75d58c3`（已推送，未部署）；缓存重构第二期阶段 A

## 一、改动清单（按层）

### src/features

- `notes/api/notes-capability.ts`（新增，38 行）：记录服务端是否支持第二期接口（幂等新建、按 ID 取单篇、元数据同步三项同版本上线）。每次启动判断一次，只有状态，不依赖网络层；探测器由调用方注入，探测失败不记结果。
- `notes/api/notes.api.ts`：
  - `NoteUploadOptions` 新增 `idempotencyKey`。
  - `createNote` 带键时发送 `Idempotency-Key` 请求头，解析新格式回执 `{data, meta}`，并核对 `meta.operation_id` 与 `data.client_id`；旧格式响应照旧解析，同时记为"服务端不支持"。
  - 新增 `probeNotesServer`（`GET /notes/batch?ids=1`，200 表示支持，404 表示不支持，其他情况抛出）。
  - 新增 `fetchCloudNote`（`GET /notes/{id}`，用 `parseCloudNote` 校验，并核对 ID）。
- `notes/notes.types.ts`：`CreateNotePayload` 新增可选 `client_id`。
- `notes/data/note-create-operation.repository.ts`（新增，199 行）：
  - `prepareNoteCreateOperation`：在事务内取出或固定新建请求。
  - `readNoteCreateOperation`，以及损坏记录校验。
  - `deleteNoteCreateOperation`：可只删除指定的那一次请求。
  - `linkCreatedNotes`：同步投影时按云端身份认领云端已建出的笔记，并把被阻塞的上传任务恢复排队。
  - 表不存在时（只建到部分迁移的旧结构库）全部退回旧协议。
- `notes/services/note-save.service.ts`：
  - 新增 `cloudErrorCode`，同时兼容同步格式和旧格式的错误码。
  - 新增 `uncertainCreatePolicy`（`replay`/`blocked`/`later`）。
  - `syncPendingNoteWithReceipt`：发送前固定请求；新建时带键发送固定的请求体；成功处理抽成 `acceptCloudNote`，按固定时的版本号接受响应并清除固定请求。
  - 新增 `recoverExistingCreate`，处理 `CLIENT_ID_EXISTS`。
  - 失败分支：
    - 收到幂等错误码时记为服务端已支持；
    - `OPERATION_IN_PROGRESS` 视为结果未知并可重试；
    - 其他明确的 4xx 清除固定请求；
    - 结构化错误用 `noteSyncErrorMessage` 取文案。
  - 保存暂存、`queueNoteUploadNow`、`uploadNoteNow` 三处"结果未知"阻塞放宽：有固定请求时不阻塞；`uploadNoteNow` 按 `uncertainCreatePolicy` 决定。
- `notes/services/note-sync.service.ts`：投影后如果认领了笔记，调用 `notifyUploadQueueChanged` 唤醒上传队列。
- `notes/data/note-sync.repository.ts`：`projectMirror` 在合并前调用 `linkCreatedNotes`，返回值增加 `linkedCount`。
- `notes/data/note-local.repository.ts`：`removeLocalNote` 同时删除固定请求。
- `notes/data/note-trash.repository.ts`：`archiveLocalNote` 移入垃圾桶时删除固定请求。
- `sync/upload-task-adapters.ts`：`executeNoteTask` 对结果未知的新建按 `uncertainCreatePolicy` 返回 `retry` 或 `blocked`；上传后仍未知时，同样按该策略判定。

### src/core

- `database/migrations/0016-create-note-create-operations.ts`（新增，26 行）：新表 `note_create_operations`。
  - 主键 `(owner_user_id, client_id)`。
  - `operation_id`、`cloud_id` 两列均为 36 位且各自唯一，另有 `revision_id`、`request_json`、`created_at`。
- `database/migrations/index.ts`：注册 0016，`CURRENT_DATABASE_VERSION` 变为 16。

### tests

- `tests/sync/notes-idempotent-create.test.cjs`（新增，358 行，11 项）：真实 SQLite（全部迁移）+ 真实 `notes.api`，HTTP 由 axios 自定义适配器模拟。
- `tests/todos/todo-local.test.cjs`：版本号断言从 15 改为 16。

### docs

- `docs/架构指南/自动上传队列开发约定.md`：第 4 节第 4 条补充例外，新增 4.1 小节"笔记新建幂等"。

## 二、与原代码对比（`git diff 3fb31f6`）

1. **新建请求**
   - 原来：`createNote({title, content, updated_at?, category_id?})`，不带请求头，每次按当前笔记重新组装请求体。
   - 现在：第一次发送前把请求体（外加 `client_id`）连同幂等键固定写入 SQLite，重试时原样发送。只有旧结构库（没有这张表）仍走原来的路径。
2. **结果未知（没有响应）后的重试**（行为反转）
   - 原来：`executeNoteTask`、`uploadNoteNow`、`queueNoteUploadNow`、保存暂存四处一律阻塞，需要用户手动处理。
   - 现在：有固定请求且服务端已确认支持时自动重发（`retry`）；服务端能力暂时无法判断时 `retry`，等下次再判断；旧服务端或升级前遗留（没有固定请求）的保持阻塞，提示文案不变。
3. **成功确认**
   - 原来：`acceptServerNote(…, note.current_revision_id)`。
   - 现在：新建时传入固定请求的 `revisionId`。本机在固定之后又修改过，就转为 `pending/update`，随后走 `PUT`（沿用 `acceptServerNote` 原有的版本比较）。
4. **409 处理**
   - 原来：只有 `NOTE_EDIT_CONFLICT`（更新）有专门处理，其余 409 一律 `rejected`、不可重试。
   - 现在：`OPERATION_IN_PROGRESS` 记为 `unknown`、可重试；`CLIENT_ID_EXISTS` 取回并认领云端笔记（云端已删除时 `rejected`，清除固定请求）；`IDEMPOTENCY_KEY_REUSED` 仍为 `rejected`，保留固定请求，以便同步时按云端身份认领。
5. **明确的 4xx**
   - 原来：`rejected`。
   - 现在：同样是 `rejected`，另外清除固定请求，下次保存时重新固定一份新请求。401、403、408、409、429 不清除。
6. **同步投影**
   - 原来：云端已建出、但本机没收到响应的笔记，会作为一篇新的已同步笔记插入，列表里出现两份。
   - 现在：如果镜像中有与固定请求同一 `cloud_id` 的笔记，投影前先认领给本机笔记。正在上传（`syncing`）的笔记，或已有其他本地行占用该 `server_id` 时不认领。
7. **错误文案**
   - 原来：一律用 `getApiErrorMessage`。结构化错误 `{error:{code,message}}` 的 `error` 是对象，文案取不出来。
   - 现在：结构化错误用 `noteSyncErrorMessage`，旧格式错误不变。

## 三、改动原因

- **固定请求**：服务端按"用户 + 幂等键"去重，并用请求体指纹校验，同一个键如果配上不同的请求体会返回 `IDEMPOTENCY_KEY_REUSED`。结果未知期间用户可能继续编辑，用最新内容重试必然被拒，所以必须原样重发，新内容再按更新上传。这和待办的发件箱做法一致（按用户要求"与待办一样"）。
- **固定时的版本号**：固定的请求体对应的是那一刻的版本。服务端确认时，本机版本如果已经前进，就不能标为已同步。直接复用 `acceptServerNote` 原有的版本比较，不需要新增状态。
- **能力检测**：旧服务端会忽略请求头和 `client_id`。结果未知时如果盲目重发，在旧服务端上会建出重复笔记。所以只有确认服务端支持后才重发。
  - 判断时机：探测只在需要重发时进行，每次启动一次，失败不记结果，避免离线时误判为"不支持"。
  - 模块设计：能力模块不引入 HTTP 客户端，避免 Node 测试加载 React Native 依赖，也避免与 `notes.api` 循环引用。
- **云端身份认领**：回执过期（`SYNC_OPERATION_DAYS` 默认 7 天）或响应丢失后，同步仍可能把云端已建出的笔记拉下来。按 `note_sync_mirror.cloud_id` 与固定请求的 `cloud_id` 配对，可以在任何时候消除重复，不依赖回执。
- **4xx 清除 / 保留规则**：幂等回执会记录 4xx，同一个键再发只会得到同样的 4xx，所以明确拒绝后必须换键。401、403、429 可能没进入业务处理，保留固定请求不会有副作用。
- **旧结构库兼容**：诊断库和部分历史测试只建到早期迁移，其他仓库对缺表的处理也是退回旧行为，这里保持一致。

## 四、完整调用链路

```text
保存（编辑器）
  saveNewNoteLocalFirst / saveEditedNoteLocalFirst
    → stageEditedNoteForSync：结果未知的新建有固定请求时不再只保存本地，照常入队
    → enqueueNoteUpload（upload_queue_tasks，dedupe note:<id>）

上传队列协调器 → executeNoteTask（upload-task-adapters）
  ├─ 结果未知的新建 → uncertainCreatePolicy
  │    ├─ 没有固定请求 → blocked（原提示）
  │    └─ ensureNotesServerV2(probeNotesServer)
  │         ├─ 已知 / 探测 200 → replay → 继续
  │         ├─ 探测 404 → blocked
  │         └─ 抛出（离线、5xx、未授权） → later → retry
  └─ uploadNoteNow → syncPendingNote → syncPendingNoteWithReceipt
       ├─ prepareNoteCreateOperation（事务：已有则原样取出，否则生成 key / cloud_id 并固定请求体与版本号）
       ├─ markLocalNoteSyncing
       ├─ createNote(operation.request, {idempotencyKey}) → POST /notes（Idempotency-Key）
       │    ├─ 201 {data, meta} → 核对键与身份 → markNotesServerV2(true)
       │    └─ 200 旧格式 → markNotesServerV2(false)
       ├─ 成功 → acceptCloudNote → acceptServerNote(固定时的版本号) → 删除固定请求
       │         └─ 版本已前进 → pending/update → 队列 retry → PUT /notes/{id}
       └─ 失败
            ├─ 没有响应 → unknown，保留固定请求 → 队列按 uncertainCreatePolicy 重试
            ├─ 409 OPERATION_IN_PROGRESS → unknown，可重试
            ├─ 409 CLIENT_ID_EXISTS → fetchCloudNote(GET /notes/{id}) → acceptCloudNote
            │                          └─ existing.deleted → rejected，清除固定请求
            ├─ 其他明确的 4xx → 清除固定请求 → rejected
            └─ 401/403/429/5xx → 保留固定请求

同步协调器 → runNoteSync → projectMirror（事务）
  → linkCreatedNotes：镜像 cloud_id = 固定请求 cloud_id，且本机 server_id 为空、不在上传中
      → 写入 server_id、按版本判定 synced 或 pending，删除固定请求，blocked 任务恢复 queued
  → 其余合并照旧（reconcileNotesInTransaction）
  → linkedCount > 0 → notifyUploadQueueChanged 唤醒队列

删除 / 回收站：removeLocalNote、archiveLocalNote → deleteNoteCreateOperation
门控：所有请求仍经 captureCloudStorageAccess；未授权时 checkAccess 抛出，不会发出请求
```

## 五、验证情况

- **类型检查**：修改前 `npm run typecheck` 0 个错误；修改后 0 个错误。
- **新增测试**：`node --test tests/sync/notes-idempotent-create.test.cjs`，11/11 通过。覆盖：
  - 首次新建带键
  - 结果未知后同键同体重发，期间的修改随后走 `PUT`
  - 旧服务端保持阻塞、能力未知时稍后重试
  - 旧格式响应
  - 回执键不匹配
  - 4xx 后换键
  - `OPERATION_IN_PROGRESS`
  - `CLIENT_ID_EXISTS` 认领与云端已删除
  - 同步认领、认领后待更新
  - 删除和移入垃圾桶时清除固定请求
- **受影响的现有测试**：`tests/editor/*`、`tests/sync/*`、`tests/trash/*`、`tests/storage/*`、`tests/reading/*` 与 `todo-local` 共 245 项，全部通过。
- **`npm run check`**：typecheck 通过；lint 0 个错误、1 个警告（既有的 `PermissionSettingsScreen.tsx` 未使用变量）；theme:check 通过；测试 604 项，601 通过、2 跳过、1 失败。失败项是既有的发布归档 ENAMETOOLONG（与本机文件系统路径长度有关），不是本次引入的。
- **未执行**：与真实后端的联调（irisapi `75d58c3` 未部署）；真机验证；Android 构建（本次没有原生改动，不需要重新打包）。
