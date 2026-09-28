# Utils 公共 Markdown 组件

- 时间：2026-09-29 05:03:13
- 授权：用户确认将组件放进 Utils，并由更新说明引用。
- 基点：4432edc43bc950e4bc51fe4d02f145a271d50936；结果为未提交工作区，没有结果提交 SHA。执行 git diff <基点> -- src/features/updates/UpdateDialog.tsx tests/releases/releases.test.cjs 核对已跟踪代码，读取新增文件核对新增实现。抽取前未提交版本已在本会话读取，原行为和文件职责有工具输出依据。此前工作区中的 AGENTS 改动和 CHANGELOG 历史记录保留。

## 改动清单（按层）

- src/features：src/features/updates/ReleaseNotes.tsx（最终新增 33 行）改为引用公共 Markdown，只负责更新标题、空说明提示和兼容配置；src/features/updates/release-notes.ts（最终新增 6 行）由解析实现缩减为四类标题配置；src/features/updates/UpdateDialog.tsx 沿用本任务接入 ReleaseNotes 的修改。
- src/core：无改动。
- src/shared：新增 src/shared/utils/markdown/parse-markdown.ts（100 行），纯解析函数和类型；新增 src/shared/utils/markdown/Markdown.tsx（95 行），通用原生渲染组件；新增 src/shared/utils/markdown/index.ts（7 行），统一导出组件、函数及类型。
- modules/：无改动。
- tests：新增 tests/ui/markdown.test.cjs（100 行），承接通用解析测试并验证公共解析无业务默认标题、自定义标题配置不影响围栏原文；tests/releases/release-notes.test.cjs（最终新增 39 行）保留旧说明兼容测试；tests/releases/releases.test.cjs 保留新增组件依赖替身，原有强制更新按钮断言未削弱。
- docs：修改 docs/构建发布/android-releases.md、docs/构建发布/更新说明编写规范.md，记录公共入口和业务配置边界；此前 docs/logs/2026-09-29-update-notes-markdown.md 标注为抽取前阶段记录；新增本日志；CHANGELOG.md 顶部追加记录。

## 与原代码对比及改动原因

1. 提交基点的更新弹窗直接显示纯文本；本任务最终通过公共 Markdown 组件排版标题、列表、加粗及行内代码，保留普通段落、空白分段和未支持语法。
2. 抽取前解析与渲染全部在 features/updates 中，其他页面复用会依赖更新业务域；现在两者统一放在 shared/utils/markdown 下，符合用户指定位置，其他页面通过 import { Markdown } from '@/shared/utils/markdown' 与 <Markdown source={text} /> 使用。
3. 原解析内置四类更新标题；现在 parseMarkdown 默认只识别轻量 Markdown，plainTextHeadings 由调用方按需提供。更新模块使用稳定的模块级配置，维持旧文本的视觉表现，公共组件不携带更新文案。默认行为差异：公共解析不自动把“新增功能”当标题；更新弹窗显式传配置，所以用户侧没有该行为变化。
4. 通用测试迁入 tests/ui，另保留业务兼容测试，避免迁移后静默丢失旧说明分组。未新增依赖、更新策略开关或存储结构变化。

## 完整调用链路

应用挂载或手动检查 → checkForUpdate → 读取安装包信息 → HTTPS GET /releases/latest → parseRelease 校验 → Zustand release → UpdateDialog 的现有 ScrollView → ReleaseNotes（业务标题、空说明分支及四类标题配置）→ Utils/Markdown → parseMarkdown(source, options) → parseMarkdownInline → 原生 Text/View。

强制更新离线分支仍由 AsyncStorage 记录经 parseRelease 校验恢复至同一 Store 和组件入口。通用组件以 source/options 的 memo 依赖复用解析结果，不自带滚动容器，不发请求、不写 Store/SQLite/原生状态；没有双端镜像或新的云授权逻辑。未知语法按文本保留，围栏内容直接显示；空内容提示由更新业务处理。下载、安装、失败重试与草稿安全沿用原有 update-store 链路。

## 验证情况

- 抽取前 npm run typecheck：通过。
- 抽取后 npm run typecheck：通过。
- node --test tests/ui/markdown.test.cjs tests/releases/release-notes.test.cjs：6/6 通过。
- 最终代码 npm run check：成功；TypeScript、theme:check 通过，Lint 0 错误、1 条既有 PermissionSettingsScreen.tsx:171 未使用 liveUpdateCapable 警告，全部 645 项测试通过。日志位于系统临时目录 irisnote-shared-markdown-check.log。
- git diff --check：通过；受影响源码和测试冲突标记扫描未发现遗留。
- Android 构建、真机滚动／字体放大／排版及安装回归：未执行。未创建 Git 提交、未发布。
