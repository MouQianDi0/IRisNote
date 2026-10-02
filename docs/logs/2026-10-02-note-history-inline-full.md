# 历史版本直达详情与全文内差异标注

- 记录时间：2026-10-02 15:32:28 UTC。
- 分支：`kroos_vps/codex-a`；改动基点：`d1655ba67590781ef69f96e2bf6551e01631d0c7`。开始时工作区干净，实现完成时尚未提交或推送；后续用户明确要求推送，授权补记见文末。
- 用户需求：点击历史版本直接进详细对比页；打开即读全文，差异在正文中标注，取消历史/当前行标签；增加正文改动处数。
- 流程：只读调查、实际链路汇报、方案与文字预览、模型建议后，用户“确认”，才运行类型基线和修改。完成验证后维护日志及 CHANGELOG；实施确认只授权本地修改；后续用户“推送”补充本次提交与远端推送授权。

## 改动清单（按层）

| 层 | 文件 | 实际改动 |
| --- | --- | --- |
| src/features | components/viewer/note-history-popover.tsx | 气泡只显示摘要列表；点击版本复制草稿和恢复上下文后直接 push 详情，删除 detail/confirm 层、全文节点、旧恢复状态及额外对比按钮；导航失败保留列表与输入，卸载释放快照 |
| src/features | components/viewer/note-history-diff.tsx | 全文统一有序 spans，普通字符只显示一次，红色删除线/绿色下划线只标实际变化；移除源行号、历史/当前行标签、增删前缀和折叠控制；默认开启差异标注开关，关闭读历史原文；增加处数与字符数，段落虚拟化，计算/降级时仍可读全文 |
| src/features | components/viewer/note-history-loading.tsx | 新增可选 compact，原默认160dp加载预留保留，标注计算使用32dp横排；150ms延迟及取消不变 |
| src/features | screens/NoteHistoryComparisonScreen.tsx | 标题“版本详情”，删除双Tab/单独全文ScrollView；恢复按钮及DraftDialog二次确认迁入此页，调用原编辑页回调，确认绑定快照；重复点击、关闭、系统返回保护、失败重试、成功返回及账号/卸载保护 |
| src/features | services/note-history-comparison-session.ts | 快照契约追加 expectedRevisionId、restoreBlockedReason、onRestore；回调仅驻内存，不通过URL或持久化；原账号会话隔离、归属校验、容量和释放逻辑保留 |
| src/features | utils/note-history-diff-rows.ts | 删除双侧行号与Fold/Reveal类型及分段展开算法；按全文spans拆成带换行的虚拟段落，保留双向还原能力 |
| src/core | 无修改 | 复用本地账号访问校验及原编辑器草稿锁、usePreventRemove；无平行草稿会话 |
| src/shared | utils/text-diff.ts | 字符结果新增有序全文spans和changes；按完整片段中的连续增删段统计处数，相邻替换合并；合并共有上下文时正确保留分隔换行，原行API/两侧chunks与预算/取消语义不变 |
| modules | 无修改 | 无原生或依赖变更 |
| tests | editor/history-diff.test.cjs | 25项：保留算法独立LCS/预算等回归；更新全文/开关/紧凑加载/字符样式测试，新增处数与原文投影、共有字只显示一次、完整2000行/空文/重试 |
| tests | editor/history-ui.test.cjs | 9项：列表直接导航、短参数与快照/原恢复回调、失败重试、加载禁用、冲突原因传递；原时间/Hook迟到保护保留，旧气泡恢复测试迁到详情页测试 |
| tests | editor/history-comparison.test.cjs | 16项：本机读取/过期/账号与卸载、页面恢复二次确认/取消/重复/失败重试/成功释放快照后返回/版本指针/冲突/旧确认保护，以及196组跨行投影 |
| docs | 进度与验证/项目编辑器进度.md | 文档0.4.25：最新状态、链路、文件职责和真实验证结果 |
| docs | 进度与验证/IRisNote编辑器核心架构与实施计划.md | 文档0.4.6：当前实现由双侧折叠改为全文标注；原实施历史保留 |
| docs | 进度与验证/IRisNote编辑器阶段3保存版本边界验证清单.md | 3B.5：当前范围与新验证记录，明确真机边界 |
| docs | CHANGELOG.md | 最新记录及修改文件、验证结果 |
| docs | logs/2026-10-02-note-history-inline-full.md | 新增98行，记录本次基点、行为对比、修改原因、真实链路与验证 |

表内src/features文件均相对`src/features/notes/`；tests与docs按对应目录列出。未修改路由入口、NoteViewer、历史服务/仓储、SQLite迁移、同步和网络API。

## 与原代码对比及改动原因

实际检查`git diff d1655ba --`相关文件，并读取基点页面代码核对旧行为。

1. 原来列表选版本调用history.select，在气泡全文详情内再点“查看正文对比”；现在列表直接创建快照并push，全文只在详情页读取一次。去掉多余步骤，让点击历史版本直接到达目标页。
2. 原来默认差异Tab、另有历史全文Tab；变更段分成历史/当前两行，正文有两侧行号和未变化段折叠。现在直接显示全文，统一片段的共有文字只出现一次；默认标注开启，关闭即读历史原文。删除标签、行号、前缀和折叠状态/控件，满足在正文中直接阅读差异的要求；仍保留虚拟化。
3. 原来只显示新增/删除字符数；现在先从有序字符结果计changes，再拆段落渲染，避免两侧投影重复计数。连续非equal片段为一处，相邻删除+插入作为替换计一处；中间有任何共有字符（含换行）分隔则另计一处。标题和分类不计正文统计。
4. 原来计算未完成时整个差异区域显示加载占位；现在先显示历史全文和原始标题，加载只在页头延迟出现。失败或超预算仍显示历史全文，无局部统计，保留重试；开关不重算或重读版本。
5. 原来恢复二次确认在气泡；现在详情页复用公共DraftDialog，原编辑页回调仅通过内存快照传递。恢复仍由原草稿会话锁定、排空和事务完成，避免新增编辑会话。成功重建编辑器会释放token，因此返回成功由本地账号会话和mounted校验确认，不能误把正常释放视作恢复失败；失败结果仍验证原快照。
6. 确认绑定具体快照，提交前重新校验快照，账号A→B→A或换路由不能沿用旧确认。事务期间usePreventRemove阻止移除详情；成功允许本次返回，取消/普通返回没有数据写入。

行为默认值变化单列：移除“默认diff Tab”；改为“直接全文 + 差异标注默认开启”。正文上下文从默认折叠改为全部保留。没有行内增删时显示“与当前内容一致”或“正文无变化”，恢复禁用仍按版本指针，而非内容比较结果。

示例：历史“明天上午去北京”，当前“明天下午去上海”，正文统计2处、新增3字符、删除3字符；全文中“上/下”和“北京/上海”交错出现并各带对应样式，共有“明天、午去”只显示一份。空格/制表符/换行各按一个Unicode码点计数，变化时分别显示·/⇥/↵并带朗读说明。NULL按空串，CRLF统一LF，其他空白与末尾换行保留；复杂emoji仍按码点统计，没有新增字素簇规则。

删除代码的原职责：气泡详情读取/全文/恢复确认由独立页承担；双侧行号、Fold/Reveal及折叠渲染由全文段落布局替代。historyDiffRows生产调用只有差异组件，类型检查确认没有遗留引用；shared.textDiffSections与useNoteHistory.select仍保留原公共契约/测试，未做无关API清理。

## 完整调用链路

~~~text
笔记编辑页 NoteViewerMeta 的最后编辑时间
  → NoteHistoryPopover.open：收键盘/补写草稿 + useNoteHistory.refresh
  → readNoteHistory：本地账号访问校验，SQLite同事务读指针/版本摘要/分类
  → 点击摘要：复制当前实时草稿（含未保存），保存原onRestore/expectedRevisionId
  → createNoteHistoryComparison：仅内存，账号会话/笔记/版本隔离
  → 关闭列表并push /pages/note/history/[id]（URL只有id/revisionId/token）
  → NoteHistoryComparisonScreen：认证与本地owner匹配 + 有效快照
  → readHistoryRevision：本机SQLite读目标，校验归属/schema
  → NoteHistoryDiff：先显示历史全文
      → diffTextWithCharacters：行定位 → 连续变更按码点精化
      → 输出单份有序全文spans、added/removed/changes
      → historyDiffRows → FlatList段落 → Text内字符标注
      → 标注开关关闭：历史原文；开启：复用结果
      → 计算/读取失败重试；超预算保留全文且无局部统计
  → 详情恢复按钮 → DraftDialog确认（关联当前快照）
  → 再校验快照/账号，拒绝当前版本/冲突/重复，保护返回
  → 内存session.onRestore → 原NoteViewer.restoreHistory
  → draft.beginSave：原会话锁定并排空草稿
  → restoreNoteFromHistory → restoreLocalNoteToRevision SQLite事务
      校验归属/指针/草稿会话序号基础版本/账号与原有业务门控
      有变化草稿先生成local-save → 新restore节点 → 更新指针
      条件清旧草稿 + 原子写入既有上传队列
  → 缓存/Notes事件 → draft.endSave(true)重建编辑器/释放旧快照
  → 详情验证原账号会话，解除返回保护并回编辑页
  → 事务失败：endSave(false)，当前输入保留，详情提示重试
  → 既有持久队列在网络/云授权满足时同步
~~~

历史查看和差异计算不写SQLite、不发网络请求。唯恢复调用原有本地事务/上传队列；服务器历史模型、API协议、创建时间/最后编辑时间、版本保存时间和分类回退语义不变。本任务没有双端镜像实现。

## 验证情况

- 改前`npm run typecheck` exit0，已记录基线；新增结果契约后首次类型检查暴露too-large常量的类型过宽，改为明确失败分支类型后重新通过，未用any/忽略规则掩盖错误。
- 改后`npm run typecheck` exit0；直接执行五个相关文件`node tests/editor/...test.cjs`：25+9+16+24+37=111项通过、0失败。
- 行算法与字符算法原有各961组独立LCS/还原核对通过；全文片段/段落196组（14×14）跨行输入分别重建历史与当前，核对增删码点数；完整2000行数据虚拟化，取消/失败/预算/空文/标题分类边界通过。
- 恢复测试实际运行页面事件代码及原本地访问策略，使用可控恢复端口/Promise：确认取消、并发、进行中返回拦截、失败重试、原编辑器释放快照后的成功返回、当前指针/冲突、卸载迟到、换账号/旧确认保护通过。原历史服务24项及版本37项事务回归也通过；这些不代表真机导航或真实服务端同步验收。
- 获准环境`npm run check` exit0：789项中787通过、2跳过、0失败；TypeScript与主题一致性通过，Lint0错误，仅既有`PermissionSettingsScreen.tsx:171`的liveUpdateCapable未使用警告。全量测试耗时61089.834935ms。
- `git diff --check`通过；最终补日志后再检查差异、Git状态和冲突标记。
- 临时证据：`/tmp/irisnote-history-inline-full-{typecheck,diff,ui,comparison,history,revisions}.log`及全量结果摘要`/tmp/irisnote-history-inline-full-check-summary.log`。工具全量输出分批返回且有截断，摘要只保存真实命令/退出码/类型Lint主题信息/最终测试总数，不称完整原始日志。
- 未执行：真机视觉/加载动画/大字模式/跨段选择复制/读屏、原生导航/系统返回/手势实测、Android/iOS/Web构建、真实云端恢复同步。
- git-commit-command技能不在当前可用技能目录，实现完成时按真实Git状态生成显式文件列表的可复制提交命令，后续Git操作按用户追加授权执行。

## Git 授权补记 — 2026-10-02 15:50:17 UTC

- 用户明确要求“推送”，授权将本次15个文件提交并常规推送至origin/kroos_vps/codex-a；已先说明提交范围、标题与远端核对步骤。
- 提交前核对：本地分支正确，工作区仅本次修改，git diff --check通过；SSH读取远端分支仍为基点d1655ba67590781ef69f96e2bf6551e01631d0c7。
- 本轮只补记Git授权，业务代码与此前npm run check通过的内容一致；提交标题为“feat(notes): 历史版本直达全文标注详情并统计改动处数”。推送后核对远端SHA和工作区，实际结果以Git记录与最终汇报为准。
