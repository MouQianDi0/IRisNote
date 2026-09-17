## 2026-09-18 03:46:15 | 新增功能：新增待办逻辑层设计与独立后端 API 预留契约（设计文档）

- 文件：docs/待办/待办逻辑层设计.md、docs/待办/待办后端API预留契约.md、docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认。本次仅落地方案文档，不实现页面、组件、数据存储、后端路由、云同步、日历或通知，不新增依赖。
- 逻辑层：定义领域模型、UI/表单/业务/仓库边界、内存首版、校验与时间状态刷新、确认/取消/遮罩/返回退出矩阵、自动保存会话结束、编辑字段合并及并发保护、确定筛选排序、原子批量、账号隔离、开发种子与后续验收清单。
- API 预留：定义独立创建/查询/更新/删除、批量及增量端点；字段和默认值、客户端稳定身份、幂等重试、基础版本冲突、设备字段隔离、快照分页、提交序列、删除防复活、游标过期恢复、错误及后端迁移/联调清单。明确为尚未实现的待评审契约，不作为真实后端已支持的证据。
- 时间规格：按用户要求改为 1 分钟步进，小时 0–23、分钟 0–59，允许 09:01、09:37 等任意分钟；原界面设计 v1.1 → v1.2，更新 §5.2 与文档变更记录，保留其余既有设计内容。
- 验证：文档章节顺序、代码围栏、相对 Markdown 链接、11 段 JSON 示例及冲突标记检查通过；原设计内容逆向还原后 SHA-256 与修改前一致，既有 TodoCalendarRail.tsx 哈希未变。普通 git diff --check 提示原设计元信息的 Markdown 双空格换行，保留既有格式；git -c core.whitespace=-blank-at-eol diff --check 通过。不运行 typecheck、应用测试、构建、真实 API 请求、数据库迁移或浏览器/设备验收；未执行暂存、提交或推送。
- 开放决策：云同步启用策略、跨设备时区及夏令时语义、幂等/快照/墓碑保留期限和真实后端存量迁移，均留待独立立项评审。

---

## 2026-09-18 03:12:47 | 优化代码：待办设计文档升版 v1.1，定稿五色状态卡与筛选批量方案

- 文件：docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认（方向确认后指定先改设计文档，代码未动）。为待办列表新方案定稿设计规范，文档 v1.0 → v1.1。
- 设计要点（按方案推荐值写入，待用户审阅数值）：§10 重写为「五色状态体系（底色/强调色五对：不重要 #C5DFFC/#64A9F7、正常 #FDEBC4/#F9C962 基准、重要 #FCCADB/#F76998、已完成 #CDF9DB/#71EF9B、已结束 #E6E8EA/#ACB2B9）+ 顶部筛选栏（全部/待进行/进行中/已过期 + ⏱排序菜单 + 🔍内联搜索）+ 4dp 强调色竖线卡片 + 长按批量模式（删除/标星/置顶）」；状态推导规则（当日完成浅绿、隔日回看灰+删除线、无时刻当天视为进行中）落入 §10.1。
- 弹窗变更：§3 明确新增/编辑复用同一弹窗（标题「编辑待办」、编辑态删除走共享确认弹窗），新增 §3.4 优先级三段行（替代颜色行）；§6 自由颜色选择器 ContainerColorPicker 移出首版；§5.2 增加纯 JS 时间轮盘实现约束（不引原生依赖，保持 Expo Go 可加载）；§9 增加卡片铃铛为展示态的边界。
- 范围与治理：五色状态色定为业务 Token（palette + nativewindColorRefs，theme:sync 生成）；v1 明确内存 store + 种子数据先行验收，持久化/云同步、循环待办、关联笔记、日历写入、通知调度均不在首版；§12 实现顺序、§13 验收清单、§14 决策（新增「已决 v1.1」小节）同步更新；新增 §15 文档变更记录。
- 验证：纯文档变更，typecheck/eslint 不适用；未修改任何源码与主题文件。

---

## 2026-09-17 14:55:23 | 修复问题：固定输入框右侧操作容器的原生层级

- 文件：src/shared/ui/Input/Input.tsx、CHANGELOG.md。
- 已获用户确认。Android 完整原生日志确认：清除应用存储后登录时，密码框右侧眼睛按钮的原生视图仍挂在包装容器 146 下，却被 Fabric 要求插入登录表单容器 182，触发 `The specified child already has a parent` 并使应用退出。
- `Input` 的 `trailing` 包装 `View` 增加 `collapsable={false}`。密码按钮在登录提交时由可点击切换为不可点击、登录完成后恢复时，该包装层将始终保留为独立原生容器，避免视图扁平化改变按钮父级；不改密码显隐、按钮禁用语义、尺寸、间距、登录请求、路由或数据逻辑。
- 调用范围已核对：`trailing` 插槽当前仅由认证字段的密码显隐按钮使用；`InputSave` 明确排除此插槽。无新增依赖。
- 验证：修改前 `npm run typecheck` 通过；修改后 `npm run check` 通过（typecheck、Expo lint、theme:check、147/147 测试，退出码 0），`git diff --check` 通过，未发现 Git 冲突标记。未构建、安装或进行真机登录验证；需使用包含此修复且与原复现包同配置的 Android 安装包验证清除系统数据后的登录、失败后重试和密码显隐。

---

## 2026-09-17 13:57:54 | 优化代码：补充清除系统存储后提交登录闪退的定向诊断日志

- 文件：src/features/auth/screens/LoginScreen.tsx、src/core/navigation/components/SwipeTabsNavigator.tsx、src/features/profile/screens/ProfileScreen.tsx、src/features/notes/screens/NotesScreen.tsx、CHANGELOG.md。
- 已获用户确认。现象为 Android 系统设置清除应用存储后，填写邮箱、验证码和密码并提交登录时闪退；历史崩溃签名为 Fabric `addViewAt` / `The specified child already has a parent`。现有栈未能对应具体业务组件，本次仅补充诊断，不宣称已修复闪退。
- 统一使用 `[IRisNoteCrashTrace]` + JSON 输出阶段与 Unix 毫秒时间戳。登录记录请求返回、会话保存、状态刷新、资料同步、用户中心跳转请求/派发、成功提示请求及失败所在阶段，各阶段包含相对提交开始的耗时；导航记录挂载/卸载、实际激活的 Tab 与索引切换请求；用户中心记录挂载/卸载及存活耗时。
- 笔记页记录挂载/卸载、本地读取、云端获取、对账、列表更新请求、同步完成、失败或账号归属变化导致的跳过，并记录各阶段数量及请求累计耗时；列表数据提交后记录数量。派发路由或提交 React 数据不等同于原生画面成功显示，需与 AndroidRuntime / SurfaceMountingManager 日志对齐判断。
- 新增日志不含邮箱、密码、验证码、Token、用户资料、笔记正文或响应/错误正文；不改 UI、登录请求、会话写入、路由目标、同步对账、排序与列表裁剪策略。无新增依赖、测试或持久化诊断数据。
- 验证：修改前 `npm run typecheck` 未报告错误；修改后 `npm run check` 通过（typecheck、Expo lint、theme:check、147/147 测试，退出码 0），`git diff --check` 通过，四个改动源码未发现 Git 冲突标记。检查基于 HEAD `61054b3cceafc7c98de84545cd30009090d27e70` 加当前工作区；未构建、安装、清除设备数据或进行真机登录复现，需用户使用包含本次日志的应用版本复现后继续定位。

---

## 2026-09-17 13:26:02 | 优化代码：忽略 irisnote-updater Gradle 构建产物并移出误提交缓存

- 文件：.gitignore、CHANGELOG.md（另通过 `git rm -r --cached` 移出 16 个索引文件，本地文件保留）。
- 已获用户确认。`.gitignore` 追加 `modules/*/android/build/` 规则；`git rm -r --cached` 将先前误提交的 16 个构建缓存移出索引：`modules/irisnote-updater/android/build/` 下 8 个 debug 产物（BuildConfig.java、R.jar、R.txt 等）与 `modules/irisnote-updater/android/.gradle/` 下 8 个缓存文件。
- 动机：v3 出包尝试后 git status 被 45 项 build 中间产物刷屏；且规则缺失前已有 16 个缓存文件进入仓库历史。清理后 git status 仅剩真实改动，协作者克隆不再携带二进制垃圾。
- 验证：`git check-ignore -v` 确认 build 与 .gradle 两类路径分别命中新规则（.gitignore:67）与既有规则（.gitignore:64）；暂存删除恰好 16 项。未触碰任何源码，typecheck 不适用。

---

## 2026-09-17 10:31:10 | 优化代码：待办日期轨道间距对齐笔记页轨道节奏

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 已获用户确认（方案+UI 文字预览）。以笔记页左侧分类轨道实测节奏（1272×2800 截图像素扫描+源码互证：条目 50×60、间距 6、节距 66dp）为基准，统一待办页右侧日期轨道。
- `DAY_SIZE=50` 拆分为 `DAY_WIDTH=50`/`DAY_HEIGHT=60`/`DAY_GAP=6`：7 张日期卡高 50→60（宽不变）、容器 gap 2→6；「返回今天」按钮与今天占位高 50→60、上边距 8→6（改用 DAY_GAP 联动节奏）；月份头维持 50×50 与笔记页头像位对应。轨道节距由 52dp 变为 66dp，与笔记页一致。
- 未触碰：轨道总宽 75、页面结构、分隔线 28×2/my-8、AppCalendar 月历弹层（48dp 格，如需统一另行立项）。无新增功能。
- 验证：修改前后 `npm run typecheck` 均 0 错；`npx eslint --no-cache` 单文件通过；无测试引用该组件。UI 待用户真机验收。

---

## 2026-09-17 03:27:16 | 新增功能：笔记排序同步与分层列表设计文档

- 文件：docs/架构指南/笔记排序同步与分层列表设计.md、CHANGELOG.md。
- 新增阶段二正式设计稿：以「排序=已同步字段的推导函数」为总则，服务端 `notes` 增 `updated_at`/`pinned_at`/`starred_at` 三时间戳列（值变化才盖章、互不牵连、服务端唯一盖章方），客户端镜像存储后按 `(is_pinned, is_starred, 层内时间戳, id)` 总序排序，单 FlatList 四段分层（置顶已标星→置顶未标星→标星→普通）。
- 记录行为语义（编辑不打乱层内次序、置顶/重置顶跳层顶）、多设备到达序 LWW 与 `id` 同刻决胜、存量回填建议（`created_at`）、`pinned_order`/`local_order` 退役计划、实施顺序（服务端先行向后兼容→客户端切键→UI 分层须文字预览）与残余风险（批量合法变序仍依赖 RN 上游修复）。
- 2026-09-16 23:46:17 落地的 reconcile 护栏为本设计的兼容层，文档内互相引用。本次只新增文档，未改代码、依赖与构建配置。
- 验证：`npx tsc --noEmit` 通过（0 错，未触及 TS 文件）；检查 Markdown 结构、相对路径引用、`git diff --check` 空白与冲突标记。

---

## 2026-09-16 23:46:17 | 修复问题：同步对账不再抹除本地排序字段，消除启动约 40 秒闪退

- 文件：src/features/notes/data/note-local.repository.ts、tests/editor/revisions.test.cjs、CHANGELOG.md。
- 问题现象：release 包（versionCode 2）连续三次在启动约 40-48 秒时前台闪退，堆栈为 Fabric `addViewAt: failed to insert view at index 13`，根因 `The specified child already has a parent`。
- 问题根源：`GET /notes` 不下发 `local_order`/`pinned_order`，而 `reconcileServerNotes` 对每条已同步行无条件 UPDATE，把 `local_order` 覆盖成服务端数组下标、`pinned_order` 抹成 NULL、`local_updated_at` 刷成当前时间。服务端回包（约 40 秒）后整表排序改变，FlatList（initialNumToRender=8 + maxToRenderPerBatch=6，第 14 格即 index 13）发生整表 key 搬移，撞上 RN 0.86 Fabric 批量挂载"插入先于移除"的竞态而崩溃；置顶顺序每次同步被抹属同一根源的数据丢失。
- 修复方案：UPDATE 前增加逐字段变化检测（title/content/category_id/created_at/is_pinned/is_starred 及服务端提供的排序值），完全无变化的行整行跳过；有变化时排序字段保序回填（`note.local_order ?? existing.local_order`、`note.pinned_order ?? existing.pinned_order`）。效果：同步回包后无实际变化的数据在本地产生逐字段相同的笔记数组，FlatList key 零移动，竞态无从触发；该语义同时是服务端将来下发排序字段（推导排序方案）后的前向兼容层。
- 选择理由：设备侧 dropbox 三次崩溃签名一致（index 13、存活 40-48s）；结构排查排除日历组件（容器子数不足）与重复 id（client_id 负数隔离 + 唯一约束），唯一与"index 13 插入"结构吻合的是笔记列表批量挂载。修复保序而非改列表参数，拔的是触发器本身。
- 风险评估：仅影响"服务端未提供排序字段"时的回填行为（服务端现状即不提供），语义收紧；不触碰正文/版本/同步状态字段与 INSERT 分支。`local_updated_at` 读取方仅 `getLocalNotes` 排序兜底，已排查无隐藏依赖。
- 验证：修改前 `npx tsc --noEmit` 0 错留底；新增 3 个回归用例（无排序字段回包保留本地值且不刷新时间戳、标志变化仍生效、服务端提供排序值时采纳），`tests/editor/revisions.test.cjs` 23/23 通过；`npm run check` 中 tsc/eslint/theme 通过、全量测试 146/147（唯一失败 `tests/releases/source.test.cjs` 为 tar 执行失败，经 git stash 前后对比确认为存量环境问题，与本次修改无关）。真机验证待用户出包：连续多次冷启动并停留超过 1 分钟，确认不再闪退。

---

## 2026-09-16 23:32:21 | 优化代码：新增面向用户的版本更新说明编写规范

- 文件：docs/构建发布/更新说明编写规范.md、AGENTS.md、CHANGELOG.md。
- 已获用户确认。新增 Agent 编写流程、版本与提交范围核实、用户可见内容筛选、通俗文案规则、正文模板、技术记录改写示例及交付检查清单；在 AGENTS.md 增加读取入口。
- 说明文件按版本号和构建号命名，未预留时使用草稿文件名；补充预留时读取文案、普通文本显示和说明长度限制，不自动执行构建、上传、发布或 Git 写操作。
- 验证：修改前后 npm run typecheck 均通过；npm run check 通过（类型、Lint、主题及 144 项测试，0 失败/跳过）；文档链接、Git 差异、空白和冲突标记检查通过。验证基于 HEAD fe77d5b0c4f4ae44f80dda5c09b5d6868a2e805b 加本次未提交文档。本次未生成具体版本说明、构建安装包或进行真机验收。

---

## 2026-09-16 16:28:01 | 优化代码：构建产物按版本号分目录存放

- 文件：scripts/release/cli.mjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认（文件夹命名取仅版本号）。build() 的 APK 与 .apk.json 输出目录由 `dist/releases/` 改为 `dist/releases/<版本号>/`，目录递归自动创建，同版本多次构建共处一夹、靠文件名区分；preparePatches() 的差量补丁临时工作目录同步归入版本子目录。
- 已有顶层旧产物不自动迁移，保留原地；后续 inspect/upload/patches 的 `--apk` 参数需指向新子目录路径，文档示例已同步更新。
- 验证：node --check 语法检查、定向 ESLint、git diff --check 通过；未执行真实构建、上传或发布。

---

## 2026-09-16 16:49:35 | 新增功能：待办创建弹窗与列表设计文档

- 文件：docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 新增待办创建弹窗、公共正文输入、日期时间、容器颜色、笔记关联和待办列表卡片的完整设计规范；布局尺寸、字体、圆角、间距、颜色层级与状态均引用现有 IRisNote 视觉设计和公共组件规范。
- 明确取消创建、确认创建、遮罩点击与系统返回的保存语义；正文非空时遮罩关闭自动保存，空内容不创建，外部日历或通知失败不得丢失本地待办。
- 记录系统日历按场景申请读写权限、本地优先关联笔记、开始时间单次普通提醒以及动态通知不适用于待办/日历场景的边界。本次只修改文档，未实现页面、组件、数据表、依赖或平台权限。
- 验证：修改前后 `npm run typecheck` 均通过；文档完成后检查 Markdown 结构、相对链接、Git 差异、空白错误及冲突标记。未运行应用、构建、浏览器或真机验收。

---

## 2026-09-16 16:18:30 | 优化代码：待办日期轨道月份标题与返回今天按钮

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 日期轨道与右侧栏顶部间隔调整为 0dp，顶部新增 50dp 中文月份标题（如“八月”），标题下复用 28×2dp 分隔线；跨月周优先显示当前周内所选日期的月份，未选中该周日期时取该周中间日所属月份。月份块作为锚点，点击后使用公共 `AnchoredPopover` 打开 `AppCalendar` 快速跳转，选择日期后自动关闭并切换到对应周。
- 原快速跳转左箭头及公共气泡月历替换为 50×50dp 主题色圆角矩形“返回今天”按钮，仅显示 `Undo2` 图标；点击后回到今天所在周并选中今天，到达今天时隐藏整个按钮并保留同尺寸占位。周一至周日七项及 2dp 日期间隔保持不变。
- 真机发现按钮初版因 `className` 与函数式样式互操作而收缩为图标边界，现将 8dp 外间距移至独立外层，按钮本体沿用日期按钮的纯原生样式路径。验证：定向 Expo ESLint、全量 `npx tsc --noEmit`、`git diff --check` 及日历测试 13/13 通过；ADB 实测非今日状态按钮为 50.1×49.7dp，到达今天后按钮节点消失，月份锚点为 50.1×49.7dp。未代替用户点击设备打开气泡验收。

---

## 2026-09-16 16:00:45 | 修复问题：待办日期轨道固定单周与翻周手势

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 根据真机截图与 ADB 布局导出修复右侧日期轨道。旧实现同时挂载前一周、当前周和下一周，未形成固定高度视口，真机实际连续暴露 2025-06-13 至 2025-06-29，并由 ScrollView 回中逻辑造成翻周方向与落点混乱。
- 日期轨道改为只创建当前周 7 个节点，固定从周一排列到周日；标签由“一/二/…”补全为“周一/周二/…/周日”。日期项保持 50×50dp，相邻纵向间隔 2dp。
- 移除三页 ScrollView 与回中逻辑，改为 Gesture Handler 在手势结束时单次换周：上滑进入下一周，下滑返回上一周；快速跳转的左箭头与公共气泡月历保持不变。
- 验证：连接设备 `3B15AL01DR100000` 的修改前布局导出确认轨道越界；修复后定向 Expo ESLint、全量 `npx tsc --noEmit`、`git diff --check` 及日历测试 13/13 通过。设备当前显示“Cannot connect to Expo CLI”，未将新源码加载到真机，因此修复后的视觉与手势仍待重新连接后验收。

---

## 2026-09-16 14:42:13 | 修复问题 / 优化代码：导航器回调类型与 Agent 构建验收规则

- 文件：AGENTS.md、src/core/navigation/components/SwipeTabsNavigator.tsx、tests/notifications/banner.test.cjs、CHANGELOG.md。
- 已获用户确认。新增类型安全、修改前后检查、合并后复验与发布提交核对等七条规则。
- withLayoutContext 使用原始 SwipeTabsNavigator 函数类型，避免 Expo Router 工厂返回的 any 丢失组件属性，恢复 screenLayout 与 tabBar 的回调参数推断；不改变界面和运行逻辑。
- 修改前基线：npm run typecheck 报 tabs/_layout.tsx 三处 TS7031/TS7006。首次完整检查的类型、Lint、主题检查通过；测试 129 通过、1 失败，原因是已提交的通知测试冲突标记。已合并测试冲突，保留后台/停止状态断言、异步等待和清理逻辑，并显式设置前台状态；清理日志冲突标记、保留双方记录。最终 npm run check 全部通过：类型检查、Lint、主题检查、144 项测试（0 失败/跳过）。导航器修改前后转译的 JavaScript 完全一致；定向 diff --check 通过，src/tests/scripts 与本次文档未检出遗留冲突标记。验证基于 HEAD 4af524d 的本次未提交工作区；未执行 APK 构建或真机验收。

---
## 2026-09-16 04:16:59 | 修复问题：Ninja 长路径及 Build Tools 37 签名解析验证完成

- 文件：scripts/release/workspace.mjs、scripts/release/ninja.mjs、scripts/release/cli.mjs、scripts/android/ninja.init.gradle、scripts/release/lib.mjs、tests/releases/workspace.test.cjs、tests/releases/releases.test.cjs、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- Windows 发布改用项目盘短目录与项目专用 Ninja 1.12.1，通过本次 Gradle init script 指定 CMAKE_MAKE_PROGRAM。Worklets、Reanimated、Expo 各架构缓存已核对指向新工具；保留共享 SDK 与全局环境。
- 构建号 2 的原预留提交 2d45ce0ab302094cb99dfc5480bef8eaf0fe4e57 在 D:/iris-build/r-5zeXpb/source 实测：构建前检查及 129 项测试通过，Gradle BUILD SUCCESSFUL，1071 tasks，24m 50s；四种架构原生编译成功，无 manifest still dirty 循环。
- 用户另行确认兼容 Build Tools 37 输出。旧脚本仅识别 Signer #1，新 apksigner 输出 V2 Signer；已增加严格整行匹配，保持多证书、重复及畸形指纹拒绝。13 项相关回归测试通过，定向 ESLint 与 diff --check 通过，正式 inspect 命令实际通过。测试文件补充 Node Buffer 导入与 __dirname 声明。
- 产物：dist/releases/IRisNote-1.0.0-2.apk 及 .apk.json；包名 com.mouqiandi.irisNote，大小 121781286 bytes，SHA256 7dec125ca8589fed872e6729e8e33ae5efe1a0bbcb7dc82abb36c6f4e34a4981。apksigner 校验成功，证书与本地正式配置一致。
- 原构建 CLI 曾在最后证书解析处退出；经独立严格校验导出产物后，修复后的 CLI inspect 再次验证通过。未为解析修复重复进行完整原生编译。
- 未提交代码、上传、发布或安装到设备；设备运行效果仍待验证。完整构建日志：.expo/release-build-2-short-path.log。

---

## 2026-09-16 03:44:48 | 修复问题：Windows 发布构建 Ninja 重生成循环（验证中）

- 文件：scripts/release/workspace.mjs、scripts/release/ninja.mjs、scripts/release/cli.mjs、scripts/android/ninja.init.gradle、tests/releases/workspace.test.cjs、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- 用户确认修复并验证完整构建。Windows 临时源码改用项目盘 iris-build 短路径，允许 IRIS_BUILD_ROOT 覆盖并校验路径；Linux/macOS 保留系统 Temp。
- 新增 setup-ninja 安装项目专用 Ninja 1.12.1，归档和默认二进制均校验 SHA-256；自建及 doctor 检查版本，支持 IRIS_NINJA_PATH 指向用户工具。通过本次 Gradle init script 在 Android 模块 CMake 参数指定工具，不覆盖共享 SDK、不更改全局配置。
- 初步验证：同一旧构建目录下，Ninja 1.10.2 将存在的 Hermes CMake 文件误判为缺失，1.12.1 dry-run 不再出现该误判；短路径及工具版本测试 2 项通过。构建号 2 已在新短目录启动完整构建，日志 .expo/release-build-2-short-path.log，尚未宣称 APK 构建成功。

---

## 2026-09-16 03:20:57 | 修复问题：发布检查中的编辑器与通知测试失败

- 文件：src/features/sync/note-upload-queue.ts、src/features/sync/upload-task-adapters.ts、src/features/notes/data/note-draft.repository.ts、src/features/notes/services/new-note-draft-session.ts、src/features/notes/services/note-save.service.ts、tests/editor/drafts.test.cjs、tests/editor/revisions.test.cjs、tests/notifications/banner.test.cjs、CHANGELOG.md。
- 按用户修复指令收窄队列依赖导入，避免保存模块经汇总入口加载无关 Expo 原生运行时；测试 SQLite 初始化加入真实上传队列迁移，验证保存入队与后续上传两个阶段。
- 测试暴露并修复实际缺陷：显式草稿的文件清理意图作为 removeExplicitFile 布尔值持久化到队列，执行任务时恢复受草稿会话/序号检查保护的清理操作；文件删除失败保留恢复记录。历史无标记任务保持原行为，不猜测删除文件。
- 手动上传增加正在同步状态检查，保留结果未知时禁止重复创建及跨账户访问约束。
- 通知测试按前台异步发布行为等待结果，并新增后台与停止后不发布横幅的回归测试。未改通知业务逻辑，未移除或跳过失败断言。
- 验证：完整 npm run check 成功，类型检查、Lint、主题检查及 129 项测试全部通过；diff --check 通过。测试使用 Node SQLite 和显式网络/文件替身，未作真机或真实服务验收。
- 未提交、构建、上传或发布；发布需提交修复并重新预留构建号。

---

## 2026-09-16 03:15:56 | 修复问题：独立构建的 CSS 声明及笔记保存返回类型

- 文件：src/types/expo.d.ts、src/features/notes/services/note-save.service.ts、CHANGELOG.md。
- 已获用户确认。新增持久 Expo 类型引用，使干净构建无需自动生成的 expo-env.d.ts 也能识别 CSS 副作用导入；为 saveNewNoteLocalFirst、saveEditedNoteLocalFirst、finishDraftSave 显式声明 Promise<NoteSaveResult>，统一可选 draftCleanupPending 的返回类型。
- 验证：正常 TypeScript 检查及编译器屏蔽 expo-env.d.ts/.expo/types 后的全项目检查均通过；Lint、主题检查、diff --check 通过。保存服务修改前后转译出的 JavaScript 完全一致，未改变运行逻辑。
- 完整 npm run check 停在测试阶段：72 通过、3 失败。drafts.test.cjs、revisions.test.cjs 加载 expo-modules-core/src/index.ts 时触发 ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING；banner.test.cjs:135 读取未定义对象的 lifetime 失败。未修改这些测试或扩大业务修复范围，APK 构建仍被检查门槛阻塞。
- 未提交、预留、构建或发布。应用源码修复需提交并重新预留，原构建号仍绑定旧提交。

---

## 2026-09-16 03:07:33 | 修复问题 / 优化代码：筛选发布源码并修复 Windows 中文路径解包

- 文件：scripts/release/source.mjs、scripts/release/cli.mjs、tests/releases/source.test.cjs、docs/android-releases.md、CHANGELOG.md。
- 用户确认先梳理构建输入。按预留提交的根目录清单排除 docs、releases、助手/编辑器目录、已审查的根文档与日志；保留源码、资源、原生模块、配置、测试、脚本、许可证与未知新增输入，不删除原仓库文件。
- Windows tar 显式使用 hdrcharset=UTF-8；在原失败归档上真实解包成功，中文文件名正确；其他平台参数保持不变。
- 验证：真实当前提交导出后核对 343 个文件与 Git blob 内容（332 个文本文件按已有 core.autocrlf 转换换行），原生模块摘要校验通过；15 项发布相关测试、定向 ESLint 与 diff --check 通过。回归覆盖中文、空格、长文件名、许可证、检查脚本、文档排除与已提交源码隔离。
- 未运行 APK 编译、上传或发布。构建号继续绑定原提交，修复导出入口后可重试原编号；应用代码变更需要重新预留。

---

## 2026-09-16 01:44:34 | 优化代码：补充本地发布配置

- 文件：.env.release.local、CHANGELOG.md。
- 按用户授权填写已确认的公开 API 地址和本机 SDK/JDK 路径，并填写项目现有签名文件路径；保留已有配置值，空差量工具路径改为采用默认查找。
- 验证：配置可解析，SDK/JDK/签名文件路径存在。管理令牌、签名密码/别名与证书指纹尚待补充，签名文件正式用途待用户确认；未构建或发布。日志不包含敏感配置值。

---

## 2026-09-16 01:31:59 | 优化代码：发布工具自动加载本地配置

- 文件：scripts/release/env.mjs、scripts/release/cli.mjs、tests/releases/release-env.test.cjs、.gitignore、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- 已获用户确认。所有发布命令自动读取项目根目录 .env.release.local，使用 Node 内置配置加载功能，终端及 CI 已有变量优先；文件不存在时支持纯环境变量，其他读取错误停止命令且不打印配置内容。
- 保持应用 .env.local 独立；确认 .env*.local 忽略规则覆盖发布配置，更新模板复制说明、引号和空值规则。不创建或覆盖真实密钥配置。
- 验证：3 项隔离子进程测试通过，覆盖根路径定位、终端优先及空值、Windows 路径、带 # 的值、可选文件和读取错误；CLI 语法检查、Git 忽略检查及 diff --check 通过。未执行 APK 构建、上传或发布。
# CHANGELOG

## 2026-09-16 15:51:22 | 优化代码：待办页右侧竖向日期轨道与快速跳转

- **变更概述**：待办页将原内容区横向周历移入右侧 75dp 预留栏，改为按周展示的七日竖向日期轨道；日期轨道距栏顶部 30dp，单元格采用与笔记分类图标同级的 50dp 方形基准。今天固定显示主题色，点击其他日期显示淡色选中态；上下翻动切换周，左箭头以公共锚点气泡弹窗打开月历快速跳转。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 移除内容区顶部横向日历，挂载右侧日期轨道。
    - `src/features/todos/components/TodoCalendarRail.tsx` - 新增：竖向周分页、日期状态色和公共气泡月历跳转入口。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 Expo ESLint、`git diff --check` 与 `node --test tests/ui/calendar.test.cjs`（13/13）通过；全量 `npx tsc --noEmit` 仍有 6 个既有错误，位于 `src/app/(tabs)/_layout.tsx`（3）及 `src/features/notes/components/editor/new-note-editor.tsx`（3），本次文件未出现类型错误；未启动浏览器、模拟器或真机。

---

## 2026-09-16 15:37:16 | 优化代码：新增全局 Git 提交命令技能调用规则

- **变更概述**：将“任务完成后强制调用 `git-commit-command` 技能”的持久规则写入全局 Codex 提示词。规则要求技能基于实际 Git 状态区分本次与无关改动、无变更时说明原因，并禁止在用户未明确要求时自动暂存、提交或推送；跨项目全局指令按约定在当前项目日志记账。
- **修改文件列表**
    - `C:\Users\31268\.codex\AGENTS.md` - 全局协作约定新增 Git 提交命令技能调用与 Git 写操作边界。
    - `CHANGELOG.md` - 记录本次全局提示词变更。
- **验证结果**：已完成提示词内容与差异检查；未执行 Git 暂存、提交或推送。

---

## 2026-09-16 15:26:56 | 优化代码：剪贴与待办页面容器互换

- **变更概述**：按确认方案完成剪贴与待办页面的容器职责互换。剪贴页移除右侧工具栏预留和内容圆角，白色内容区撑满可用宽度；待办页恢复原有 AppCalendar，并采用左侧内容区加右侧 75dp 预留栏的横向结构，右侧栏与笔记分类栏的宽度和背景保持一致。既有剪贴、待办页面顺序调整保持不变。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 移除右侧 75dp 栏与圆角内容卡片，改为全宽、无圆角的剪贴内容区。
    - `src/features/todos/screens/TodosScreen.tsx` - 恢复 AppCalendar，改为内容区与右侧 75dp 预留栏的横向布局。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 Expo ESLint 与 `git diff --check` 均通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 14:22:17 | 新增功能：公共日历组件待办跟踪文档

- **变更概述**：应用户要求在 `docs/待办/` 新建日历组件专线跟踪文档（与既有 `待办事项.md` 公共组件线同模式）。内容：① 记录 AppCalendar 周月双形态（路线 B）当前落地进度——规范 v1.1、依赖安装、五个源码文件与 Date ID 工具、待办页 12dp 挂载、13/13 单元测试与静态检查（commit 12679b9，工作区干净）；② 沉淀六项关键裁定史（路线 B 定案、矩形圆角 16dp、单分隔线、周视图交互、挂载间距、范围外事项）防反复；③ 链接规范/公共组件规范/FlashCalendar 调研/节假日数据源调研/TODO 总索引/CHANGELOG 条目六份关联文档；④ 补充剩余清单四组：验收类（真机对账、手势、无障碍、视觉验收）、实现类（AppCalendarList、待办页业务联动、日历弹窗）、路线 B 三项已知取舍处置、节假日数据源两项待决策。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/待办/公共日历组件待办.md` - 新增：公共日历组件待办跟踪文档（首版）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：文档内 6 个相对链接目标逐一核对存在；进度事实摘自规范 v1.1 §9/§10、CHANGELOG 2026-09-16 10:58:50 条目与 git log（12679b9，`git status --short` 干净）；未启动浏览器、模拟器或真机。

---

## 2026-09-16 10:58:50 | 新增功能：日历公共组件 AppCalendar（周月双形态，路线 B）并挂载待办页

- **变更概述**：按已确认计划（路线 B：flash-calendar）实现日历公共组件族并首次挂载。① 新增 `AppCalendar`：周视图（收起态单周条，左右分页翻周、滚动窗口边缘静默重建近似无限翻页、跨月日期正常渲染）与月视图（44dp 标题行 + IconButton compact ghost 导航翻月、min/max 钳制）双形态；下滑展开、上滑收起（垂直位移 >14dp 判定 + 220ms 高度动画），展开/收起按选中值锚定。选中/今日为整格 48×48 矩形圆角（radii.control 16dp 连续圆角，用户裁定取代 v1.0 的 40dp 圆），今日 surfaceSelected 底蓝字，范围中段全宽色带端点仅外侧圆角；唯一分隔线在表头行底（用户裁定，标题行下不画），分隔线到首行日期 0dp（主题容器负 margin 抵消库内 4dp 统一间距）。② 周条与月视图共用 CalendarTheme 映射（模块级常量，引用稳定）与 flash-calendar 日格积木（Calendar.Item.Day/WeekName + buildCalendar 周行元数据）。③ 选值状态机：single 再点不取消；range 起点→终点→早于起点重设→第三击重来，受控/非受控并存（外部值回显保留内部阶段）。④ Date ID 全链路本地时区工具（toDateId/fromDateId 等，杜绝 UTC 偏移）。⑤ 待办页（第二页）挂载：容器上边框下 12dp，周视图默认，受控单选。AppCalendarList 契约保留未实现（无调用方）。已知取舍（用户确认路线 B 时知情）：flash-calendar 无逐格无障碍标签注入点；范围内禁用日显示选中态。
- **修改文件列表**
    - `src/shared/utils/date-id.ts` - 新增：Date ID 本地时区工具（toDateId/fromDateId/addDays/addWeeks/toMonthId/addMonths/startOfWeekId/formatMonthTitle/weekdayLabels 等）。
    - `src/shared/ui/Calendar/calendar-logic.ts` - 新增：纯逻辑（single/range 选值状态机、toActiveDateRanges、锚定与收起/展开目标计算、月份导航钳制、周滚动窗口）。
    - `src/shared/ui/Calendar/flash-calendar-theme.ts` - 新增：视觉规格常量 + CalendarTheme 映射（矩形圆角状态表、表头 gap 归零与 0dp 间隔负 margin、activeDayFiller 补缝色）+ 模块级格式化函数。
    - `src/shared/ui/Calendar/WeekStrip.tsx` - 新增：收起态周条（分页 ScrollView 滚动窗口 + flash-calendar 日格复用 + 星期表头）。
    - `src/shared/ui/Calendar/AppCalendar.tsx` - 新增：主组件（月视图标题行/导航、flash-calendar Calendar 承载、viewMode 受控/非受控、PanResponder 手势、高度动画）。
    - `src/shared/ui/Calendar/index.ts` - 新增：组件族导出。
    - `src/shared/ui/index.ts` - 追加 AppCalendar 及类型导出。
    - `src/features/todos/screens/TodosScreen.tsx` - 挂载 AppCalendar（pt-3 = 距容器上边框 12dp，initialViewMode="week"，受控单选状态）。
    - `tests/ui/calendar.test.cjs` - 新增：13 项 Node 单元测试（时区往返/闰年/跨月/周起点/状态机全语义/钳制/锚定/窗口）。
    - `docs/UI/日历公共组件规范.md` - 升级 v1.1：周视图双形态、矩形圆角状态表、单分隔线裁定、路线 B 定案与取舍、验收清单勾选、§10 实现勘误。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：`npx tsc --noEmit` 新增/修改文件零错误（仓库另有 6 处未触碰文件的既有错误：`_layout.tsx` ×3、`new-note-editor.tsx` ×3）；定向 `npx eslint --no-cache` 全部通过（tests 目录按项目惯例不参与 eslint，与既有测试一致）；`node --test tests/ui/calendar.test.cjs` 13/13 通过；全量 `npm test` 82/84，2 个失败为 `tests/editor/drafts|revisions.test.cjs` 的既有环境问题（Node 24 拒绝对 node_modules/expo-modules-core TS 源码做类型剥离，与本次改动无关）。未启动浏览器、模拟器或真机；真机对账与视觉验收待用户执行。

---

## 2026-09-16 07:56:02 | 优化代码：剪贴板页预留右侧工具栏

- **变更概述**：剪贴板页在内容卡片右侧预留与笔记页分类栏相同的 75dp 工具栏栏位，沿用应用背景与现有卡片的右上角圆角；当前仅保留布局空间，未接入工具操作。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 将页面改为内容区与右侧工具栏栏位的横向布局。
    - `CHANGELOG.md` - 记录本次剪贴板工具栏预留。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

## 2026-09-16 07:52:27 | 优化代码：剪贴板页镜像笔记容器

- **变更概述**：剪贴板摘录页采用与笔记页对应的容器布局：顶部 15dp、应用背景、白色内容卡片、16dp 内容内边距与底部 8dp 间距；卡片使用右上角内容圆角，并按镜像方向保留上、右、下边框。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 使用镜像笔记页的剪贴板内容容器承载现有占位内容。
    - `CHANGELOG.md` - 记录本次剪贴板页容器调整。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:47:46 | 新增功能：通知渠道适配文档（Android / iOS / 鸿蒙调研）

- **变更概述**：应用户要求，产出三平台系统通知能力调研与适配文档，按普通/重要/动态三分类对照。关键结论：① Android 渠道自由度最高（任意自建 NotificationChannel，importance 建后锁死、用户可全量覆盖，HIGH 即第三方打扰上限）；iOS 无渠道概念、分级随单条通知（passive/active/timeSensitive/critical，critical 需 Apple 特批、笔记类不适用）；鸿蒙为固定 7 类 SlotType 枚举白名单制（SERVICE_INFORMATION 默认即 LEVEL_HIGH 横幅，LIVE_VIEW 渠道三方不可直接创建，须走 Live View Kit 系统代理 + AGC 场景审核）。② 动态通知：Android 16 Live Updates 政策明令禁止"即将到来的日历事件"，鸿蒙实况窗 11 类模板场景无笔记类且 8 小时上限、需 AGC 申请，iOS Live Activities 需持续变化实时内容——三平台均无本项目合规场景，动态通知暂不立项。③ 项目侧盘点：系统通知零实现（无 expo-notifications 等任何依赖，设置页为 disabled 占位"规划中"），需求散落于 TODO.md L72、后续开发指南 §14、视觉设计规范"系统通知必须独立立项"约束、服务端手册 §19 远期推送；已实现的 src/core/notifications 为应用内横幅，与系统通知分层并行。④ 给出渠道映射草案（提醒=HIGH/timeSensitive/SERVICE_INFORMATION，回执=LOW/passive/CONTENT_INFORMATION）、Expo SDK 57 落点（expo-notifications 渠道 API 与 interruptionLevel 均已支持、Live Activities 不在其内、鸿蒙无 Expo 构建目标）与风险清单（Android 14+ 精确闹钟收紧、鸿蒙授权弹窗仅一次等）。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/UI/通知渠道适配.md` - 新增调研与适配文档（版本 1.0）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：平台事实均以官方文档当日核验（Android developer 文档 Live Updates 硬性要求与政策禁项、Apple HIG 与 WWDC21 时效性通知、华为实况窗文档 8 小时/准入原则/AGC 申请、OpenHarmony API 参考 SlotType/SlotLevel 枚举值与 requestEnableNotification 单次弹窗机制、Expo v57 notifications SDK 文档 API 清单）；项目侧结论来自全库检索（依赖、android 构建配置、src/ 通知引用、docs 需求出处逐条核对）。

---

## 2026-09-16 07:48:32 | 优化代码：待办页仅保留上边框

- **变更概述**：待办主容器增加与笔记页主内容卡片一致的 1dp 上边框；左右及底部边框、阴影和分页虚线保持移除，容器仍全高铺满。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 主容器增加 `border-t border-note-page-border`。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:46:55 | 优化代码：撤销笔记页左边框隐藏

- **变更概述**：按用户指令撤销上一轮笔记主内容卡片左边框隐藏，恢复其上、左、下边框；待办页无边框、无阴影、无分页虚线的当前状态不变。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 恢复主内容卡片左边框。
    - `CHANGELOG.md` - 记录本次撤销。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:45:18 | 修复问题：隐藏笔记页左侧分页边框

- **变更概述**：笔记页主内容卡片移除左边框，避免横向切换时其随场景平移至待办页交接位置形成残留竖线；保留上、下边框、圆角、间距及笔记业务逻辑。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 主内容卡片改为仅上、下边框。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：待执行定向 ESLint 与差异空白检查；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:41:51 | 修复问题：移除待办页分页虚线

- **变更概述**：删除待办页左侧中段虚线分割 View，横向分页切换不再显示任何人为分页线；待办容器继续保持无边框、无阴影与全高铺满。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 删除绝对定位的分页虚线。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:38:12 | 修复问题：移除待办页分页侧向阴影

- **变更概述**：待办主容器移除 `shadow-lg`，使横向切换时顶部和底部不再出现连续的左右投影线；保留白色背景、全高布局及左侧中段浅色虚线。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 删除主容器侧向阴影类。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:35:09 | 修复问题：隐藏笔记页右侧分页边框

- **变更概述**：笔记页主内容卡片移除右边框，避免横向切换至待办页时露出连续分页竖线；保留上、左、下边框、圆角、内容间距与现有笔记业务逻辑。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 四周边框改为仅上、左、下边框。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:32:57 | 修复问题：待办页无边框铺满容器

- **变更概述**：移除待办主卡片上、右、下实线边框以及 8dp 底部外边距，卡片自顶部 15dp 铺至页面底部；保留左侧中段浅色虚线，避免横向分页时出现连续左右边界线。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 主卡片改为无四周实线、无底部留白的 `flex-1` 容器。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:21:45 | 修复问题：减弱待办页交接分割线

- **变更概述**：移除待办主卡片左侧贯穿全高的实线边框，避免其覆盖交接虚线造成分页边界过于明显；保留中间 50% 高度的虚线，并改用 `divider` 色与 50% 不透明度。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 左侧边框改为无边框，仅保留中段浅色虚线。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:36:33 | 优化代码：待办页连续卡片容器

- **变更概述**：待办页占位内容改置于与笔记页主内容区同高的白色底层卡片；卡片保留笔记页边框和阴影层级、不使用圆角，并在左侧交接边缘增加仅覆盖容器中间 50% 高度的虚线，使横向切换笔记与待办时页面边界连续可辨。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 新增待办主内容卡片、左侧中段虚线分割线与内容内边距。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git diff --check` 通过。定向 ESLint 与 `tsc --noEmit` 均因当前 WSL 1 无法解析 Windows Node.js 安装目录而未启动，未产生代码诊断；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:25:18 | 新增功能：节假日数据源调研与选型文档

- **变更概述**：应用户要求实测五类节假日数据源（date-holidays / Nager.Date / Calendarific / Abstract Holidays API / 中国专项）并落成调研文档。核心实测结论：全球库均不掌握中国"放假安排"（date-holidays 2026 春节仅 2/16–18 三天、Nager CN 仅 6 条单日，实际春节休 2/15–23 且 2/14、2/28 补班）；chinese-days 的 isWorkday/isInLieu/调休区间实测全对（含 10/10 补班周六判定，附赠农历互转与 24 节气）；chinese-workday npm 包 CJS require 直接报错（打包缺陷）；timor.tech API 被 Cloudflare 人机校验拦截。文档给出「本地双源 + 每年更新」分层选型：中国查询层用 chinese-days、全球覆盖用 date-holidays（推荐构建期生成精简 JSON，10.97 MB 全量不可进 RN bundle）、更新通道挂 holiday-cn + 应用内更新，并附 HolidayProvider 统一接口草案衔接 /日历 命令、AI 日程与 AppCalendar 七态打点；另勘误原对比表（Nager 实测 204 国、date-holidays 206 国、全球库"中国调休✅"均为误标）。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/学习参考/节假日数据源调研与选型.md` - 新增调研文档。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：数据均为当日实测——Nager.Date 公开 API 实调（CN 2026 六条、AvailableCountries 204 国）；holiday-cn 2026.json 拉取核对（国庆 10/1–7 休、9/20 与 10/10 补班真值）；date-holidays / chinese-days / chinese-workday 于临时目录 npm 安装后 Node 实跑（isHoliday/isWorkday/getHolidaysInRange 输出、包结构 exports 与 `require("fs")` 依赖检查）；GitHub API 核对星数/推送时间/协议（date-holidays 1101★、Nager.Date 1410★、chinese-days 1292★、holiday-cn 2.1k★）；Calendarific 免费档 500/月为官网口径（未注册实测），Abstract 免费档为第三方口径并已在文中标注。

---

## 2026-09-16 06:06:55 | 新增功能：安装日历库依赖 flash-calendar 与 flash-list

- **变更概述**：按用户指令为日历公共组件（见 `docs/UI/日历公共组件规范.md`）启动技术路线 B，执行依赖安装。`npx expo install @shopify/flash-list @marceloterreiro/flash-calendar`：flash-list 由 Expo SDK 57 的 bundledNativeModules 自动定版 2.0.2（官方第三方库列表在列，Expo Go 可用），满足 flash-calendar v2.0.0 的 peer 要求 `@shopify/flash-list >= 2.0.0`；flash-calendar 安装 ^2.0.0（node_modules 实际 2.0.0，dist 入口与类型文件完整）。仅依赖变更，未写任何业务代码。
- **修改文件列表**
    - `package.json` / `package-lock.json` - 新增 `@shopify/flash-list@2.0.2`、`@marceloterreiro/flash-calendar@^2.0.0` 两条依赖。
    - `node_modules`（不入库）- 随安装更新。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：`npx expo install` 退出无错误（尾部仅既有 audit/allow-scripts 提示）；package.json 与 node_modules 双侧版本核对一致（flash-list 2.0.2、flash-calendar 2.0.0）；flash-calendar 包 `dist/index.js` + `dist/index.d.ts` 入口存在。SDK 57 文档 `/versions/v57.0.0/sdk/flash-list` 确认 flash-list 属官方支持第三方库。注意：FlashList 含原生代码，若后续在未内置该版本的 Expo Go 上加载失败，需升级 Expo Go 至 SDK 57 版或改用 dev build。

---

## 2026-09-16 06:02:09 | 新增功能：日历公共组件规范文档（AppCalendar / AppCalendarList）

- **变更概述**：应用户要求，按《IRisNote视觉设计规范》《公共组件规范》的 Token 体系与文档体例，编写日历公共组件的目标规范（未实现）。定义 AppCalendar（单月含导航）与 AppCalendarList（多月滚动）两组件：布局总览 ASCII 图含关键间距标注（单元格 48×48dp 水平无缝、行距 4dp、选中圆 40dp、月份行 44dp、表头 32dp、分隔线 1dp）、日期格七态样式表（默认/今天/选中/范围中间/按压/禁用/非本月，全部映射 semanticColors 语义 Token）、Date ID 数据契约（禁手工 toISOString 转换）、single/range 两种模式的受控 props TS 契约与点击语义、无障碍规格、技术实现路线（路线 A 纯自绘零依赖 vs 路线 B 基于 flash-calendar 的 theme 映射表，并警示项目未安装 FlashList 而 flash-calendar v2 硬性要求 ≥2.0.0）、验收清单。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/UI/日历公共组件规范.md` - 新增组件规范文档（版本 1.0）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：样式数值全部取自既有规范原文（17sp/13sp 字号档、#007AFF 品牌蓝、surfaceSelected #EAF2FF、divider #E0E0E0、pressedOpacity 0.85、borderCurve continuous、IconButton compact 40×40/触控 44 规格）；项目未安装 @shopify/flash-list 的事实经 package.json 核实；`src/shared/ui/` 落位与导出方式经目录核实。

---

## 2026-09-16 05:45:09 | 新增功能：Flash Calendar 调研与自定义方案文档

- **变更概述**：应用户要求调研 React Native 日历库 Flash Calendar（marceloprado/flash-calendar，npm `@marceloterreiro/flash-calendar` v2.0.0，MIT，1505 stars），并将调研结果落成文档。内容含项目概况、核心特点（FlashList 驱动、6kb gzip、仅依赖 mitt、Date ID 时区安全）、组件与核心 API（Calendar / Calendar.List / useDateRange 等）、四个层级的自定义方案（theme prop 三态函数、布局格式 props、组件自组合、行为级定制）、IRisNote 集成注意事项（重点：v2.0.0 peer 依赖要求 @shopify/flash-list >= 2.0.0）、参考链接。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/学习参考/FlashCalendar_调研与自定义方案.md` - 新增调研文档。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：数据来源均为当日实测核对——GitHub API（stars/协议/最近提交时间）、npm registry（dist-tags/peerDependencies）、官方文档站（usage/customization/tips-and-tricks）、源码（`tokens.ts` 色板、`Calendar.tsx` 的 `CalendarTheme` 类型、`CalendarThemeProvider.tsx`）。

---

## 2026-09-16 04:31:56 | 修复问题：重写提交消除行尾符假差异污染

- **变更概述**：经用户确认，将 c3993a3（优化 tab ui，因行尾转换失效夹带约 300 个文件的 CRLF 假差异并已经 PR #94 合入 master）重写为规范化版本：回退到 de3fb17 后新增 `.gitattributes`（`* text=auto`）并 `git add --renormalize`，纯行尾文件与污染前逐字节相同自动剔除，重做提交仅含 58 个真实改动文件 + `.gitattributes`，并保留原提交时间戳。随后强推 kroos 与 master（--force-with-lease）。协作者需 `git fetch` 后 `git reset --hard origin/master` 重新对齐；PR #94 在 GitHub 上仍显示 Merged 但提交已被替换，属预期外观现象。
- **修改文件列表**
    - `.gitattributes` - 新增，声明 `* text=auto` 锁定行尾规范。
    - `CHANGELOG.md` - 记录本次修复。
    - （其余为 c3993a3 原有的 58 个真实改动文件，内容不变，仅存储行尾恢复 LF。）
- **验证结果**：重做提交相对 de3fb17 的 diff 仅含真实改动文件（LICENSE 等纯行尾文件 blob 哈希与 de3fb17 一致）；强推后 origin/kroos 与 origin/master 指向重做提交。

---

## 2026-09-16 03:17:05 | 优化代码：codegraph 本地数据库三文件脱离 git 跟踪

- **变更概述**：经用户确认，对 .codegraph/codegraph.db（约 10MB）、codegraph.db-shm、codegraph.db-wal 执行 `git rm --cached`，暂存区写入删除跟踪记录（D），磁盘文件保留。三者脱离跟踪后由 `.codegraph/.gitignore` 已有的 `*` 规则（忽略目录内除自身外一切）接管，无需修改根 .gitignore。协作者拉取该提交时本地这三个文件会被 git 删除，codegraph 会自动重建，无损失。
- **修改文件列表**
    - `.codegraph/codegraph.db`、`.codegraph/codegraph.db-shm`、`.codegraph/codegraph.db-wal` - 仅移出 git 索引，文件内容未改动。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认三条 D 记录已入暂存区；`ls` 确认文件仍在磁盘（10002432/32768/0 字节）；`git check-ignore -v` 确认 `.codegraph/.gitignore:4:*` 接住三者。未提交。

---

## 2026-09-16 03:13:48 | 优化代码：debug.log 等四个运行时文件脱离 git 跟踪

- **变更概述**：经用户确认，对 debug.log、tmpwebapp-node-modulesprepare.log、.codegraph/daemon.log、.codegraph/daemon.pid 执行 `git rm --cached`，暂存区写入删除跟踪记录（D），磁盘文件保留。该记录将随下一次 commit 提交，之后四个文件成为未跟踪文件并被 `.gitignore` 的 `*.log`/`*.pid` 规则忽略，不再出现在 status 中。注意：协作者拉取该提交时本地这四个文件会被 git 删除（运行时自动再生，无损失）。
- **修改文件列表**
    - `debug.log`、`tmpwebapp-node-modulesprepare.log`、`.codegraph/daemon.log`、`.codegraph/daemon.pid` - 仅移出 git 索引，文件内容未改动。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认四条 D 记录已入暂存区（另有并行会话的 `D src/core/navigation/hooks/useSwipeTab.ts` 非本次产生）；`ls` 确认四个文件仍在磁盘。未提交。

---

## 2026-09-16 03:09:33 | 优化代码：清理暂存区垃圾文件并补全忽略规则

- **变更概述**：推送 kroos 后清理混入暂存区的构建缓存与日志文件，并补充 .gitignore 规则防止再次混入。注意：debug.log、tmpwebapp-node-modulesprepare.log、.codegraph/daemon.log、.codegraph/daemon.pid 是历史已跟踪文件，本次仅移出暂存区，未脱离跟踪（需另行确认后执行 git rm --cached 才能让忽略规则对其生效）。
- **修改文件列表**
    - `.gitignore` - 新增 `.gradle/`（覆盖 modules/* 子项目缓存）、`*.log`、`*.pid` 忽略规则。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认 8 个 `modules/irisnote-updater/android/.gradle/` 缓存文件已回到未跟踪状态并被忽略；4 个已跟踪日志文件回到未暂存修改状态。未做其他文件改动，未提交。

---

## 2026-09-16 02:36:43 | 修复问题：悬浮 Tab 改为先路由再播放点击动画

- **变更概述**：点击非当前 Tab 时立即路由，目标页成为当前页后再由蓝色图标播放 35dp → 17.5dp → 35dp 的两段 200ms 动画，避免路由更新吞掉放大阶段；点击当前 Tab 仍直接播放动画且不重复路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将路由与动画请求解耦；使用共享目标状态在路由生效后触发动画，连续点击只保留最后目标，开始滑动时取消待播放的点击动画。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与限定范围 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认先路由后动画、当前页重复点击、快速连续点击和点击后立即滑动四类行为。

---

## 2026-09-16 00:21:12 | 优化代码：悬浮 Tab 支持连续点击反馈

- **变更概述**：悬浮 Tab 的不同目标连续点击、路由前重复点击同一目标、以及重复点击已选中 Tab 均会播放 35dp → 17.5dp → 35dp 的两段 200ms 动画。前两种仅保留最后一次非当前 Tab 点击的路由；已选中 Tab 只播放蓝色动画，不重复路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将目标、会话号和是否路由合并为原子点击请求，保证快速连点的旧动画/旧路由被取消，并开放已选中 Tab 的无路由点击反馈。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认三种连续点击行为、路由次数及点击后立即滑动取消。

---

## 2026-09-16 00:16:33 | 修复问题：悬浮 Tab 放大动画改由真实缩放链驱动

- **变更概述**：修复点击 Tab 后放大动画仍可能因路由与间接状态反应同帧竞争而丢失的问题。点击目标图标现在由自身的实际缩小动画完成回调直接切蓝并启动 200ms 放大，随后并行派发路由；放大不等待路由结果，也不再依赖父组件的阶段信号或占位计时器。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将点击缩小、变蓝、放大和路由串成单一 UI 线程动画链；删除 `clickPhase` 与 `clickTransitionProgress`，保留会话号对快速连点和滑动取消的保护。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认 35dp → 17.5dp → 35dp 的两个 200ms 阶段、变蓝与路由，以及快速连点和点击后立即滑动的取消行为。

---

## 2026-09-16 00:08:28 | 修复问题：悬浮 Tab 路由抢占蓝色放大动画

- **变更概述**：第 200ms 切蓝后，先在 UI 线程登记蓝色图标由 50% 放大至 100% 的 200ms 动画，再异步派发路由；不监听、不等待路由完成或成功结果，避免导航更新抢占并丢失放大反馈。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 调整点击完成回调中的动画初始化与路由派发顺序。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认点击后的完整蓝色放大与页面切换并行。

---

## 2026-09-16 00:04:03 | 修复问题：悬浮 Tab 延迟路由被过期会话错误取消

- **变更概述**：修复非当前悬浮 Tab 点击后，图标完成前 200ms 灰色缩小却未变蓝、未切换页面的问题。点击会话号改为先计算并缓存新值，再写入 UI 共享状态；后续 UI 线程动画完成回调使用同一值校验，因此可继续执行变蓝、路由与蓝色放大。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 统一点击会话号的写入值与延迟动画完成后的校验值，避免 JS/UI 线程时序导致正常点击被当作过期会话。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需在真机确认第 200ms 的变蓝与页面切换、蓝色放大、连续点击及点击后立即横滑取消。

---

## 2026-09-15 23:57:41 | 优化代码：悬浮 Tab 点击改为延迟变蓝的两段缩放

- **变更概述**：点击目标 Tab 后，图标先以灰色在 200ms 内缩小到 50%；第 200ms 同步切换为蓝色并路由，再在 200ms 内放大到 100%。快速连续点击或开始滑动会取消旧会话的变色、放大和路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 用私有点击目标、阶段与会话共享值替换 `pulse`，实现两段缩放、延迟变色及路由取消。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认灰色缩小的完整 200ms、变蓝与路由同帧、蓝色放大，以及快速连续点击和点击后立即横滑的取消行为。

---

## 2026-09-15 23:52:14 | 优化代码：恢复悬浮 Tab 的点击选中动画

- **变更概述**：恢复点击非当前 Tab 时目标蓝色图标的原 `pulse` 反馈（0.5 秒、`ease-out`、透明度 0.5 与缩放 0.6 回到正常）。点击会同步图标颜色并取消尚未完成的滑动延迟路由；横向滑动焦点缩放不触发该动画。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增点击动画版本状态、目标图标 `pulse` 和点击对过期滑动导航的取消。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认连续点击不同 Tab、点击后立即横滑，以及点击当前 Tab 不重复播放的行为。

---

## 2026-09-15 23:47:36 | 优化代码：悬浮 Tab 改为焦点缩放后路由

- **变更概述**：横向滑动进入图标焦点时，图标在 200ms 内缩小到 50%；焦点离开时在 200ms 内还原。重复或反向途经会从当前缩放值平滑切换。成功松手后，最终焦点图标先完成还原，再路由到目标页面；新滑动会取消旧的待执行路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 删除途经抖动，改为 UI 线程焦点缩放、最终放大完成后的延迟路由和过期路由取消。
    - `src/shared/theme/motion.ts` - 删除不再使用的 `tabShake`；右侧按钮的循环 `shake` 保持不变。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、反向滑动、松手后 200ms 路由及立即开始下一次滑动的取消行为。

---

## 2026-09-15 23:39:03 | 修复问题：恢复右侧操作按钮的循环抖动

- **变更概述**：恢复右侧 35dp 操作图标原有的 2 秒无限循环抖动及末段摇摆节奏；左侧滑动途经 Tab 保留即时单次抖动，两者使用独立关键帧，互不影响。
- **修改文件列表**
    - `src/core/navigation/components/FloatingActionButton.tsx` - 恢复 `shake` 的 2 秒、无限循环、`ease-in-out` 动画包裹。
    - `src/core/navigation/components/FloatingMenu.tsx` - 左侧途经 Tab 改用专用 `tabShake`，仍按跨过图标中心时单次触发。
    - `src/shared/theme/motion.ts` - 恢复原 `shake` 关键帧，并拆出立即摇摆的 `tabShake`。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx`、`FloatingActionButton.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认右侧完整 2 秒循环，以及左侧慢拖、快速横拖、反向滑动时的单次抖动。

---

## 2026-09-15 23:33:20 | 优化代码：悬浮 Tab 图标放大并按滑动途径抖动

- **变更概述**：左侧悬浮 Tab 移除可视文字标签，图标从 24dp 放大为与右侧操作按钮一致的 35dp。横向滑动变色期间，每个被手指途经的图标立即播放一次抖动；右侧操作按钮不再持续循环抖动。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除文字渲染，保留 50dp 触摸区并补足 Tab 无障碍语义；基于滑动位置跨过图标中心的 UI 线程反应逐项触发单次抖动。
    - `src/core/navigation/components/FloatingActionButton.tsx` - 删除右侧操作图标的无限循环抖动，保留 35dp 图标和原有点击、长按行为。
    - `src/shared/theme/motion.ts` - 将共享抖动关键帧改为从动画开始即摇摆，以匹配滑动途经的即时反馈。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx`、`FloatingActionButton.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、反向划过同一图标、松手导航和普通单击 Tab。

---

## 2026-09-15 23:20:30 | 新增功能：悬浮 Tab 滑动预选颜色跟手

- **变更概述**：悬浮 Tab 横向滑动期间，图标灰蓝颜色改为按手指实时横坐标连续交叉淡化；颜色进度不使用固定时长，手指快慢会直接反映到变色速度。拖动期间不切换页面，成功结束时保持最终目标图标为蓝色并沿用单次最终坐标导航；取消或落在左右 8dp 内边距时恢复当前页面图标颜色。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增 UI 线程选择位置共享值、图标灰蓝双层交叉淡化和拖动取消回退；保留最终坐标单次导航。
    - `CHANGELOG.md` - 记录本次新增功能。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、两图标中心之间的渐变、松手导航以及取消/边距回退。

---

## 2026-09-15 23:00:58 | 优化代码：悬浮 Tab 改为松手后单次切换

- **变更概述**：悬浮 Tab 横向拖动不再逐个经过图标区即时导航；仅在横向位移超过 1dp 且手势成功结束时，按最终 `x` 坐标识别目标图标并导航一次。结束位置落在菜单左右 8dp 内边距时保持当前页面，取消或失败手势不触发导航。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除拖动过程命中与多次导航，改为 `onEnd` 单次最终坐标判定。
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 移除仅服务于即时定位的临时分页动画状态，恢复页面原有动画设置。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：两个受影响组件已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认短横拖、长横拖、松手落在不同图标区、边距松手及取消手势的行为。

---

## 2026-09-15 22:55:00 | 优化代码：docs 文档目录按分类重组

- **变更概述**：docs 下 31 篇 md 按内容归类为 7 个子目录（UI、API后端、进度与验证、架构指南、学习参考、构建发布、待办），根目录 `TODO.md` 与 `待办事项.md` 一并移入 `docs/待办/`；同步修复跨分类互链与全部外部路径引用。
- **修改文件列表**
    - `docs/UI/`、`docs/API后端/`、`docs/进度与验证/`、`docs/架构指南/`、`docs/学习参考/`、`docs/构建发布/`、`docs/待办/` - 31 篇 md 与 `release.env.example` 经 git mv 移入对应分类目录。
    - `docs/架构指南/后续开发指南.md` - 3 处互链改指 `../UI/`。
    - `docs/UI/全局横幅通知设计与调用规范.md` - 2 处互链改指 `../架构指南/`。
    - `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md` - 4 处互链改指 `../架构指南/` 与 `../学习参考/`。
    - `docs/UI/IRisNote视觉设计规范.md` - 3 处 `TODO.md` 提及改为 `docs/待办/TODO.md`。
    - `docs/UI/miuix设计参考（HyperOS风格）.md` - 1 处样式规范提及加 `UI/` 前缀（miuix 上游仓库的 `docs/guide/*` 路径不动）。
    - `docs/待办/TODO.md`、`docs/待办/待办事项.md` - 自根目录移入，内部 7 处 docs 路径引用更新为新分类路径。
    - `README.md` - 8 处文档链接更新为新路径。
    - `src/features/notes/components/editor/draft-dialog.styles.ts`、`scripts/ui-dump-parse.mjs` - 仅注释中的规范路径更新。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：全仓 36 处 markdown 相对链接扫描全部可达；残留旧扁平路径仅为 irisapi 服务端仓库的 `docs/releases.md` 与 `项目编辑器进度.md` 历史日志行（按记录不改写历史，保留）；两个被改动代码文件通过定向 ESLint（零错误零警告）。git mv 保留文件历史；未运行 TypeScript/构建（无逻辑改动）。

---

## 2026-09-15 22:52:38 | 修复问题：快速拖动悬浮 Tab 时页面动画滞后

- **变更概述**：修复手指快速横向掠过多个悬浮 Tab 图标时，原生分页器连续播放默认转场而落后于当前命中图标的问题。实际横向移动达到 1dp 后，拖动会话内的页面切换改为无动画即时定位；手势结束后的下一帧恢复原有分页动画，因此图标单击和页面区域的正常横滑不受影响。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 在 UI 线程识别实际横向拖动起止，并仅在拖动会话期间通知分页器切换为即时同步模式。
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 接收悬浮 Tab 拖动状态，临时关闭 `TabView` 页间动画并在下一帧安全恢复，清理未执行的恢复帧。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：两个受影响组件已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机快速连续划过四个图标、快速反向划动，以及单击图标与页面横滑后确认默认动画恢复。

---

## 2026-09-15 22:44:22 | 新增功能：悬浮底栏拖动即时切换主页面

- **变更概述**：悬浮底栏在手指按下和移动期间按当前位置实时识别笔记、待办、剪贴、用户图标区；进入新图标区即导航到对应主页面，不再等待松手。命中逻辑按实际 `onLayout` 宽度和 8dp 内边距计算，适配不同屏宽，右侧设置按钮不参与此手势。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增 UI 线程拖动命中判定、跨区去重和到 JS 导航调度；保留图标点击、无障碍语义、底栏原有视觉与设置按钮。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认按住连续划过四个图标、反向划动、笔记卡片横滑和右侧设置点击。

---

## 2026-09-15 21:37:55 | 新增功能：主页面实时横滑切换

- **变更概述**：笔记、待办、剪贴、用户四个主页面改为基于 `react-native-tab-view` 与原生 `react-native-pager-view` 的横向 Pager；页面跟随手势连续移动，完成翻页后浮动菜单的选中状态与当前路由同步。相邻页预加载一页，端点不再循环或过度回弹。
- **修改文件列表**
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 新增 Expo Router 适配的 Pager Tabs，保持文件路由、嵌套 Stack、手势事件与页面预加载。
    - `src/app/(tabs)/_layout.tsx` - 使用 Pager Tabs 替代原 Bottom Tabs，保留现有浮动菜单和各 Tab 的模糊目标包装。
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除菜单自身横滑绑定，菜单点击改由 Pager 导航状态处理。
    - `src/core/navigation/hooks/useSwipeTab.ts` - 删除旧 `PanResponder` 松手后切换逻辑。
    - `src/core/navigation/navigation.constants.ts` - 删除仅供旧横滑 Hook 使用的 Tab 顺序和索引常量。
    - `package.json`、`package-lock.json` - 新增 `react-native-tab-view` 与 SDK 57 兼容的 `react-native-pager-view`。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：受影响导航文件已通过定向 ESLint（零错误零警告）和 `git diff --check`。未运行 TypeScript、构建、导出或设备验收；真机仍需核验横滑与笔记卡片横滑手势的优先级。

---

## 2026-09-15 21:26:28 | 优化代码：AGENTS.md 文档版本链接跟进 SDK 57

- **变更概述**：master 合并带来 Expo SDK 57（~57.0.22）升级后，AGENTS.md 顶部强制阅读的版本文档链接仍指向 v56.0.0，已更新为 https://docs.expo.dev/versions/v57.0.0/（链接有效性已在线核验，SDK 57 对应 React Native 0.86）。
- **修改文件列表**
    - `AGENTS.md` - 文档链接 v56.0.0 → v57.0.0，仅此一行。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：纯文档链接修改，不触碰代码；WebFetch 核验目标页面为 Expo SDK v57.0.0 reference。

---

## 2026-09-15 21:22:15 | 优化代码：同步远端 master 到 kroos

- **合并 origin/master（419a68f，PR #91~#93）进入 kroos，合并提交 de3fb17**
    - 带入应用内更新功能（modules/irisnote-updater 原生差量合并模块、发布工具、Gradle 回环修复）、SDK 57 升级（Expo ~57.0.22）、双渠道构建与包名统一等 67 个文件改动。
    - 中止了此前针对过时 master（3397042，PR #90）的半成品合并后重新合并；已核验 3397042 为 origin/master 祖先，中止不丢内容。
    - 唯一冲突 CHANGELOG.md：双方条目全部保留并按时间倒序重排，同时修复自动合并造成的顶部标题丢失与文件中部标题重复。
- **修改文件列表**
    - `CHANGELOG.md` - 冲突解决（双保留 + 倒序 + 标题去重）及本条记录。
- **验证结果**
    - `npm install` 完成（+112 / −439 / ~211 个包，SDK 57 依赖就位；transitive uuid 弃用警告与 unrs-resolver 安装脚本提示，均无碍）。
    - `npx tsc --noEmit`：仅 new-note-editor.tsx 326/368/376 三处既有 draftCleanupPending 错误，与 master 基线完全一致，无新增。
    - `npm test`：71 项 69 过 2 挂，失败为 drafts/revisions 两文件既有 Node 24 类型剥离加载问题（kroos/master 双方均有记录）；kroos 侧 banner 测试修复保留生效，master 新增 releases 差量测试全部通过。
    - `npm run lint` 与 `npm run theme:check` 通过。
    - 未做设备验收。注意：master 已升级 SDK 57，现有 SDK 56 的 Expo Go 将无法加载本项目，需升级 Expo Go 或改用 dev build 流程。

---

## 2026-09-15 16:44:52 | 修复问题：项目构建入口的 Gradle 回环错误

- 文件：scripts/android/gradle-env.mjs、scripts/android/run.mjs、package.json、scripts/release/cli.mjs、tests/releases/gradle-env.test.cjs、docs/android-releases.md、CHANGELOG.md。
- Windows 构建通过子进程 JAVA_TOOL_OPTIONS 指定原项目 .expo 目录作为 Unix 域套接字目录，覆盖 Gradle 启动器、daemon 和编译子进程。默认用户 Temp 的 Unix 域连接失败，项目目录的实际连接与 Selector 创建成功。
- npm run android 和新增 npm run gradle 接入统一入口，自有发布构建使用同一环境；Gradle 命令默认 --no-daemon。保留已有 JVM 参数及父进程环境，Linux/macOS 不注入设置。
- 验证：新修复与发布流程共 14 项测试通过（含真实 JDK Selector）；定向 ESLint、Node 语法检查、git diff --check 通过；Expo run:android --help 参数转发成功；npm run gradle -- help 实际 BUILD SUCCESSFUL，33 tasks，耗时约 1 分钟。
- 原生编译验证：npm run gradle -- :irisnote-updater:compileDebugKotlin 已越过回环和配置阶段，后续等待 react-android-0.86.3-debug.aar（279001319 字节）下载，临时文件停在 62620736 字节数分钟无增长，主动结束本次验证。日志：.expo/gradle-updater-build.log。不能据此声称原生编译或 APK 构建通过。
- 范围：直接 android/gradlew.bat 与 Android Studio 直接同步未接入项目启动入口，仍需单独设置；未修改全局 JDK、TEMP、网络或防火墙，未部署或发布。

---

## 2026-09-15 16:35:58 | 修复问题：Windows Gradle 回环连接（验证中）

- 文件：scripts/android/gradle-env.mjs、scripts/android/run.mjs、package.json、scripts/release/cli.mjs、tests/releases/gradle-env.test.cjs、docs/android-releases.md、CHANGELOG.md。
- 已获用户确认。Windows 构建入口通过进程级 JAVA_TOOL_OPTIONS 指定原项目 .expo 套接字目录，覆盖 Gradle daemon 与编译子进程；Linux/macOS 不注入。自有发布构建使用原项目目录，避免独立 checkout 的用户 Temp 路径。
- 保留已有 JVM 参数，不修改父进程或全局环境；新增 npm run gradle，npm run android 接入统一环境。
- 临时验证已通过 NIO Selector 和 Gradle 握手，持久入口验证进行中。

---

## 2026-09-15 16:08:26 | 新增功能 / 修复问题：按主次补丁版本实行完整与差量更新

- 文件：src/features/updates/release.ts、update-store.ts、UpdateDialog.tsx；scripts/release/cli.mjs、delta.mjs；modules/irisnote-updater/（Expo 模块声明、Kotlin 模块、HPatch.java、四 ABI 原生库、Gradle/ProGuard 配置、SHA-256 清单及上游许可）；tests/releases/releases.test.cjs、delta-roundtrip.mjs；package.json、docs/android-releases.md、docs/release.env.example、CHANGELOG.md。
- 主版本不同使用完整 APK；同主版本的功能/补丁更新要求匹配的差量包。客户端核对真实安装构建、版本、旧 APK 摘要及补丁算法，缺少补丁不静默回退全量。
- Android 合并使用固定 HDiffPatch 5.1.3 官方库。读取已安装 sourceDir，校验旧包/补丁/目标摘要及新包签名、版本、包名；禁止跨缓存路径和拆分 APK 差量。失败清理输出，安装前再次校验。
- 发布工具支持 setup-delta 与 patches；上传完整目标后自动为历史同主版本生成补丁、实际还原验证并上传，恢复操作跳过已完成补丁。工具归档与原生文件摘要固定，构建前同时核对工作区和归档代码里的原生库。
- 界面新增完整/差量类型与实际下载大小，新增“正在合并更新”及无匹配补丁状态。
- 验证：客户端/工具 11 项测试、后端版本规则 4 项测试通过；全量 lint、theme:check、后端 TypeScript 检查通过；Android Hermes 导出通过（4137 modules，dist/delta-update-validation）。Expo 自动链接识别 irisnote-updater；四 ABI ELF LOAD 均为 0x4000 对齐，JNI 导出符号存在。
- 真实差量工具验收：独立签名的合成测试 APK 各 1057116 字节，补丁 2240 字节；还原后完整 SHA-256 与目标一致，并通过 apksigner 与 aapt 校验。错误旧摘要和损坏补丁被拒绝。记录：.expo/delta-tests/signed-apk-bXPcAZ/result.json。该体积不代表正式 IRisNote 更新效果。
- 未通过环境验收：Gradle 原生模块编译在进入编译前报 Unable to establish loopback connection / Could not receive a message from the daemon；仅对本次进程尝试 Unix-domain/IPv4 参数，无全局环境变更，仍失败。adb 无设备。原有三处 draftCleanupPending 类型错误仍存在。
- 尚未完成原生模块编译、真机合并及覆盖安装、真实数据库发布验证。未运行迁移、未部署、未提交 EAS 构建或发布版本。

---

## 2026-09-15 15:56:10 | 新增功能：差量更新（实施中，用户已确认）

- 新增 HDiffPatch 5.1.3 原生合并模块及固定摘要库、差量生成/实际还原校验、版本规则和补丁接口。
- 主版本变化使用完整包；同主版本必须匹配差量包，不静默退回完整下载。
- 代码实施中，尚未运行数据库迁移或实际发布。

---

## 2026-09-15 15:27:24 | 新增功能 / 修复问题：双渠道构建、包名统一与 App 内更新

- 文件：app.json、app.config.ts、eas.json、package.json、package-lock.json、.gitignore、README.md、docs/android-releases.md、docs/release.env.example、plugins/with-release-signing.js、scripts/release/cli.mjs、scripts/release/lib.mjs、src/features/updates/release.ts、update-store.ts、UpdateDialog.tsx、src/features/settings/screens/SettingsScreen.tsx、src/core/providers/AppProviders.tsx、tests/releases/releases.test.cjs、CHANGELOG.md。
- 本地生成工程：android/app/build.gradle、android/app/src/main/AndroidManifest.xml、res/values/strings.xml、java/com/mouqiandi/irisNote/MainActivity.kt 和 MainApplication.kt；旧 NextNote 两个入口迁移到新包目录。android 仍按项目约定忽略，新 checkout 通过 app.config 和插件重新生成。
- 新包名统一为 com.mouqiandi.irisNote，显示名 IRisNote，scheme 为 irisnote。旧包名属于另一应用，不自动迁移数据。
- EAS 保留；版本来源改为 local，由发布工具注入服务分配的构建号。保留 EAS AAB production 构建；APK 自有构建在独立 Git 提交目录执行。
- 发布命令支持 doctor/reserve/build/inspect/upload/status/publish/withdraw，构建、上传草稿和发布分离。校验真实包名、版本、单一签名证书与 SHA-256。正式 Gradle 构建禁止回退到调试签名。
- App 新增六小时自动检查和手动检查、更新说明、下载进度/取消/重试、分块 SHA-256 校验、安装前复核、系统安装和安装权限入口。进程被杀后的后台下载不在当前保证范围。
- 依赖新增 expo-application ~57.0.3、@noble/hashes ^2.0.1。修复构建工具在 Windows 下的批处理引号及 npm.cmd 绝对路径解析。
- 验证：新增客户端/工具 8 项测试全部通过；全量 lint、theme:check 通过；Android Hermes 导出通过（4136 modules，dist/releases-validation）；Expo 配置注入实测包名正确，示例版本 1.2.3 / 构建号 44。doctor 与 npm.cmd 实际调用通过。
- 项目既有阻塞：类型检查仍有 new-note-editor.tsx 三处 draftCleanupPending 错误；全量测试执行时 61 通过、3 失败（drafts/revisions 原生模块加载和 banner lifetime），之后新增的第 8 项工具测试亦通过。未修改这些既有问题，构建前置检查会阻断正式打包。
- 未验收：正式 APK/AAB 构建、EAS 凭据、真实 PostgreSQL 发布事务、HTTPS 下载及设备覆盖升级；adb 无已连接设备。未部署、未分配实际构建号、未上传或发布。

---

## 2026-09-15 15:16:05 | 新增功能 / 修复问题：双渠道构建与应用更新（实施中）

- 文件：app.json、app.config.ts、eas.json、package.json、package-lock.json、plugins/with-release-signing.js、scripts/release/、src/features/updates/、SettingsScreen.tsx、AppProviders.tsx、android/app/build.gradle、AndroidManifest.xml、Kotlin 入口包目录。
- 统一新包名，新增 App 内版本检查、下载、SHA-256 校验和安装入口；接入集中编号与 EAS/自有构建工具。正式发布需独立执行。
- 当前阶段：代码实施中，尚未验证、部署或发布。

---

## 2026-09-15 12:02:25 | 优化代码 / 修复问题

- **SDK 57 最新补丁升级（用户已确认）**
    - package.json：Expo 更新为 ~57.0.22，按官方 bundledNativeModules 对齐现有 Expo 与 React Native 依赖；移除项目配置、脚本和测试均未引用的 expo-module-scripts@56.0.3，避免引入旧测试预设和重复 React。
    - package-lock.json：更新依赖锁定；移除 file-entry-cache 错误指向 emoji-regex 的记录，由 npm 重新解析官方元数据。
    - CHANGELOG.md：记录升级范围和验证结果。
- **验证结果**
    - Expo Doctor 21/21 通过；安装版本与 SDK 57.0.22 bundledNativeModules 配套要求无不匹配；package.json 与锁文件根依赖一致。
    - npm 安装成功；file-entry-cache 正确包名、官方下载地址、integrity 和 create API 验证通过；React 仅保留 19.2.3 一份。
    - Lint 与 theme:check 通过；Android Hermes Bundle 导出通过（4118 modules），输出 dist/sdk57-android。
    - 类型检查剩余 new-note-editor.tsx 第 326、368、376 行 draftCleanupPending 类型错误，均在升级前已存在；已声明但缺失的 expo-network、expo-intent-launcher 安装后相关错误消除。
    - 单测 54 通过、3 失败：drafts/revisions 两个测试在安装 Expo 网络模块后直接加载原生模块，触发 Node ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING；banner 连接测试仍因 lifetime 访问失败。未修改业务源码或测试。
    - Web 导出通过：5305 modules，服务端 3690 modules，17 个静态路由，CSS 与 SQLite worker 已打包，输出 dist/sdk57-web；原生 APK 构建与设备验收未执行。
    - 在线 expo install --check 首次遇到 TLS 连接中断，离线配套检查通过；后续在线 Expo Doctor 完整通过。
- **原生工程边界**：本地 android 仍含旧包名 com.mouqiandi.NextNote，本轮未重生成原生目录。

---

## 2026-09-15 09:44:32 | 修复问题

- **修复发布检查阻塞（用户已确认）**
    - scripts/sync-theme-css.mjs：比较时兼容 CRLF/LF，写入时保留原换行符。
    - src/core/navigation/hooks/useLongPressNavigation.ts：共享值改用 get/set，保留既有导航与动画参数。
    - src/features/auth/providers/AuthProvider.tsx：分离存储读取与状态提交，初始化异步回调增加失效保护；移除未使用类型。
    - src/features/notes/categories/category-icons.ts、components/CategoryButton.tsx：通过静态 CategoryIcon 入口渲染已有图标，保留尺寸、配色及回退。
    - src/features/notes/categories/index.ts、src/features/notes/index.ts：显式导出 API，避免重复导出类型。
    - src/features/settings/screens/SettingsScreen.tsx：移除未使用且无挂载副作用的头像 Hook。
    - CHANGELOG.md：记录修改与验证结果。
- **依赖恢复**：已从 npm 官方获取 file-entry-cache@8.0.0，核对完整性摘要并恢复本机对应目录；create API 和普通 Lint 缓存启动通过。原异常目录保存在系统临时目录 irisnote-file-entry-cache-repair 下。
- **锁文件待确认**：package-lock.json 中 file-entry-cache 指向 emoji-regex；该记录及依赖元数据仍需补充授权修正，当前未改动锁文件，下次安装可能复发。
- **验证结果**
    - 本轮 8 个修改文件定向 ESLint 通过；全量 Lint 的原 17 个错误、5 个警告消除。
    - theme:check 通过；临时副本验证 LF/CRLF 比较、写入格式保留、真实差异检出与修复均通过，未改动 global.css。
    - 模拟运行验证长按完成/提前释放仅导航一次、同路由不跳转、缩放恢复、图标映射及 Folder 回退、认证异步初始化/刷新/失效初始化保护通过；不等同于设备验收。
    - 当前仓库含本轮未修改的同步队列代码：全量 Lint 剩 2 个缺失依赖错误（expo-network、expo-intent-launcher）；类型检查另有 sync-queue 路由类型、draftCleanupPending 返回类型错误。
    - 全量单测通过 54、失败 3：两个测试文件因 expo-network 缺失无法加载，通知连接测试失败。未调整这些源码或测试。
    - 尚未重新完成 Android Bundle 导出或设备验收，未提交云端构建。

---

## 2026-09-15 09:23:24 | 修复问题

- **发布基础收口：统一名称并补齐检查与 Android 构建入口**
    - app.json - 图片与相机权限文案中的 NextNote 改为 IRisNote。
    - package.json、package-lock.json - 内部 npm 包名统一为 irisnote，不修改 Android 包名、EAS 项目身份或依赖版本。
    - package.json - 新增 typecheck、test、check、eas、build、build:apk、build:aab；test 使用 Node 24+ 执行 tests/**/*.test.cjs，不运行浏览器脚本；构建前执行统一检查。
    - eas.json - 固定 EAS CLI 24.4.0，preview APK 启用远端版本号自动递增；production 保留现有自动递增策略。
    - CHANGELOG.md - 记录已确认的第一阶段变更与验收边界。
- **命令说明**
    - npm run check：类型、Lint、主题一致性及现有单元测试。
    - npm run build 或 npm run build:apk：检查通过后提交 EAS preview APK 云端构建，需要网络与 EAS 账号权限。
    - npm run build:aab：检查通过后提交 EAS production Android 云端构建。
- **验证结果**
    - TypeScript、110 项现有单元测试、Expo public 配置解析、图标资源存在性、包名与锁文件一致性、变更差异检查通过。
    - Android Hermes Bundle 导出成功（4059 modules），输出 dist/phase1-android；此结果不等同于签名 APK 构建或设备验收。
    - npm run check 未通过：现有 Lint 缓存加载失败（fileEntryCache.create is not a function）；本机 node_modules/file-entry-cache/package.json 实际标识为 emoji-regex，依赖目录内容异常。
    - 单独执行 theme:check 失败；只读比较确认主题内容在 CRLF 标准化后完全一致，现有校验脚本因换行符差异误报。未改动主题 CSS 或同步脚本。
    - 关闭缓存诊断（expo lint --no-cache）完成，报告现有 17 个错误、5 个警告：useLongPressNavigation.ts 的共享值赋值、AuthProvider.tsx 的 Effect、CategoryButton.tsx 的动态图标组件、notes/categories 与 notes 的 index.ts 重复导出，以及未使用变量。此次未改动这些业务文件或屏蔽规则。
    - 配置核验参考：https://docs.expo.dev/versions/v56.0.0/ 、https://docs.expo.dev/versions/v56.0.0/sdk/imagepicker/ 、https://docs.expo.dev/build-reference/apk/ 、https://docs.expo.dev/build-reference/app-versions/ 。
    - 未提交 EAS 云端构建，未验收签名 APK、安装或覆盖升级；构建入口会在检查失败时阻止提交。

---

## 2026-09-15 01:42:51 | 新增功能

- **悬浮操作按钮随标签切换图标变形**
    - 使用持续挂载的 MorphIcon 和 lucide 图标数据，在铅笔、勾选框、剪贴板和齿轮之间播放 snappy 变形。
    - 保留外层每轮 2 秒的无限 shake，变形期间及结束后持续摇晃；变形遵循系统减少动态效果设置。
    - 保持 66dp 按钮、35dp 图标、配色、点击防抖导航和长按手势及动画。
- **修改文件列表**
    - src/core/navigation/components/FloatingActionButton.tsx - 添加图标数据映射并接入 MorphIcon。
    - CHANGELOG.md - 记录本次已确认变更。
- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint 和差异检查通过；尚未进行设备视觉验收。

---

## 2026-09-15 01:53:36 | 修复问题

- **修复连接聚合测试对异步横幅发布的过时假设**
    - 服务器连接协调器自同步队列提交（454da44）起，故障横幅发布改为异步 `publishFault`（先取暂存任务摘要），并新增后台（inactive）不发布的守卫；原测试在事件发出后的同一 tick 内同步断言横幅已存在，且以 `setActive(false)` 运行协调器，与现行设计不符导致测试失败。
    - 测试改为 async，在断言前用 `setImmediate` 冲刷微任务队列等待 `publishFault` 完成；`setActive(false)` 改为 `setActive(true)` 并注释说明前台语义；用例验证逻辑本身（失败聚合、恢复解析、陈旧事件不误报）未改动。
    - 功能代码零修改；已核实横幅收回/恢复真实运行路径无缺陷，本次为纯测试适配。
- **修改文件列表**
    - `tests/notifications/banner.test.cjs` - 适配异步发布与前台激活假设。
    - `CHANGELOG.md` - 记录本次测试修复。
- **验证结果**
    - `node --test tests/notifications/banner.test.cjs` 14/14 通过；全量套件 55 过 2 挂，剩余失败为 drafts/revisions 两文件在 Node 24 下因 node_modules 内裸 `.ts` 类型剥离限制无法加载，与代码无关（kroos 原版同样失败）。
    - `npx eslint --no-cache --no-warn-ignored tests/notifications/banner.test.cjs` 报告 1 个既有 `no-undef __dirname`（第 7 行原有代码，非本次引入），未处理以避免扩大确认范围。
    - 未运行 tsc（未触碰 `.ts`/`.tsx` 源码）、构建、导出或设备验收。

---

## 2026-09-15 00:00:50 | 新增功能

- **同步队列支持自适应列表与保留历史的任务删除**
    - 暂存任务列表卡改为按内容自动增高；移除强制撑满页面的 `flexGrow: 1`，内容超过剩余视口时才在 16dp 圆角容器内滚动。
    - 每行新增公共 `IconButton compact` 删除入口；正在上传及没有上一 Revision 的笔记任务禁用，并显示不能回滚的原因。
    - 删除笔记任务前显示“确认回滚？”二次确认弹窗；执行期间显示“回滚中…”，锁定重复提交、返回和遮罩关闭，失败原因保留在弹窗内。
    - 队列删除与笔记回滚合并到同一个 SQLite 事务；从父 Revision 内容创建新的 `origin=restore` 当前版本，被取消的版本继续保留在版本历史中。
    - 上传协调器改用 `status=queued` 条件认领任务，消除页面删除与自动上传之间的竞争窗口；已被认领的任务不会并发回滚。
    - 未尝试且已有服务端副本的笔记回滚后恢复已同步状态；无服务端副本保留待同步；已尝试上传则标为云端状态未知，要求用户核对后再同步。
- **修改文件列表**
    - `src/core/sync/upload-queue.repository.ts`、`src/core/sync/upload-queue-coordinator.ts` - 新增原子取消入口及条件任务认领。
    - `src/features/notes/data/note-local.repository.ts` - 新增回滚可用性检查与保留版本历史的事务内回滚。
    - `src/features/sync/upload-task-cancellation.ts`、`src/features/sync/index.ts` - 编排任务取消、笔记缓存更新及分类视图刷新。
    - `src/features/sync/components/sync-task-delete-dialog.tsx` - 新增删除/回滚二次确认弹窗。
    - `src/features/sync/screens/SyncQueueScreen.tsx` - 接入自适应列表、删除组件、禁用原因和确认流程。
    - `docs/自动上传队列开发约定.md`、`docs/IRisNote视觉设计规范.md`、`docs/项目架构与文件索引.md` - 记录删除事务、Revision 语义、UI 尺寸和模块职责。
    - `CHANGELOG.md` - 记录本次功能。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 已获授权的只读 ADB 布局导出当时未停留在同步队列页，因此未把其他页面的控件数据冒充为本页实测；未点击或改变设备状态。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器或设备交互验收；列表真实高度、禁用态、回滚结果和弹窗交互仍由用户主动验收。

---

## 2026-09-14 23:36:52 | 优化代码

- **进入同步队列页后自动收回服务器未连接横幅**
    - 同步队列页获得焦点后立即收回 `server-connection` 全局横幅，并在页面聚焦期间阻止服务器连接协调器和上传队列协调器重新发布同一横幅。
    - 页面失焦后解除展示抑制；服务器故障或设备离线仍存在时重新显示横幅，已恢复时不产生旧通知。
    - 收回只影响服务器未连接横幅，不伪造“服务器已恢复”，也不隐藏上传进度、上传暂停或任务阻断横幅。
- **修改文件列表**
    - `src/core/notifications/notification.store.ts` - 增加仅供受控展示生命周期使用的强制收回能力，普通关键通知仍不能由用户关闭。
    - `src/core/notifications/server-connection-banner-visibility.ts` - 新增引用计数式页面聚焦抑制与状态订阅。
    - `src/core/notifications/server-connection-coordinator.ts`、`src/core/sync/upload-queue-coordinator.ts` - 发布前检查抑制状态，并在解除抑制后按真实故障状态恢复横幅。
    - `src/core/notifications/index.ts`、`src/features/sync/screens/SyncQueueScreen.tsx` - 导出并接入页面焦点生命周期。
    - `docs/自动上传队列开发约定.md`、`docs/IRisNote视觉设计规范.md`、`docs/全局横幅通知设计与调用规范.md`、`docs/项目架构与文件索引.md` - 记录展示边界、页面行为和模块职责。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器、ADB 或设备验收；横幅收回、页面停留期间不重现及离页恢复仍由用户主动验收。

---

## 2026-09-14 22:57:40 | 新增功能

- **新增服务器恢复自动上传队列**
    - 新增按账号隔离的 SQLite 持久上传任务表；笔记和分类在本地保存后先入队，由全局协调器监听前台 Wi-Fi／移动数据变化、探测服务器并串行执行。
    - 可恢复故障最多自动重试 10 次，并以稳定横幅原位更新任务序号和尝试次数；达到上限后暂停，等待一次离线到在线变化再恢复。401／403、业务校验、未知创建结果及缺少适配器会安全阻断并改用“查看暂存”提醒，避免无效请求、重复创建或错误引导到网络设置。
    - 按 UTF-8 JSON 请求体估算所需上传量，并记录可观测的上传字节；估算值明确不包含 HTTP/TLS、响应和网络协议开销。
    - 服务器未连接且存在任务时，全局横幅显示任务数、预计上传量及“查看暂存”；连续失败横幅提供系统“网络设置”动作。暂存列表不在设置页增加入口。
    - 新增同步队列页面，展示网络类型、任务状态、预计流量、尝试次数和最近错误；设置同步预留标准入队函数及执行适配器注册口，当前未虚构设置后端服务。
- **修改文件列表**
    - `src/core/database/migrations/0005-create-upload-queue.ts`、`src/core/database/migrations/index.ts` - 新增结构版本 5 上传队列表及迁移登记。
    - `src/core/sync/*` - 新增队列契约、持久仓库、事件、运行时状态、网络监听协调器、流量估算及系统网络设置跳转。
    - `src/features/sync/*` - 新增笔记／分类／设置入队适配层、任务执行器及暂存列表页面。
    - `src/core/notifications/notification-provider.tsx`、`src/core/notifications/server-connection-coordinator.ts` - 启动上传协调器，并让服务器故障横幅按队列状态切换为“查看暂存”。
    - `src/features/notes/services/note-save.service.ts`、`src/features/notes/services/note-exit-sync-coordinator.ts`、`src/features/notes/components/editor/new-note-editor.tsx`、`src/features/notes/screens/NotesScreen.tsx` - 笔记保存、退出和手动同步改为先写持久队列。
    - `src/features/notes/categories/components/CategoryBar.tsx`、`src/features/notes/categories/hooks/useCategory*.ts` - 分类创建、更新和删除接入持久队列并叠加待处理本地视图。
    - `src/app/pages/user/sync-queue.tsx`、`src/app/_layout.tsx` - 注册暂存列表路由。
    - `package.json`、`package-lock.json` - 增加 Expo SDK 56 匹配的 `expo-network` 与 `expo-intent-launcher`。
    - `docs/自动上传队列开发约定.md`、`docs/项目架构与文件索引.md`、`docs/IRisNote视觉设计规范.md`、`docs/全局横幅通知设计与调用规范.md` - 记录状态机、接入契约、UI 尺寸、风险和当前限制。
    - `CHANGELOG.md` - 记录本次功能变更。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器或设备验收；数据库迁移、网络切换、系统设置跳转和横幅层级仍由用户主动验收。

---

## 2026-09-14 21:22:54 | 修复问题

- **笔记列表改为本地数据优先，云端 401 不再中断展示**
    - 首页笔记列表完成本地 SQLite 读取后立即应用数据；云端同步请求与本地读取使用独立错误边界。
    - 云端请求返回 401 或其他失败时保留本地笔记列表，并以“云端笔记同步失败，继续使用本地数据”记录警告；仅本地读取失败才报加载失败。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 分离本地加载与云端同步的错误处理。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 目标文件 Expo ESLint 与 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收。

---

## 2026-09-14 20:40:11 | 修复问题

- **修复编辑器工具栏“收起键盘”按钮无动作**
    - 键盘显示时，公共编辑器工具栏第一区改为调用 `Keyboard.dismiss()`；键盘隐藏时仍调用既有“编辑正文”回调。
    - 无障碍标签随状态切换为“收起键盘”或“编辑正文”，视觉样式、尺寸和预留按钮均未调整。
- **修改文件列表**
    - `src/core/editor/components/editor-bottom-toolbar.tsx` - 绑定收起键盘动作并更新状态化无障碍文案。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 目标文件 Expo ESLint 与 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；真机收起键盘与重新进入编辑的交互仍由用户验收。

---

## 2026-09-14 19:56:29 | 优化代码

- **InlineHint 支持按需点击并接入云同步状态行**
    - `InlineHint` 保持未传事件时的静态单行提示行为；传入 `onPress` 后才渲染可点击容器，支持禁用、无障碍标签、状态和触控热区。
    - 新增 `standard` 尺寸（20dp 图标、4dp 间距）用于云同步；默认 `compact` 草稿说明不变。可点击态按压时显示 85% 不透明度，禁用时不触发事件。
    - 笔记操作的云同步行改用公共 `InlineHint`，保留原有上传、防重复、同步中锁定、无账号关闭、失败红色与上下各 12dp 触控热区；业务上传逻辑未迁入公共组件。
    - 更新组件接口、视觉规范、审计基线、架构索引和待办；新建笔记离开确认的富文本丢弃提示记为后续候选，避免丢失局部加粗语义。
- **修改文件列表**
    - `src/shared/ui/InlineHint/InlineHint.tsx`、`src/shared/ui/InlineHint/index.ts`、`src/shared/ui/index.ts` - 扩展可选点击接口、尺寸与导出。
    - `src/features/notes/components/viewer/note-operation-info.tsx` - 云同步状态行接入公共组件。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`待办事项.md` - 同步契约、状态和迁移记录。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、目标文件 Expo ESLint、`npm run design:audit` 与 `git diff --check` 通过。
    - 审计为 252 个源码文件、19,659 行；主题目录外固定颜色 14、裸字号 17、裸圆角 15，均未因本批增加。
    - 未运行测试、构建、导出、浏览器或设备验收；云同步点击、上传时锁定、错误文案单行截断与按压反馈仍由用户主动验收。

---

## 2026-09-14 19:47:57 | 优化代码

- **补充 Codex 会话的 ChatGPT 模型建议规则**
    - 在项目根目录 `AGENTS.md` 新增 Codex 专用模型建议章节，要求涉及编码、修复、重构、UI 或持久指令变更时强制考虑 ChatGPT 模型及思考强度。
    - 明确即使宿主未展示完整模型列表，也必须给出具体推荐并说明实际切换能力以当前界面为准；同时保留 ZCode 专用调度规则的适用边界。
- **修改文件列表**
    - `AGENTS.md` - 新增 Codex / ChatGPT 模型建议与 ZCode 规则边界。
    - `CHANGELOG.md` - 记录本次持久文档变更。
- **验证结果**
    - 已检查新增章节位置、Markdown 结构与规则内容；未涉及代码、测试、构建、导出或设备验收。

---

## 2026-09-14 19:34:01 | 新增功能 / 优化代码

- **新增公共单行补充说明 InlineHint**
    - 新增 `InlineHint` 公共组件，固定为 14dp 左侧图标、6dp 间距、13sp 单行尾部省略文本；组件不提供点击、按压、禁用、加载或业务状态接口。
    - 新增 `neutral` 与 `important` 主题配方：普通说明图标和文本使用 `textSecondary` 灰蓝，重要提示使用 `destructive` 红色；两者均为 transparent 背景，不含边框或圆角。
    - 删除草稿弹窗的私有 `DraftLocalNotice`，草稿管理弹窗与新建笔记离开确认直接接入公共 `InlineHint`；本机草稿说明保留灰蓝样式，删除草稿不可恢复提示改为重要红色样式，调用方继续负责 12dp 外部间距。
    - 同步公共组件接口、视觉规范、待办、审计基线与架构索引，明确 `InlineHint` 与后续可操作 `InlineMessage` 的职责边界。
- **修改文件列表**
    - `src/shared/ui/InlineHint/InlineHint.tsx`、`src/shared/ui/InlineHint/index.ts`、`src/shared/ui/index.ts` - 新增并导出公共补充说明组件。
    - `src/shared/theme/component-recipes.ts`、`src/shared/theme/theme.types.ts` - 新增 `inlineHint` 的普通与重要语义配方。
    - `src/features/notes/components/editor/draft-dialog.tsx`、`src/features/notes/components/draft-manager-dialog.tsx`、`src/features/notes/components/editor/new-note-editor.tsx` - 移除私有草稿提示并迁移为公共组件。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`待办事项.md` - 更新组件契约、尺寸、颜色、迁移状态与审计快照。
    - `CHANGELOG.md` - 记录本次公共组件新增。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、目标文件 Expo ESLint、`npm run design:audit`、`git diff --check` 通过。
    - 审计为 252 个源码文件、19,616 行；主题目录外固定颜色 14、裸字号 17、裸圆角 15，均未因本批增加。
    - `npm run theme:check` 仍提示当前 `global.css` 与默认主题预设不同步；本批未修改主题生成源，也未执行会写入生成文件的 `npm run theme:sync`。
    - 未运行测试、构建、导出、浏览器或设备验收；单行截断、灰蓝/红色呈现与弹窗布局由用户主动验收。

---

## 2026-09-14 22:24:15 | 新增功能

- **悬浮导航背景模糊及 15dp 顶部渐变**
    - 新增 expo-blur 与渐变蒙版依赖，按当前标签页选择 Android BlurTargetView，采样实际页面内容。
    - 模糊覆盖屏幕底部全宽 101dp，顶部 15dp 通过透明度蒙版平滑显现；按钮高 66dp、底部 20dp、左右 16dp 和控件间隔 15dp 保持不变。
    - 模糊与按钮共用 300ms 位移动画，隐藏距离覆盖渐变区域和阴影；背景不拦截触摸。
- **修改文件列表**
    - package.json、package-lock.json - 添加原生模糊和蒙版依赖。
    - src/app/(tabs)/_layout.tsx - 按场景提供背景采样目标。
    - src/core/navigation/components/FloatingMenu.tsx - 背景模糊、渐变蒙版及整组隐藏。
    - CHANGELOG.md - 记录本次已确认功能和验收结果。
- **验证结果**
    - TypeScript、目标文件 ESLint、差异检查通过；Android x86_64 开发客户端构建成功并安装至 Pixel_9_Pro_XL 模拟器。
    - 截图确认底部真实模糊、15dp 顶部透明度渐变、按钮清晰；持续滚动时整组移出底边，停止后恢复，切换用户/笔记后的采样正常。
    - 从两按钮间隙滑动可滚动底下的列表；13 秒切页及滑动观测窗口内 JavaScript 警告/错误为 0。
    - 本机 Java 回环连接异常使用仅当前构建进程的 jdk.net.unixdomain.tmpdir 参数规避。原 Metro 未识别新增 expo-blur，验收使用独立的 8082 Metro；未停止或重启原 8081 服务。
    - 本次完成 Android 模拟器验收，未进行 iOS 实机验收。

---

## 2026-09-14 21:22:35 | 修复问题

- **修复悬浮导航在组件渲染期间读取 Reanimated 共享值的警告**
    - 将 FloatingMenu 的共享值访问统一为 get()/set()，保持访问位于 Effect、事件及动画回调内，避免 React Compiler 将 hiddenOffsetY.value 提取为渲染阶段的缓存依赖。
    - 保留当前布局、配色、300ms 动画和导航交互。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 替换共享值属性读写方式。
    - CHANGELOG.md - 记录本次已确认修复。
- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint、git diff --check 通过。
    - 检查模拟器实际加载的编译结果：缓存依赖只比较 hiddenOffsetY 和 translateY 对象，渲染阶段不再读取 hiddenOffsetY.value。
    - Android 模拟器连续切换用户/笔记并滚动列表，14 秒观测窗口内 Reanimated 警告为 0；截图确认滚动期间导航隐藏、停止后恢复。

---

## 2026-09-14 20:00:45 | 优化代码

- **悬浮导航向下隐藏、对称外边距及左右滑动切页**
    - 整组左右外边距均为 16dp，白色 Tab 栏弹性填满剩余宽度，四项等宽分配；两侧控件高 66dp，白栏内边距 8dp、项目高 50dp，主按钮间隔从 15dp 增至 24dp。
    - 隐藏方向改为向屏幕底部移动，位移按实际高度加底部偏移 50dp 与阴影余量 16dp 计算，保留现有触发时机和 600ms 动画。
    - 切页手势仅绑定白色 Tab 栏：左滑下一页、右滑上一页，按笔记/待办/剪贴/用户的可见顺序循环；横向主导且位移超过 30dp 才切页，上下滑动不切页。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 布局尺寸、纵向隐藏动画及手势绑定范围。
    - src/core/navigation/hooks/useSwipeTab.ts - 左右滑动判定与可见顺序切页。
    - CHANGELOG.md - 记录本次已确认变更。
- **验证结果**
    - TypeScript、两文件 ESLint 通过；移除手势 hook 原有渲染阶段 ref 写入，直接使用当前路由。
    - 模拟器验证：左滑从笔记进入待办、右滑返回笔记，上滑白栏未切页；列表滑动期间整组隐藏，停止后恢复。
    - 已截图核对加长白栏与对称外边距的整体效果；控件树仍因无法进入空闲状态而读取失败，精确 dp 未完成原生树实测。尺寸使用明确数值类名，避免 rem 换算偏差。

---

## 2026-09-14 19:41:26 | 优化代码

- **悬浮 Tab 栏横排并与主操作按钮等高**
    - 白色 Tab 栏移至蓝色主操作按钮左侧，四个入口横排；白栏高 66dp、每项 50×50dp、四周内边距 8dp，与 66×66dp 主按钮间隔 15dp。
    - 整组保留右边距 16dp、底部偏移 50dp；沿用颜色、按压反馈、Tab 路由、上下滑动切换与主按钮操作。
    - 隐藏动画按实际布局宽度加 32dp（右边距与阴影余量）计算位移，避免横排后仅隐藏右侧部分。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 横向布局、等高尺寸及自适应隐藏位移。
    - CHANGELOG.md - 记录本次已确认的 UI 变更。

- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint、目标文件 git diff --check 均通过。
    - 模拟器刷新后开发客户端出现 Unable to load script；重新连接现有 Metro 后仍报告局域网地址 unexpected end of stream，未完成新布局截图、dp 实测及交互验收。
    - 现有开发服务未停止或重启，未修改环境配置。

---

## 2026-09-14 14:47:43 | 修复问题

- **恢复 Android Studio 启动前置与 Android SDK 工具链完整性**
    - 移除指向不存在 `studio.vmoptions` 文件的用户级 `STUDIO_VM_OPTIONS` 环境变量，恢复 Android Studio 使用安装目录内置 VM 配置的前置条件。
    - 清理用户 `PATH` 中已不存在的旧 SDK `adb.exe` 路径，保留有效的 `D:\AndroidSDK` 配置。
    - 从 Google Android 官方源安装 Command-line Tools 22.0 到 `D:\AndroidSDK\cmdline-tools\latest`，官方 SHA-256 校验通过；将其 `bin` 目录加入用户 `PATH`。
    - 将仅含安装占位文件的 Build Tools 35.0.0 残缺目录移至 `D:\AndroidSDK\.repair-backup-20260914-144157`，通过本机代理重新安装官方 `build-tools;35.0.0`。
- **修改文件列表**
    - `CHANGELOG.md` - 记录本次 Android Studio / Android SDK 本机环境修复。
    - `D:\AndroidSDK\cmdline-tools\latest\**` - 新增 Android SDK 命令行工具。
    - `D:\AndroidSDK\build-tools\35.0.0\**` - 重新安装完整的 Build Tools 35.0.0。
    - 用户环境变量 - 移除失效 `STUDIO_VM_OPTIONS` 和旧 SDK PATH 项，新增 Command-line Tools `bin` PATH 项。
- **验证结果**
    - `sdkmanager --version` 返回 `22.0`，`sdkmanager.bat` 与 `avdmanager.bat` 均存在。
    - Build Tools 35.0.0 的 `aapt.exe`、`aapt2.exe`、`d8.bat`、`zipalign.exe`、`apksigner.bat`、`source.properties` 与 `package.xml` 全部存在，`Pkg.Revision=35.0.0`。
    - Android Studio 已绕过第一层失效 VM 配置，但内置 JBR 继续报 `sun.nio.fs` 模块访问错误；安装目录 VM 参数修复尚未实施，待用户单独确认。

---

## 2026-09-14 19:16:38 | 优化代码

- **笔记查看与编辑器返回入口接入公共 BackButton**
    - `NoteViewerHeader` 与 `PlainTextEditor` 的私有 `Pressable + ArrowLeft` 实现改为公共 `BackButton`；保持 40×40dp 视觉尺寸、透明 ghost 背景、24dp 图标，并由公共组件提供布局外 2dp hitSlop。
    - 两处原有 `onBack` / `onCancel` 回调原样保留；未调整键盘收起、草稿落盘、同步、页面退出或保存按钮逻辑。
    - 同步阶段 2 待办、视觉规范、审计基线和架构索引，记录阅读与编辑器返回入口已迁移。
- **修改文件列表**
    - `src/features/notes/components/viewer/NoteViewerHeader.tsx` - 改用公共 `BackButton`。
    - `src/core/editor/components/plain-text-editor.tsx` - 改用公共 `BackButton`，保留编辑器取消回调。
    - `待办事项.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md` - 更新迁移状态与尺寸契约。
    - `CHANGELOG.md` - 记录本次迁移。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、两个改动文件的 Expo ESLint、`npm run design:audit` 与 `git diff --check` 通过。
    - `npm run theme:check` 未通过：当前 `global.css` 与默认主题预设不同步；本批未改主题文件，未执行会写入生成文件的 `npm run theme:sync`。
    - 未运行测试、构建、导出、浏览器或设备验收；返回后键盘收起、草稿保存和页面退出时序仍由用户主动验收。

---

## 2026-09-14 19:16:06 | 修复问题

- **修复验证码公共按钮在登录与注册页丢失胶囊外观的问题**
    - `AppButton` 将调用方 `className` 移至外层容器；验证码按钮的 `w-[120px]` 现在只决定占用宽度，不再与内部 `Pressable` 的主题样式合并冲突。
    - 内部按钮显式拉伸至容器宽度，继续负责 48dp 高度、16dp 圆角、主题背景、横向内容、加载与禁用态；验证码发送、倒计时及禁用逻辑不变。
    - 该修复同时适用于其他向 `AppButton` 传入布局类名的调用方；`AuthButton` 仍是无行为变更的兼容封装。
- **修改文件列表**
    - `src/shared/ui/AppButton/AppButton.tsx` - 分离外层布局与内部胶囊视觉样式。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 已完成源码与差异复核；依照当前授权边界，未运行测试、构建或设备/浏览器验收。
    - 请在设备上确认登录与注册页的「发送验证码」为 120×48dp 浅蓝胶囊，并检查默认、禁用、发送中与倒计时状态。

---

## 2026-09-14 19:11:49 | 修复问题

- **修复公共状态胶囊按钮在分类操作弹窗中竖向渲染的问题**
    - `StatusToggle` 将调用方布局类名从内部可点击节点移至外层容器；`className="flex-1"` 现在仅负责两个状态按钮的等宽分配，不再参与内部样式合并。
    - 内部 `Pressable` 显式拉伸至外层宽度，并保持图标与文字横向排列、48dp 高度、16dp 圆角、8dp 图文间距、主题背景与按压态。
    - 笔记操作与分类操作继续复用同一公共组件；置顶/标星的业务回调、文案、选中态和禁用态均未改动。
- **修改文件列表**
    - `src/shared/ui/StatusToggle/StatusToggle.tsx` - 分离外层宽度布局与内部胶囊视觉布局。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 已完成源码与差异复核；依照当前授权边界，未运行测试、构建或设备/浏览器验收。
    - 请在设备上确认图标与文字横向排列、两个按钮等宽，以及默认/选中状态外观。

---

## 2026-09-14 18:36:03 | 优化代码

- **置顶/标星状态按钮抽取为公共组件 `StatusToggle`**
    - 将笔记操作弹窗内的局部组件 `StatusAction`（置顶/标星胶囊按钮）与分类操作弹窗内的内联实现，统一抽取为全局公共组件 `StatusToggle`（`src/shared/ui/StatusToggle/`），两处调用点改为复用同一实现，消除样式分叉。
    - 组件规格：高 48dp、图标 20 + 间距 8dp + 文字 17 号常规（`AppText variant="control"`）、圆角 16dp（`radii.control`，continuous）、水平内边距 16dp；配色复用 `componentRecipes.iconButton` 三态（默认 surfaceControl/#F0F0F0、选中 surfaceSelected/#EAF2FF + brandPrimary/#007AFF、禁用 secondaryDisabled/#F7F7F7 + textDisabled/#B2B2B2），按压透明度走 motion 预设；a11y `role=button` + `state={selected, disabled}`；宽度不写死，由调用方传 `className="flex-1"`。
    - 笔记操作弹窗：删除局部 `StatusAction`，视觉除圆角 14→16dp（legacy token 向语义 token 对齐）外像素级不变，文案保持静态「置顶/标星」。
    - 分类操作弹窗：内联 map 替换为两个 `StatusToggle`，动态文案「已置顶/未置顶」「已标星/未标星」按用户决策保留（文案 A 方案）；图标 24→20、图标与文字间距 4→8dp，与笔记弹窗参数收敛一致。
- **修改文件列表**
    - `src/shared/ui/StatusToggle/StatusToggle.tsx` - 新建公共组件。
    - `src/shared/ui/StatusToggle/index.ts` - 新建导出文件。
    - `src/shared/ui/index.ts` - 新增 `StatusToggle` 导出。
    - `src/features/notes/components/viewer/NoteContextMenu.tsx` - 删除局部 `StatusAction`（36 行），调用点改用 `StatusToggle`。
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 内联按钮实现（14 行）替换为 `StatusToggle`，移除未再使用的 `radii` 导入。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；5 个改动文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 7 个 node 测试文件（editor×4 / notifications / profile / reading）全部通过。
    - 两弹窗的按钮三态视觉与交互由用户在设备上验收。

---

## 2026-09-14 04:30:43 | 新增功能

- **「真机布局实测验收」固化为规范强制步骤**
    - 将已验证的 uiautomator dump → px/dp 对账流程写入四份规范文档顶部（§0）：截图判读、提出修改要求、验证改动三个场景必须先真机实测再下结论；无 adb 环境跳过实测，但不得编造数值。
    - 判读规则随文档固化：px 须除以「密度/160」换算 dp；文本 bounds 非触摸热区；原生树经 RN 扁平化看不到组件名与 padding 来源，定位原因须回源码；clickable 计数天然多于 RN 触摸组件数。
- **修改文件列表**
    - `scripts/ui-dump-parse.mjs` - 新增一键实测脚本：自动读密度（Override 优先）→ uiautomator dump → 解析输出每个元素的 class/文本/无障碍描述与 px、dp 边界，`--serial` 指定多设备目标机。
    - `docs/IRisNote视觉设计规范.md` - 顶部新增 §0，版本 1.11 → 1.12。
    - `docs/公共组件规范.md` - 顶部新增 §0，版本 1.4 → 1.5。
    - `docs/公共组件审计基线.md` - 顶部新增 §0（作为 `design:audit` 静态扫描的真机复核手段）。
    - `docs/样式开发规范.md` - 顶部新增 §0。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - 脚本真机实跑通过（PLQ110，476dpi，1dp=2.975px），输出格式与预期一致；`npx eslint --no-cache --no-warn-ignored scripts/ui-dump-parse.mjs` 通过（0 警告）。
    - 文档为纯 Markdown 变更，不涉及代码逻辑；§0 正文与落稿范围（含《样式开发规范》、无 adb 跳过条款）均经用户确认。

---

## 2026-09-14 04:27:39 | 优化代码

- **登录/注册页"发送验证码"按钮迁移为公共 AppButton**
    - 登录页与注册页的"发送验证码"按钮调用点由 `AuthButton`（薄封装）改为直接使用公共 `AppButton`（`variant="tonal"` 显式声明），与组件库统一迁移方向一致。
    - 属性同步：`busy` → `loading`（AppButton 原生命名）；`className="w-[120px]"`、label 三态（发送中…/倒计时/发送验证码）、disabled 逻辑（邮箱无效/倒计时中/提交中）全部保持不变，布局与视觉零变化（120×48dp、surfaceControl 底、16dp 连续圆角）。
    - `AuthButton` 组件本身保留：登录主按钮、注册主按钮、WelcomeScreen 仍在使用，迁移去留待后续决策。
- **修改文件列表**
    - `src/features/auth/screens/LoginScreen.tsx` - "发送验证码"改用 `AppButton`，新增 import。
    - `src/features/auth/screens/RegisterScreen.tsx` - 同款同步迁移，新增 import。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建；按钮三态（默认/禁用/发送中）视觉与交互由用户在设备上验收（需重新构建后查看，旧构建显示为纯文字样式）。

---

## 2026-09-14 04:00:30 | 优化代码

- **分类弹窗名称输入框升级为公共 InputSave**
    - 分类操作弹窗（重命名）与新建分类弹窗的名称输入框由公共 `Input` 迁移到公共 `InputSave`（52dp 输入框 + 52×52dp tonal 保存按钮，Save 图标 20dp），与笔记详情页 `NoteRename` 的保存输入约定统一。
    - 分类操作弹窗：保留自动聚焦、10 字限制、失焦/键盘提交保存；新增保存按钮点击保存（`onSave`），三路保存共用 `handleRename`。
    - 新增一次性提交锁 `renameLockRef`：Android 上点保存按钮会先触发输入框 blur 再触发 press，锁可防止重命名被重复调用；锁在每次进入编辑态时复位。
    - 新建分类弹窗：保存按钮与键盘"完成"均触发 `handleSubmit`（沿用空名称拦截）；底部"确定"按钮及其禁用态保持不变；未使用 `disabled` 属性（`InputSave.disabled` 会连同输入框一起禁用，空名称时会锁死输入），空名称由 `handleSubmit` 拦截。
    - 编辑态标题行高度 48dp → 52dp（进入编辑瞬间微增高，与 `NoteRename` 一致）。
- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 重命名输入改用 `InputSave`，新增提交锁。
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 名称输入改用 `InputSave`，接 `onSave`/`onSubmitEditing`。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建/设备验收；保存按钮视觉与交互由用户验收。

---

## 2026-09-14 03:25:46 | 优化代码

- **分类新建与重命名输入框接入公共 Input**
    - 将分类操作弹窗的重命名输入框和新建分类弹窗的名称输入框从私有 `TextInput` 样式迁移到公共 `Input`。
    - 两处字段统一使用 48dp 高度、`radii.field = 16dp`、1dp 常驻边框、主题表面色、17sp 文字和聚焦主色边框；页面不再重复声明输入框身份颜色、圆角和字号。
    - 保留分类名称 10 字限制、输入值、自动聚焦、失焦保存、键盘提交、空名称拦截和分类接口逻辑不变。
    - 同步公共组件待办、设计审计迁移状态和架构索引。
- **修改文件列表**
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 新建分类名称字段改用公共 `Input`。
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 分类重命名字段改用公共 `Input`。
    - `待办事项.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md` - 更新分类输入迁移状态和审计快照。
    - `CHANGELOG.md` - 记录本次分类输入框迁移。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、两个分类组件与公共 Input 的目标 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 设计审计中直接包含 `TextInput` 的文件由阶段 0 的 11 个降至 9 个；主题目录外固定颜色 14、裸字号 19，均未增加。
    - 未运行测试、构建、导出、浏览器或设备验收；输入框自动聚焦、键盘和视觉效果由用户主动验收。

---

## 2026-09-14 03:04:36 | 新增功能 / 优化代码

- **推进公共组件阶段 2 并完成认证域首批接入**
    - 新增 `AppText`、`AppButton`、`IconButton`、`BackButton`、`Input` 五个公共基础组件，并统一从 `@/shared/ui` 导出；颜色读取语义 Token/组件配方，圆角读取用途 Token，页面只保留布局扩展入口。
    - `AppButton` 实现 primary/secondary/tonal/danger/text、44/48dp 尺寸、加载锁定、显式禁用配色和 16dp 圆角；危险禁用态保持浅红背景 `#F8D7D2` 与红色内容 `#E94634`。
    - `IconButton` 实现 ghost/tonal/selected、40/48dp 尺寸、紧凑触控补偿、加载/选中/禁用无障碍状态；`BackButton` 统一 24dp ArrowLeft，并保留纯图标和带文字模式。
    - `Input` 实现单行 48dp、多行最小 96dp、16dp 圆角、常驻 1dp 边框，以及聚焦/错误/禁用/只读、前后内容、清空、原生 ref、键盘和自动填充属性透传。
    - 认证域的按钮、字段、密码显隐和返回入口已接入公共组件；`AuthButton`、`AuthField` 保留为业务薄适配，认证校验、接口、系统返回与键盘逻辑不变。旧 `Button`、`TextField` 继续作为迁移兼容入口。
    - 依据 Expo SDK 56 文档评估 `@expo/ui` Universal API；普通输入为保持现有受控字符串和原生 TextInput 契约使用 React Native 原语封装，后续 Picker/Switch/BottomSheet 仍优先评估 `@expo/ui`。
    - 同步待办、公共组件规范、审计基线、架构索引；记录用户已完成此前浮动工具栏 16dp 圆角验收。
- **修改文件列表**
    - `src/shared/ui/AppText/*`、`AppButton/*`、`IconButton/*`、`BackButton/*`、`Input/*`、`src/shared/ui/index.ts` - 新增阶段 2 基础组件、类型与公共出口。
    - `src/features/auth/components/AuthButton.tsx`、`AuthField.tsx`、`AuthScreenLayout.tsx` - 将认证视觉接入公共组件，保留业务适配和返回流程。
    - `待办事项.md`、`docs/公共组件规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md` - 更新接口、技术选型、迁移状态、审计快照和用户验收记录。
    - `CHANGELOG.md` - 记录本次阶段 2 变更。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、新增组件及认证适配文件的 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 审计快照为 242 个源码文件、18,490 行；主题目录外固定颜色 14、裸字号 19，均未因本批增加。
    - `npx prettier --write` 因项目当前命令解析到 `jest-snapshot-prettier` 并报 `getPlugin() requires astFormat to be set`，未改写源码；已以目标 ESLint 和手工格式复核替代，未新增格式化依赖或修改锁文件。
    - 未运行测试、构建、导出、浏览器或设备验收；阶段 2 新组件的视觉与交互仍由用户主动验收。

---

## 2026-09-14 02:25:12 | 优化代码

- **浮动编辑器工具栏圆角调整为 16dp**
    - 将无键盘浮动工具栏从复用旧 `radius.hyperControl = 14dp` 改为独立语义 Token `radii.editorToolbar = 16dp`，避免继续与按钮圆角耦合。
    - 保持浮动工具栏 225×48dp、底部 40dp 间距、白色背景、阴影、滚动显隐和点击逻辑不变；键盘期 43.2dp 通栏仍为 0dp 圆角并紧贴输入法。
    - 同步默认主题预设、生成后的 CSS Token、公共组件规范、视觉规范、审计基线、架构索引、编辑器进度和公共化待办。
- **修改文件列表**
    - `src/core/editor/components/editor-bottom-toolbar.tsx` - 接入独立 16dp 工具栏圆角 Token。
    - `src/shared/theme/presets/default-light.json`、`src/shared/theme/theme.types.ts`、`global.css` - 新增并同步 `editorToolbar` 圆角。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md`、`待办事项.md` - 更新当前规格、状态与实施记录。
    - `CHANGELOG.md` - 记录本次圆角调整。
- **验证结果**
    - `npx tsc --noEmit`、目标文件 Expo ESLint、`npm run theme:check` 和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；视觉效果由用户主动验收。

---

## 2026-09-14 02:20:22 | 优化代码

- **完成公共组件阶段 0 审计与阶段 1 主题基座首批实施**
    - 新增默认浅色主题预设，将原始色板、语义颜色、组件状态配方、圆角、间距、字号和动效值集中到单一来源；保留旧 `colors`、`radius` 导出作为渐进迁移兼容层。
    - 新增 NativeWind CSS Token 同步与一致性检查脚本，以及可重复执行的设计系统审计脚本；记录 232 个源码文件、18,009 行源码和主要漂移位置的审计基线。
    - 按已确认规范将现有 HyperOS 按钮、有底状态控件、图标选择单元和阅读进度气泡接入 16dp 语义圆角；编辑器浮动工具栏继续使用兼容 14dp，避免旧 `hyperControl` 复用造成连带变化。
    - 危险按钮禁用背景与内容分别由 `destructiveDisabled = #F8D7D2`、`onDestructiveDisabled = #E94634` 统一提供，组件配方不再硬编码状态颜色。
    - 同步公共组件规范、视觉规范、样式开发规范和公共化待办状态；当前尚未开始 AppButton、Input、AppDialog 等组件本体及业务调用方迁移。
- **修改文件列表**
    - `src/shared/theme/presets/default-light.json` - 新增默认主题唯一原始值来源及 CSS 映射表。
    - `src/shared/theme/palette.ts`、`semantic-colors.ts`、`component-recipes.ts`、`theme-preset.ts`、`theme-typography.ts`、`theme.types.ts` - 新增主题解析、类型和组件配方。
    - `src/shared/theme/colors.ts`、`radius.ts`、`spacing.ts`、`typography.ts`、`index.ts` - 接入主题预设并保留旧调用方兼容导出。
    - `global.css`、`package.json`、`scripts/sync-theme-css.mjs`、`scripts/audit-design-system.mjs` - 增加 CSS 托管区块、同步命令和审计命令。
    - `src/features/notes/categories/components/CategoryActionModal.tsx`、`CategoryIconPicker.tsx`、`src/shared/ui/ProgressBubble/ProgressBubble.tsx` - 接入 16dp 语义圆角。
    - `docs/公共组件审计基线.md`、`docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/样式开发规范.md`、`待办事项.md` - 记录审计基线、主题来源、圆角规范与推进状态。
- **验证结果**
    - `npx tsc --noEmit` 通过。
    - 受影响 TypeScript、TSX 与脚本的 Expo ESLint 检查通过。
    - `npm run theme:check`、`npm run design:audit`、脚本语法检查和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；交互与视觉验收仍由用户主动发起。

---

## 2026-09-14 02:01:38 | 优化代码

- **建立公共组件公共化实施待办**
    - 汇总聊天中确认的按钮、返回入口、输入框、图标选择器、弹窗、状态与列表组件需求，并结合当前项目重复实现和主题 Token 漂移情况形成实施基线。
    - 将公共化工作拆分为主题基座、基础组件、组合组件、状态组件、调用方迁移、治理验收六个阶段；每项补充现状来源、实施步骤、依赖关系、迁移范围、排除项和完成标准。
    - 按已确认目标记录普通按钮、有底图标按钮、图标选择单元和阅读进度气泡统一为 16dp 圆角；输入框新增独立 16dp 字段圆角，并要求先拆分旧 `hyperControl` 语义以避免连带修改。
    - 固化危险按钮禁用背景 `#F8D7D2`、文字与图标 `#E94634`，并补充可替换主题、Web/原生映射、一致性检查和用户验收边界。
- **修改文件列表**
    - `待办事项.md` - 新增公共组件公共化的分阶段详细实施方案。
    - `CHANGELOG.md` - 记录本次文档规划变更。

---

## 2026-09-14 01:14:41 | 优化代码

- **建立可替换主题的公共组件规范**
    - 新增公共组件目标规范，明确按钮、图标按钮、返回按钮、输入框、表单字段、图标选择器和弹窗的形状、尺寸、颜色映射、状态优先级、无障碍及 TypeScript 接口。
    - 建立 ThemePreset、基础色板、语义颜色和组件配方三层契约；规定后期手动修改主题时集中替换主题预设，页面不得逐项覆盖组件身份色。
    - 明确当前源码尚未完成公共组件迁移，保留 `global.css` 与 `src/shared/theme` 双向同步边界，并记录后续单一主题源及一致性检查目标。
    - 按用户确认，将危险按钮禁用态固定为浅红背景 `#F8D7D2`、红色文字与图标 `#E94634`。
- **修改文件列表**
    - `docs/公共组件规范.md` - 新增公共组件、主题、状态、接口和迁移规范。
    - `docs/IRisNote视觉设计规范.md` - 升级至 1.9，接入公共组件规范并修正危险按钮禁用字色。
    - `docs/样式开发规范.md` - 增加可替换主题及调用方样式约束。
    - `CHANGELOG.md` - 记录本次规范变更。
## 2026-09-14 04:16:49 | 优化代码

- **移除根布局底部安全区留白**
    - 根 `SafeAreaView` 仅保留顶部及左右安全区，不再应用底部安全区 inset，使页面内容延伸至 Android 系统手势区域后方。
    - 保留 Android 系统导航手势横条本身，不修改系统导航栏可见性、业务逻辑或页面内部间距。
- **验证结果**
    - 目标文件 ESLint、全量 TypeScript 和本次文件差异空白检查通过。
    - `Pixel_9_Pro_X` 已触发热刷新，但现有 Expo/Metro `8082` 进程对状态页和入口请求均超时，模拟器持续显示 `Refreshing...`；本轮未重启开发服务，运行时视觉验收尚未完成。
- **修改文件列表**
    - `src/app/_layout.tsx`
    - `CHANGELOG.md`

---

## 2026-09-14 03:51:06 | 优化代码

- **用户页改为移动端横纵全屏布局**
    - 移除 560dp 最大宽度、屏幕宽度检测、380dp 紧凑账户样式、760dp 悬浮导航避让和底部 150dp 预留；用户页不再为了规避 Tab 栏而压缩内容。
    - 滚动内容与内部布局均使用 `flexGrow: 1` 占满手机可用高度；账户与概览位于顶部、继续阅读位于中部、我的内容位于底部，三区使用弹性间距铺满一屏，内容超高时自然滚动。
    - 内容区使用全宽布局和四周 16dp 内边距；头像固定 64×64dp、昵称固定 20sp，不再针对 320dp 超小视口压缩组件。
- **将用户页验收标准切换为移动端**
    - 基准视觉尺寸调整为 390×844 与 412×915，只验收 Android/iOS 移动端的安全区、全屏宽高、滚动、触控和状态表现。
    - Web 宽屏、桌面居中和 320×568 不再作为用户页设计与视觉验收条件；当前阶段明确将 Tab 栏遮挡排除在用户页变更范围外。
    - TypeScript、相关 ESLint、差异空白检查和 110 项 Node 测试通过；Android 与 iOS Hermes Bundle 均成功导出。
    - 本轮未执行 Web 宽屏验收，也未连接 Android/iOS 真机；移动端视觉效果、安全区和头像权限仍由真机验收确认。
- **修改文件列表**
    - `src/features/profile/screens/ProfileScreen.tsx`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `design-qa.md`
    - `README.md`
    - `CHANGELOG.md`

---

## 2026-09-14 03:32:18 | 新增功能 / 优化代码

- **将用户页重构为无顶栏的个人工作台**
    - 移除蓝色资料头图、顶部标题栏、静态深色模式/隐私/反馈菜单和重复退出入口，页面从安全区下方 16dp 直接进入账户卡片。
    - 新增笔记、分类、标星三项真实概览；本地未同步笔记优先覆盖同一服务端笔记，服务端独有项只用于补足，避免重复计数。
    - 新增“继续阅读”卡片，从当前账号的结构化阅读记录中选择仍未读完的最新笔记；无记录时展示可进入笔记页的明确空状态。
    - 新增全部笔记、星标笔记和草稿箱三个真实快捷入口；笔记页支持 `view=starred` 筛选及 `drafts=1` 打开草稿箱，并在关闭草稿箱后清除一次性参数。
    - 用户 Tab 的悬浮主按钮由闪电图标改为设置齿轮，并补充可访问名称；窄于 760dp 时为右侧悬浮导航预留独立轨道，避免 320dp 屏幕遮挡内容。
    - 账户与概览加载、头像上传、未登录、长文本截断和数据暂不可用均有明确状态；未新增后端接口或依赖。
- **验证结果**
    - Expo SDK 56 版本化文档已核对；TypeScript、相关 ESLint、差异空白检查和 Expo Web 生产导出通过，仍输出 16 个静态路由。
    - 110 项 Node 测试全部通过，新增概览合并、继续阅读选择及分账号阅读记录枚举覆盖。
    - 可见 Chrome 命名会话完成宽屏、390×844、320×568 验收，并验证设置、星标筛选和草稿箱真实入口；合成账户与模拟数字仅用于视觉验收，完成后已从源码移除。
    - 浏览器控制接口不提供字面量 `--headed --persistent` 参数，实际使用可见且持续复用的 Chrome 命名会话，并在结束前恢复默认视口。
- **修改文件列表**
    - `src/features/profile/screens/ProfileScreen.tsx`
    - `src/features/profile/hooks/useProfileOverview.ts`
    - `src/features/profile/profile-overview.ts`
    - `src/features/notes/screens/NotesScreen.tsx`
    - `src/features/notes/reading/reading-progress-store.ts`
    - `src/core/navigation/navigation.constants.ts`
    - `src/core/navigation/navigation.types.ts`
    - `src/core/navigation/components/FloatingActionButton.tsx`
    - `tests/profile/profile-overview.test.cjs`
    - `tests/reading/reading.test.cjs`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `README.md`
    - `CHANGELOG.md`

---

## 2026-09-14 02:58:10 | 优化代码

- **设置首页验证收口**
    - 107 项 Node 测试全部通过；设置页面及组件 ESLint、差异空白检查通过。
    - Expo Web 生产导出成功，输出包含 `/pages/user/settings` 在内的 16 个静态路由。
    - 可见浏览器完成宽屏、390×844 和 320×568 验收；确认账户卡、四格概览、分组设置、禁用态和底部滚动布局，浏览器无 error/warning 日志。
    - 用于合成账户的本地预览路由已删除，未调用真实登录、头像上传、退出登录或同步接口。
    - 全量 TypeScript 仍被实施前已有的 `(tabs)/_layout.tsx` 与 `AuthScreenLayout.tsx` 两处 `/auth/welcome` typed-route 错误阻断，本次设置文件未新增类型错误。
    - 浏览器工具不提供 `--headed --persistent` 参数，实际使用可见的 Codex 应用内浏览器并恢复默认视口。
- **修改文件列表**
    - `CHANGELOG.md`
    - `design-qa.md`

---

## 2026-09-14 02:54:47 | 新增功能

- **新增 IRisNote 设置首页 UI**
    - 将静态占位页重构为账户卡片、四格状态概览和三组设置卡片，使用项目既有 `#007AFF` 主色、浅色背景与 HyperOS 圆角层级。
    - 复用认证与头像能力，支持头像入口、登录信息、加入时间、版本号、返回与退出登录；加载和未登录直达均有明确状态。
    - 主题、编辑阅读、通知、全局同步、数据与隐私、帮助反馈等未接入能力统一显示为「规划中」禁用态，不提供虚假跳转。
    - 完全移除参考图中的会员、购买、套餐、容量和轮播语义；未新增依赖、设置持久化或后端接口。
    - 390×844、320×568 与宽屏浏览器结构检查通过，窄屏可以滚动到底部；浏览器没有 error/warning 日志。
- **修改文件列表**
    - `src/features/settings/screens/SettingsScreen.tsx`
    - `src/features/settings/components/SettingsOverviewItem.tsx`
    - `src/features/settings/components/SettingsRow.tsx`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `README.md`
    - `TODO.md`
    - `design-qa.md`
    - `CHANGELOG.md`
- **验证进度**：设置相关 ESLint 与 Expo Web 导出通过；全量 TypeScript 仍被本次修改前已有的两处 `/auth/welcome` typed-route 错误阻断，未越权修改认证文件。

---

## 2026-09-14 02:44:25 | 优化代码

- **确认设置首页参考布局与真实能力边界**
    - 采用账户信息、四格状态概览和分组设置卡片的纵向结构，沿用 IRisNote `#007AFF` 品牌主色与浅色 HyperOS Token。
    - 明确排除会员中心、购买入口、容量套餐、容量进度条和轮播圆点。
    - 规定尚未接入的主题、编辑阅读、通知、同步、数据及隐私能力显示为「规划中」禁用态，避免虚假交互。
    - 固化页面、卡片、设置行、顶栏、头像、退出入口及窄屏滚动的尺寸和间距。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md`
    - `CHANGELOG.md`

---

## 2026-09-12 11:28:07 | 优化代码

- **欢迎与认证参考布局验证完成**
    - TypeScript、相关页面及路由 ESLint、差异空白检查通过；Web 生产导出成功，包含欢迎页在内的 16 个路由。
    - 浏览器确认欢迎页品牌居中和底部双按钮、登录/注册居中标题、返回入口及字段排版。
    - 320×568 注册表单与 320×360 欢迎页可以滚动访问底部；1280×800 注册页宽屏居中正常。
    - 验证欢迎页进入登录、登录与注册互相替换、表单返回欢迎页、直接打开注册后返回欢迎页，以及未登录从根路径进入欢迎页。
    - 已恢复浏览器视口并停留欢迎页。浏览器工具不提供 --headed --persistent 参数，采用可见的现有浏览器会话。
    - Android 系统返回、iOS 手势/键盘、真实认证及退出登录后的完整联调未进行，仍待真机与账户验收。
- **修改文件列表**
    - `CHANGELOG.md` - 记录检查结果与验证边界。

---

## 2026-09-12 11:23:50 | 新增功能 / 优化代码

- **按参考图布局重构欢迎与认证页面**
    - 新增欢迎页：复用 IRisNote 图标，品牌区居中，注册/登录双按钮置底，短屏可滚动。
    - 登录注册新增 44dp 返回入口、居中标题与说明，表单边距改为 16dp，字段及主按钮间距改为 28dp。
    - 未登录 Tabs 入口转向欢迎页；表单切换替换路由，返回欢迎页时支持无历史栈回退；Android 返回键同步处理。
    - 沿用现有认证字段、接口、配色与错误反馈，未调整工作区中已有的横幅组件改动。
- **修改文件列表**
    - `src/features/auth/screens/WelcomeScreen.tsx`
    - `src/app/auth/welcome.tsx`
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/app/_layout.tsx`
    - `src/app/(tabs)/_layout.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：实施完成，静态检查与浏览器验证进行中。

---

## 2026-09-12 11:23:08 | 优化代码

- **确认参考图布局适配规格**
    - 新增欢迎页居中品牌区及底部双按钮规范；登录注册改为左上返回、居中标题、16dp 页边距和 28dp 字段间距。
    - 保留 IRisNote 内容、配色和认证字段，记录欢迎入口与返回规则。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md`
    - `CHANGELOG.md`

---

## 2026-09-12 09:43:04 | 优化代码

- **登录注册重构验证收口**
    - `npx tsc --noEmit`、认证组件及页面 ESLint、`git diff --check` 均通过。
    - `npx expo export --platform web --output-dir .expo/auth-web-export` 成功导出 15 个路由。
    - 浏览器验证通过：初始禁用、邮箱失焦错误及修正、密码显隐、注册密码最短长度与一致性、修正后按钮启用、登录注册切换。
    - 320×568 窄屏注册表单可滚动访问底部；1280×800 宽屏实测字段宽 440dp、左右居中。已恢复原视口并清空测试表单。
    - 浏览器工具不提供 `--headed --persistent` 参数，实际复用并显示现有浏览器。
    - 未发送真实验证码、未提交真实认证；接口成功/失败反馈、加载时序及 Android/iOS 键盘交互仍需联调与真机验收。
    - 格式化通过直接调用项目 Prettier API 完成；现有 npx prettier 入口指向 jest-snapshot-prettier，未改动工具链。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `CHANGELOG.md`

---

## 2026-09-12 09:39:37 | 优化代码

- **登录注册页面统一为 HyperOS 风格**
    - 新增认证共用页面、字段和按钮组件，统一 440dp 内容宽度、48dp 控件、字体、圆角、间距及密码显隐触控区。
    - 表单增加滚动、键盘避让、聚焦/失焦错误、明确的加载与禁用状态。
    - 字段及接口错误就地展示，发送成功使用横幅，认证成功保存刷新会话后直接跳转用户页。
    - 保留认证接口与字段，使用 Ref 锁防止重复请求；注册页面直接打开时提供登录路由回退。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：TypeScript 检查通过，相关 ESLint 与浏览器验证继续执行。

---

## 2026-09-12 09:37:01 | 优化代码

- **确认登录注册 HyperOS 视觉规格**
    - 记录已确认的页面布局、dp 间距、字段顺序、按钮层级及反馈方案，作为后续实现依据。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md` - 新增登录注册页面规格。
    - `CHANGELOG.md` - 记录已确认规格。

---

## 2026-07-26 02:05:47 | 新增功能

- **初始化 CodeGraph 项目索引**
    - 为 IRisNote 建立本地代码知识图谱，首次索引覆盖 129 个文件，生成 948 个节点和 1,687 条关系边。
    - 使用 CodeGraph 验证应用入口调用链，成功解析 `RootLayout → AppProviders → AuthProvider` 及相关影响范围。
    - 保留 CodeGraph 自动生成的目录级忽略规则，使数据库、日志和运行时文件仅保存在本机，不进入版本控制。

- **修改文件列表**
    - `.codegraph/.gitignore` - 新增 CodeGraph 生成文件忽略规则。
    - `.codegraph/codegraph.db` - 新增本地代码图谱数据库（已忽略，不提交）。
    - `CHANGELOG.md` - 记录 CodeGraph 初始化与验证结果。

---

## 2026-07-19 01:18:27 | 优化代码

- **使用 Tailwind Variants 重构状态样式，保持现有视觉与交互不变**
    - 接入 `tailwind-variants` 默认构建并补齐 `tailwind-merge`，统一解决调用方样式覆盖冲突。
    - 将 Button、Card、ModalPanel、Screen、TextField 的手写变体映射迁移为类型安全的 `tv()` 定义；Button 的原生 `disabled` 属性同步驱动禁用外观，TextField 通过 `invalid` 驱动错误边框。
    - 将浮动菜单、分类操作、分类按钮、图标选择器、新建分类和笔记上下文菜单中的条件类名迁移为 boolean variants 或 slots。
    - 保留原有颜色、尺寸、间距、圆角、透明度、状态条件和业务行为，不调整设计 Token 或页面视觉。
    - 为 VS Code 配置 `tv()` 内的 Tailwind CSS IntelliSense，并更新样式开发规范。

- **修改文件列表**
    - `package.json`
    - `package-lock.json`
    - `.vscode/settings.json`
    - `src/shared/ui/Button/Button.tsx`
    - `src/shared/ui/Card/Card.tsx`
    - `src/shared/ui/ModalPanel/ModalPanel.tsx`
    - `src/shared/ui/Screen/Screen.tsx`
    - `src/shared/ui/TextField/TextField.tsx`
    - `src/core/navigation/components/FloatingMenu.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/features/notes/categories/components/CategoryActionModal.tsx`
    - `src/features/notes/categories/components/CategoryButton.tsx`
    - `src/features/notes/categories/components/CategoryIconPicker.tsx`
    - `src/features/notes/categories/components/CreateCategoryModal.tsx`
    - `src/features/notes/components/viewer/NoteContextMenu.tsx`
    - `docs/样式开发规范.md`
    - `CHANGELOG.md`

---

## 2026-07-12 13:35:31 | 优化文档

- **重写项目介绍并建立当前源码开发文档体系**
    - 重写 `README.md`，仅保留项目介绍、真实功能状态、技术栈、环境变量、安装启动和文档入口。
    - 新增项目架构与文件索引，逐项记录路由、Core、Shared、Feature、根配置和资源文件职责。
    - 新增业务模块与运行逻辑，说明认证、笔记、分类、头像和主导航的数据流、事件流及状态边界。
    - 新增后续开发指南，提供“修改目标到文件”的查询表，以及新增页面、Feature、API、组件、Hook 和状态方案的示例。
    - 更新样式开发规范，使目录、导入示例和 NativeWind/Theme Token 分工与当前源码一致。

- **修改文件列表**
    - `README.md`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `docs/后续开发指南.md`
    - `docs/样式开发规范.md`

---

## 2026-07-12 13:07:25 | 优化代码

- **阶段八：收敛分类操作弹窗的重复实现**
    - `CategoryActionModal` 复用共享 `CategoryIconPicker`，删除内部重复的图标分组与图标行渲染逻辑。
    - 抽出 `CategoryDeleteConfirmModal`，保留既有拖动确认、取消、二次确认和删除回调行为。
    - 使用分类常量判断“全部”虚拟分类，避免在操作弹窗中维护重复字面值。

- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 收敛图标选择并保留分类操作编排。
    - `src/features/notes/categories/components/CategoryDeleteConfirmModal.tsx` - 新增删除二次确认弹窗。

---

## 2026-07-12 12:02:45 | 优化代码

- **阶段七：清理迁移后的遗留入口**
    - 删除全项目无调用方的 `useSwipeSelect` Hook。
    - 清理 Notes、Categories、HTTP API 和 data 迁移后不再承载文件的旧目录。
    - 不改变应用功能、路由或状态行为。

- **修改文件列表**
    - `src/hooks/useSwipeSelect.ts` - 删除无引用的通用滑动选择 Hook。
    - `src/api`、`src/data`、`src/components/Note`、`src/components/FloatingBarComponents`、`src/hooks/notes`、`src/hooks/FloatingBar` - 删除完成迁移后的空目录。

---

## 2026-07-12 11:57:53 | 优化代码

- **阶段六：迁移 Excerpt Feature 的页面入口**
    - 将剪贴板摘录列表和新建摘录的占位页面迁入 `src/features/excerpts/screens`。
    - 保留 `/(tabs)/excerpt` 和 `/pages/excerpt/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 移除原摘录占位页面中没有业务用途的 Reanimated 状态。

- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx`、`src/features/excerpts/screens/CreateExcerptScreen.tsx`、`src/features/excerpts/index.ts` - 新增 Excerpt Feature 页面和入口。
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/pages/excerpt/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:47:14 | 优化代码

- **阶段五：迁移 Todo Feature 的页面入口**
    - 将待办列表和新建待办的占位页面迁入 `src/features/todos/screens`。
    - 保留 `/(tabs)/todo` 和 `/pages/todo/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 未新增尚无真实业务需求的 API、状态管理、Hooks 或类型文件。

- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx`、`src/features/todos/screens/CreateTodoScreen.tsx`、`src/features/todos/index.ts` - 新增 Todo Feature 页面和入口。
    - `src/app/(tabs)/todo/index.tsx`、`src/app/pages/todo/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:39:53 | 修复问题

- **修复 FloatingBar 遗留文件导致的 TypeScript 解析失败**
    - 删除重新出现在 `src/components/FloatingBarComponents/FloatingBar.tsx` 的废弃实现；该文件第 125 行 JSX 属性已损坏，且项目内不存在对旧路径的引用。
    - 正式实现继续使用 `src/features/notes/categories/components/CategoryBar.tsx`，避免同时维护两份 FloatingBar。

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 删除无引用且语法损坏的旧实现。

---

## 2026-07-12 10:57:57 | 优化代码

- **阶段四：迁移 Notes 与 Notes Categories Feature**
    - 将笔记、分类 API、缓存、事件通知、选择状态、排序逻辑、页面与业务组件迁入 `src/features/notes`，路由文件改为仅转发 Screen 的薄包装。
    - 将笔记缓存与事件订阅拆分为独立模块；保留既有本地缓存、分类删除后的增量移除、置顶/标星乐观更新和失败回滚逻辑。
    - 将分类图标解析与图标分组收口到分类 Feature，并新增共享图标选择器供新建分类使用。
    - 保留 `/pages/note/[id]`、`/pages/note/create` 与 `/(tabs)/note` 路径及既有交互行为；不引入 Zustand。

- **修改文件列表**
    - `src/features/notes/api/*`、`notes.cache.ts`、`notes.events.ts`、`notes.selectors.ts`、`hooks/*`、`components/*`、`screens/*` - 迁入并拆分笔记业务实现。
    - `src/features/notes/categories/api/*`、`categories.constants.ts`、`categories.events.ts`、`category-icons.ts`、`category-selection.ts`、`components/*`、`hooks/*` - 迁入并拆分分类业务实现。
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为路由薄包装。
    - `src/api/notes.ts`、`src/api/categories.ts`、`src/data/notes.ts`、`src/data/categories.ts`、旧 Note/FloatingBar/Category 组件及 Hooks - 删除完成迁移后的旧入口。

---

## 2026-07-12 10:36:09 | 优化代码

- **阶段三：迁移认证、个人资料与设置 Feature**
    - 将认证 API、认证 Context、认证 Provider、认证 Hooks 和登录/注册 Screen 迁入 `src/features/auth`，原有认证路由改为仅转发 Screen 的薄包装
    - 将个人资料页面和头像 Hook 迁入 `src/features/profile`，并将用户资料请求、头像上传、图片采集和头像 URL/数据 URI 工具拆分为独立模块
    - 将设置占位页面迁入 `src/features/settings`，原有设置路由改为薄包装
    - 将用户资料响应归入 Auth 类型，将头像 URL 标准化归入 shared 工具，避免 Auth 与 Profile 形成双向依赖
    - 保留 `/auth/login`、`/auth/register`、`/(tabs)/user` 和 `/pages/user/settings` 路径，以及登录、注册、头像上传、会话恢复和退出登录的既有行为

- **修改文件列表**
    - `src/features/auth/api/auth.api.ts`、`src/features/auth/api/session.api.ts` - 迁入认证与会话 API
    - `src/features/auth/auth.context.ts`、`providers/AuthProvider.tsx`、`hooks/useAuth.ts`、`hooks/useEmailValidation.ts` - 迁入认证状态与 Hooks
    - `src/features/auth/screens/LoginScreen.tsx`、`RegisterScreen.tsx`、`index.ts` - 迁入认证页面与公开入口
    - `src/features/profile/api/profile.api.ts`、`services/avatar-picker.service.ts`、`utils/avatar.ts`、`hooks/useAvatar.ts`、`screens/ProfileScreen.tsx` - 迁入个人资料与头像能力
    - `src/features/settings/screens/SettingsScreen.tsx`、`src/features/settings/index.ts` - 迁入设置页面
    - `src/shared/utils/avatar.ts` - 新增跨 Feature 的头像 URL 标准化工具
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx`、`src/app/(tabs)/user/index.tsx`、`src/app/pages/user/settings.tsx` - 改为路由薄包装
    - `src/core/providers/AppProviders.tsx`、`src/app/(tabs)/_layout.tsx`、`src/components/FloatingBarComponents/FloatingBar.tsx` - 改为使用新的认证与个人资料入口
    - `src/api/auth.ts`、`src/api/user.ts`、`src/hooks/useAuth.tsx`、`src/hooks/useAvatar.ts`、`src/hooks/useEmailValidation.ts` - 删除已迁移的旧入口

## 2026-07-12 02:16:59 | 优化代码

- **阶段二：迁移共享能力与应用导航基础设施**
    - 将 HTTP client、错误规范化、主题令牌、动效令牌和基础 UI 组件迁入 `src/shared`，统一跨 Feature 的依赖入口
    - 新增共享 storage key，收口认证 token、用户信息和设备标识的存储键，保持现有存储值和会话行为不变
    - 新增 `AppProviders`，以等值方式统一认证 Provider 与手势根容器的应用级装配
    - 将浮动菜单、浮动操作按钮、Android 返回退出处理和导航 Hooks 迁入 `src/core/navigation`
    - 合并原本分散在菜单、手势和操作按钮中的 Tab 顺序、路径识别与主操作配置，保留当前单数路由和现有 URL
    - 删除完成迁移后的旧 HTTP、主题、UI、导航配置与导航 Hook 源文件；未改动 Notes、Categories、Auth 和 Profile 的业务实现

- **修改文件列表**
    - `src/shared/http/client.ts`、`src/shared/http/errors.ts` - 迁入 HTTP 请求与错误处理能力
    - `src/shared/storage/storage.keys.ts` - 新增共享 AsyncStorage 键定义
    - `src/shared/theme/*` - 迁入颜色、间距、圆角、排版和动效令牌
    - `src/shared/ui/*` - 迁入 Button、Card、ModalPanel、Screen 和 TextField 基础组件及统一导出
    - `src/shared/hooks/useDebouncedAction.ts` - 迁入通用操作防抖 Hook
    - `src/core/providers/AppProviders.tsx` - 新增应用级 Provider 组合
    - `src/core/navigation/*` - 新增导航配置、可见性状态、浮动导航组件、返回处理组件和导航 Hooks
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 改为使用 AppProviders、核心导航组件和共享主题
    - `src/app/**`、`src/components/**`、`src/hooks/**`、`src/api/**` - 更新为使用新的 shared/core 导入路径与 storage key
    - `src/api/client.ts`、`src/api/errors.ts`、`src/theme/*`、`src/components/ui/*`、`src/data/actions.ts`、`src/data/floatingMenuVisibility.ts`、相关旧导航组件与 Hooks - 删除已迁移源文件

## 2026-07-12 01:57:17 | 优化代码

- **阶段一：统一领域类型并修正依赖方向**
    - 新增共享 `User` 类型，以及认证、笔记、笔记分类与个人资料的领域类型模块，消除同一数据模型在 API、缓存、页面和组件中的重复声明
    - 将笔记缓存、笔记列表、详情查看器、滑动项和置顶/收藏 Hook 统一改为依赖 `Note` 类型，移除 Hook 对 UI 组件类型的反向依赖
    - 将分类 API、分类组件与分类操作 Hook 统一改为依赖分类领域类型，移除 API 对 `data` 层类型的反向依赖
    - 将认证 Context 和个人资料 API 统一改为依赖共享 `User` 类型，并将个人资料响应、头像上传和采集类型归入 Profile 模块
    - 保持现有路由、API 请求地址、缓存/事件机制和交互行为不变；Zustand 状态迁移留待后续独立阶段处理

- **修改文件列表**
    - `src/shared/types/user.ts` - 新增认证与个人资料共用的用户模型
    - `src/features/auth/auth.types.ts` - 新增认证 DTO 与认证上下文类型
    - `src/features/notes/notes.types.ts` - 新增笔记及创建、更新载荷类型
    - `src/features/notes/categories/categories.types.ts` - 新增分类及创建、更新载荷类型
    - `src/features/profile/profile.types.ts` - 新增个人资料与头像相关响应类型
    - `src/api/auth.ts`、`src/api/categories.ts`、`src/api/notes.ts`、`src/api/user.ts` - 改为使用并转出领域类型
    - `src/data/categories.ts`、`src/data/notes.ts` - 移除重复模型声明并引用统一类型
    - `src/hooks/useAuth.tsx` - 改为使用认证状态与共享用户类型
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为从 Notes 领域类型模块导入类型
    - `src/components/Note/NoteViewer.tsx`、`src/components/Note/SwipeableNoteItem.tsx` - 移除重复笔记类型声明
    - `src/components/FloatingBarComponents/FloatingBar.tsx`、`src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx`、`src/hooks/FloatingBar/*` - 改为从分类领域类型模块导入类型
    - `src/hooks/notes/useNotePin.ts`、`src/hooks/notes/useNoteStar.ts` - 移除对 UI 组件类型的依赖

## 2026-07-11 20:46:07 | 优化代码

- **重构 NativeWind 样式管理结构（保持现有视觉与布局）**
    - 在 `global.css` 中使用 NativeWind v5/Tailwind CSS v4 `@theme` 建立语义化颜色和圆角令牌，所有令牌沿用原始视觉值
    - 新增 `src/theme` TypeScript 令牌层，集中管理图标、SVG、动画和原生对象样式使用的颜色、间距、圆角与字号
    - 新增 `src/components/ui` 基础组件层，集中管理按钮、输入框、卡片、弹窗面板和页面容器的重复样式结构
    - 将页面和业务组件中散落的十六进制、RGB、RGBA 颜色迁移到主题令牌，并将 6 处 `StyleSheet.create` 等值迁移为 NativeWind 类名
    - 保留所有现有颜色值、组件尺寸、间距、圆角、阴影、排列、动画和交互逻辑，不进行视觉风格调整
    - 新增项目样式开发规范，并为旧 NativeWind 手册补充当前 v5/Tailwind CSS v4 配置提示

- **修改文件列表**
    - `global.css` - 新增 NativeWind 语义化颜色和圆角令牌
    - `src/theme/colors.ts` - 新增原生颜色令牌
    - `src/theme/spacing.ts` - 新增对象样式间距令牌
    - `src/theme/radius.ts` - 新增圆角令牌
    - `src/theme/typography.ts` - 新增字号与字重令牌
    - `src/theme/index.ts` - 新增主题统一导出
    - `src/components/ui/Button.tsx` - 新增按钮基础组件及背景变体
    - `src/components/ui/TextField.tsx` - 新增表单输入框基础组件
    - `src/components/ui/Card.tsx` - 新增卡片基础组件
    - `src/components/ui/ModalPanel.tsx` - 新增弹窗面板基础组件
    - `src/components/ui/Screen.tsx` - 新增页面根容器组件
    - `src/components/ui/index.ts` - 新增基础组件统一导出
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 使用主题颜色令牌
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/(tabs)/todo/index.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/(tabs)/note/index.tsx`、`src/app/(tabs)/user/index.tsx` - 使用语义类名、主题令牌和基础组件
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx` - 复用按钮与输入框基础组件
    - `src/app/pages/excerpt/create.tsx`、`src/app/pages/todo/create.tsx`、`src/app/pages/user/settings.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/pages/note/create.tsx` - 将静态 `StyleSheet` 等值迁移为 NativeWind 类名
    - `src/components/ActionButton.tsx`、`src/components/AddCategoryButton.tsx` - 使用语义类名与主题颜色
    - `src/components/addNoteClass.tsx`、`src/components/CategoryActionModel.tsx` - 复用按钮、弹窗面板和主题令牌
    - `src/components/FloatingMenu.tsx` - 使用浮动菜单语义令牌
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 使用主题颜色与圆角令牌
    - `src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx` - 使用主题颜色与语义圆角
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 使用分隔线语义颜色
    - `src/components/Note/Card/NoteCard.tsx`、`src/components/Note/Card/NoteSwipeActions.tsx` - 使用笔记卡片语义令牌
    - `src/components/Note/SwipeableNoteItem.tsx` - 使用卡片语义圆角
    - `src/components/Note/Viewer/NoteDetailStateView.tsx` - 复用按钮与主色令牌
    - `src/components/Note/Viewer/NoteViewerHeader.tsx`、`src/components/Note/Viewer/NoteViewerMeta.tsx` - 使用主题颜色令牌
    - `src/components/PinBadge.tsx`、`src/components/StarBadge.tsx` - 使用 SVG 主题颜色令牌
    - `src/hooks/FloatingBar/CategoryIndicator.tsx` - 使用状态与阴影颜色令牌
    - `docs/样式开发规范.md` - 新增项目样式维护与新增页面指南
    - `docs/NativeWind-Tailwind-完整手册.md` - 补充项目当前配置入口提示
    - `CHANGELOG.md` - 记录本次样式结构重构

---

## 2026-07-10 19:04:02 | 修复问题

- **修复笔记详情分类名称一直显示为全部**
    - 移除 `NoteViewerMeta` 中对全局当前选中分类名称的依赖，避免详情页把侧边栏选中状态误当作笔记所属分类
    - 根据当前笔记的 `categoryId` 获取分类列表并匹配真实分类名称，未找到或获取失败时显示“未知分类”
    - 将原本写在组件外部的 `useState` 和 `useEffect` 移入组件内部，修复 React Hook 使用位置错误

- **修改文件列表**
    - `src/components/Note/Viewer/NoteViewerMeta.tsx` - 按笔记分类 ID 解析分类名称并修复 Hook 位置
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-10 18:14:59 | 优化代码

- **按 API 文档更新前端接口调用**
    - 新增认证、验证码、笔记、分类和错误解析的统一 API 封装，减少页面与 Hook 中散落的请求路径
    - `client` 请求拦截器改为读取 `EXPO_PUBLIC_BASE_URL`，并为验证码、注册、登录链路自动携带稳定的 `X-Device-Id`
    - 登录和注册页改为使用认证接口封装，并统一展示限流等待时间、验证码剩余尝试次数等后端错误信息
    - 笔记列表、笔记创建/删除、分类列表/创建/更新/删除、笔记置顶/标星等调用点改为使用统一接口函数
    - 保留前端现有的笔记分类、置顶和标星行为，其中 `PUT /notes/:id` 属于现有功能兼容封装

- **修改文件列表**
    - `src/api/client.ts` - 支持环境变量 API 地址与验证码链路设备标识
    - `src/api/auth.ts` - 新增认证与验证码接口封装
    - `src/api/categories.ts` - 新增分类接口封装
    - `src/api/errors.ts` - 新增 API 错误信息解析工具
    - `src/api/notes.ts` - 新增笔记接口封装
    - `src/app/auth/login.tsx` - 接入认证封装与统一错误提示
    - `src/app/auth/register.tsx` - 接入认证封装与统一错误提示
    - `src/app/(tabs)/note/index.tsx` - 接入笔记和分类封装
    - `src/app/pages/note/create.tsx` - 接入创建笔记封装
    - `src/app/pages/note/[id].tsx` - 接入获取笔记封装与统一错误提示
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 接入获取分类封装
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 接入删除分类和删除笔记封装
    - `src/hooks/FloatingBar/useCategoryPin.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryStar.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryRename.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryChangeIcon.ts` - 接入更新分类封装
    - `src/hooks/notes/useNotePin.ts` - 接入更新笔记封装和统一错误提示
    - `src/hooks/notes/useNoteStar.ts` - 接入更新笔记封装和统一错误提示
    - `CHANGELOG.md` - 记录本次接口更新变更

---

## 2026-07-08 19:05:28 | 修复问题

- **修复笔记页语法结构损坏导致编译失败**
    - 清理 `note/index.tsx` 中残留的重复和不完整代码块，恢复完整的 `fetchNotes` 请求逻辑
    - 移除页面内重复的置顶和标星内联实现，重新使用已抽离的 `useNotePin` 与 `useNoteStar`
    - 保留笔记列表刷新、分类变更订阅、删除笔记、缓存同步和返回顶部动画等原有行为

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 修复损坏的组件结构并恢复 hook 调用
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-08 01:11:19 | 优化代码

- **抽离笔记置顶与标星 Hook**
    - 新增 `useNotePin`，封装笔记置顶的乐观更新、置顶顺序维护、后端同步和失败回滚逻辑
    - 新增 `useNoteStar`，封装笔记标星的乐观更新、后端同步和失败回滚逻辑
    - `note/index.tsx` 改为调用独立 Hook，减少页面组件中的业务逻辑长度
    - 保留原有缓存同步、打开操作栏关闭、错误提示和排序行为

- **修改文件列表**
    - `src/hooks/notes/useNotePin.ts` - 新增笔记置顶 Hook
    - `src/hooks/notes/useNoteStar.ts` - 新增笔记标星 Hook
    - `src/app/(tabs)/note/index.tsx` - 接入独立 Hook，移除内联置顶/标星回调
    - `CHANGELOG.md` - 记录本次优化代码变更

---

## 2026-07-05 11:56:48 | 修复问题

- **修复删除分类后全部列表残留未知分类笔记**
    - 新增按分类移除本地笔记缓存的事件通知，避免删除分类后全量刷新全部笔记
    - 分类下笔记和分类本身在服务端删除成功后，再通知笔记页本地移除对应分类下的笔记
    - 笔记页订阅分类笔记移除事件，仅过滤当前本地 `notes` 状态中匹配分类的笔记
    - 保持用户手动刷新时从服务端重新校准数据的能力，避免本地删除失败后误隐藏服务端数据

- **修改文件列表**
    - `src/data/notes.ts` - 新增按分类移除笔记的本地事件机制
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 分类删除成功后广播本地笔记移除事件
    - `src/app/(tabs)/note/index.tsx` - 订阅分类笔记移除事件并增量更新笔记列表
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-05 04:09:50 | 优化代码

- **优化 FloatingBar 分割线样式**
    - 将 `FloatingBarDivider` 从 1px 普通灰色长线调整为 2px 短胶囊分割线
    - 缩短宽度并增加上下间距，让分类分组更轻、更清晰
    - 使用更柔和的冷灰色与透明度，降低侧边栏视觉噪音

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 调整 FloatingBar 分割线样式
    - `CHANGELOG.md` - 记录本次样式优化变更

---

## 2026-07-04 16:46:35 | 优化代码

- **优化删除分类时的笔记删除请求压力**
    - 将分类下笔记的逐条删除从无限并发 `Promise.all` 调整为小批量限流执行
    - 每批最多删除 3 条笔记，批次之间间隔 100ms，降低服务器瞬时请求峰值
    - 保留后续替换为服务端批量删除接口的代码标记
    - 分类下笔记删除完成后，再继续删除分类本身，保持原有删除顺序

- **修改文件列表**
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 增加分类笔记删除限流逻辑
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 16:06:19 | 新增功能

- **新增笔记列表滚动时隐藏 FloatingMenu**
    - 新增跨组件菜单显示状态通知，笔记页滚动时发布隐藏状态，滚动停止后恢复显示
    - `FloatingMenu` 订阅隐藏状态，并使用 Reanimated `withTiming` 控制整体向屏幕右侧滑出/滑回
    - 在笔记页 `FlatList` 的 `onScroll` 中加入 180ms 停止滚动防抖，覆盖拖拽滚动和惯性滚动场景
    - 页面卸载时清理恢复定时器并强制显示菜单，避免菜单状态残留

- **修改文件列表**
    - `src/data/floatingMenuVisibility.ts` - 新增 FloatingMenu 隐藏/显示状态通知模块
    - `src/components/FloatingMenu.tsx` - 新增菜单横向滑出/滑回动画和状态订阅
    - `src/app/(tabs)/note/index.tsx` - 在笔记列表滚动时触发菜单隐藏，停止滚动后恢复
    - `CHANGELOG.md` - 记录本次新增功能变更

---

## 2026-07-04 15:39:59 | 优化代码

- **优化笔记列表渲染性能**
    - 将 `filteredNotes` 改为 `useMemo`，避免滚动按钮、弹窗等无关状态变化时重复过滤笔记数组
    - 新增 `NoteListItem` 并使用 `memo` 包裹，减少父组件状态变化导致的笔记卡片重复渲染
    - 将删除、刷新、滚动到顶部、`renderItem`、`keyExtractor` 等回调改为稳定引用，降低 FlatList 内部重复更新成本
    - 固定列表头部、空态和内容容器样式对象，减少 FlatList 子节点重复创建
    - 为 FlatList 增加 `initialNumToRender`、`maxToRenderPerBatch`、`updateCellsBatchingPeriod`、`windowSize`、`removeClippedSubviews` 等批量渲染约束
    - 新增 `showScrollTopRef`，仅在滚动阈值状态变化时更新 `showScrollTop`，避免滚动中重复触发 state 更新

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 优化笔记列表过滤、渲染、滚动状态与 FlatList 批量渲染参数
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 15:13:49 | 优化代码

- **优化笔记页重复请求问题**
    - 移除分类列表获取成功后再次广播分类变更的逻辑，避免形成重复刷新链路
    - 分类点击仅更新当前分类状态，不再触发全局分类变更事件
    - 笔记页移除聚焦时无条件全量刷新，改为初次加载、笔记变更事件和手动刷新时更新
    - 为 `/notes` 与 `/categories` 请求增加 in-flight 去重，复用尚未完成的同类请求

- **修改文件列表**
    - `src/components/FloatingBar.tsx` - 清理分类点击广播与分类请求重复触发
    - `src/app/(tabs)/note/index.tsx` - 调整笔记页刷新时机并增加请求去重
    - `src/app/pages/note/create.tsx` - 新建笔记成功后发送笔记变更通知
    - `src/data/notes.ts` - 新增笔记变更通知机制
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 15:07:22 | 优化代码

- **优化滑动切换页面的导航方式**
    - 将滑动切换底部 Tab 时使用的 `router.push` 调整为 `router.replace`
    - 避免连续滑动切换页面时不断堆积导航栈
    - 降低页面返回栈膨胀带来的切换卡顿风险

- **修改文件列表**
    - `src/hooks/FloatingMenu/useSwipeTab.ts` - 优化滑动切换 Tab 的导航方式
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-02 15:00:00 | 重构优化

- **将头像逻辑抽离为独立 Hook `useAvatar`**
    - 新建 `src/hooks/useAvatar.ts`，封装头像上传、URL 处理、缓存破坏等全部逻辑
    - 对外暴露 `avatarSource`（含 cache-busting 的 Image source）、`avatarUploading`、`showAvatarOptions`
    - `user/index.tsx` 从 ~45 行内联逻辑缩减为单行 Hook 调用
    - `tsconfig.json` 添加 `skipLibCheck: true` 排除 node_modules 类型干扰

- **修改文件列表**
    - `src/hooks/useAvatar.ts` — 新建，独立头像 Hook
    - `src/app/(tabs)/user/index.tsx` — 使用 `useAvatar` 替换内联逻辑
    - `tsconfig.json` — 添加 `skipLibCheck`

---

## 2026-07-02 14:30:00 | 修复问题

- **修复头像上传后无法实时显示的问题**
    - 根因：`normalizeAvatarUrl` 将 `127.0.0.1` 头像 URL 映射到错误路径 `/avatars/xxx.png`，实际应为 `/api/user/avatar/xxx.png`
    - 修复：从原始 URL 提取文件名，映射到 `GET /api/user/avatar/:filename` 接口路径
    - 根因：`Image` 组件按 URI 做 HTTP 缓存，上传后同一 URL 不刷新
    - 修复：添加 `avatarKey` state，每次上传后递增，通过 `?t=N` 参数破坏缓存

- **新增服务端用户数据同步**
    - 在 `useAuth` 中新增 `syncProfile()` 方法，首次加载时调用 `GET /api/user/profile` 同步最新用户数据（含头像）
    - 登录/注册成功后调用 `syncProfile()` 确保数据一致
    - 上传头像成功后调用 `syncProfile()` 获取服务端最新头像 URL

- **清理冗余代码**
    - 移除 `user/index.tsx` 中上传头像后多余的 `AsyncStorage.setItem` 和手动拼接 avatar（已被 `syncProfile` 覆盖）
    - 移除未使用的 `refresh` 引用

- **修改文件列表**
    - `src/api/user.ts` — 修正 `normalizeAvatarUrl` 中 127.0.0.1 映射逻辑
    - `src/hooks/useAuth.tsx` — 新增 `syncProfile`、`getUserProfile` 引入、首次加载同步
    - `src/app/(tabs)/user/index.tsx` — 移除冗余代码、添加 cache-busting、调用 `syncProfile`
    - `src/app/auth/login.tsx` — 登录成功后调用 `syncProfile`
    - `src/app/auth/register.tsx` — 注册成功后调用 `syncProfile`
    - `src/components/FloatingBar.tsx` - 在 `handlePress` 的 `setCurrentCategory` 之后添加 `notifyCategoriesChanged()` 调用
