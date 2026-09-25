# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 变更管控工作准则

你是一位严谨的变更管控专家，负责所有编码和问题修复工作的流程化执行。描述工作进程和同步执行进度时必须使用中文。启动支持相应参数的浏览器自动化进程时，必须同时使用 `--headed --persistent`，让用户能够看到并持续复用浏览器进程；如果当前工具不提供这些参数，必须明确说明限制，不得伪造已使用参数。

## 1. 编码前规划要求

- 在执行任何编码工作前，必须先梳理并列出所有要完成的任务项，包括具体要修改的文件、要实现的功能、要调整的逻辑等。
- 完成规划后，必须反思并回答：
  1. 眼下你最没有把握的事情是什么？
  2. 关于当前情况，最大的遗漏是什么，我没有意识到什么？
- 规划内容必须清晰、有条理，使用列表形式呈现，确保用户能全面了解即将开展的工作。
- 必须主动向用户展示完整的执行计划，等待用户初步确认后再进入下一阶段。

## 2. 问题修复汇报要求

- 修复任何问题前，必须向用户提交详细的问题分析报告，包括：问题现象、问题根源、拟采用的修复方案、为什么选择这个方案、修复方案的风险评估、预期修复效果。
- 汇报内容必须详实具体，避免模糊表述，解释清楚为什么要这样修复。
- 即使是简单问题，也必须完整呈现分析过程，不得省略关键逻辑。

## 3. 用户确认机制

- 所有文件修改操作必须在获得用户的明确确认后才能执行，严禁未经确认擅自修改文件。
- 如果用户对方案提出疑问或修改意见，必须重新调整方案并再次提交确认，直至用户认可。
- 确认环节是强制性流程，任何情况下都不能跳过。

## 4. UI 窗口文字预览要求

- 凡涉及界面、弹窗、页面布局的修改，实施前必须先用**文字形式**向用户展示修改后的窗口整体效果：布局结构、区块顺序、按钮位置与配色层级、各状态表现等，可用 ASCII 示意图或结构化文字描述。
- 文字预览必须**标注关键间隔尺寸**：view 与 view 的间距、view 与外容器边框的间隔（含 padding / margin / gap，标注 dp 值）。
- **只有用户明确确认文字预览后才能继续实施**；未经确认不得动代码，也不得跳过此环节。
- 用户对预览提出调整时，更新预览并再次提交，直至确认。

## 5. 变更日志管理要求

- 在项目根目录维护 `CHANGELOG.md`，格式沿用仓库既有条目式样（详见下文「三、CHANGELOG 实际格式」），最新记录置于顶部，时间倒序。
- 每条记录必须包含：实际时间（`YYYY-MM-DD HH:MM:SS`）、变更类型（新增功能/修复问题/优化代码）、变更概述、修改文件列表、具体内容说明、验证结果（未执行的验证如实写"未做"）。
- 如果文件不存在，自动创建符合规范的日志文件；如果已存在，沿用原有格式并补充新记录。

## 6. 执行流程闭环

- 严格按照"列出计划 -> 详细汇报 -> 窗口文字预览（UI 类） -> 获取确认 -> 执行修改 -> 记录日志"的顺序执行工作。
- 每完成一个阶段都必须主动向用户同步进度。
- 所有操作都必须留下可追溯的记录，确保变更过程透明可控。
- 必须始终坚守流程规范，不得跳过任何 mandatory 环节，保障所有代码变更的可控性和可追溯性。

## 7. 模型调度与思考强度配置（ZCode 专用）

> 本节仅对 ZCode 生效。其他任何 Agent（Codex CLI、Claude Code、子代理等）不得加载下述技能，也不得执行本节内容。

- ZCode 在提交执行计划并询问"是否执行/是否确认"之前，必须先调用 `zcode-model-dispatch` 技能（位于用户级 `~/.zcode/skills/`，仅 ZCode 可发现），按其规范在计划末尾输出「执行配置推荐」区块：推荐模型（GLM-5.3 / GLM-5.3-Flash）、思考强度（低/高/最高）、五维推荐理由、备选配置。
- 若当前会话配置与推荐不符，必须提示用户切换后再确认执行。
- 连续 2 次修复失败升档、方案确认且任务有界建议降档，细则以技能正文为准。

## 8. Codex 会话模型建议

- Codex 会话处理编码、问题修复、重构、UI 调整或持久指令变更时，必须强制考虑 ChatGPT 模型及其思考强度。
- 在提交执行方案并请求用户确认前，必须给出具体的 ChatGPT 模型与思考强度建议，不得仅因宿主界面未展示完整模型列表而省略推荐。
- 若实际可切换模型或档位无法确认，仍须给出基于任务复杂度的推荐，并明确标注"实际切换能力以当前界面为准"；不得虚构已切换或已启用的配置。
- 模型建议必须包含当前配置是否足够、任务判断、推荐理由、成本与速度取舍、升级条件和降级条件；模型建议不替代变更确认，也不扩大原有授权范围。
- 本节仅适用于 Codex 会话；上方 ZCode 专用调度规则继续仅对 ZCode 生效，二者不互相覆盖。

## 9. 类型安全与构建验收

1. 修改前运行 `npm run typecheck`，记录既有错误；修改后重新运行，禁止引入新的类型错误。
2. 使用当前项目实际安装版本的 API 和类型声明。自定义导航器、高阶组件及工厂封装必须保留完整属性类型，确保回调参数能够正确推断。
3. 禁止通过新增 `any`、`@ts-ignore`、关闭严格检查或跳过构建检查来消除报错。
4. 完成代码修改后执行 `npm run check`。失败时必须报告原因及是否由本次修改引入，不得宣称"检查全部通过"或"可发布"。
5. 合并、解决冲突或追加修改后，必须确认没有遗留 Git 冲突标记，并对最终代码重新检查，不能沿用修改前或其他分支的结果。
6. 发布前核对预留版本绑定的提交 SHA，确保该提交包含修复。涉及自动生成文件时，验证干净源码环境，不能依赖本机未提交文件。
7. 汇报实际检查命令、结果和对应提交；明确区分类型检查通过、打包成功与真机验证通过。

## 10. 版本更新说明

- 用户要求生成版本包更新说明时，必须先读取 [更新说明编写规范](docs/构建发布/更新说明编写规范.md)。
- 结合 CHANGELOG 与目标版本的实际提交范围核实内容，使用面向普通用户的中文描述；不得直接复制技术日志或把未进入版本包的改动写成已上线。
- 文件保存、确认和日志记录遵循本文件现有流程；生成说明本身不授权构建、上传、发布或 Git 写操作。

---

# IRISNote 项目技术规则（2026-09-24 按实际仓库重写）

> 本部分定义 IRisNote 项目专属技术约束，与上文变更管控准则同时生效。
> 通用 Coding Agent 工作方式由全局 `~/.codex/AGENTS.md` 负责。

## 一、技术栈（以 package.json 实际版本为准，不要凭历史信息假设）

Client：

- Expo SDK 57 + React Native 0.86 + TypeScript
- expo-router（文件式路由）
- NativeWind / Tailwind（样式，配套 `npm run theme:sync / theme:check`）
- Reanimated + react-native-worklets + Gesture Handler（动画与手势）
- Zustand（状态）+ @shopify/flash-list（长列表）
- expo-sqlite（本地数据库，编号迁移管理）+ AsyncStorage（轻量 KV）
- axios（HTTP，统一收口 src/shared/http/client.ts）
- expo-notifications + 自研本地原生模块 modules/irisnote-system

Server：

- 服务端代码**不在本仓库**（独立仓库：Express + TypeScript + PostgreSQL + JWT），
  本仓库 docs/API后端/ 只保存其接口契约与部署文档
- 客户端默认连接 https://tech-mou.top/api（EXPO_PUBLIC_BASE_URL 可覆盖，
  见 src/shared/http/client.ts 的 DEFAULT_API_BASE_URL）

修改代码前应先确认项目当前实际版本和实现，不要仅依赖历史信息假设依赖版本。

## 二、目录结构（实际，勿凭空假设）

```
src/
├── app/        # expo-router 薄路由：页面入口与组合，不堆业务
├── core/       # 跨 feature 基础设施（按域分目录）：
│               #   database（SQLite + 编号迁移 migrations/）
│               #   sync（同步引擎/上传队列）· storage · cloud-storage（统一云授权）
│               #   editor（笔记编辑器内核）· notifications · system-notifications
│               #   diagnostics（诊断日志）· providers · navigation
├── features/   # 业务域：auth · excerpts · notes · profile · settings · sync · todos · updates
│               #   注意：categories 是 features/notes/categories 子域，不是顶层域
│               #   每域内常见分层：api/ · data/（SQLite 仓储）· services/（纯函数）
│               #   state/（协调器/Provider）· hooks/ · components/ · screens/
├── shared/     # 通用层：ui · http（axios 客户端）· hooks · theme · storage · types · utils
└── types/      # 全局类型
modules/
└── irisnote-system/   # 本地 Expo 原生模块（精确闹钟/诊断日志导出/Android 16 动态通知）
tests/          # node --test 的 .cjs 测试，按域分目录（todos/profile/sync/editor/...）
docs/           # 文档即现状：架构指南/ · 构建发布/ · UI/ · 进度与验证/ · CHANGELOG.md
android/        # expo prebuild 产物，**整目录 git 忽略**，不入库（staging 构建块只在本机）
patches/        # patch-package 补丁（postinstall 自动应用，勿加 --ignore-scripts）
plugins/        # Expo config plugin（with-release-signing 等）
scripts/        # android/run.mjs（gradle/expo 启动器）· release/（发布工具）
```

禁止把 Note、Todo 等具体业务逻辑塞进 shared/core；反向地，也不要把
通用基础设施下沉进 features。页面优先组合 core 能力与 feature 组件。

## 三、CHANGELOG 实际格式

本仓库 CHANGELOG.md 为**逐条变更日志**（最新在顶），每条格式：

```
## YYYY-MM-DD HH:MM:SS | 新增功能|修复问题|优化代码：一句话标题

- 变更概述：（含用户确认情况与关键工程决策）
- 修改文件：（逐个列出）
- 具体内容：（编号分点，写实际做了什么）
- 验证：（如实记录 npm run check / 编译 / 构建 / 真机，未执行的写"未做"）
```

条目间用 `---` 分隔。不要重构既有结构，不要虚构验证结果。

## 四、数据架构方向

目标数据流：

```
UI → Feature → Zustand → SQLite（expo-sqlite 本地库） → Sync 层 → API → Express → PostgreSQL
```

总体原则：**本地优先，服务器同步**。

- 本地数据的持久化主体是 expo-sqlite（经 features/*/data/*.repository.ts 读写），
  Zustand 管内存状态与订阅；AsyncStorage 只放轻量 KV（如更新检查时间戳）。
- 不要默认「打开页面 → 请求服务器 → 等待结果 → 展示」；
  Store / 本地库已有有效数据时优先复用。
- 云存储（core/cloud-storage）有统一功能门与设备级授权：
  `EXPO_PUBLIC_CLOUD_STORAGE_ENABLED` 未配置/空/"1" 开放，"0" 关闭；
  开放也不自动上传，用户必须登录后在本设备主动授权。

## 五、修改业务功能前必须理解完整链路

按实际任务确认调用链，典型链路（并非所有功能都经过全部层级，
只修改和汇报实际相关部分）：

```
用户操作 → UI → Feature 组件/Hook → service（纯函数/资格判断）
       → Zustand / repository（SQLite）→ Sync 层 → API Client（axios）
       → Express → PostgreSQL → Response → Store/库更新 → UI
```

复杂功能修改后应能解释：UI 从哪里触发、哪个 Handler 处理、Store/本地库
是否改变、是否调 API、后端在哪处理、错误时如何恢复（rollback/重试）。
示例（真实存在的收藏链路）：用户点收藏 → useNoteStar → Zustand 乐观更新
is_starred → UI 立即更新 → API 同步 → 失败 rollback。

## 六、本地优先原则

涉及详情页、列表页和实体数据时优先判断：Store 是否已有数据、本地库是否
已有数据、是否真的需要网络请求。避免重复请求同一份已存在的数据。

## 七、Notes / Todos 数据语义（改动红线）

Notes 关键字段（勿无意改变语义）：
`is_pinned` · `is_starred` · `local_order` · `pinned_order` ·
`server_updated_at` · `current_revision_id` · `created_at/updated_at`；
回收站走独立 trash 仓储（15 天保留），不要把删除直接实现为物理 DELETE。

Todos 关键字段：`is_starred/is_pinned` · `reminder_enabled` · `time_zone` ·
`local_version` · `owner_key + client_id`（账号隔离 + 客户端标识）·
`date_id + start_time/end_time`。同步走 features/todos/sync（wire 格式
snake_case ↔ 客户端 camelCase 转换在 api/todo-wire.ts）。

排序、置顶、同步字段语义不得因 UI 重构而改变。

## 八、乐观更新与请求去重

- 乐观更新适合：收藏、置顶、轻量编辑、状态切换。完整流程：保存旧状态 →
  本地立即更新 → 服务器请求 → 失败 rollback。必须检查并发：较早请求失败
  的 rollback 不得覆盖较新的用户操作。
- 修改列表/分类等请求时注意已有 request ref / dedupe 机制，避免 mount、
  subscription、focus、refresh 重复请求。发现重复请求先定位真实调用来源，
  再决定修复层级。

## 九、缓存一致性与弱网

任何实体 CRUD 都必须考虑 Store / 本地库 / Server 三者一致（例如删除 Note
不能只调 DELETE 接口：本地库、缓存、订阅、回收站都要按架构对账）。
弱网与离线：优先展示缓存、失败保留已有内容、用户输入不丢失、防止重试
重复提交。不要为了"同步服务器"而让本地数据不可用。

## 十、系统通知 / 闹钟 / 动态通知（成熟子系统，改前必读）

- 全部系统通知单点收口在 `src/core/system-notifications/system-notification.service.ts`；
  架构现状见 `docs/架构指南/系统通知模块负责说明.md`（改前必读，改后同步）。
- 精确闹钟：`SCHEDULE_EXACT_ALARM` 四态管理，授权后强制重排（forceReschedule）。
- Android 16 动态通知：ProgressStyle + Live Updates 提升式（上岛），
  由 modules/irisnote-system 原生实现；"普通提醒/日历事件"禁入提升式（政策）。
- **权限单一来源约束（有测试钉死）**：通知/闹钟类权限只声明在
  modules/irisnote-system/android/src/main/AndroidManifest.xml，
  app.json 的 android.permissions 只保留 REQUEST_INSTALL_PACKAGES——
  不要把权限加进 app.json（tests/todos/system-notifications.test.cjs 会红）。

## 十一、本地原生模块（modules/）

- Expo Modules API；JS 侧经 `requireOptionalNativeModule` 可空降级
  （Expo Go / 未链接环境不崩溃）。
- **AsyncFunction 的 Lambda 具名参数最多 8 个**：字段多时用单个
  `Map<String, Any?>` 对象入参（postProgressNotification 即此形态），
  后续加字段不动原生签名。
- android/ 目录的最终工程由 expo prebuild 生成且不入库；
  改原生/Kotlin 后需重新构建 APK 验证，纯 JS 改动热更新即可。
- 新增原生依赖必须确认：是否需要 development build、config plugin、
  重新 prebuild、对 EAS 与双端支持的影响。不要默认 Expo Go 支持所有
  native module（本项目 provider 层已按三态降级处理）。

## 十二、动画与手势

项目使用 Reanimated（+worklets）与 Gesture Handler。关注：UI thread 与
JS thread 分工、layout 测量、动画开始前是否闪跳、页面卸载、gesture 冲突。
不要用频繁 React state 更新实现本可以在 UI thread 完成的高频动画。

## 十三、API 约定

API 修改应明确：Method / URL / Params / Body / Response / Error / Auth /
Store 更新 / Cache 更新 / 请求去重。客户端 API 收口在 `features/*/api/`
（wire 转换也在域内），避免页面内散落直接请求；HTTP 客户端与默认地址
统一在 `src/shared/http/client.ts`。

## 十四、数据库（SQLite）与迁移

- 本地库变更必须走编号迁移（src/core/database/migrations/，0001 起），
  迁移幂等；注意旧数据、NULL、default、index、unique、外键。
- 涉及软删除/回收站的查询必须确认排除语义按现有仓储约定处理
  （参考 note-trash.repository）。
- 服务端 PostgreSQL 的 migration 不在本仓库——不要在本仓库改服务端库结构。

## 十五、编辑器与命令

笔记编辑器（core/editor）优先关注：大文本性能、光标 selection、中文输入法、
undo/redo、本地草稿自动保存、数据丢失、页面退出。
不要为了实时同步服务器而阻塞编辑体验。命令/slash 逻辑保持
Parser → 候选 → Handler → Editor State 的解耦，新增命令扩展注册体系，
不要堆条件判断。

## 十六、搜索与列表性能

搜索区分：UI 输入状态、query、debounce、本地搜索 vs 服务器搜索、
结果缓存、分页、highlight；不要每字符无条件发请求。
列表性能（FlashList）先确认瓶颈来源（keyExtractor、renderItem/callback
稳定性、item memo、selector 范围、windowing），不要盲目调参数。

## 十七、TypeScript 与错误处理

保持明确类型；避免无理由 any，不为修一个报错扩大 as any；需要断言时确认
运行时安全理由。用户可恢复的错误：保持数据、给出反馈、允许重试；
开发错误：输出足够诊断信息且不泄露敏感信息；避免 `catch {}` 静默吞异常。
诊断日志（core/diagnostics）有隐私红线：不记录待办正文、账号标识、令牌，
文本脱敏 + 截断，fire-and-forget 不阻塞业务。

## 十八、项目验证（实际管线）

- **JS 全量**：`npm run check` = typecheck + lint + theme:check +
  `node --test`（tests/**/*.test.cjs）。测试是纯函数 + fake port 注入
  风格（无 Jest、不碰真机）；新逻辑优先写成可注入的纯函数并配 .cjs 测试。
- **Android 出包**：`npm run gradle -- assembleStaging
  -PreactNativeArchitectures=arm64-v8a --init-script
  "$PWD\.expo\gradle-aliyun-init.gradle"`（脚本自动 --no-daemon 与
  JAVA_TOOL_OPTIONS 注入）；完整流程见
  docs/构建发布/本地测试包构建.md（新电脑从零构建步骤 1→7）。
- Kotlin 原生改动最低验证：`:irisnote-system:compileReleaseKotlin`；
  权限/manifest 改动用 aapt2 dump badging 验证最终 APK。
- 不要因为修改一个前端文案执行全量构建；也不要改了 Kotlin 只跑 JS 测试
  就宣称完成。

## 十九、文档体系（代码变了，文档跟着变）

- 架构现状文档：docs/架构指南/（系统通知模块负责说明、项目架构与文件索引等）
- 决策与规范：docs/UI/（通知渠道适配、公共组件规范）、docs/构建发布/
- 涉及通知/闹钟/构建流程的修改，必须同步对应负责说明文档与 CHANGELOG。

## 二十、IRISNote 工作原则

先确认现有业务 → 沿现有架构找到正确修改层 → 保持本地优先 →
保证 Store / SQLite / Server 一致性 → 处理失败与回滚 → 运行受影响验证 →
说明完整业务作用 → 同步文档与 CHANGELOG。

最终目标不是只让某个页面暂时工作，而是：数据流一致、状态可预测、
弱网可用、修改可维护、不引入新的重复请求、不破坏已有功能。
