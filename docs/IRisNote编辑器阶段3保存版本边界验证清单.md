# IRisNote 编辑器阶段 3 保存版本边界验证清单

> 版本：3A.2
> 更新：2026-09-09 13:18:01 +08:00
> 状态：3A 数据层已实现并通过 30 项 Node 回归；Android 真机迁移与两次保存行为验证通过；Web 迁移与 3B 历史 UI 待后续

## 1. 已实现范围（3A）

- 数据库结构 3 → 4：新增 `note_revisions`（revision_id / owner_user_id / client_id / parent_revision_id / title / content / category_id / origin / created_at / schema_version）；`local_notes` 加 `current_revision_id`，`note_drafts` 加 `base_revision_id`。
- 迁移幂等：列存在性检查、仅回填无版本指针的笔记；已有关联草稿仅补 NULL 基础版本，不重置过期草稿的冲突判定。
- 存量回填：升级时每篇笔记的当前内容生成 origin=`migrate` 的初始版本并指向它。
- 保存创建版本：新建保存事务内创建 V1（origin=local-save）；编辑保存内容有变化时追加新版本，parent 指向旧当前版本，指针随事务前移。
- 无变化判断：trim 后标题、正文、分类与当前版本一致时不创建版本；pending 状态照写驱动上传重试；此前已 synced 且无变化时跳过上传并复位 synced。
- 对账一致性：`reconcileServerNotes` 覆盖 synced 行且内容不同时追加 origin=server-reconcile 版本；内容相同不动版本链；新服务器笔记入库即建 V1；服务器删除传播时版本随笔记清理。
- 恢复数据能力：`restoreLocalNoteToRevision` 以旧版本内容创建 origin=restore 新版本，旧节点不可变，指针前移并置 pending 等待同步。
- 草稿基础版本：`note:<id>` 草稿记录 base_revision_id，冲突判定升级为指针比对；迁移前旧草稿（NULL）退回内容快照比对；保存关联后基础版本推进到新当前版本。
- 删除一致性：`removeLocalNote` 在同一事务内先删版本再删笔记；未提交草稿不受影响（沿用不级联约定）。
- 显式不建版本通道：置顶/标星（`useNotePin`/`useNoteStar`）、同步状态变化（markLocalNoteSyncing/Failed/Synced）、`acceptServerNote` 元数据回写。

## 2. 自动化证据

```powershell
node --test tests/editor/revisions.test.cjs tests/editor/drafts.test.cjs
```

30 项全部通过（revisions 11 + drafts 19）：

- 迁移回填：v3 数据（笔记 + 已关联草稿）升级后获得 migrate V1 与草稿基础版本。
- 首次保存恰好一个 V1；编辑产生 V2 且 parent 链正确。
- 无变化 + pending：不建版本但仍发起上传（网络替身计数 1）。
- 无变化 + synced：不建版本、不发起上传、状态复位 synced、返回 accepted/unchanged。
- 版本插入故障注入：整事务回滚，笔记内容不变、草稿保留。
- 对账三分支：内容变化追加 server-reconcile 版本、内容相同无新版本、新笔记建 V1；服务器删除后笔记与版本一并清理。
- 恢复：旧节点原样保留，新版本 origin=restore、指针前移、置 pending；恢复当前版本被拒绝。
- 草稿基础版本过期（他处先保存 V2）：本次保存被阻止、草稿保留。
- 删除笔记级联清版本；版本按账户隔离。

drafts.test.cjs 的既有用例随仓库返回结构（`{ note, revisionCreated }`）与迁移骨架同步修订；语义断言未放松。

## 3. 静态与构建结果

- 全量 `npx tsc --noEmit` 通过（0 错误）。
- 本次 10 个源码文件 ESLint（expo flat 配置）通过（0 错误 0 警告）。
- `git diff --check` 通过。
- 未执行 Web/Android/iOS Bundle、浏览器流程或实机测试。

## 4. 待验证（3A 外部项）

- [x] 真机 v3 库升级 v4：2026-09-09 Android 实机（M2012K11AC）迁移成功，见第 7 节。
- [x] 实机编辑保存两次后 `note_revisions` 行数与内容链正确：见第 7 节。
- [x] 无变化保存不产生新版本（数据库证据）；界面提示与日志文案的目视确认并入日常使用观察。
- [ ] 杀应用重开对账：内容一致不增版本；另一设备改动后对账追加 server-reconcile 版本。
- [ ] Web（SQLite Alpha）迁移与保存链路。
- [ ] 快照存储增长观察：每次有效保存存整篇快照，本地暂不限量（哈希去重属阶段 6，保留策略属待决策 O-005）。

## 5. 3B 范围（未开始）

- 详情页历史入口、版本列表、内容查看/对比、恢复确认（数据能力已由 `restoreLocalNoteToRevision` 提供）。
- 恢复后的云端上传复用现有保存服务；UI 验收以 Web/实机为准。

## 6. 能力边界

- 版本是本地概念；服务端无 Revision，`baseRevision` 条件更新与版本同步属阶段 7。本地冲突检测（草稿基础版本过期）不等于服务端冲突解决。
- 版本快照为完整内容拷贝，无块级结构与内容哈希（阶段 4/6）。
- 置顶、标星、分类名等元数据变化不产生版本；`restore` 与本地保存共用同步队列语义（pending → 上传）。
- 旧版本恢复会立即置 pending 并在 3B 中提供上传编排；当前 3A 阶段无 UI 入口，数据能力仅供测试调用。

## 7. Android 真机验证 — 2026-09-09 13:18:01 +08:00

- 设备：M2012K11AC（alioth），Android 16，开发版经 USB 端口反向映射连接 Metro 8081。
- 迁移：应用加载新 bundle 后自动执行 v3→v4。复查数据库：`PRAGMA user_version = 4`；17 篇笔记全部回填 `migrate` 来源 V1（0 篇漏指针、0 孤儿版本）；6 份已关联草稿全部回填 `base_revision_id`。升级后 v4 快照存档于 `.expo/phase3a-device-backup/irisnote-v4.db`。
- 有变化保存：编辑"第一次更改"笔记并保存 → 产生恰好 1 个 `local-save` 新版本，parent 正确指向该笔记的 `migrate` V1，笔记 `current_revision_id` 前移，保存后 `synced`（修复后的服务端 PUT 链路同步正常）。
- 无变化保存：同一笔记不做修改直接保存 → `local-save` 版本总数保持 1，未创建任何新版本。
- 未测试：Web 迁移、对账分支（同内容不增版本/另一设备改动追加 server-reconcile）、恢复入口（3B 提供 UI 后验证）、iOS。
