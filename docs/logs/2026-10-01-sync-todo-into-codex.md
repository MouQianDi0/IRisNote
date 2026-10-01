# 将 todo 同步到 codex 并迁移当前工作

- 时间：2026-10-01 13:26:41 UTC
- 类型：优化代码
- 用户要求：在 codex 拉取 todo，再同步当前工作并推送 codex，后续在 codex 开发。
- 分支映射：todo=`kroos_todo`，codex=`kroos_vps/codex-a`；通过远端 `ls-remote` 实际确认，没有名为 `todo`/`codex` 的分支。
- 同步前 codex：`be7d88c2fc3f8c633f1a364d132285a6078f5f68`；todo：`25c98c9319da6e8629c550e68d5686b7680816e7`。`git merge-base` 为 `be7d88c2fc3f8c633f1a364d132285a6078f5f68`，codex 是 todo 的祖先。
- 已执行：codex 从 `be7d88c` 快进到 `25c98c9`，带入 26 个既有提交、113 个文件（+8419/-1215），没有合并冲突或重写原提交。
- 当前功能提交：`c9dfe2a1f92b39775cab0940318f5c717a00f475`（`feat(notes): 历史详情默认行级对比并增加加载反馈`），12 文件 +1391/-190；提交父节点是 `25c98c9319da6e8629c550e68d5686b7680816e7`。
- 本记录与 AGENTS 工作分支约定以独立文档提交收尾；外部推送目标为 `origin/kroos_vps/codex-a`，采用正常快进推送并核对远端 SHA。

## 1. 改动原因与原代码对比

1. 原 codex 停在摘录通知 B 档提交，todo 包含后续动态卡动作、摘录暂存/通知直接保存、开发者模式和笔记历史恢复等更新；用户要求以 codex 继续工作，因此将已存在的 todo 历史快进同步到 codex。比较依据是实际 `git diff be7d88c..25c98c9`。
2. 原来当前 12 文件的历史 diff/加载改动尚未提交，工作区位于 todo；现在在 codex 恢复并提交，完整文件 SHA-256 与切分支前备份一致。本轮没有人工改写这 12 文件的功能逻辑。功能详细调用链、每文件变更和验证见 [历史差异与加载日志](2026-10-01-note-history-diff-loading.md)。
3. 原项目规则没有固定 Codex 后续工作分支；现在 AGENTS 第 20 节指定 `kroos_vps/codex-a`，从其他分支更新时在该分支合入，新的用户指令可改变该约定。该约定不授予未来任务自动提交/推送权限。
4. todo 本地与远端指针仍为 `25c98c9319da6e8629c550e68d5686b7680816e7`；本次新功能提交只在 codex 上创建。本次没有应用默认值反转，功能提交的默认历史 Tab 变化记录在原功能日志。

## 2. 当前工作保护与真实执行路径

```text
原工作区 kroos_todo@25c98c9（12 文件未提交）
 → 复制完整文件、tracked.patch、SHA-256 manifest 到 /tmp 备份
 → git stash push --include-untracked（保留新增文件）
 → git fetch origin
 → git switch kroos_vps/codex-a
 → git merge --ff-only origin/kroos_vps/codex-a（已最新）
 → git merge --ff-only origin/kroos_todo（26 提交快进）
 → git stash apply d453c9227e1d8f266d1641d62ecc6314d223685f
 → 校验 12 文件 SHA-256 全部一致
 → 增加 AGENTS 工作分支约定
 → 重新运行 typecheck/check、冲突标记与 diff 检查
 → 精确暂存 12 个功能文件并提交 c9dfe2a
 → 维护同步 CHANGELOG/本日志，与 AGENTS 组成文档提交
 → 正常推送 origin/kroos_vps/codex-a，远端 SHA 与本地 HEAD 核对
```

- 备份位置：`/tmp/irisnote-codex-transfer-20261001-131959`，包含 12 个完整文件和 SHA-256 manifest。
- 保留 stash：`d453c9227e1d8f266d1641d62ecc6314d223685f`；使用 apply，未删除备份。
- 分支同步改变 Git 工作树，不迁移或删除运行中的真实数据库，不发应用 API 请求、不执行发布。todo 带入的存量数据库迁移/同步实现保留原语义。
- Git 操作没有冲突；没有新增 fallback 或双端镜像。通知与恢复的既有链路分别见已同步的系统通知说明及各原功能日志。

## 3. 本轮直接修改文件

- `AGENTS.md`：新增第 20 节，指定 Codex 默认工作分支及其他分支合入方式，保留按任务授权提交/推送规则。
- `CHANGELOG.md`：新增本轮分支同步和工作分支约定记录，保留历史 diff/加载功能条目及全部既有历史。
- `docs/logs/2026-10-01-sync-todo-into-codex.md`：本日志，记录 SHA、快进范围、工作区保护、调用路径、文件清单及验证限制。
- `src/features`、`src/core`、`src/shared`、`modules`、`tests`：本轮直接修改为上一任务已验证的 12 文件功能提交；代码与切分支前备份一致，详见原功能日志。

## 4. 快进带入的完整文件清单（按层）

下表直接由 `git diff --numstat be7d88c..25c98c9` 生成。均为 todo 中既有提交带入，不是本轮重新编写；新增行数/删除行数对应实际差异。具体功能说明随 todo 原 CHANGELOG、各域说明和 docs/logs 一并带入。

### src/features

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `src/features/excerpts/components/ClipboardDetectedCard.tsx` | 10 | 15 |
| `src/features/excerpts/components/ExcerptCaptureFeedback.tsx` | 103 | 0 |
| `src/features/excerpts/components/ExcerptFormDialog.tsx` | 61 | 97 |
| `src/features/excerpts/components/ExcerptSessionDialog.tsx` | 1 | 1 |
| `src/features/excerpts/components/ExcerptStashPanel.tsx` | 337 | 0 |
| `src/features/excerpts/components/ExcerptToolbar.tsx` | 23 | 10 |
| `src/features/excerpts/data/excerpt-stash.repository.ts` | 157 | 0 |
| `src/features/excerpts/domain/clipboard-detection.ts` | 8 | 11 |
| `src/features/excerpts/domain/excerpt-capture-feedback.ts` | 29 | 0 |
| `src/features/excerpts/domain/excerpt-stash-drag.ts` | 8 | 0 |
| `src/features/excerpts/domain/excerpt-stash-merge.ts` | 9 | 0 |
| `src/features/excerpts/hooks/useClipboardDetection.ts` | 5 | 69 |
| `src/features/excerpts/hooks/useExcerptStash.ts` | 26 | 0 |
| `src/features/excerpts/screens/ExcerptCaptureScreen.tsx` | 92 | 156 |
| `src/features/excerpts/screens/ExcerptsScreen.tsx` | 110 | 6 |
| `src/features/excerpts/services/clipboard-handled.ts` | 0 | 94 |
| `src/features/excerpts/services/excerpt-capture-controller.ts` | 21 | 45 |
| `src/features/excerpts/services/excerpt-capture.ts` | 3 | 4 |
| `src/features/excerpts/services/excerpt-service.ts` | 6 | 6 |
| `src/features/excerpts/services/excerpt-session-notifications.ts` | 1 | 1 |
| `src/features/excerpts/services/excerpt-stash-service.ts` | 48 | 0 |
| `src/features/excerpts/state/clipboard-offer-store.ts` | 0 | 6 |
| `src/features/notes/components/viewer/NoteViewer.tsx` | 48 | 1 |
| `src/features/notes/components/viewer/NoteViewerHeader.tsx` | 7 | 1 |
| `src/features/notes/components/viewer/note-history-popover.tsx` | 413 | 0 |
| `src/features/notes/data/note-local.repository.ts` | 91 | 7 |
| `src/features/notes/data/note-revision.repository.ts` | 24 | 0 |
| `src/features/notes/hooks/use-note-history.ts` | 67 | 0 |
| `src/features/notes/services/note-history.service.ts` | 81 | 0 |
| `src/features/settings/data/system-preferences.repository.ts` | 7 | 16 |
| `src/features/settings/hooks/use-developer-mode.ts` | 31 | 0 |
| `src/features/settings/hooks/use-notification-test-tools.ts` | 168 | 0 |
| `src/features/settings/screens/AboutScreen.tsx` | 97 | 5 |
| `src/features/settings/screens/DeveloperOptionsScreen.tsx` | 294 | 0 |
| `src/features/settings/screens/DiagnosticLogScreen.tsx` | 271 | 0 |
| `src/features/settings/screens/HelpFeedbackScreen.tsx` | 1 | 178 |
| `src/features/settings/screens/SettingsScreen.tsx` | 22 | 0 |
| `src/features/settings/services/developer-environment.ts` | 90 | 0 |
| `src/features/settings/state/developer-mode-store.ts` | 49 | 0 |
| `src/features/settings/utils/developer-environment-report.ts` | 85 | 0 |
| `src/features/settings/utils/developer-unlock.ts` | 48 | 0 |
| `src/features/settings/utils/diagnostic-log-view.ts` | 43 | 0 |
| `src/features/todos/data/todo-sync.repository.ts` | 10 | 0 |
| `src/features/todos/services/todo-aggregate-live.service.ts` | 5 | 0 |
| `src/features/todos/services/todo-card-action.service.ts` | 356 | 0 |
| `src/features/todos/services/todo-live-update.service.ts` | 12 | 0 |
| `src/features/todos/state/todo-live-update-coordinator.ts` | 28 | 2 |

### src/core

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `src/core/database/migrations/0020-create-excerpt-stash.ts` | 21 | 0 |
| `src/core/database/migrations/index.ts` | 2 | 0 |
| `src/core/diagnostics/diagnostic-log.ts` | 46 | 2 |
| `src/core/diagnostics/index.ts` | 4 | 0 |
| `src/core/system-notifications/system-notification-native-provider.tsx` | 90 | 3 |
| `src/core/system-notifications/system-notification.types.ts` | 4 | 1 |

### src/shared

无快进净差异。

### modules

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `modules/irisnote-system/android/src/main/AndroidManifest.xml` | 5 | 0 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/IrisNoteSystemModule.kt` | 73 | 0 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptCaptureActivity.kt` | 5 | 0 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptSessionNotifications.kt` | 57 | 6 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoActionReceiver.kt` | 153 | 0 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoActionStore.kt` | 93 | 0 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoForegroundService.kt` | 2 | 1 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoNotifier.kt` | 64 | 1 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/live/LiveTodoTimeline.kt` | 25 | 1 |
| `modules/irisnote-system/android/src/main/res/drawable/ic_action_todo_cancel.xml` | 5 | 0 |
| `modules/irisnote-system/android/src/main/res/drawable/ic_action_todo_complete.xml` | 5 | 0 |
| `modules/irisnote-system/android/src/main/res/drawable/ic_action_todo_snooze.xml` | 5 | 0 |
| `modules/irisnote-system/index.ts` | 31 | 1 |

### tests

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `tests/editor/history-ui.test.cjs` | 380 | 0 |
| `tests/editor/history.test.cjs` | 707 | 0 |
| `tests/excerpts/clipboard-detection.test.cjs` | 10 | 42 |
| `tests/excerpts/clipboard-handled.test.cjs` | 0 | 119 |
| `tests/excerpts/excerpt-capture-screen.test.cjs` | 134 | 0 |
| `tests/excerpts/excerpt-capture.test.cjs` | 155 | 183 |
| `tests/excerpts/excerpt-local.test.cjs` | 8 | 39 |
| `tests/excerpts/excerpt-stash-panel.test.cjs` | 324 | 0 |
| `tests/excerpts/excerpt-stash.test.cjs` | 183 | 0 |
| `tests/releases/source.test.cjs` | 1 | 1 |
| `tests/settings/developer-mode.test.cjs` | 166 | 0 |
| `tests/todos/system-notifications.test.cjs` | 1 | 1 |
| `tests/todos/todo-card-actions.test.cjs` | 329 | 0 |
| `tests/todos/todo-live-update.test.cjs` | 3 | 0 |
| `tests/todos/todo-local.test.cjs` | 2 | 2 |
| `tests/todos/todo-sync.test.cjs` | 36 | 0 |

### docs

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `docs/UI/IRisNote视觉设计规范.md` | 6 | 4 |
| `docs/UI/通知渠道适配.md` | 1 | 1 |
| `docs/logs/2026-09-28-todo-live-card-actions.md` | 134 | 0 |
| `docs/logs/2026-09-29-developer-mode.md` | 136 | 0 |
| `docs/logs/2026-09-29-merge-codex-a-be7d88c-into-kroos-todo.md` | 83 | 0 |
| `docs/logs/2026-09-29-merge-codex-a-into-kroos-todo.md` | 109 | 0 |
| `docs/logs/2026-09-29-merge-master-local-cloud-markdown.md` | 67 | 0 |
| `docs/logs/2026-09-29-note-status-write-coalescing.md` | 2 | 0 |
| `docs/logs/2026-09-29-todo-completed-at-patch-422.md` | 44 | 0 |
| `docs/logs/2026-09-30-clipboard-stash-merge-2.md` | 41 | 0 |
| `docs/logs/2026-09-30-clipboard-stash-merge.md` | 88 | 0 |
| `docs/logs/2026-09-30-excerpt-card-save-button.md` | 67 | 0 |
| `docs/logs/2026-09-30-excerpt-direct-capture.md` | 88 | 0 |
| `docs/logs/2026-09-30-excerpt-stash-autosave.md` | 59 | 0 |
| `docs/logs/2026-09-30-excerpt-stash-inline-edit.md` | 71 | 0 |
| `docs/logs/2026-09-30-excerpt-stash-save-button.md` | 26 | 0 |
| `docs/logs/2026-09-30-excerpt-stash-single-settle.md` | 27 | 0 |
| `docs/logs/2026-09-30-host-guard-class-forname.md` | 48 | 0 |
| `docs/logs/2026-09-30-review-fixes-notification-id-host-guard.md` | 63 | 0 |
| `docs/logs/2026-10-01-capture-feedback-top-anchor.md` | 39 | 0 |
| `docs/logs/2026-10-01-note-history-3b.md` | 297 | 0 |
| `docs/架构指南/业务模块与运行逻辑.md` | 11 | 10 |
| `docs/架构指南/系统通知模块负责说明.md` | 57 | 27 |
| `docs/架构指南/项目架构与文件索引.md` | 13 | 0 |
| `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md` | 16 | 13 |
| `docs/进度与验证/IRisNote编辑器阶段3保存版本边界验证清单.md` | 45 | 13 |
| `docs/进度与验证/项目编辑器进度.md` | 40 | 13 |

### src/app 与根文件

| 文件 | 新增行 | 删除行 |
| --- | ---: | ---: |
| `CHANGELOG.md` | 196 | 0 |
| `src/app/_layout.tsx` | 8 | 0 |
| `src/app/pages/user/developer/index.tsx` | 1 | 0 |
| `src/app/pages/user/developer/logs.tsx` | 1 | 0 |

## 5. 验证结果与边界

- 同步前 `npm run typecheck`：通过。
- 同步后重新执行获准环境 `npm run check`：TypeScript/主题检查通过；Lint 0 错误、1 个既有 PermissionSettingsScreen unused-vars 警告；765 项中 763 通过、2 跳过、0 失败。该结果来自本次 codex 工作树，不沿用之前分支的运行结果。
- 恢复后 12 文件 SHA-256 与备份一致；功能提交暂存范围实测为这 12 文件，无其他任务改动。
- `git diff --check` / `git diff --cached --check`：通过；src/modules/tests/规则/CHANGELOG 无遗留冲突标记。
- 原生尝试 `npm run gradle -- :irisnote-system:compileReleaseKotlin --offline`：未完成，实际报错 JAVA_HOME 未设置且 PATH 没有 java，未获得 Kotlin 编译通过证据。
- 未执行：Android/iOS/Web 包构建、真机视觉/动画/手势/朗读、真实服务器恢复同步。
- git-commit-command 技能未找到，依据真实 Git 状态指定路径进行提交；本次用户明确授权同步当前工作并推送 codex。纯分支约定/同步记录不再运行无关应用测试。
