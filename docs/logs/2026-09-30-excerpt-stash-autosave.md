# 暂存区列表同宽输入与离开自动保存

- 日期：2026-09-30（UTC）。基点：`3c8ee70e8b6704e6f0cf22ba8b7fb123030e672c`，分支 `kroos_todo`。
- 实测对比：`git diff 3c8ee70 -- src/features/excerpts/components/ExcerptStashPanel.tsx src/features/excerpts/screens/ExcerptsScreen.tsx tests/excerpts/excerpt-stash-panel.test.cjs`；开始时工作区干净。
- 用户已确认补充方案；先更新 UI 规范，再实施修改。

## 改动清单（按层）与原代码对比

- `src/features/excerpts/components/ExcerptStashPanel.tsx`：编辑行去掉额外 `px-4`，Input 设 `w-full`，左右边缘与滚动列表对齐，内部留白继续由公共组件承担。原来尾部 Check/X 显式保存/取消，现在移除按钮及导入，失焦自动保存。
- 同一面板：原来多个出口不能离开编辑，关闭丢弃未保存内容；现在 finishEditing 共用单个保存 Promise，leave 共用单个后续动作 Promise。未改原文直接退出；成功再切换、操作或关闭，失败保留原始输入、提示并重新聚焦。
- 同一面板：当前正文 ref 在输入事件中同步更新，保存期间只读；旧 Input 的输入/失焦按 clientId 门控，不能修改新编辑项。UI 禁用状态用 React state，任务 ref 只在事件/Effect 中使用。保留长按拖拽及 180ms 单次回位。
- `src/features/excerpts/screens/ExcerptsScreen.tsx`：关闭按钮、遮罩和系统返回共用 closeStash，经面板 leave 等待编辑保存。保存中仍可请求关闭，非编辑操作忙时保留禁用边界；账号/仓库代次变化清理编辑提示状态。原来合并直接冻结闭包中的 stash.items，现在在完成编辑后调用 repository.list 读取最新 SQLite 快照。
- `src/core`、`src/shared`、`modules`：无改动。复用公共 Input 与既有本机仓储，不改共享输入行为、数据库结构、后端 API、系统通知或透明捕获。
- `tests/excerpts/excerpt-stash-panel.test.cjs`：扩展宿主 harness 的 ref/focus 模拟，显式保存/取消断言改为自动保存；组件回归由 7 项变为 12 项，覆盖并发出口、未改不写、关闭等待、切换及旧事件保护、最新正文合并、失败保留和卸载边界。
- `docs/UI/IRisNote视觉设计规范.md`：同步同宽、无操作按钮、自动保存出口与失败边界。
- `CHANGELOG.md`、本日志：记录原因、调用链、验证及真机限制；本日志为新增 59 行，职责是记录自动保存与 UI 调整的全链路。

## 原因与取舍

用户希望多行输入占满列表宽度，并直接离开完成保存，减少按钮和额外确认。只使用 onBlur 不能保证关闭前写入完成，还可能在同一次点击触发关闭与失焦时重复提交；因此把所有编辑出口收敛到同一保存任务，第一项离开动作成功后才执行。合并重新读 SQLite，避免使用保存前闭包中的旧正文。失败保留输入并返回焦点，不用自动关闭掩盖失败。

删除了取消编辑函数、显式保存图标和 Keyboard.dismiss 调用；原保存职责由 finishEditing 承担，取消丢弃行为按用户要求替换为离开自动保存。移除主动收键盘，避免切换到新 Input 时关闭刚出现的键盘；原生输入焦点/弹窗关闭负责键盘变化，体验待真机验证。没有默认分隔语义变化，没有数据清理或迁移。

## 完整调用链

```text
点条目 → 面板 leave（先处理旧编辑）→ 保存成功后完整预填新条目
输入 → 同步 editingRef + React editing state，仅本地编辑
失焦 → clientId 校验 → finishEditing
切换条目 / 删除 / 粘贴 / 清空 / 合并 / 关闭
  → leave 去重后续动作 → finishEditing
  → 已有保存任务：加入同一 Promise
  → 正文未改：清编辑状态，不写 SQLite
  → 有修改：冻结当前正文，保存期间 Input 只读
  → ExcerptsScreen.runStashAction 操作锁 + ready/ownerKey/generation
  → ExcerptStashRepository.update → prepareExcerptContent
  → 空内容/20000 码点上限校验 → 同账号哈希冲突检查
  → SQLite 事务更新 content/content_hash → 账号代次复核
  → useExcerptStash.refresh → 列表快照
  → saved：恢复预览，执行首个离开动作
  → duplicate/异常：保留完整输入和错误，恢复焦点，取消离开
合并：自动保存结束 → openStashMerge → repository.list 最新快照
  → 原有合并表单 / saveMergedStash → 本机摘录 → removeMerged 清理未变快照
关闭：自动保存结束 → closeStash 再核验账号/操作锁 → 关闭弹窗
```

当前面板卸载后不发布迟到保存结果、不执行后续动作或聚焦新窗口。切账号仍受既有仓储租约校验，旧输入不能落入新账号。列表写入或刷新错误沿用原有处理；实际写入成功而列表刷新失败时仍明确提示操作已完成。

本次自动保存指输入失焦、面板操作和显式关闭；不添加进程退出钩子，不能保证系统强杀时尚未触发离开的输入落库。链路仅本机 SQLite，没有云上传、HTTP 请求或新增权限。

## 验证

- 修改前、首轮修改后 `npm run typecheck`：通过。
- `node tests/excerpts/excerpt-stash-panel.test.cjs`：12/12 通过；为组件状态/回调模拟，不代替原生布局和焦点实测。
- `node tests/excerpts/excerpt-stash.test.cjs`：9/9 通过，包含真实 SQLite 事务、账号隔离和合并快照清理。
- 首轮完整检查在 Lint 阶段发现本次新增的 react-hooks/refs 错误；已改为用 saving state 决定 UI 禁用状态，未关闭规则或添加忽略标记。
- 最终获准环境 `npm run check`：通过，714 项、712 通过、2 跳过、0 失败；类型、Lint 和主题一致性通过，仅既有设置页未使用变量警告。
- `git diff --check`：通过。
- APK 构建、真机宽度/键盘/失焦/关闭和拖拽验收：未执行。
