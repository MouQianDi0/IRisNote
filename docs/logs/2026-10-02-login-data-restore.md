# 主动登录后一次性读取云端数据

- 记录时间：2026-10-02 17:49:15（Asia/Shanghai）。
- 类型：修复问题。
- 用户确认范围：每次主动登录成功后拉取一次云端数据；云同步开关保持原状态，首次登录默认关闭。
- 对比基点：`364a5eacc4f31ba0a90a10a9e4cc00304a67e1d1`；结果为本次未提交工作区。使用 `git diff 364a5eacc4f31ba0a90a10a9e4cc00304a67e1d1 -- <本次文件>` 检查实际差异，并逐行读取新增文件。没有创建提交，不能把工作区伪称为新的提交 SHA。
- 开始排查时工作区干净。期间其他任务向 CHANGELOG 追加了 17:45:19 的软著材料记录，本次保留该记录与原历史；不包含该任务的材料改动。

## 1. 改动清单（按层）

### src/features

| 文件 | 具体改动与原因 |
| --- | --- |
| `auth/screens/LoginScreen.tsx` | 完成令牌/资料保存、会话刷新与资料同步后登记登录读取任务；不等待数据恢复才导航。构建关闭云能力时沿用原成功提示。解决登录只取资料、未授权账号无法显示云端实体的问题。 |
| `auth/services/login-data-restore.ts` | 新增 86 行；内存任务状态机，按主动登录编号去重，分类先于笔记、待办独立运行，记录成功域，重试仅运行失败/未执行域，换登录或退出取消旧任务。避免焦点变化、冷启动及重绘反复请求。 |
| `auth/providers/LoginDataRestoreProvider.tsx` | 新增 199 行；等待认证、云能力读取和待办仓储就绪，以本次登录令牌取得只读租约，组装三个域的恢复、刷新事件、取消与结果横幅。令牌替换时清理旧进度提示。 |
| `notes/api/notes-sync.api.ts` | 抽出支持显式配置的 transport 工厂，原普通实例保留；登录读取选择完整正文协议，不做额外能力探测，避免云同步关闭时仅恢复摘要而无法打开正文。 |
| `notes/categories/api/categories.api.ts` | GET 分类允许传入租约/固定令牌/取消信号；登录读取遇到非数组响应报错，避免将坏响应当作空分类应用。 |
| `notes/categories/data/category-cache.ts` | 接收恢复专用请求配置与会话 guard，允许关同步时单次拉取；校验分类结构，复用 dirty/version 保护与本地合并。恢复失败向任务报告，不能用旧缓存伪装成功。 |
| `notes/services/note-sync-coordinator.ts` | 恢复任务跳过回收站上传与本地星标/置顶发送，复用下载、落库、缓存/事件发布；已有普通任务取消并排空后才开始恢复。页面协调器停止不再取消独立登录恢复，旧会话仍受租约取消控制。 |
| `todos/api/todos.api.ts` | 可携带只读租约 ID，继续固定本次账号 token、超时与 signal，复用原协议解析。 |
| `todos/services/todo-sync.service.ts` | 增加 downloadOnly，保留本地候选登记而跳过 prepareOperations 与写请求；按仓储/owner 共享任务，恢复等已有普通任务结束，失效旧会话排空后重启。防止两个下载修改同一游标。 |
| `settings/screens/CloudStorageSettingsScreen.tsx` | 说明关闭后暂停持续同步，每次主动登录仍读取一次，不会因此开启云同步；开关操作与默认值不变。 |

### src/core

| 文件 | 具体改动与原因 |
| --- | --- |
| `cloud-storage/cloud-storage-policy.ts` | 新增内存只读租约：绑定 owner/generation/ready/构建能力，统一取消；只允许指定 GET，释放后失效。使用数字句柄避免 Axios 克隆配置对象导致身份丢失。没有写入持久授权或修改 enabled。 |
| `providers/AppProviders.tsx` | 在既有通知、认证、云能力和待办 Provider 内挂载 LoginDataRestoreProvider，页面导航不卸载恢复任务。 |

### src/shared

| 文件 | 具体改动与原因 |
| --- | --- |
| `http/client.ts` | Axios 配置增加 loginRestoreId；调用入口同步校验路由/会话，请求拦截器选择只读或普通租约，继续在 adapter 发包前与响应到达后校验、取消和释放。普通请求仍要求显式云授权，未知接口不放行。 |

### modules/

无改动；Android/iOS/Web 复用共享 TypeScript 链路，无新增双端原生镜像、原生 API 或权限声明。现有待办仓储广播仍会被原有提醒链路订阅，本次不改提醒实现。

### tests

- `tests/auth/login-data-restore.test.cjs`：新增 98 行；验证主动登录触发、相同任务去重、同账号再次登录、分类顺序、部分失败重试、退出和 A→B→A 取消。
- `tests/sync/cloud-storage.test.cjs`：只读白名单、禁止写请求/未知路由、构建开关、会话撤销、授权保持；真实 Provider + Axios 拦截器 + 全迁移 SQLite + Zustand 回归，验证登录后展示笔记正文/分类/待办、保留本机待办、零上传、重绘不重复。
- `tests/sync/notes-meta-sync.test.cjs`：305 篇笔记由元数据模式恢复完整正文，覆盖超过 300 篇保留范围的正文淘汰场景。
- `tests/sync/notes-sync.test.cjs`：关闭云授权仍能以登录租约恢复笔记并发布列表事件，页面协调器卸载不误取消。
- `tests/todos/todo-sync.test.cjs`：分页只下载、去重、仓储广播、保留未上传正文与本机新增项、不创建 outbox 写操作。

### docs

- `docs/架构指南/业务模块与运行逻辑.md`：补充入口、顺序、HTTP 门控、只读范围、失败重试及普通同步并发关系。
- `docs/logs/2026-10-02-login-data-restore.md`：本次全链路日志。
- `CHANGELOG.md`：按真实时间倒序添加本次记录，保留其他任务条目。

## 2. 与原代码对比

1. 原来登录只保存会话、同步用户资料并导航；现在额外登记本次登录的数据读取任务，在后台恢复分类、笔记正文和待办。
2. 原来无云授权时 HTTP 拒绝所有实体请求；现在仅携带有效登录租约且属于白名单的 GET 获准，普通云请求的授权要求不变。
3. 原来直接复用完整同步会执行笔记标记/回收站和待办写操作；现在恢复路径跳过这些步骤，服务器实体不因恢复而被写入。
4. 原来笔记按服务端能力采用元数据与最近正文缓存；登录恢复现在使用已有完整协议，因此会下载更多正文，占用相应网络与磁盘。后续已授权的普通同步仍按原缓存策略运行。
5. 原来每个待办协调器自行去重；现在同步 service 也按仓储和账号去重，防止独立恢复与普通同步并发处理同一游标。
6. 原来分类失败可以返回 stale 缓存；恢复任务会报告失败并提供重试，已有界面继续使用本地数据。

**默认值/开关：没有反转。** `cloud_storage_consent:user:<id>` 缺省仍为 false；本次不写该键。已开启账号继续开启，关闭账号继续关闭。`EXPO_PUBLIC_CLOUD_STORAGE_ENABLED=0` 仍禁止云恢复。

## 3. 完整调用链路与数据落点

```text
唯一自动登记入口：LoginScreen.handleLogin
  loginWithPassword → 撤销旧云会话 → 保存 token/User → refresh → syncProfile
  → 构建云能力可用：loginDataRestore.request(owner, token)
  → router.replace 用户页（不等待数据恢复）

LoginDataRestoreProvider
  → 等待当前 owner/token、云状态 ready、todoRepository owner ready
  → createLoginRestoreAccess(owner)：不设置 consent
  → 固定 Bearer token + loginRestoreId → shared/http/client
      同步调用校验 → 拦截器校验 → adapter 前校验 → 响应校验
      非 GET/未知路径拒绝；换号、撤权、会话变化或释放后拒绝
  ├─ categories.api GET /categories
  │   → loadCategories → mergeRemoteCategories（dirty/version）→ SQLite
  │   → notifyCategoriesChanged → CategoryBar 读取本地分类
  │   └─ syncNotes(restore)
  │       → 完整 snapshot/changes 分页（相对 API base URL）
  │       → runNoteSync → 镜像/游标 → projectMirror → 本地笔记与版本
  │       → notes.cache + notifyNotesChanged → 列表/详情订阅
  └─ syncTodos(downloadOnly)
      → enlistExisting（保护本地候选），跳过 prepareOperations/write/batch
      → GET /todos 或 /todos/changes
      → stage/finishSnapshot 或 applyRemote + cursor，事务内再次检查会话
      → TodoLocalRepository.syncTransaction → broadcast → Zustand → 待办列表

完成：释放临时租约，保留原云授权
失败：保留已完成域与本地数据，横幅重试失败/未执行域
退出/新登录：取消旧任务；旧响应无法用于当前登录
冷启动/focus/重绘：无 request()，只读既有本地数据
```

- 白名单包括 `/notes/batch` 以供复用的 transport 配置；完整模式当前使用 snapshot/changes，不进行元数据能力探测。
- 各域复用既有仓储的本机修改、草稿、删除/回收站语义保护，没有 migration，没有修改笔记或待办字段定义。成功数据写入本地，不回滚独立成功域；事务失败按各仓储既有事务机制回滚。
- 云授权已开启时，普通同步仍可按原授权上传。这里的“只读/零上传”指登录恢复路径；关闭授权的端到端回归实测全部恢复请求为 GET。
- 没有新增诊断正文、账号或令牌日志。凭据只沿原认证与请求通道使用，不写变更日志或横幅。

## 4. 验证情况

- 修改前：`npm run typecheck` 通过，无既有类型错误。
- 分域回归：登录任务、云权限、笔记及待办测试通过。初次新增夹具有两处错误（正文淘汰数量未超过 300、outbox 表名写错）；端到端夹具补齐对象形式 SQLite 参数支持后通过，这些均是新增测试适配问题。
- 完整检查首轮：`npm run check` 通过，729/729；TypeScript、theme:check 通过，Lint 0 错误，1 条既有警告：`PermissionSettingsScreen.tsx:171` 的 `liveUpdateCapable` 未使用，该文件未修改。
- 最终文案与差异收敛后的 `npm run check`：通过，729/729；TypeScript、theme:check 通过，Lint 0 错误/同一条既有警告。详细输出保存在被忽略的 `.expo/login-data-restore-final-check.log`，该文件不作为交付源码依赖。
- `git diff --check` 通过；源代码、测试与更新架构文档未发现 Git 冲突标记。
- 未执行：Android/iOS/Web 实机或浏览器 UI 验证、真实服务端登录/恢复联调、Android 打包、发布、Git 提交/推送。Node Provider 回归不是手机渲染验证。
