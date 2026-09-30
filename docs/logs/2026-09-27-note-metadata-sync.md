# 笔记同步改为元数据模式：镜像不再存正文，按正文哈希下载变化的正文

- 日期：2026-09-27
- 基点：阶段 A 完成后的工作区（`3fb31f6` + 新建幂等改动，见 `2026-09-27-note-idempotent-create.md`）→ 结果：工作区（未提交）
- 关联：CHANGELOG 2026-09-27 12:12:44；后端 irisapi `75d58c3`（`fields=meta`、`GET /notes/batch`，未部署）；缓存重构第二期阶段 B1

## 一、改动清单（按层）

### src/features

- `notes/api/notes-sync.types.ts`：
  - 新增类型：`CloudNoteMeta`（去掉 `content`，加 `content_hash`、`content_length`、`content_preview`）、`MirrorNote`（两种格式的联合）、`NoteFields`、`BatchPage`。
  - 新增函数：
    - `isCloudNoteMeta`；
    - `parseCloudNoteMeta`：拒绝带 `content` 的记录；哈希必须是 64 位小写十六进制；哈希、长度、摘要三者必须一致；
    - `parseMirrorNote`：按记录自身格式选择解析器；
    - `parseBatch`。
  - `SnapshotPage`、`NoteChange` 的笔记类型改为 `MirrorNote`，`parseSnapshot`、`parseChanges` 改用 `parseMirrorNote`。
  - `SnapshotQuery` 新增 `fields`。
  - `NotesSyncTransport.changes` 新增第 5 个参数 `fields`，另外新增两个可选方法 `supportsMeta`、`batch`。
- `notes/api/notes-sync.api.ts`：
  - `changes` 按需带上 `fields`；
  - 新增 `supportsMeta`（`ensureNotesServerV2(probeNotesServer)`，与阶段 A 共用每次启动的能力判断）；
  - 新增 `batch`（`GET /notes/batch?ids=`）。
- `notes/data/note-content-hash.ts`（新增，38 行）：
  - `noteContentHash`：用 `@noble/hashes` 计算 UTF-8 字节的 SHA-256。
  - `fillLocalContentHashes`：为有云端副本、正文非空、但还没有哈希的本地笔记补算哈希，写回时核对正文未被并发修改。
- `notes/data/note-sync.repository.ts`：
  - `SyncState` 新增 `mirror_mode`；`resetSnapshot` 新增可选参数 `mode`。
  - `readCloudMirror` 改为返回 `MirrorNote[]`。
  - 新增 `readMissingBodies`：列出需要下载正文的笔记——本机没有的、已同步但哈希不同的、垃圾桶里被其他设备恢复的。
  - 新增 `withBody`：为元数据记录补上正文，先用刚下载的，其次用哈希相同的本地正文，都没有时本轮跳过。
  - `projectMirror` 新增参数 `bodies`。
- `notes/services/note-sync.service.ts`：
  - 同步开始时通过 `supportsMeta` 确定镜像模式；模式变化时 `resetSnapshot(mode)`。
  - 快照和增量按模式带上 `fields`。
  - 合并前调用 `downloadBodies`（补算哈希 → 列出缺正文的笔记 → 每 50 篇一批下载）。
- `notes/data/note-cache.repository.ts`：`readNoteCacheCandidates` 按记录格式比较正文——元数据镜像比哈希，完整镜像比原文。
- `notes/services/note-cache.service.ts`：清理笔记缓存请求的是完整快照，如果收到元数据记录就拒绝；读取已缓存的身份改用 `parseMirrorNote`。

### src/core

- `database/migrations/0017-add-note-content-hash.ts`（新增，38 行）：
  - `local_notes` 新增 `content_hash` 列；
  - `note_sync_state` 新增 `mirror_mode` 列（默认 `'full'`，只允许 `full` 或 `meta`）；
  - 新增触发器 `local_notes_content_hash_reset`：正文变化、且同一语句没有同时设置哈希时，清空哈希；
  - 列已存在时跳过，可以重复执行。
- `database/migrations/index.ts`：注册 0017，数据库版本变为 17。

### tests

- `tests/sync/notes-meta-sync.test.cjs`（新增，315 行，10 项）：真实 SQLite（全部迁移）+ 内存假服务端（按 `fields` 返回完整或元数据；支持批量接口）。
- `tests/todos/todo-local.test.cjs`：版本号断言从 16 改为 17。

### docs

- `docs/API后端/笔记正文按需加载接口需求.md`：状态行写明客户端已实现元数据同步。

## 二、与原代码对比（基点为阶段 A 后的工作区）

1. **镜像内容**
   - 原来：`note_sync_mirror.payload` 和快照暂存都保存云端返回的完整 JSON（含正文），每篇已同步笔记在本机至少有 3 份正文：镜像、`local_notes`、当前版本。
   - 现在：服务端支持时只存元数据（不含正文），每篇少一份。旧服务端仍存完整 JSON。
2. **同步请求**
   - 原来：快照和增量总是不带参数，每次正文变化都随事件完整下载一次。
   - 现在：服务端支持时带 `fields=meta`；只为哈希不同或本机没有的笔记调用 `GET /notes/batch` 取正文。只改置顶、星标、分类、标题的事件不再下载正文。
3. **合并输入**
   - 原来：`projectMirror` 直接把镜像里的完整笔记交给 `restoreFromRemote` 和 `reconcileNotesInTransaction`。
   - 现在：先经 `withBody` 补上正文再交给同样的两个函数。正文来源是刚下载的笔记，或哈希相同的本地正文。补不上正文的笔记本轮跳过，不改动本地，也不会误删（删除仍只看镜像的墓碑）。
4. **模式切换**
   - 原来：没有模式概念。
   - 现在：同步开始时判断服务端能力。支持则切到 meta，不支持则切回 full；无法判断（离线等）时沿用当前模式，不重建快照。切换时重建快照，因为快照令牌与模式绑定；旧镜像保留到新快照取完再整体替换。
5. **本地正文哈希**
   - 原来：没有这一列。
   - 现在：`content_hash` 按需补算。任何写入路径改了正文，触发器都会清空它，所以不需要在每个写入点单独维护。
6. **清理笔记缓存**
   - 原来：候选笔记要求镜像正文与本地逐字相同。
   - 现在：元数据镜像改为比较哈希。

## 三、改动原因

- **镜像去掉正文**：需求文档第 1 节的目标之一是"同步链路只比对元数据和正文摘要，不再为了比对而保存第二份正文"。镜像只用来判断版本和变化，完整正文已经在 `local_notes` 和版本历史里。
- **用哈希判断，不用版本号**：版本号在置顶、星标、分类变化时也会递增。只看版本号，每次标记笔记都会重新下载正文；哈希只在正文变化时才不同。
- **触发器清空，而不是每个写入点维护**：正文写入分散在新建、编辑、合并、恢复版本、回滚、垃圾桶恢复等十几个函数里，逐个维护容易遗漏。触发器保证哈希只可能"与正文一致"或"为空"，为空时再补算，代价只落在改过的正文上。
- **补不上正文就跳过**：下载失败或服务端报告 `missing`（已被删除）时，用旧正文或空正文合并都会写错数据。跳过后下一轮会补上，删除则由墓碑事件处理。
- **能力无法判断时保持当前模式**：离线时如果把能力判断误当成"不支持"，会反复重建快照。
- **与阶段 A 共用能力判断**：服务端三项接口同一版本上线，一次判断就够，每次启动最多发一次探测请求。

## 四、完整调用链路

```text
同步协调器（回前台 / 本机写入后 / 每 60 秒 / 联网恢复 / 页面请求）
  → runNoteSync(db, owner, notesSyncTransport, signal, guard)
    ├─ transport.supportsMeta → ensureNotesServerV2(probeNotesServer)（每次启动一次）
    │    true → meta │ false → full │ 抛出 → 沿用 note_sync_state.mirror_mode
    ├─ 模式变化 → resetSnapshot(mode)：清空游标与暂存，写入 mirror_mode
    ├─ 快照：transport.snapshot({limit, fields?, cursor?, snapshot_token?})
    │    → parseSnapshot → parseMirrorNote（带 content_hash 的是元数据）
    │    → stageSnapshot（payload 原样保存）→ 末页整体替换 note_sync_mirror
    ├─ 增量（两轮）：transport.changes(cursor, limit, signal, fields) → applyChanges
    ├─ meta 模式：downloadBodies
    │    ├─ fillLocalContentHashes（sha256；写回时核对 content 未变）
    │    ├─ readMissingBodies（本机没有 / 已同步但哈希不同 / 垃圾桶被恢复）
    │    └─ transport.batch（每批 50 篇）→ GET /notes/batch → parseBatch → bodies
    └─ projectMirror(db, owner, check, bodies)（事务）
         ├─ linkCreatedNotes（阶段 A）
         ├─ readCloudMirror → withBody（刚下载的 / 哈希相同的本地正文 / 跳过）
         ├─ restoreFromRemote（垃圾桶被其他设备恢复）
         ├─ reconcileNotesInTransaction(mirror=true)（原逻辑：跳过未同步的行，正文变化时生成 server-reconcile 版本）
         └─ 墓碑与缺失处理（原逻辑，只看镜像 payload IS NULL）

触发器：UPDATE local_notes SET content=… → content_hash=NULL（同一语句同时设置了哈希时保留）
清理笔记缓存：readNoteCacheCandidates（元数据镜像比哈希）→ clearNoteCache（仍请求完整快照）
分类删除任务：readCloudMirror 只用 id、category_id，两种格式都可以
```

## 五、验证情况

- **类型检查**：修改后 `npm run typecheck` 0 个错误（阶段 A 前的基线为 0）。
- **新增测试**：`node --test tests/sync/notes-meta-sync.test.cjs`，10/10 通过。覆盖：
  - 客户端哈希与服务端算法一致（空串、CRLF、表情、null），以及元数据解析的异常情况
  - 从完整模式切换后只取元数据，正文没变时不下载
  - 正文变化时下载并生成版本，只改置顶时不下载，新笔记下载后插入，哈希一致后不再下载
  - 下载不到正文时跳过，下一轮补上
  - 未同步的本地修改不被下载覆盖
  - 触发器清空哈希
  - 旧服务端切回完整模式；能力无法判断时不重建快照
  - 被其他设备从垃圾桶恢复的笔记下载后恢复
  - 清理笔记缓存按哈希选候选
  - 同步后列表完整
- **现有测试**：editor、sync、trash、storage、reading 与 todo-local 共 268 项，全部通过。
- **`npm run check`**：typecheck 通过；lint 0 个错误、1 个既有警告；theme:check 通过；测试 614 项，611 通过、2 跳过、1 失败（既有的发布归档 ENAMETOOLONG，与本次无关）。
- **未执行**：与真实后端联调（后端未部署）；真机验证；大量笔记首次补算哈希的耗时测量。
