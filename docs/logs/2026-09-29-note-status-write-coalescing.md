# 笔记星标/置顶请求合并与写入后同步防抖

- 日期：2026-09-29
- 基点：`a1f6f97`（feat(notes): 缓存重构第二期）→ 结果：工作区（未提交）
- 关联：CHANGELOG `2026-09-29 04:08:42 | 优化代码：笔记星标/置顶连续切换合并为一次请求，写入后同步改为尾部防抖`

## 一、改动清单（按层）

### src/features

- `src/features/notes/services/note-status-writer.ts`（新增，94 行）：纯调度器，不依赖 React 或项目其他模块。
  - 导出 `NOTE_STATUS_DEBOUNCE_MS = 1000`（与待办同步协调器 `schedule(delay = 1000)` 一致）和 `createNoteStatusWriter({ send, delayMs? })`。
  - 按 `owner:noteId` 为每条笔记维护一个条目：服务端确认值 `confirmed`、用户最新值 `desired`、代次 `generation`、是否在发送 `sending`、尾部计时器 `timer`，以及最近一次点击的 `checkAccess`、`isCurrentSession`、`onFailed`。
  - `request()`：更新最新值、代次加 1、重置 1 秒计时器。
  - `flush()`：
    - 正在发送时直接返回；`desired === confirmed` 时删除条目，不发请求。
    - 否则先 `checkAccess()` 再 `send()`。
    - 成功后写入 `confirmed`；如果没有待触发的计时器，就立刻再处理一次最新值。
    - 失败时，如果代次没变（发出后用户没再点过）：删除条目，只有会话仍有效时才调用 `onFailed(confirmed, error)`。
    - 失败时，如果代次已变：不回滚，接着发最新值。
- `src/features/notes/hooks/useNoteStar.ts`（修改）：
  - 新增模块级 `starWriter`，它的 `send` 调用 `updateNote(serverId, { is_starred })`，保留原来的开始/成功日志。
  - 点击时从 `notesRef.current` 读当前笔记的最新值计算翻转，不再直接用 `item.is_starred`。
  - 乐观更新不变；原来的 `try { await updateNote } catch { 恢复整表快照 }` 改成 `starWriter.request(...)`。
  - `onFailed` 只把该笔记的 `is_starred` 设回确认值，并弹出和原来相同的提示文案。
  - 移除 `err: any`，改用 `isAxiosError` / `getApiErrorData` 取日志字段。
- `src/features/notes/hooks/useNotePin.ts`（修改）：
  - 同样改为模块级 `pinWriter`。
  - 点击时额外记录 `previousPinnedOrder`。
  - `onFailed` 只把该笔记的 `is_pinned` 设回确认值；确认值为已置顶时，恢复 `previousPinnedOrder`，否则置空。
  - 不再把 `pinnedOrderRef` 重置为回滚快照里的最大值。
- `src/features/notes/services/note-sync-coordinator.ts`（修改）：
  - 抽出 `run()`。
  - 新增导出常量 `NOTE_SYNC_AFTER_WRITE_MS = 1500` 和 `requestAfterWrite()`：每次调用都清掉已有计时器，重新计时 1.5 秒。
  - `onNoteCloudWrite` 的订阅从 `request` 换成 `requestAfterWrite`。
  - `request()`（100ms、已有计时器时不重复排）仍用于回到前台、60 秒定时、网络恢复和失败重试。
- `src/features/notes/screens/NotesScreen.tsx`（修改）：只更新 `toggleContextStatus` 上方的注释。原注释说"整表快照回滚所以要串行"，这个前提已经不成立；逻辑没有改动。

### tests

- `tests/sync/note-write-coalescing.test.cjs`（新增，262 行，10 条）：
  - 调度器 9 条：
    - 防抖时长与待办一致
    - 窗口内连续点击只发最后的值
    - 切回原值不发请求
    - 请求途中点击时等前一个返回再发
    - 在途期间点回确认值时不重发
    - 无新点击的失败会回滚
    - 旧失败不覆盖新点击，并重发最新值
    - 授权失效时不发请求、直接回滚
    - 会话失效时丢弃回滚
  - 协调器 1 条：用桩替换 `note-sync.service` 和 `note-trash.service`，验证回到前台后 100ms 同步；连续 5 次写入每次都重新计时，最后一次写入 1.5 秒后只拉取一轮。

### docs

- `docs/架构指南/业务模块与运行逻辑.md` §4.8：流程图改为调度器流程，并补充写入后同步的时机。
- `docs/架构指南/项目架构与文件索引.md`：新增 `note-status-writer.ts` 一行，更新两个 hook 的职责描述。
- `docs/架构指南/后续开发指南.md` §Hooks：`useNotePin` 示例流程改为当前实现。

## 二、与原代码对比

证据来自 `git diff a1f6f97 -- <文件>`。

1. **发送时机**
   - 原来：`toggleStar` / `togglePin` 在乐观更新之后立刻 `await updateNote(serverId, payload)`，每点一次就发一个 `PUT /notes/:id`。
   - 现在：交给调度器，1 秒内没有新点击才发，而且只发最后的值。
   - 行为反转：最终值等于服务端确认值时（例如点了偶数次）**不再发请求**。
2. **并发**
   - 原来：列表滑动路径只有 `useDebouncedAction` 的 500ms 前沿锁（`SwipeableNoteItem.tsx:193`）。网络慢时，前一个 PUT 没返回，下一个就能发出，同一字段的请求可以并行，服务端最终值取决于到达顺序。
   - 现在：同一笔记同一字段同一时间只有一个请求在路上。
3. **失败回滚范围**
   - 原来：`updateNotesLocally(() => previousNotes)`，恢复成点击时的整表快照，会覆盖这段时间内其他笔记的变化和同一笔记后来的点击。
   - 现在：只改这条笔记的这一个字段。而且只在"发出后没有新点击"时回滚；已有新点击时不回滚，继续发最新值。
4. **`pinnedOrderRef`**
   - 原来：失败时重置为 `max(previousNotes.pinned_order)`。
   - 现在：保持单调递增，不再重置。
5. **授权检查的位置**
   - 原来：请求返回后调用 `checkAccess()`，不通过就进入失败回滚。
   - 现在：在发送前调用 `checkAccess()`，授权或账号已变化时不发请求，直接走失败路径；请求返回后不再检查。
   - 账号切换期间在途的请求，仍由 HTTP 层的云存储门控中止；成功后只更新调度器内部的确认值，不改界面。
6. **成功日志**：`id` 字段原来是本地 `item.id`，现在是 `serverId`（`send` 只拿得到服务端 ID）。失败日志仍然用本地 `item.id`。
7. **写入后同步**
   - 原来：`onNoteCloudWrite(request)`。写入结束后 100ms 同步；已有计时器时不重排。一轮同步进行中又有写入，会因为 `check()` 判断版本变化而作废，然后重新排队。
   - 现在：`onNoteCloudWrite(requestAfterWrite)`，每次写入结束都重新计时 1.5 秒。
   - 行为变化：正文上传、分类写入、星标/置顶写入之后，拉取服务端变化会比原来晚约 1.4 秒。回到前台、60 秒定时、网络恢复仍是 100ms。
8. **长按菜单**
   - 原来：`toggleContextStatus` 要等网络请求返回才释放 `contextStatusLock`。
   - 现在：hook 在本地更新后立即返回，锁马上释放，菜单里可以连续切换，由调度器合并。

## 三、改动原因

- **请求过多**：用户反馈快速连续修改会产生大量请求。追踪后发现待办（1 秒尾部防抖、单通道、按条目求差合并）和笔记正文（750ms 本地草稿防抖、离开页面才入上传队列、按 `note:<id>` 去重）都已经合并。唯一没有防抖的是笔记星标/置顶：每次点击一个 PUT，而且每个 PUT 结束后，`notes-sync.api.ts` 的拦截器都会通过 `beginNoteCloudWrite` 触发 100ms 后一轮同步（`GET /notes/trash` + `GET /notes/changes`）；同步途中再有写入又会作废重来。快速切换 5 次，最坏会有十几个请求。
- **防抖取 1 秒**：按用户选择与待办对齐，两个域的"改动到上传"延迟一致。界面在本地立即变化，1 秒延迟只影响何时上云。
- **"最后值获胜 + 与确认值比较"而不是简单防抖**：星标/置顶是布尔值，服务端只关心最终状态。和确认值比较后，点回原状态可以完全不发请求。
- **同篇串行 + 按代次决定是否回滚**：满足 AGENTS.md 第 6 节"旧请求的失败回滚不能覆盖较新的用户操作"。原实现在并发下会用旧快照覆盖新操作。
- **回滚缩小到单字段**：整表快照回滚会冲掉这期间同步推送的其他笔记变化，属于同一类覆盖问题。
- **调度器放在模块级**：用户在 1 秒窗口内离开笔记页时，界面和运行时缓存已经是新值，最后一次点击仍要发出去，不能跟着组件卸载一起丢掉。会话/账号变化靠 `checkAccess`（`captureCloudStorageAccess` 的代次）和 `isCurrentSession` 拦截，不需要跟组件生命周期绑定。
- **写入后同步改为 1.5 秒尾部防抖**：拉取是为了把服务端对写入的结果落回 SQLite 镜像，连续写入时只需要最后一次之后拉一轮。1.5 秒比状态防抖的 1 秒长，一次合并后的写入结束后只会引发一轮拉取。前台、定时、网络恢复这三种触发没有"连续写入"的特点，继续用 100ms，保证打开应用就能尽快看到最新数据。
- **`pinnedOrderRef` 不再重置**：它只用来给新置顶分配更大的序号。回滚现在只改一条笔记，重置反而可能让下一次置顶复用已经分配给另一条待发笔记的序号；单调递增不会冲突。拉取列表时 `applyNotes` 仍会按实际数据重算。

## 四、完整调用链路

```text
[列表右滑按钮] SwipeableNoteItem.handlePinPress / handleStarPress
    └─ useDebouncedAction 500ms 前沿锁（未改，防手抖双击）
[长按菜单] NotesScreen.toggleContextStatus（contextStatusLock，本地更新后立即释放）
        │
        ▼
useNoteStar.toggleStar / useNotePin.togglePin（唯一入口）
    ├─ captureCloudStorageAccess(user_id) 失败 → Alert，不改列表（门控）
    ├─ 无 server_id → Alert，不改列表（降级）
    ├─ notesRef.current 取最新值 → 计算翻转（置顶另分配 ++pinnedOrderRef）
    ├─ updateNotesLocally → setNotes + setCachedNotes（乐观更新）
    └─ starWriter / pinWriter.request({ confirmed, desired, checkAccess, isCurrentSession, onFailed })
            │  代次 +1，重置 1000ms 计时器
            ▼
        flush()（计时器到期，或上一次发送结束且没有待触发的计时器）
            ├─ sending → 返回（上一次发送结束后接着处理）
            ├─ desired === confirmed → 删除条目，不发请求
            ├─ checkAccess() 抛错 → 按失败处理（不发请求）
            └─ send → updateNote → PUT /notes/:serverId { is_starred | is_pinned }
                    │  axios 请求拦截器 beginNoteCloudWrite()（notes-sync.api.ts）
                    ├─ 成功 → confirmed = value → 有新值则再 flush
                    └─ 失败
                         ├─ 代次未变 → 删除条目 → isCurrentSession()?
                         │      ├─ 是 → onFailed → 只回滚该笔记该字段 + Alert
                         │      └─ 否 → 丢弃
                         └─ 代次已变 → 不回滚 → flush 发最新值
                    │
                    ▼  axios 响应拦截器 finished() → onNoteCloudWrite 监听者
        startNoteSyncCoordinator.requestAfterWrite()
            └─ clearTimeout + setTimeout(run, 1500)（每次写入结束都重新计时）
                    ▼
                run() → 云存储关闭时只同步回收站
                      → syncNotes（进行中的同一任务复用）
                          → synchronizeNoteTrash（GET /notes/trash）
                          → runNoteSync（GET /notes/changes …）→ SQLite 镜像
                          → notifyNotesChanged(upsert) → NotesScreen.onNotesChanged → setNotes
其他触发（未改）：setActive(true) / 60s setInterval / 网络恢复 / 同步失败重试 → request() 100ms
```

- 没有 JS/Kotlin 双端镜像逻辑，本次不涉及原生模块。
- 星标、置顶各有一个调度器，互相独立。同一笔记同时改星标和置顶，会各发一个只带自己字段的 PUT，和原来一致。

## 五、验证情况

- 改动前 `npm run typecheck`：0 个错误（基线）。
- 改动后 `npm run typecheck`：0 个错误。中途出现过 2 个新错误（`Note.user_id` 是可选类型，而调度器的 `owner` 当时要求 `number`），已把 `owner` 改为可选来修正，没有用断言或 `any`。
- `node --test tests/sync/note-write-coalescing.test.cjs`：10/10 通过。
- `npm run check`：退出码 1。
  - typecheck 通过。
  - lint：0 个错误、1 个警告（`PermissionSettingsScreen.tsx:171` 的 `liveUpdateCapable` 未使用）。暂存本次改动后在基线上复现同一警告，是既有问题。
  - 测试：632 项，628 通过、2 跳过、2 失败。
  - 失败 1：`tests/releases/source.test.cjs`「release archive excludes audited material…」，原因是 `/tmp` 下长中文文件名 `ENAMETOOLONG`。基线同样失败，属于环境问题。
  - 失败 2：`tests/storage/storage.test.cjs`「startup cleanup is scheduled once per process…」。这条测试只加载 `src/core/storage/auto-cleanup.ts`（依赖都是桩），与本次改动无关；它用真实时间等 20ms，属于时序不稳定。本次改动下单独跑 15 次失败 2 次；暂存本次改动后在基线上单独跑 20 次失败 5 次，基线同样不稳定。
- 未执行：真机验证（连续切换星标/置顶时实际请求数、1 秒后落云、失败回滚提示）。纯 JS 改动，未重新构建原生应用。未与真实服务端联调。
