# 编辑时间历史入口与独立正文对比页

- 时间：2026-10-02 08:52:14 UTC。
- 分支：`kroos_vps/codex-a`；改前基点：`7552eeb4a7baed6e6a7f132b75a0a978068799df`。
- 结果：本次功能变更。提交前原有文件以 `git diff 7552eeb --` 核对，新增文件直接核对内容；提交结果以 `git diff 7552eeb..HEAD` 复核。
- 用户确认：时间入口/创建时间展示、独立对比页、IDE 风格折叠的具体方案与文字预览后，用户回复“确认”。2026-10-02 用户随后明确要求“写好commit 远程提交”，追加授权本次18文件提交和 codex 远端推送。

## 1. 改动清单（按层）

| 层 | 文件 | 修改点与原因 |
| --- | --- | --- |
| src/features | `components/viewer/NoteViewer.tsx` | 历史从 Header actions 移至元信息槽，传入 note.updated_at；原 blur/草稿补写/恢复回调继续复用 |
| src/features | `components/viewer/NoteViewerMeta.tsx` | 删除独立创建时间格式化和 Text，改由 historyEntry 承担最后编辑时间与入口；窄屏可换行，避免长时间标签挤压分类/统计 |
| src/features | `components/viewer/note-history-popover.tsx` | 时间 Pressable 锚点；列表显示笔记创建时间；详情直接保留历史全文及恢复，按钮关闭气泡并 push 对比页；防重复导航，失败保留气泡及当前输入；拥有快照并在卸载释放 |
| src/features | `components/viewer/note-history-diff.tsx` | 保留字符高亮、独立标题缓存与预算；正文拆成带两侧源行号的 FlatList 行数据；IDE 风格折叠条、上下20行/全部展开/收起/重新折叠，边界换行只显示标记不另起可视空行 |
| src/features | `screens/NoteHistoryComparisonScreen.tsx` | 新增245行；解析路由并校验快照，重读所选本机历史，处理读取失败/过期/迟到结果，默认字符对比与历史全文 Tab、返回；不建立第二个草稿会话 |
| src/features | `services/note-history-comparison-session.ts` | 新增62行；复制并冻结当前草稿，路由不传正文，按账号会话/笔记/版本匹配；最多4份内存快照，显式释放、过期和 A→B→A 防旧快照复用 |
| src/features | `utils/note-history-time.ts` | 新增19行；时间格式化、未知编辑时间提示；不混用创建/同步时间 |
| src/features | `utils/note-history-diff-rows.ts` | 新增114行；字符片段投影到实际源行，边界虚拟换行不增加行号；折叠/分段展开时保持两侧计数，无重叠遗漏 |
| src/app | `src/app/pages/note/history/[id].tsx` | 新增1行路由转发，页面业务在 feature |
| src/app | `src/app/_layout.tsx` | 注册无系统 Header 的历史对比页面；沿既有笔记白色安全区策略 |
| src/core | — | 无修改；草稿 blur 补写和 usePreventRemove 正式退出保护保持原行为 |
| src/shared | — | 无修改；已有 Myers 行定位/字符精化、语义色、PageHeader/Screen 继续复用 |
| modules | — | 无修改或新增原生依赖 |
| tests | `tests/editor/history-diff.test.cjs` | 23→25项，注入真实行投影；新增分段展开/剩余行/重新折叠及2000行展开的虚拟数据和源行号验证；原字符高亮/加载/取消/预算回归保留 |
| tests | `tests/editor/history-ui.test.cjs` | 12→13项；时间/创建时间、草稿快照、短路由参数、防重复导航、导航失败重试和卸载释放；保留恢复及迟到读取测试 |
| tests | `tests/editor/history-comparison.test.cjs` | 新增363行、8项；真实会话策略和页面事件测试，账号/归属/过期/读取重试/返回/全文切换，121组拆行与高亮计数核对、分段源行号重建 |
| docs | `docs/进度与验证/项目编辑器进度.md` | 0.4.24，更新当前 UI、真实调用链、文件职责及验证 |
| docs | `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md` | 0.4.5，更新3B当前状态，阶段4仍未开始 |
| docs | `docs/进度与验证/IRisNote编辑器阶段3保存版本边界验证清单.md` | 3B.4，更新实际范围并追加第11节验证与未验收项 |
| docs | `CHANGELOG.md` | 置顶实际时间、18文件清单、实现和最终验证 |
| docs | 本文件 | 新增92行全链路记录 |

上表 src/features 相对路径均以 `src/features/notes/` 为根。全部18个文件属于本次任务；依赖、数据库仓储/迁移、上传队列和恢复服务没有修改。

## 2. 与原代码对比及原因

1. 原编辑页直接展示 note.created_at，Header 另有 History 图标。现在元信息时间取 note.updated_at 并作为历史入口，创建时间单独放在历史列表和对比页元信息；消除创建时间被当作编辑时间的显示问题。未知或无效编辑时间明确提示未知，不使用 local_updated_at 或 created_at 冒充。
2. 原版本详情在300dp气泡内默认对比/历史全文。现在气泡版本详情显示历史全文与“查看正文对比”，恢复确认仍在原气泡；对比 push 独立页面，独立页默认对比并保留全文 Tab。该变化是已确认的入口/默认展示调整，无新配置开关。
3. 原基准是气泡中实时 currentValue。现在进入对比页时复制 currentValue，包含未保存输入；对比期间基准固定为打开那一刻。理由是避免跨路由异步读草稿的写入竞态；返回原编辑会话继续输入，下次打开取得最新快照。
4. 原正文以整块 Text 和整段展开按钮展示。现在字符 span 拆到实际源行，增加历史/当前两个行号；浅灰折叠条保留两行上下文，可从两端各展开20行、展开全部/局部收起/重新折叠。FlatList 只按需创建行组件，避免全部展开时一次渲染大量 Text。
5. 原字符 diff 仍沿用，不改算法预算；新行投影处理段首/尾虚拟换行，附着到实际行的高亮标记，不生成虚假的源行号。码点统计、空白标记、仅实际增删字着色、标题独立缓存与超限全文提示继续保留。
6. 笔记创建时间已经由 local_notes 持久化，readNoteHistory 原来就返回它；此任务只是展示既有字段，没有新复制字段、伪造创建版本，或改写 revision.created_at。各版本仍保持自己的保存时间和排序语义。

删除的职责均有明确落点：NoteViewerMeta 创建时间 Text/格式化由历史时间工具与时间入口替代；气泡 detailTab/内嵌对比改由独立页 Tab/对比组件承担。NoteViewerHeader 的公共 actions 插槽保留供其他调用使用。

## 3. 完整实际调用链

```text
编辑页 note.updated_at
  → NoteViewerMeta.historyEntry → NoteHistoryPopover 时间锚点
  → onOpen：收起键盘 + 原 draft.requestFlush（只补写 note_drafts）
  → useNoteHistory.refresh → readNoteHistory
  → SQLite：local_notes + note_revisions 摘要 + 本地分类（同事务/账号隔离）
  → 列表展示 note.created_at 与各版本自己的 created_at
  → 选择版本 → readHistoryRevision → 本机所选版本全文
  → 查看正文对比
      → createNoteHistoryComparison：复制当前草稿、时间/分类快照，捕获本地账号会话
      → 关闭气泡 → router.push /pages/note/history/[id]（仅 id/revisionId/token）
      → 原编辑页留在栈内；原 blur 补写草稿，不触发正式离开提交
      → NoteHistoryComparisonScreen：按账号会话/笔记/版本读取内存快照
      → readHistoryRevision 再校验并读取本机所选历史
      → NoteHistoryDiff：正文/标题分别分批字符比较
      → historyDiffRows：真实源行号、字符拆行、上下文/分段展开
      → FlatList：按需渲染正文；全文 Tab 保留对比缓存和展开状态
      → 返回：router.back，沿用原编辑会话和未保存输入
```

- 对比页面自身没有数据库写入和网络请求；原编辑页开历史和导航 blur 仍沿既有规则补写草稿。正式版本仍只在原正式保存/恢复边界创建；无服务器镜像历史 API。
- 快照最多4份、编辑页卸载释放；同一入口重新打开先释放旧快照。账号会话检查独立于云授权，离线/未授权仍可用；A→B→A、笔记/版本不匹配、进程重启或缺 token 显示过期，拒绝读版本。没有正文写入 URL 或持久化第二份草稿。
- 导航异常释放失败快照、保留气泡/全文/当前输入并允许重试。版本读取异常提示错误并可重试；每次 attempt 匹配完成状态，切路由/账号/卸载丢弃迟到结果。
- 计算仍每2048步让出线程，共享200000步、输入400000 UTF-16码元/12000行等上限；任何超限不显示部分统计。150ms加载、失败重试、取消和空正文处理保留。
- 恢复从气泡沿原 NoteViewer.restoreHistory → 草稿保存锁 → restoreNoteFromHistory → 本地原子事务执行；成功更新缓存/事件、重建会话并入既有上传队列，失败保留草稿。创建时间、版本/草稿/分类保护均沿原链路。

## 4. 实际验证

- 修改前 `npm run typecheck` 退出0、无既有类型错误；修改后单独类型检查退出0，最终完整检查再次覆盖。
- 针对性执行：`node tests/editor/history-diff.test.cjs` 25/25、`history-ui.test.cjs` 13/13、`history-comparison.test.cjs` 8/8、`history.test.cjs` 24/24、`revisions.test.cjs` 37/37；合计107项通过。
- 新拆行测试121组组合：空文、空行、段首/末尾换行、拆分/合并和上下文；双侧连续源行号、原文行重建、突出码点数等于统计。分段展开从两侧各20行，不重复/遗漏；2000行展开全部仍使用虚拟行数据。原行/字符各961组独立LCS核对保留。
- 页面/入口事件测试覆盖仅本机读取、未保存输入快照、防重复 push、返回、全文保持缓存、失败重试、数组/错误深链、账号切换与迟到结果、卸载释放；不是原生导航或真机布局验收。
- 初次长文本测试将超预算重写误当作完整差异，并把折叠控制条的下一行位置当作末源行号，修正了测试输入/断言；未扩大工作预算。首次全量785项中782通过、1失败、2跳过；修正后全量重跑退出0：785项中783通过、0失败、2跳过，实际耗时62323.635246ms。
- 最终 `npm run check`：TypeScript、主题校验通过；Lint仅既有 `PermissionSettingsScreen.tsx:171` 的 liveUpdateCapable unused-vars 警告（0错误、1警告）。最终代码与测试已完整重跑。
- `git diff --check` 通过；受影响源码/测试/文档无Git冲突标记。功能实现阶段未进行构建、发布、暂存、提交或推送；后续 Git 写入按第5节追加授权执行。
- 临时证据：`/tmp/irisnote-history-time-page-{typecheck,diff,ui,comparison,history,revisions}.log`，最终完整检查输出摘要 `/tmp/irisnote-history-time-page-check-summary.log`；临时文件不随Git入库。
- 未执行：真机视觉/导航/手势/动画/选择复制/朗读/大字模式；Android/iOS/Web构建；真实云端恢复同步。

## 5. Git 状态与提交建议

- 开始时 codex 分支工作区干净，HEAD 与远端指针一致；本次18个变更文件均来自本任务。未动原有 stash/备份或其他分支。
- git-commit-command 技能在当前可用技能目录中未找到；依真实Git清单生成可复制命令 `/tmp/irisnote-history-time-page-commit.txt`，只包含上述18文件。
- 2026-10-02 09:06:15 UTC 核对本次追加授权，执行范围限定上述18文件；提交标题为 `feat(notes): 编辑时间历史入口与独立正文对比页`，提交正文说明时间语义、草稿快照、独立页面、分段折叠与实际验证。
- 远端目标为 `origin/kroos_vps/codex-a`，正常快进推送；通过命令级 SSH 地址复用已有认证，不修改持久远端配置。推送后独立读取远端SHA与本地HEAD对照，并检查工作区状态。
