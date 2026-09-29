# 更新弹窗 Markdown 排版

> 本文记录公共抽取前的实施阶段（含当时行数与检查结果）。最终目录、职责与最终验证见 [Utils 公共 Markdown 组件](2026-09-29-shared-markdown-utils.md)。

- 时间：2026-09-29 04:56:07
- 授权：用户确认本轮方案后实施。
- 基点：4432edc43bc950e4bc51fe4d02f145a271d50936；结果为当前未提交工作区，无结果提交 SHA。
- 对比依据：执行 git diff 4432edc43bc950e4bc51fe4d02f145a271d50936 -- src/features/updates/UpdateDialog.tsx docs/构建发布/android-releases.md docs/构建发布/更新说明编写规范.md，并执行 git diff -- tests/releases/releases.test.cjs、读取新增文件核对。修改前这三个受影响文件无已有工作区改动。已有 AGENTS.md、旧备份删除与 CHANGELOG 历史条目属于本轮之前的变更，保留。

## 改动清单（按层）

- src/features：新增 src/features/updates/release-notes.ts（94 行），解析说明块与行内强调；新增 src/features/updates/ReleaseNotes.tsx（90 行），以原生 Text/View 呈现说明并记忆解析结果；修改 src/features/updates/UpdateDialog.tsx，以 ReleaseNotes 替代单一 Text。
- src/core：无改动。
- src/shared：无改动，使用现有主题颜色。
- modules/：无改动。
- tests：修改 tests/releases/releases.test.cjs，注册 ReleaseNotes 依赖替身以保持原强制更新按钮回归断言；新增 tests/releases/release-notes.test.cjs（100 行），5 项测试覆盖旧说明、混合 Markdown、段落保留、未支持语法、空内容和 12000 字符长文本。
- docs：更新 docs/构建发布/更新说明编写规范.md 的显示约定与兼容范围；更新 docs/构建发布/android-releases.md 的客户端呈现说明；新增本日志；根目录 CHANGELOG.md 顶部追加本轮记录。

## 与原代码对比及原因

1. 原来更新说明与“本次更新”拼在一个 Text 内，Markdown 标记原样展示；现在按标题、段落和条目分块，列表正文换行对齐，并渲染加粗与行内代码，改善层次和阅读间距。
2. 原来四类普通分组标题没有视觉区分；现在“新增功能／体验优化／问题修复／升级提醒”识别为标题，使已发布的纯文本说明也获得排版改善。
3. 保留版本标题、普通段落和不支持的内容；没有复用 settings 的历史说明解析器，因为该解析器会丢弃没有列表项的段落。围栏代码块保留原文，复杂嵌套、转义、表格、图片、HTML 和链接交互不在支持范围。
4. 原来空说明只剩“本次更新”；现在增加“暂无更新说明。”。沿用原 ScrollView 和底部操作区，组件 memo 避免下载进度变化时反复解析不变的说明。
5. 发布工具继续读取 .txt 字符串，文档说明旧客户端与历史更新页的限制，因此默认发布文案仍采用普通标题与列表。无新增依赖。
6. 无更新策略、默认开关或数据语义反转；说明显示从纯文本改为轻量 Markdown 子集，无服务端/数据库变更。

## 完整调用链路

应用挂载或手动检查 → checkForUpdate → 原生模块读取已安装包信息（不可用时读取 Application 信息）→ HTTPS GET /releases/latest → parseRelease 校验 → useUpdateStore.release → UpdateDialog（release 存在才呈现说明）→ ReleaseNotes → parseUpdateNotes / parseUpdateNotesInline → 原生 Text/View → 现有 ScrollView。

离线恢复分支：已有强制更新 AsyncStorage 记录 → 核对安装构建号 → parseRelease → Zustand → 同一显示入口。空文本显示占位文案；普通文本保留；不支持语法保留文本。此展示组件无网络、原生调用或状态回写，无双端镜像实现。既有 Android 支持检查、请求去重、强制更新门控和失败重试由 update-store 保持；不涉及云授权修改、SQLite 写入或用户输入回滚。下载与安装按钮仍调用原有 downloadUpdate / installUpdate。

## 验证情况

- 修改前 npm run typecheck：通过。
- 修改后 npm run typecheck：通过。
- node --test tests/releases/release-notes.test.cjs：5 项通过。
- npm run check：首次 643/644 通过，原弹窗测试缺少新增 ReleaseNotes 的依赖替身（本次引入）；补齐后重新完整运行成功，644/644 通过。TypeScript、Lint（0 错误）、theme:check 均通过。Lint 有既有 PermissionSettingsScreen.tsx:171 的 liveUpdateCapable 未使用警告，该文件未改动。
- git diff --check：通过（仅 Git 行尾转换提示）。
- 受影响文件 Git 冲突标记扫描：未发现。
- Android 构建、真机排版／滚动／字体放大及安装回归：未执行；静态检查与解析测试不代表真机验证。
