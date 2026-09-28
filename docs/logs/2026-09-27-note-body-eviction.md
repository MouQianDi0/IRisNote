# 笔记混合模式：正文淘汰与按需下载

- 日期：2026-09-27
- 基点：阶段 B1 完成后的工作区（`3fb31f6` + 阶段 A、B1 改动，见 `2026-09-27-note-idempotent-create.md`、`2026-09-27-note-metadata-sync.md`）→ 结果：工作区（未提交）
- 关联：CHANGELOG 2026-09-27 12:59:38；后端 irisapi `75d58c3`（`GET /notes/{id}`、`fields=meta`、`GET /notes/batch`，未部署）；缓存重构第二期阶段 B2

用户确认的规则：
- 置顶、星标、有草稿、未同步、正在打开的笔记始终保留正文；其余按最近打开保留 300 篇，超出的只留摘要。
- 淘汰时保留历史版本。
- 存储页的"笔记缓存"改为"释放笔记正文"。
- 详情页新增"正文未下载"状态；列表卡片改显示摘要，不加标记；存储页新增"笔记正文"统计行。

## 一、改动清单（按层）

### src/features

- `notes/data/note-body.repository.ts`（新增，131 行）：
  - `NOTE_BODY_KEEP_RECENT = 300`。
  - `hasBodyState`：检查表结构是否已有正文状态列，旧结构库跳过所有淘汰逻辑。
  - `readEvictedPreviews`：读取已淘汰笔记的摘要。
  - `markNoteOpened`：记录最近打开时间。
  - `readCandidates`：列出可淘汰的笔记，条件是已同步、没有本地修改、没有草稿和上传任务、未置顶未星标，且镜像中 `json_extract(payload,'$.content_hash')` 等于本地哈希。
  - `evictNoteBodies`：保留前 `keepRecent` 篇，`exclude` 中的笔记既不占名额也不会被淘汰；其余清空正文、写入摘要和长度，哈希保留。
  - `readNoteBodyStats`：统计本机有正文、只剩摘要、当前可释放的篇数。
- `notes/services/note-body.service.ts`（新增，158 行）：
  - `ensureNoteBody`：
    - 正文在本机时，只记录打开时间；
    - 已淘汰时调用 `fetchCloudNote`（`GET /notes/{id}`），再用 `reconcileNotesInTransaction`（mirror 模式）合并；云端正文为 null 时显式标为已下载；
    - 最后记录打开时间，并通知列表。
    - 取不到时抛出 `NoteBodyUnavailableError`，原因分为 offline、not-found、local-only、error。
  - `releaseNoteBodies`：存储页手动释放，在 `withNoteCacheMaintenance` 内执行，补算哈希后以 `keepRecent = 0` 淘汰，并逐条通知列表。
  - `readNoteBodyUsage`：供存储页读取统计。
- `notes/services/note-sync.service.ts`：
  - 新增 `holdNoteBody`、`heldNoteBodies`（正在打开的笔记计数）。
  - `downloadBodies` 改用 `readBodyPlan(NOTE_BODY_KEEP_RECENT)`，返回下载到的正文和"只插入摘要"的集合。
  - 元数据模式下，合并后补算哈希，再以保留 300 篇、排除正在打开的笔记为条件执行 `evictNoteBodies`。
- `notes/data/note-sync.repository.ts`：
  - `readMissingBodies` 改为 `readBodyPlan`。需要下载的包括：哈希不同的已同步笔记、被置顶或星标的已淘汰笔记、垃圾桶被恢复的笔记，以及在保留范围内的新笔记。其中置顶、星标的新笔记必定下载，其余按修改时间从新到旧，补满 `keepRecent` 减去本机已有正文篇数的名额。超出范围的新笔记只插入摘要。
  - `withBody` 不把已淘汰笔记当作本地正文副本。
  - 新增 `applyMetadataOnly`：已淘汰的笔记只更新标题、分类、置顶、星标、时间、哈希、摘要、长度；计划中只插入摘要的新笔记以淘汰状态插入，沿用清理缓存时留下的本地身份，不生成版本。
  - `projectMirror` 新增 `evictedInserts` 参数，把拿不到正文的元数据记录交给 `applyMetadataOnly`。
- `notes/data/note-local.repository.ts`：
  - 新增 `withBodyState`。`readNoteByClientId`、`getLocalNotes` 通过 `readEvictedPreviews` 带上 `body_state` 和 `content_preview`，列定义不变，旧结构库照常可读。
  - `updatePendingLocalNote`：已淘汰的笔记，保存时如果没带正文（只改标题或分类）就拒绝。
- `notes/data/note-trash.repository.ts`：
  - `archiveLocalNote` 会把已淘汰笔记的 `body_state`、`content_preview` 写入 `local_json`；
  - `trashPreview` 在没有正文时退回显示 `content_preview`；
  - `restoreArchivedNote` 在没有云端数据时，拒绝恢复已淘汰的笔记。
- `notes/notes.types.ts`：`Note` 新增 `body_state`、`content_preview`。
- `notes/screens/NoteDetailScreen.tsx`：
  - 新增 `show`：已淘汰的笔记先调用 `ensureNoteBody` 再显示，正文在本机时后台记录打开时间。
  - 新增 `body-missing` 状态。
  - 用 `holdNoteBody` 在查看期间保留正文。
  - 回到页面时，如果缓存里的笔记已淘汰，不直接显示。
- `notes/components/viewer/NoteDetailStateView.tsx`：新增 `body-missing` 状态，标题"正文未下载"、说明"这篇笔记的正文不在本机，联网后可以查看"，带重试按钮，布局沿用原样。
- `notes/components/card/SwipeableNoteItem.tsx`：已淘汰的笔记，卡片第二段显示 `content_preview`。
- `notes/components/viewer/NoteContextMenu.tsx`：新增 `bodyMissing`，正文未下载时复制、分享、图片分享只提示，不执行。
- `notes/screens/NotesScreen.tsx`：打开已淘汰笔记的长按菜单时在后台下载正文；改标题前先 `ensureNoteBody`。
- `notes/services/note-sync-coordinator.ts`：维护期间的提示文案改为"笔记正文正在释放"。
- `settings/screens/DataStorageSettingsScreen.tsx`：
  - 清理项改名"笔记正文"，数值为"可释放 N 篇"，并更新说明、确认弹窗和结果文案；
  - 改用 `readNoteBodyUsage`、`releaseNoteBodies`；
  - "本地数据"卡片新增"笔记正文"行：`已下载 x · 摘要 y`。

### src/core

- `database/migrations/0018-add-note-body-state.ts`（新增，55 行）：
  - `local_notes` 新增 `body_state`（默认 `'present'`）、`content_preview`、`content_length`、`last_opened_at`，列已存在时跳过。
  - 重建哈希清空触发器：只在 `body_state='present'` 时清空，所以淘汰不会清掉哈希。
  - 新增触发器 `local_notes_body_restored`：已淘汰的行被任何路径写入 `content` 时，恢复为 present，并清空摘要、长度和哈希。
- `database/migrations/index.ts`：注册 0018，数据库版本变为 18。
- `storage/auto-cleanup.ts`、`storage/storage-policy.ts`：注释中的"笔记缓存"改为"笔记正文"。

### tests

- `tests/sync/notes-body-eviction.test.cjs`（新增，320 行，8 项）。
- `tests/storage/storage.test.cjs`：替身改为 `note-body.service`；标签改为"笔记正文"；新增统计行断言。
- `tests/sync/notes-meta-sync.test.cjs`：哈希改为合并后立即补算，断言相应调整。
- `tests/sync/notes-sync.test.cjs`：维护提示文案的匹配改为 `/正文正在释放/`。
- `tests/todos/todo-local.test.cjs`：版本号断言从 17 改为 18。

### docs

- `docs/API后端/笔记正文按需加载接口需求.md`：状态行写明客户端已实现混合模式。

## 二、与原代码对比（基点为 B1 后的工作区）

1. **本机正文**
   - 原来：所有已同步笔记都在本机保留完整正文。
   - 现在：服务端支持元数据同步时，超出保留范围的笔记只留摘要；正文在云端，打开时下载。旧服务端（完整模式镜像没有哈希）不会淘汰任何正文。
2. **合并**
   - 原来（B1）：拿不到正文的元数据记录整条跳过。
   - 现在：已淘汰的笔记改为只更新元数据；超出范围的新笔记以淘汰状态插入。其余不变。
3. **正文下载范围**
   - 原来（B1）：本机没有的笔记全部下载正文。
   - 现在：新设备只按修改时间下载 300 篇，置顶、星标的除外；被置顶或星标的已淘汰笔记会补下载。
4. **打开笔记**
   - 原来：从缓存或本地读出后直接显示。
   - 现在：已淘汰的先下载；下载不了时显示"正文未下载"或"笔记不存在"。打开时记录时间。
5. **保存**（新增限制）
   - 原来：只改标题或分类的保存，会把当前正文一起写进新版本并上传。
   - 现在：已淘汰的笔记必须带完整正文才能保存，否则报错。列表改标题会先下载正文。
6. **列表和菜单**
   - 原来：卡片显示正文，复制和分享直接使用正文。
   - 现在：已淘汰的笔记显示摘要；复制和分享在正文到位前只提示；打开菜单时在后台下载正文。
7. **存储页**（行为反转）
   - 原来：“笔记缓存”整条删除已同步的笔记，并清空同步状态，笔记要等下次同步才回到列表。
   - 现在：“笔记正文”只释放正文，笔记留在列表中，同步状态不变。
8. **回收站**
   - 原来：淘汰概念不存在。
   - 现在：已淘汰笔记的回收站预览显示摘要；没有云端数据时拒绝恢复。

## 三、改动原因

- **只淘汰镜像哈希与本地一致的笔记**：这是淘汰的安全前提——云端必须确实存着与本机相同的内容。完整模式的镜像没有哈希，SQL 条件自然不成立，所以旧服务端下不需要额外开关。
- **用触发器维护正文状态**：已淘汰的笔记会从合并、恢复历史版本、完整保存等多个路径拿回正文。触发器保证只要写入了正文，状态就同步恢复为 present。这也避免了修改公共的列定义 `LOCAL_NOTE_COLUMNS`，那样会让只建到部分迁移的历史测试库和诊断库无法读取。
- **保存兜底放在仓库层**：只改标题或分类的保存会把当前正文写进新版本并上传，而已淘汰笔记的"当前正文"是空的。在 `updatePendingLocalNote` 里拒绝，可以同时覆盖所有 UI 入口，包括将来新增的入口。
- **只更新元数据的路径不经过 `reconcileNotesInTransaction`**：原合并逻辑会比较正文、生成版本、判断时间冲突，这些对没有正文的笔记都不成立；单独写一条 UPDATE 更容易核对。
- **查看期间保留正文**：同步每 60 秒会执行一次淘汰，正在阅读或编辑的笔记不能被淘汰。
- **新设备按修改时间补满名额**：新设备上还没有"最近打开"记录，修改时间是最接近的替代。
- **手动释放不保留 300 篇**：用户主动选择释放时，目的就是尽量腾出空间；置顶、星标、有草稿和未同步的笔记仍然保留（用户选择的规则）。

## 四、完整调用链路

```text
同步（协调器 → runNoteSync，元数据模式）
  ├─ downloadBodies
  │    ├─ fillLocalContentHashes
  │    ├─ readBodyPlan(300)：需要下载的笔记 + 只插入摘要的笔记
  │    └─ transport.batch（每批 50 篇）
  ├─ projectMirror(bodies, evictedInserts)（事务）
  │    ├─ linkCreatedNotes（阶段 A）
  │    ├─ withBody：刚下载的正文 / 哈希相同的本地正文（已淘汰的除外）
  │    ├─ restoreFromRemote、reconcileNotesInTransaction（原逻辑；写入正文时触发器恢复 present）
  │    └─ applyMetadataOnly：已淘汰笔记只更新元数据；超出范围的新笔记以淘汰状态插入
  ├─ fillLocalContentHashes（刚写入的正文）
  └─ evictNoteBodies(300, heldNoteBodies())
       └─ UPDATE content=NULL, body_state='evicted', 摘要、长度（哈希保留）
  → 协调器把有变化的笔记推给列表 → SwipeableNoteItem 显示摘要

打开笔记（NoteDetailScreen）
  holdNoteBody(id) ── 页面卸载时释放
  show(note)
   ├─ 正文在本机 → 显示；后台 ensureNoteBody → markNoteOpened
   └─ 已淘汰 → loading → ensureNoteBody
        ├─ captureCloudStorageAccess → fetchCloudNote(GET /notes/{id}) → parseCloudNote
        ├─ reconcileNotesInTransaction(mirror) → 触发器恢复 present
        ├─ markNoteOpened → setCachedNote + notifyNotesChanged
        └─ 失败：离线 → body-missing（正文未下载）；410/404 NOTE_NOT_FOUND → not-found；
                 未授权 → local-only；其他 → error

列表长按（NotesScreen → NoteContextMenu）
  打开菜单：已淘汰 → 后台 ensureNoteBody → 列表更新后，菜单拿到带正文的笔记
  复制 / 分享：bodyMissing → 提示，不执行
  改标题：ensureNoteBody → saveEditedNoteLocalFirst
  兜底：updatePendingLocalNote 发现已淘汰、且没带正文 → 抛错

存储页（DataStorageSettingsScreen）
  统计：readNoteBodyUsage → readNoteBodyStats（已下载 / 摘要 / 可释放）
  释放：releaseNoteBodies → withNoteCacheMaintenance（中止正在进行的同步）→ fillLocalContentHashes
        → evictNoteBodies(0, heldNoteBodies()) → 逐条推送已淘汰的笔记

回收站：archiveLocalNote（local_json 带摘要）→ trashPreview（没有正文时显示摘要）
        restoreArchivedNote（没有云端数据时拒绝恢复已淘汰的笔记）
门控：按需下载经 captureCloudStorageAccess；旧服务端下完整模式镜像没有哈希，不会淘汰
```

## 五、验证情况

- **类型检查**：修改后 `npm run typecheck` 0 个错误。
- **新增测试**：`node --test tests/sync/notes-body-eviction.test.cjs`，8/8 通过。覆盖：
  - 保留规则：置顶、星标、草稿、上传任务、正在打开的笔记，以及最近打开的篇数；淘汰后摘要、长度、哈希正确，历史版本不变，列表带上摘要，统计正确
  - 完整模式不淘汰
  - 已淘汰的笔记只更新元数据、不下载正文；星标后补下载
  - 打开时下载最新正文并恢复；离线时报 offline，410 时报 not-found
  - 只改标题或分类的保存被拒绝，带完整正文的保存可以恢复正文
  - 新设备 303 篇：下载 301 篇（300 篇加 1 篇置顶），最旧的 2 篇只插入摘要，第二次同步不再下载
  - 回收站显示摘要，没有云端数据时拒绝恢复
  - 触发器行为
- **现有测试**：存储页 18/18，`notes-meta-sync` 10/10，`notes-sync` 35/35。
- **`npm run check`**：typecheck 通过；lint 0 个错误、1 个既有警告（`PermissionSettingsScreen.tsx`）；theme:check 通过；测试 622 项，619 通过、2 跳过、1 失败（既有的发布归档 ENAMETOOLONG，与本次无关）。
- **未执行**：
  - 与真实后端联调（后端未部署，淘汰和按需下载在旧服务端上不会启用）；
  - 真机上确认"正文未下载"状态页、列表摘要、存储页新行的显示效果；
  - 大量笔记首次淘汰的耗时测量。
