# 2026-09-29 待办快速完成切换回环触发云端 422 校验失败修复

## 背景

用户实测：已完成的待办被重复连续快速点击、最终仍为已完成时，同步报"与云端校验不通过"。nginx 访问日志实证（1.14.177.177）：2026-09-29 18:49–18:53 复现时段 `PATCH /api/todos/{id}` 连续返回 422（272 字节校验错误响应，当日共 17 次），与 200 交替出现在同一待办 ID 上。

## 改动清单（按层）

- `src/features/todos/data/todo-sync.repository.ts`：`prepareOperations` 构造 patch 的 `fields` 之后新增 10 行守卫——`completed_at` 存在差异而 `is_completed` 不在差异中时，丢弃 `completed_at`；丢弃后 fields 为空走既有 no-op publish 路径（记录直接与基线对齐，不发出网络请求）。无其他改动。
- `tests/todos/todo-sync.test.cjs`：新增用例「快速完成切换回环只产生完成时间差异时不出请求，按基线对齐」（36 行），覆盖两条断言：① 回环后 `prepareOperations` 产出 0 个操作、同步记录 `synced` 且 candidate 完成时间回到基线值；② 真实完成状态翻转仍成对携带 `is_completed` + `completed_at`（guard 服务端仲裁契约不被误伤）。
- `CHANGELOG.md`、本日志。

## 与原代码对比

基点：f44867d（docs: 合并 master 全链路日志与变更记录），实测 `git diff f44867d..工作区`。

- 原来：diff 出的字段直接进 patch；仅当 `fields.is_completed === true` 时强制补 `completed_at`（原注释"Completion timestamp always participates in the patch"只覆盖了置完成方向）。
- 现在：先丢弃无 `is_completed` 翻转伴随的孤立 `completed_at` 差异，再执行原有的置完成强制补齐；两者条件互斥，置完成方向的仲裁契约原样保留。
- 行为变化标注：**无开关、无默认值反转**。唯一行为变化是"完成时间单字段差异"从"发出 patch → 必然 422 → 记录 blocked"变为"按基线 no-op 对齐、零请求"。

## 改动原因

服务端契约（`~/irisapi/src/services/todo-validation.ts` `patchInput`）：`completed_at` 必须与 `is_completed` 成对提交，单独出现即 422 `INVALID_COMPLETED_AT`。客户端 `completedAt` 的唯一写入方是 `complete()`（`todoFormKeys` 不含它），每次写入必然伴随 `isCompleted` 翻转。因此"completed_at 单字段差异"只可能来自 1 秒防抖窗口内的完成→取消→完成回环：本地 candidate 最终 `{true, T2}` 与云端基线 `{true, T1}` 相比只剩时间戳不同。该时间戳差异是回环噪声——云端完成态未变，本地重记了完成时刻。丢弃它等价于既有空 diff no-op 语义（`publish(s, s.base)`），不丢失任何用户意图；真实翻转场景不受影响。

## 完整调用链路（改后）

```text
TodoCard 勾选 → TodosScreen.run() → todoRepository.complete() [本地 SQLite + sync record dirty，不碰网络]
  → todoRepository.subscribe → TodoSyncCoordinator.wake() [1s 尾沿防抖；在途则置 requested 单飞合并]
  → drain(1s 后) → syncTodos → prepareOperations [逐记录 diff candidate vs base]
      → fields 含 completed_at 且不含 is_completed？ → 丢弃 completed_at（本次修复）
      → fields 为空 → publish(s, s.base) [记录对齐基线，不出请求]（本次回环的实际落点）
      → fields 非空 → patch（is_completed=true 时强制携带 completed_at，原有仲裁路径不变）
  → transport.write PATCH /todos/{id} → acceptOperation/failOperation → notifyTodoSyncChanged
```

门控与降级分支未变：云未授权/离线时整条同步链不启动（`TodoSyncProvider` 捕获授权捕获失败即返回）；422 仍按不可重试处理（真实服务端拒绝依旧进 blocked，可在同步队列处理）。

## 验证情况

- 修改前基线：`npm run typecheck` 0 错误。
- `node --test tests/todos/todo-sync.test.cjs`：28/28 通过（含新增用例）。
- `npm run check` 全过：typecheck 0 错误、lint 通过（既有警告非本次文件）、theme:check 通过、node --test 661/661。
- 真机端到端复现验证：未执行（需 staging 包重装后快速点击验证；服务端契约与线上 422 日志已作为修复依据实证）。
