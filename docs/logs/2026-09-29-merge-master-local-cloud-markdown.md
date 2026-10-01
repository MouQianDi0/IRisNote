# 2026-09-29 合并 origin/master：本地云解耦与公共 Markdown 组件进入 kroos_todo

## 背景

`kroos_todo` 分支（待办动态卡动作按钮功能线）与 `master` 主线各自演进后，按用户指令把 `origin/master` 合并进当前分支，使动态卡功能线基于 0.7.0 发布后的最新主线代码继续开发。

- 合并基点（merge-base）：`9cfe27c`
- 合并结果提交：`f14fcdf`（Merge remote-tracking branch 'origin/master' into kroos_todo）
- 带入的 master 提交：`38e307d`（0.7.0 更新说明）、`4432edc`（PR #130，本地云解耦 + v19 迁移）、`b566523`（PR #131，公共 Markdown 组件）及两个 merge 提交

## 改动清单（按层，均来自 master 侧带入，本分支侧无文件改动）

### src/features

- `notes/services/note-flags.service.ts`（新增）：标星/置顶独立同步服务，无需下载正文即可同步状态。
- `notes/categories/data/category-local.repository.ts`（新增）：本机分类实体仓储与云/本地 ID 映射。
- `notes/services/note-trash.service.ts`：回收站删除/恢复改为记录意图，支持恢复已淘汰正文的笔记并保留本地预览（约 +296 行）。
- `notes/hooks/useNotePin.ts`、`useNoteStar.ts`：重构为走 note-flags.service 的独立同步链路。
- `notes/categories/components/CategoryBar.tsx`、`CreateCategoryModal.tsx`、`categories/data/category-cache.ts`：适配本机分类，创建失败保留输入。
- `notes/data/note-local.repository.ts`、`note-sync.repository.ts`、`note-trash.repository.ts`、`services/note-body.service.ts`、`note-save.service.ts`、`note-sync-coordinator.ts`、`screens/NotesScreen.tsx`、`NoteDetailScreen.tsx`、`components/viewer/NoteDetailStateView.tsx`、`NoteViewerMeta.tsx`：正文缺失提示、本机标志持久化与回收站意图适配。
- `sync/category-upload-queue.ts`、`upload-task-adapters.ts`（新增）、`upload-task-cancellation.ts`：上传队列重构，修复重复上传，新增任务取消。
- `settings/screens/CloudStorageSettingsScreen.tsx`：提示文案适配。
- `updates/ReleaseNotes.tsx`、`UpdateDialog.tsx`、`release-notes.ts`：更新说明改用公共 Markdown 组件排版。

### src/core

- `database/migrations/0019-local-cloud-independent.ts`（新增）+ `migrations/index.ts`：v19 迁移，新增本地分类表、笔记本机标志、垃圾桶意图等表结构。
- `cloud-storage/cloud-storage-policy.ts`：本机操作只检查账号会话，云请求继续遵守原授权门控。
- `sync/upload-queue.repository.ts`：上传队列字段适配。

### src/shared

- `utils/markdown/Markdown.tsx`、`parse-markdown.ts`、`index.ts`（新增）：公共 Markdown 解析与渲染组件。

### tests

- `sync/local-only.test.cjs`（新增，667 行）：本机模式 17 项测试。
- `ui/markdown.test.cjs`（新增，100 行）：公共解析测试。
- `releases/release-notes.test.cjs`、`releases.test.cjs`、`sync/notes-body-eviction.test.cjs`、`todos/todo-local.test.cjs`：适配与迁移。

### docs / releases

- `docs/logs/2026-09-28-local-only-cloud-independence.md`、`2026-09-29-shared-markdown-utils.md`、`2026-09-29-update-notes-markdown.md`（新增）：master 侧功能自带的全链路日志，本次合并原样带入，细节以其为准。
- `docs/构建发布/android-releases.md`、`更新说明编写规范.md`、`releases/notes-0.7.0.txt`（新增）：发布文档与 0.7.0 更新说明。
- `CHANGELOG.md`：合并带入 master 侧 3 条记录；解决冲突时按时间倒序保留双方条目（kroos_todo 侧「待办动态卡操作按钮」在顶）。

## 与原代码对比

- 原来是什么：合并前 `kroos_todo` 停在 `bcfc10b`，不包含 0.7.0 发布内容、笔记/分类本机云解耦（v19 迁移、note-flags 独立同步、回收站意图）、公共 Markdown 组件。
- 现在是什么：`f14fcdf` 起上述能力全部进入 `kroos_todo`；`kroos_todo` 自有的动态卡动作 4 个提交（`d995392`~`bcfc10b`）不变。两边改动文件不重叠，无语义冲突。
- 行为默认值/开关无反转：云存储总开关（`EXPO_PUBLIC_CLOUD_STORAGE_ENABLED`）语义不变，仅细化了"本机操作 vs 云请求"的校验分层。

## 改动原因

主线（master）已发布 0.7.0 并合入本地云解耦与公共 Markdown 组件；动态卡功能线需要基于最新主线继续，避免后续合并冲突扩大和重复实现。

## 完整调用链路

本次为合并提交，不引入新链路。带入链路的完整描述见合并自带的三篇日志：`docs/logs/2026-09-28-local-only-cloud-independence.md`（本机操作→独立会话校验→本地库，云请求→原授权门控）、`docs/logs/2026-09-29-update-notes-markdown.md` 与 `2026-09-29-shared-markdown-utils.md`（更新弹窗→ReleaseNotes→shared/utils/markdown）。

## 验证情况

- 合并前基线 `npm run typecheck`：0 错误。
- 冲突仅 `CHANGELOG.md` 一处（双方都在顶部追加条目），按时间倒序解决；`git diff --check` 通过，无遗留冲突标记。
- 合并后 `npm run check`：退出码 0，TypeScript、Lint、theme:check 通过，node --test 660/660 通过（含带入的 local-only 17 项、markdown/UI 用例与本分支动态卡用例）。
- Android 原生构建与真机验证未执行（本次合并未触碰 `modules/` 原生代码；带入的迁移 0019 在真机首次启动时才会执行，后续真机验证时关注）。
- 未推送：合并提交仍在本地，等待用户授权后推送。
