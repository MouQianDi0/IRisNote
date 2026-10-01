# 暂存区入口、列表布局与行内编辑

- 日期：2026-09-30（UTC）。
- 修改基点：`151bab7d49abb0f824543336704773055b03ce5c`，分支 `kroos_todo`。
- 对比依据：实际检查 `git diff 151bab7 -- src/features/excerpts/ docs/UI/IRisNote视觉设计规范.md`，新增测试与本日志单独检查；开始时工作区干净。
- 用户已确认文字预览和修改方案；先更新 UI 规范，再实施代码。

## 改动清单（按层）

- `src/features/excerpts/components/ExcerptToolbar.tsx`：移除 Inbox 的 `selected={stashCount > 0}`，保留数量的无障碍说明及四按钮顺序。
- `src/features/excerpts/components/ExcerptStashPanel.tsx`：统一浅灰圆角滚动容器、连续条目；粘贴按钮移到列表下方；公共多行 Input 行内编辑和显式保存/取消；调整连续条目的中心计算，保留拖拽与失败回滚。
- `src/features/excerpts/screens/ExcerptsScreen.tsx`：暂存编辑连接仓储 update，复用操作锁、账号代次校验及刷新入口；移除暂存 edit 表单分支，保留正常摘录编辑、检测候选和合并表单。
- `src/core`、`src/shared`、`modules`：无改动；复用公共 Input、IconButton 与 AppButton，不改原生捕获、系统通知或数据库结构。
- `tests/excerpts/excerpt-stash-panel.test.cjs`：新增 211 行、7 项组件回调回归测试，模拟 React hooks 和宿主边界，执行真实面板状态及回调，不声称覆盖原生布局/手势。
- `docs/UI/IRisNote视觉设计规范.md`：同步入口无常驻选中态、上下顺序、列表规格和行内编辑边界。
- `CHANGELOG.md`、本日志：记录改动、原因、调用链和实际验证。本日志为新增 71 行，职责是记录此次 UI 与保存链路调整。

## 与原代码对比及原因

1. 原来只要暂存条数大于零，Inbox 就保持 selected 蓝色背景。现在普通 ghost 入口始终中性；数量通过标题与无障碍名称呈现，避免把“有内容”误表达为“当前选中”。Timer 会话与搜索展开的选中态保留。
2. 原来粘贴按钮在列表上方，每条独立浅灰卡片留 12dp 间距。现在列表在上、粘贴在下，参考草稿箱统一 `bg-hyper-list`、16dp 圆角裁切容器；条目上下 12dp/左右 16dp，正文 17sp 两行预览。取消序号前缀，正文区域更直接；无列表选中背景、主色文字或勾选。
3. 原来点正文打开 ExcerptFormDialog。现在原位切为公共 `Input multiline size=body`（144dp 高、正文可滚动），完整预填原文，保存/取消使用公共 48dp IconButton。避免额外弹窗切换，同时维持统一输入组件状态。
4. 原来拖拽中心计算包含卡片间 12dp 空隙。现在去掉空隙并同步中心计算，使用各条目实际测量高度；编辑展开/收起仍重新测量，长按排序逻辑与事务保持。
5. 原来的 edit 表单分支及对应提交分支已移除；原职责由面板行内输入与屏幕 onUpdate 承担，其他表单仍复用 ExcerptFormDialog。无数据迁移、默认分隔开关反转或旧数据删除。

## 完整调用链

```text
摘录页工具栏 Inbox（普通 ghost）
  → 打开 DraftDialog + useExcerptStash.refresh
  → ExcerptStashRepository.list(ownerKey)
  → SQLite local_excerpt_stash → Hook 快照 → 连续滚动列表

单击条目正文
  → ExcerptStashPanel 本地 editing={id,text}，完整原文预填公共 Input
  → 输入只改本地状态；取消恢复预览、不写库
  → 保存：savingRef 防重复提交，进入屏幕 runStashAction
  → 仓库 ready/操作锁/ownerKey + generation 校验
  → ExcerptStashRepository.update(ownerKey,id,text)
  → prepareExcerptContent 规范换行并检查空内容/20000 码点上限
  → 事务检查同账号其他条目 content_hash，更新正文和哈希
  → 账号代次复核 → useExcerptStash.refresh → Hook 列表快照
  → saved：结束编辑、收键盘、恢复预览
  → duplicate/异常：保留输入、Input 错误态与错误文案，可修改后重试

长按 250ms → 原有拖拽半高阈值 → 本地实时交换
  → 锁滚动 → 松手完整 ID 排列 → onReorder → runStashAction
  → 仓储 reorder 一次事务重写 local_order → 刷新
  → 失败恢复原显示顺序

列表下方「粘贴到暂存区」
  → 原有 pasteClipboardToStash 单次剪贴板读取 → 仓储 add
  → 刷新条数、显示 2 秒结果提示，弹窗保持打开

「合并保存」
  → 冻结当前快照 → 原有合并表单 → saveMergedStash
  → 本机摘录保存 → removeMerged 仅清理未变快照条目 → 刷新
```

编辑期间其他条目操作、粘贴、清空、合并和拖拽禁用，列表仍可滚动查看。显式关闭弹窗取消未保存编辑；真正提交期间沿用屏幕操作锁拦截关闭。卸载后迟到保存结果不更改面板或关闭新键盘。刷新失败沿用准确提示“操作已完成，但暂存列表刷新失败，请重新打开暂存区”。

本次链路只写本机 SQLite，不经过 Zustand 摘录保存（除原有合并）、同步协调器、HTTP API 或 Android 原生模块；没有新增权限或跨平台镜像实现。

## 验证

- 修改前、修改后 `npm run typecheck`：均通过。
- `node tests/excerpts/excerpt-stash-panel.test.cjs`：7/7 通过，覆盖图标状态、上下顺序、连续中心坐标、取消、重复提交、重复/空内容/磁盘失败保留输入、卸载后迟到结果、拖拽失败回滚。
- `node tests/excerpts/excerpt-stash.test.cjs`：9/9 通过，包含实际 SQLite 事务、账号隔离、排序回滚与合并快照清理。
- 沙箱 `npm run check`：类型、Lint、主题一致性通过；63 个测试文件中 59 通过、4 失败。单独复现发布测试，确认为 `listen EPERM 127.0.0.1` 与 `spawnSync git EPERM` 环境限制；随后获准环境 npm run check 通过（709 项，707 通过、2 跳过、0 失败）。
- Lint：仅既有 `PermissionSettingsScreen.tsx:171` 的 `liveUpdateCapable` 未使用警告，无新增错误。
- 真机视觉、键盘弹出/收起、正文内滚动、列表滚动、拖拽手感与 APK 构建：未执行，待用户真机验收。
