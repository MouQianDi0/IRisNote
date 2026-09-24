# IRisNote AGENTS.md

本文件只定义 IRisNote 项目规则；通用工作方式由全局 `AGENTS.md` 负责。修改前以当前代码、依赖版本和实际 Git 状态为准。

## 1. 技术栈

客户端当前使用 Expo SDK 57、React Native 0.86、TypeScript、expo-router、NativeWind/Tailwind、Reanimated、react-native-worklets、Gesture Handler、Zustand、FlashList、expo-sqlite、AsyncStorage、axios、expo-notifications，以及本地 Expo 原生模块。具体版本以 `package.json` 为准。主题样式配套 `npm run theme:sync` 与 `npm run theme:check`。

服务端代码在独立仓库（Express、TypeScript、PostgreSQL、JWT）；本仓库 `docs/API后端/` 保存接口与部署文档，不承担服务端 migration。HTTP 客户端在 `src/shared/http/client.ts`，默认地址为 `https://tech-mou.top/api`，可由 `EXPO_PUBLIC_BASE_URL` 覆盖。

## 2. 实际目录

```text
src/app/                  expo-router 路由入口与页面组合
src/core/                 database、sync、storage、cloud-storage、editor、
                          notifications、system-notifications、diagnostics 等跨域能力
src/features/             auth、excerpts、notes、profile、settings、sync、todos、updates
src/features/notes/categories/  分类子域；不存在顶层 features/categories
src/shared/               ui、http、hooks、theme、storage、types、utils
src/types/                全局类型
modules/irisnote-system/  精确闹钟、系统通知、诊断日志导出等 Android 原生能力
modules/irisnote-updater/ APK 差量合并与校验的 Android 原生模块
tests/                   按域组织的 node --test .cjs 测试
docs/                    架构、UI、构建发布、进度与验证等文档
patches/                 patch-package 补丁
plugins/                 Expo config plugins
scripts/                 Android 启动器和发布工具
android/                 expo prebuild 生成的本机工程，已由 .gitignore 忽略
```

业务域常按 `api/`、`data/`、`services/`、`state/`、`hooks/`、`components/`、`screens/` 分层，实际目录因域而异。Todo 同步实现位于 `features/todos/` 下的 `state/`、`services/`、`data/` 和 `api/todo-wire.ts`，没有独立的 `features/todos/sync/`。具体业务逻辑留在 feature；通用基础设施留在 core/shared；路由页保持组合职责。

## 3. 数据架构与本地优先

典型数据流为 UI → Feature → Zustand / SQLite → 同步层 → axios API → 服务端。各功能链路并不一定经过所有层。expo-sqlite 是本地实体数据的主要持久化层，Zustand 负责内存状态与订阅，AsyncStorage 用于轻量 KV。Store 或本地库已有有效内容时优先复用，避免打开页面就重复等待网络。

云存储由 `src/core/cloud-storage/` 统一控制：`EXPO_PUBLIC_CLOUD_STORAGE_ENABLED` 未配置、空值或 `"1"` 时开放，`"0"` 时关闭。开放不等于允许上传；登录后还须在本设备主动授权。账号或授权变化时，现有云请求会被中止或拒绝。修改同步、上传和 HTTP 请求时遵守这一门控。

## 4. 修改业务功能前追踪真实链路

按任务检查触发 UI、组件或 Hook、service、Store、SQLite repository、同步协调器、API、响应更新与错误恢复。汇报只描述实际经过的层。需要特别说明本地数据是否变化、是否发请求、失败是否保留用户输入、重试与回滚如何处理。已有近似实现优先复用。

## 5. Notes 与 Todos 数据语义

Notes 的 `is_pinned`、`is_starred`、`local_order`、`pinned_order`、`server_updated_at`、`current_revision_id`、`created_at`、`updated_at` 各有排序、同步或版本语义；回收站通过独立 `note-trash.repository.ts` 和服务处理，保留期为 15 天，不能把普通删除简化为物理 `DELETE`。

Todos 的 `is_starred`、`is_pinned`、`reminder_enabled`、`time_zone`、`local_version`、`owner_key + client_id`、`date_id + start_time/end_time` 具有账号隔离、提醒和同步语义。wire 格式的 snake_case 与客户端 camelCase 转换在 `src/features/todos/api/todo-wire.ts`。UI 重构不得改动这些字段含义。

## 6. 乐观更新、请求去重与弱网

轻量状态切换可沿现有模式乐观更新：保存旧状态、立即更新 UI、同步服务端、失败恢复；并发时，旧请求的失败回滚不能覆盖较新的用户操作。`useNoteStar` 现有链路会先更新列表、再请求 API、失败恢复旧列表；修改该链路时需核查并发安全与云授权状态。

列表、分类等请求应先定位现有 request ref、订阅、focus、refresh 及去重逻辑，确认重复请求的真实来源。实体 CRUD 要核对 Store、SQLite、Server、回收站及订阅的一致性。离线或弱网时优先保留缓存和用户输入，允许安全重试，避免重复提交。

## 7. 系统通知、闹钟与动态通知

改动前读取 `src/core/system-notifications/system-notification.service.ts` 与 `docs/架构指南/系统通知模块负责说明.md`，改后同步负责说明。精确闹钟使用 `SCHEDULE_EXACT_ALARM` 状态管理；授权恢复后需按现有 `forceReschedule` 链路重排。Android 16 动态通知由 `modules/irisnote-system` 实现 ProgressStyle / Live Updates 提升请求；普通提醒和日历事件不得进入提升式通道。

通知及闹钟相关权限由 `modules/irisnote-system/android/src/main/AndroidManifest.xml` 声明，经 Gradle 合并。`app.json` 的 `android.permissions` 当前只包含 `REQUEST_INSTALL_PACKAGES`；不得在此重复加入 `SCHEDULE_EXACT_ALARM` 等权限。`tests/todos/system-notifications.test.cjs` 含单一来源约束。

## 8. 本地原生模块

`modules/irisnote-system` 使用 Expo Modules API，JS 侧通过 `requireOptionalNativeModule` 在 Expo Go 或未链接环境降级。`postProgressNotification` 以单个 `Map<String, Any?>` 入参传字段，避免 Expo Modules `AsyncFunction` Lambda 具名参数数量限制。修改 Kotlin 或模块 API 后，应按影响重新构建原生应用；纯 JS 改动可按现有开发流程验证。

`modules/irisnote-updater` 是 Android APK 差量合并、校验和安装准备模块；涉及更新流程时先读其 README、`src/features/updates/` 与发布脚本。新增原生依赖时确认 development build、config plugin、prebuild、EAS 和平台支持，不能假设 Expo Go 可用。`android/` 是本地生成物，不入库。

## 9. 动画与手势

使用 Reanimated、worklets 和 Gesture Handler 时核查 UI / JS 线程分工、布局测量、起始闪跳、卸载清理及手势冲突。高频动画避免频繁更新 React state。

## 10. API 约定

API 修改明确 Method、URL、Params、Body、Response、Error、Auth、Store 与缓存更新、去重及云授权。域内接口放在 `features/*/api/`，HTTP 客户端统一在 `src/shared/http/client.ts`；不在页面中散落直接请求。

## 11. SQLite 与迁移

本地结构变更走 `src/core/database/migrations/` 的编号迁移，迁移应考虑重复执行、旧数据、NULL、默认值、索引、唯一性和外键。软删除查询遵守现有 trash 仓储约定。服务端 PostgreSQL migration 不在本仓库。

## 12. 编辑器与命令

`src/core/editor/` 改动重点核查大文本、selection、中文输入、undo/redo、草稿自动保存及退出时数据安全。服务器同步不得阻塞编辑。Slash/命令扩展沿 Parser → 候选 → Handler → Editor State 的解耦方式和现有注册机制。

## 13. 搜索与列表性能

搜索先区分输入状态、query、debounce、本地和远程搜索、缓存、分页及高亮，避免每字符无条件请求。FlashList 性能问题先找真实瓶颈，如 keyExtractor、renderItem 稳定性、memo、selector 和 windowing，再调参数。

## 14. TypeScript、错误处理与诊断隐私

保持明确类型，不靠新增无理由的 `any`、`as any` 或忽略检查消除错误。可恢复错误保留数据、反馈并允许重试；开发错误提供足够诊断信息且不泄露敏感内容。`core/diagnostics` 不记录待办正文、账号标识或令牌，文本按现有规则脱敏与截断，日志写入不得阻塞业务。

## 15. 项目验证

- `npm run check` 依次执行 TypeScript、Lint、`theme:check` 和 `node --test`；测试位于 `tests/**/*.test.cjs`，常以纯函数和 fake port 注入实现。
- Android 构建入口为 `npm run gradle -- ...`，具体参数和环境准备以 `docs/构建发布/本地测试包构建.md` 为准。本机可用的 staging 命令示例：`npm run gradle -- assembleStaging -PreactNativeArchitectures=arm64-v8a --init-script "$PWD/.expo/gradle-aliyun-init.gradle"`。
- `irisnote-system` Kotlin 改动至少验证 `:irisnote-system:compileReleaseKotlin`；其他原生模块验证其受影响编译任务。Manifest / 权限改动需要检查最终 APK 合并结果。按实际环境与风险选择检查，未执行的项目如实写明。仅改文档时不运行无关应用检查。

## 16. CHANGELOG 实际格式

根目录 `CHANGELOG.md` 是最新在顶的逐条记录，沿用当前格式：

```text
## YYYY-MM-DD HH:MM:SS | 新增功能/修复问题/优化代码：一句话标题

- 变更概述：...
- 修改文件：...
- 具体内容：...
- 验证：...

---
```

实际时间、文件、决策和验证结果必须真实；未执行写明。保留已有历史条目，不重构格式。

## 17. 文档体系

架构现状见 `docs/架构指南/`，UI 决策与组件规范见 `docs/UI/`，构建与发布见 `docs/构建发布/`，阶段计划与验证清单见 `docs/进度与验证/`。修改通知、闹钟、更新或构建流程时同步相应负责说明和 CHANGELOG；文档只写与代码一致的现状。

## 18. 工作原则

确认现有业务 → 找到正确修改层 → 保持本地可用 → 核对 Store / SQLite / Server 一致性 → 处理失败与回滚 → 做受影响验证 → 说明真实业务作用 → 同步相关文档与 CHANGELOG。目标是数据流一致、状态可预测、弱网可用、可维护，且不引入重复请求或破坏现有功能。
