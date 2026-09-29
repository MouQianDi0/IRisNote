# 合并 origin/Timmi（b566523）：星标/置顶采用本地优先方案，保留写入后同步防抖

- 日期：2026-09-29
- 基点：merge-base `a1f6f97` → 本侧 `bb23729`（星标/置顶请求合并）× 远端 `b566523`
- 关联：CHANGELOG `2026-09-29 04:36:41` 合并条目；前一篇 `docs/logs/2026-09-29-note-status-write-coalescing.md`（本次合并部分推翻，差异见第二节）

## 一、改动清单（按层）

### 合并范围

远端 `a1f6f97..b566523` 共 4 个提交，45 个文件，+2537/−437：
- `9cfe27c`：PR #129 合入。
- `38e307d`：0.7.0 更新说明。
- `4432edc`：本地云解耦与迁移 0019。
- `b566523`：更新说明改用公共 Markdown 组件。

没有依赖变化（`package.json`、`package-lock.json` 未改）。

### 本次合并自身的改动（不是带入的）

- `src/features/notes/hooks/useNoteStar.ts`、`useNotePin.ts`：冲突，**整份采用远端版本**。现在调用 `toggleLocalNoteFlag` 做本地事务切换，不再直接请求 API。
- `src/features/notes/screens/NotesScreen.tsx`：冲突只有 `toggleContextStatus` 上方一行注释，采用远端的"Serialize menu actions while each local transaction commits."。
- `src/features/notes/services/note-status-writer.ts`：**删除**。两个 hook 改用远端版本后已经没有调用方。
- `src/features/notes/services/note-sync-coordinator.ts`：自动合并，没有冲突。同时包含：
  - 远端：`syncNotes` 在回收站同步后调用 `syncLocalNoteFlags`。
  - 本侧：`NOTE_SYNC_AFTER_WRITE_MS = 1500` 和 `requestAfterWrite`（写入结束后 1.5 秒尾部防抖）。
- `tests/sync/note-write-coalescing.test.cjs`：删掉调度器的 9 条测试和测试夹具（从 262 行减到 98 行），只保留协调器防抖那 1 条；头部注释改为描述写入后同步防抖。
- `docs/架构指南/业务模块与运行逻辑.md` §4.8：标题改为"置顶与标星（本地优先）"，流程图改为合并后的真实链路。
- `docs/架构指南/项目架构与文件索引.md`：删除 `note-status-writer.ts` 一行，新增 `note-flags.service.ts` 一行，两个 hook 的职责改为本地切换。
- `docs/架构指南/后续开发指南.md` §Hooks：示例流程改为本地事务加统一同步。
- `CHANGELOG.md`：冲突，两边条目按时间倒序交叉排列：远端 05:03:13、04:56:07 → 本侧 04:08:42 → 远端 09-28 19:22:57、05:15:00。顶部新增本次合并条目。
- `docs/logs/2026-09-29-merge-origin-timmi-b566523.md`：本篇。

## 二、与原代码对比

证据：`git diff a1f6f97 origin/Timmi -- src/features/notes/hooks`，以及合并工作区中 `git diff bb23729 -- <文件>`。

1. **星标/置顶的写入方式**
   - 本侧 `bb23729`：乐观更新列表后，交给模块级 `note-status-writer`，1 秒防抖后直接发 `PUT /notes/:id`；需要云授权，也需要有云端 ID。
   - 远端 `4432edc`：本地优先。`toggleLocalNoteFlag` 在 SQLite 事务里翻转 `local_notes` 并写入 `note_local_flags`（带 version），然后由 `syncLocalNoteFlags` 统一发送。不需要云授权，也不需要云端 ID。
   - 合并后：采用远端方案。
   - 行为反转：本侧"关闭云授权时不改列表、弹出需要开启云存储"的行为不保留，改为远端的"本机照常切换，授权后再发送"。
2. **失败处理**
   - 本侧：网络失败时，只要之后没有新点击，就回滚这一个字段。
   - 合并后：只有本地事务失败才提示"保存失败"。网络失败时待发送记录保留，下次同步重试，界面不回滚。
3. **请求合并**
   - 本侧：由调度器按笔记合并。
   - 合并后：由"待发送表 + 协调器防抖"两者配合：
     - 每次本地切换都会经 `beginNoteCloudWrite` 触发 `onNoteCloudWrite`，由 `requestAfterWrite` 重新计时 1.5 秒；
     - 连续切换结束 1.5 秒后只跑一轮 `syncNotes`；
     - 这一轮里 `syncLocalNoteFlags` 每条笔记只发 1 个 PUT，带当时最新的置顶/标星值。
   - 和远端单独运行时比较：远端原来是写入后 100ms 就同步，点击间隔超过 100ms 左右时，每次点击都会各触发一轮同步、各发一个 PUT；同步途中再有写入，这一轮还会因为版本变化作废重来。
4. **本侧优点没有保留下来的部分**
   - 调度器"最终值等于服务端确认值时不发请求"：待发送表不和服务端的值比较，切回原值仍会发 1 个 PUT。
5. **没有变化的部分**：协调器 `request()` 的 100ms 触发（回到前台、60 秒定时、网络恢复、失败重试）。

## 三、改动原因

- **冲突怎么选**：用户在两个方案中选择了"采用远端 + 保留防抖"。
  - 远端方案本地优先、支持离线，符合 AGENTS.md 第 3 节。
  - 待发送表加 version 确认，天然满足第 6 节"旧请求不能覆盖较新的用户操作"。
  - 本侧调度器解决的也是同一个问题，但只能在线用，失败时还要回滚界面。
- **删除调度器**：hooks 改用远端版本后它没有调用方，留下来就是死代码。
- **保留协调器防抖**：它和远端待发送表正好互补。远端解决的是"发什么"（每条笔记只保留最新值）；防抖解决的是"什么时候发"（连续写入时只跑一轮）。两者都有，才能做到连续切换只发 1 个 PUT。
- **CHANGELOG 和旧日志的处理**：本侧 04:08:42 条目和前一篇日志是 `bb23729` 当时的真实记录，按规则保留原样，不回改；本篇说明哪些内容已经被推翻。

## 四、完整调用链路

```text
[列表右滑] SwipeableNoteItem.handlePinPress / handleStarPress（useDebouncedAction 500ms 前沿锁）
[长按菜单] NotesScreen.toggleContextStatus（contextStatusLock，等待本地事务完成）
        ▼
useNoteStar.toggleStar / useNotePin.togglePin（唯一入口；账号不匹配时直接返回）
        ▼
note-flags.service.toggleLocalNoteFlag
    ├─ captureLocalStorageAccess(owner)（本地会话门控，不要求云授权）
    ├─ beginNoteCloudWrite()
    ├─ db.transaction：
    │    local_notes 翻转标记（置顶：pinned_order = MAX + 1，否则 NULL）
    │    note_local_flags UPSERT 最新值，version + 1
    ├─ setCachedNote + notifyNotesChanged(upsert) → hook 用返回的笔记更新列表
    └─ finally finish() → onNoteCloudWrite 监听者
            ▼
note-sync-coordinator.requestAfterWrite()（clearTimeout，重新计时 1500ms）
            ▼  最后一次写入 1.5 秒后
run()
    ├─ 云存储关闭 → 只做本地回收站维护（降级；标记留在待发送表）
    └─ syncNotes（进行中的任务复用；captureCloudStorageAccess 门控）
         ├─ synchronizeNoteTrash（GET /notes/trash）
         ├─ syncLocalNoteFlags：JOIN 有 server_id 的记录，逐条 PUT /notes/:server_id
         │    成功 → DELETE … WHERE version = 发送时的 version（期间又有切换则保留）
         │    失败 → catch 吞掉，记录保留，下一轮重试
         ├─ runNoteSync（GET /notes/changes …）→ SQLite 镜像
         │    触发器 preserve_pending_note_flags 保证回写不覆盖未确认的标记
         └─ notifyNotesChanged → NotesScreen.onNotesChanged → setNotes
    PUT 的 axios 拦截器也会 begin/finish → 1.5 秒后再跑一轮（这时没有待发送记录，只拉取，不会形成循环）

另一个入口：upload-task-adapters 在笔记上传任务完成后调用 syncLocalNoteFlags
```

- 没有 JS/Kotlin 双端镜像逻辑，不涉及原生模块。

## 五、验证情况

- 合并前（`bb23729`）：`npm run typecheck` 0 个错误（见前一篇日志）。
- 合并在临时工作区中进行，`node_modules` 链接主仓库。这样检查的是合并提交本身的内容，不受主工作区里其他未提交文件影响。
- 冲突标记扫描：没有残留；`grep note-status-writer` 在 src、tests、docs/架构指南 中没有残留引用。
- CHANGELOG：合并后 293 条，和两边条目的并集一致；相对远端没有删除任何一行。
- `node --test tests/sync/note-write-coalescing.test.cjs`：1/1 通过。
- 合并后在临时工作区跑 `npm run check`：退出码 1。
  - typecheck 0 个错误；theme:check 通过。
  - lint：0 个错误，1 个既有警告（`PermissionSettingsScreen.tsx:171` 的 `liveUpdateCapable` 未使用）。
  - 测试：646 项，642 通过、2 跳过、2 失败。
  - 失败 1：`tests/releases/source.test.cjs` 的 ENAMETOOLONG，既有环境问题。
  - 失败 2：`tests/releases/gradle-env.test.cjs`「Windows fix preserves caller variables…」，报错是"Gradle socket 路径过长"，由临时工作区路径过长导致。本次合并没有改动 `scripts/android` 和这个测试；在主仓库路径下单独运行 2/2 通过。
  - storage 启动清理的不稳定测试这次通过了。
- 未执行：真机验证（连续切换星标/置顶时的实际请求数、离线切换后恢复授权再发送），未与真实服务端联调。
