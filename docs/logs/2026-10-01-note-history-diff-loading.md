# 笔记历史默认差异与加载反馈

- 时间：2026-10-01 12:54:29 UTC
- 类型：新增功能
- 基点：`25c98c9319da6e8629c550e68d5686b7680816e7`，`kroos_todo`；修改前工作区干净。已实际检查 `git diff 25c98c9 -- src/features/notes/components/viewer/note-history-popover.tsx tests/editor/history-ui.test.cjs`；新增文件逐项审阅。
- 用户已确认默认对比/历史全文、行级差异、零新依赖及加载动画后授权实施；本次未提交、推送或发布。

## 1. 关键边界与影响

- 对比方向是历史版本 → 当前编辑器内存草稿，包含未保存输入。`−` 是当前已删除的历史行，`+` 是当前新增行。标题/分类单列，不计正文行数；分类 ID 判断变化、分类名复用当前本地表，不能还原历史分类名称。
- 内容一致与版本身份独立。沿用当前版本指针禁用恢复；当前已保存版本与草稿有差异时仍不能恢复自身，同内容的不同历史版本仍可按既有规则恢复。
- 纯展示计算不写数据库、不发网络请求、不创建版本、不改草稿锁或上传队列。列表仍只读取摘要，选择后本机读取完整版本。
- 默认展示差异属于行为反转；历史全文仍支持选择复制，单独的当前编辑全文 Tab 删除，其实时草稿基准由对比视图承担。
- 正文合计 400000 UTF-16 码元/12000 行、200000 工作步与渲染块上限保护 JS 线程；超预算只提示查看全文，不把局部结果当作完整统计。无公共行的完全重写直接分组展示。
- 生成器每 2048 工作步 yield，feature 内定时调度后续批次；卸载/返回列表/关闭/输入变化时停止任务并丢弃迟到结果。相同输入保留结果与展开状态，切换全文不重新计算。
- 读取/计算加载动画延迟 150ms；快速完成不人为延长等待。内容区预留高度，原生高度变化与动画体验尚未实测。恢复确认立即显示转圈，既有去重/禁用/失败保留输入规则继续生效。

## 2. 改动清单（按层）

### src/features

- `src/features/notes/components/viewer/note-history-popover.tsx`：详情 Tab 默认 diff、保留历史全文；使用差异组件和延迟加载占位；读取中保留 Tab/禁用恢复；关闭和返回使计算组件卸载；全文隐藏对比无障碍节点；恢复按钮复用 `leading` 插槽显示转圈，公共 DialogButton 不变。
- `src/features/notes/components/viewer/note-history-diff.tsx`：新增 237 行，负责分批任务调度、输入关联缓存、取消/迟到保护、错误重试、元数据变化、统计/差异/上下文展开与可选择/朗读展示。
- `src/features/notes/components/viewer/note-history-loading.tsx`：新增 36 行，负责 160dp 加载占位、150ms 动画延迟、忙碌朗读状态及卸载清理。

### src/core

- 无改动；草稿保存和数据库基础设施沿用现有实现。

### src/shared

- `src/shared/utils/text-diff.ts`：新增 224 行，纯 Myers 行级 diff 生成器、前后缀优化、无共享行整段分组、输入/工作量/块数限界及上下文折叠；NULL/空串统一，保留空白/末尾换行，仅统一 CRLF/LF。

### modules

- 无改动；没有新增依赖、原生能力、迁移或 API。

### tests

- `tests/editor/history-diff.test.cjs`：新增 354 行，14 项算法/组件/加载测试，含 961 组短序列与独立 LCS/双向重建核对、大文本测量和取消/迟到/失败/折叠/朗读验证。
- `tests/editor/history-ui.test.cjs`：更新默认 Tab/实时草稿/历史全文断言及恢复转圈；新增内容与版本指针独立、读取期间禁用、关闭/返回取消及全文切换缓存测试；原有去重/恢复错误/Hook 竞态测试保留，合计 12 项。
- `tests/editor/history-test-host.cjs`：新增 164 行，从原 history-ui 测试提取宿主并补齐 useMemo、依赖变化后的 effect 清理和计时推进；不验证原生布局。默认导入替身与转译设置显式匹配，修复初轮夹具失败。

### docs

- `docs/进度与验证/项目编辑器进度.md`：更新当前状态、真实调用路径、职责/测试表及本次进展，保留旧时间点记录。
- `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md`：更新 3B 当前实施状态、默认对比/加载/预算边界及实际验证。
- `docs/进度与验证/IRisNote编辑器阶段3保存版本边界验证清单.md`：更新已实现能力，追加本次命令、结果、性能测量和待验收项，保留 3A/3B 原始证据。
- `docs/logs/2026-10-01-note-history-diff-loading.md`：本篇全链路日志。
- `CHANGELOG.md`：新增最新条目，记录实际文件与验证。

## 3. 与原代码对比及原因

1. 原来默认显示历史原文，另一个 Tab 显示当前编辑全文，用户需要肉眼找差异；现在默认行级对比，保留历史全文以便阅读或找回原文。**默认值由历史全文变为差异**。
2. 原来读取时仅显示一个通用转圈；现在按列表/版本/计算区分文案，延迟显示、预留高度以减少快速读取的闪烁；恢复过程在既有按钮中增加动画，不改变三级气泡导航。
3. 原来没有 diff 算法；现在 shared 负责纯算法，feature 负责调度与展示。分批和预算控制避免长笔记搜索阻塞交互，完全重写直接分组减少搜索成本。
4. 原来恢复权限取决于版本 ID；现在仍然如此，diff 的一致状态不会替换该判断，避免把实时未保存内容误当作正式版本。
5. 原来测试宿主不跟踪 effect 依赖或模拟 useMemo；现在复用增强宿主覆盖加载计时、输入变化、取消和迟到结果，原有恢复测试继续运行。

## 4. 完整调用链路

```text
NoteViewer 实时 value → NoteHistoryPopover.currentValue
  History 按钮 → 原 onOpen 收键盘/请求草稿补写
  → useNoteHistory.refresh → readNoteHistory → 本机 SQLite 事务
    （账号门控，版本摘要/当前版本指针/本地分类，不取正文列表）
  → 点击版本 → useNoteHistory.select → readHistoryRevision → 本机版本快照
  → 默认 diff Tab → NoteHistoryDiff
    → diffTextLines 历史正文/实时草稿正文
    → 定时推进批次，预算或输入限界 → 全文提示降级
    → 完成结果缓存 → textDiffSections → 统计/新增/删除/可展开上下文
    → 标题/分类独立比较；读取/计算过 150ms → NoteHistoryLoading
    → 输入变化/关闭/返回列表/卸载 → 取消计时与生成器，拒绝旧结果回写
  → 历史全文 Tab → 原版本 title/category/content，选择复制
  → 恢复按钮（仍按版本指针与冲突门控）→ 原确认层
    → 正在恢复按钮转圈 → NoteViewer.restoreHistory
    → draft.beginSave/排空 → restoreNoteFromHistory → restoreLocalNoteToRevision
    → 原事务：账号/版本/草稿保护，保存有变化输入，追加 restore，清理旧草稿/入队
    → 缓存/事件通知 → 重建编辑会话；失败保留输入、确认层可重试
    → 网络/云授权允许时原持久队列同步（对比本身不参与网络）
```

本次没有双端镜像或服务器修改；iOS/Android 使用同一个 RN 展示入口。

## 5. 实际验证

- 修改前 `npm run typecheck`：通过；最终检查覆盖修改后类型检查。
- `node tests/editor/history-diff.test.cjs`：14/14。
- `node tests/editor/history-ui.test.cjs`：12/12。
- `node tests/editor/history.test.cjs`：24/24，真实 Node SQLite 与完整迁移，未替换事务逻辑。
- `node --test --test-concurrency=1 tests/editor/history-diff.test.cjs tests/editor/history-ui.test.cjs tests/editor/history.test.cjs`：3 个测试文件通过。
- 最终获准环境 `npm run check` 通过：TypeScript、主题检查通过，Lint 0 错误、1 个既有设置页警告；765 项测试中 763 通过、2 跳过、0 失败。相关算法/差异组件 14 项、历史 UI/Hook 12 项、SQLite/恢复服务 24 项全部通过。
- 初轮默认导入测试夹具失败，已修正并重跑通过。沙箱全量检查中 cos/source/system-notifications/todo-api 四个文件失败，最终获准环境同一代码完整检查均通过；COS/source 单独复核也通过。沙箱记录 `/tmp/irisnote-history-diff-check.log`、最终结果摘要 `/tmp/irisnote-history-diff-approved-check-summary.log`，均为临时证据，不入 Git。
- 算法在服务器 Node 2000 行输入同步推进实测：少量修改 3.76ms、完全重写 1.89ms、重复行重排 0.51ms；不代表移动端批次调度、布局或动画性能。
- `git diff --check`：通过；源码/测试冲突标记检查无匹配。
- 未执行：Android/iOS/Web 构建、真机视觉/加载动画/手势/朗读/选择复制与真实服务器恢复同步。
