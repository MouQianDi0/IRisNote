# IRisNote 系统架构图

生成日期：2026-09-19。图类型：`architecture`。生成工具：Archify 2.17。

打开 [交互架构图](irisnote-architecture.html)，支持浅深色、缩放、节点查看、源码链接和导出。图是自包含 HTML，可直接在浏览器打开；无需启动 IRisNote 开发服务。可维护输入为 [irisnote.architecture.json](irisnote.architecture.json)。

## 范围与证据版本

- 客户端：`D:\Note project\IRisNote`，提交 `73b664cf543b9bc72c8ff36dd806d36c78dbd310`，检查时工作区干净。
- 后端：`D:\Note project\irisapi`，提交 `898440c8ea35936e6e355cdce61e5433d448d6a4`，检查时工作区干净。
- 图描述这两个版本的源码关系。没有核验服务器实际部署、线上数据库、邮件送达、真实包下载或 Android 真机安装。
- 图中箭头表示调用/依赖发起方向；省略响应箭头。不表示数据仅能单向流动。
- 为保持总览可读，合并了页面和业务、本地持久化、上传队列和 HTTP 客户端。Redis、MinIO、Resend 为独立支撑服务，不是移动端直连目标。

## 源码依据

客户端路径相对 `D:\Note project\IRisNote`；服务端路径相对 `D:\Note project\irisapi`。HTML 中的 14 个源码引用由 Archify 对客户端固定提交的 Git blob 验证；服务端依据由本次只读检查记录在下表，不属于该单仓库自动验证收据。

| 图中部分 | 仓库与源码 | 已核对的职责 |
| --- | --- | --- |
| 页面与笔记业务 | 客户端 `src/app/_layout.tsx`、`src/core/providers/AppProviders.tsx`、`src/features/notes/services/note-save.service.ts` | Expo Router 根页面、数据库/认证/通知 Provider，笔记保存与上传 |
| 本地持久化 | 客户端 `src/core/database/application-database-resource.ts`、`src/core/database/migrations/index.ts`、`src/features/auth/providers/AuthProvider.tsx` | expo-sqlite；本地笔记、草稿、保存版本和上传队列表；AsyncStorage 会话 |
| 本地与云端对账 | 客户端 `src/features/notes/data/note-local.repository.ts`、`src/features/notes/api/notes.api.ts` | 云端读取、写入及服务端更新时间对账，避免旧响应覆盖新编辑 |
| 上传队列与 API 客户端 | 客户端 `src/core/sync/upload-queue-coordinator.ts`、`src/features/sync/upload-task-adapters.ts`、`src/shared/http/client.ts` | 持久化任务、按用户执行、网络探测/重试、Axios Bearer Token |
| 队列生命周期与通知 | 客户端 `src/core/notifications/notification-provider.tsx` | 随登录用户及 AppState 管理队列；后台状态暂停处理；通过横幅展示连接和上传状态 |
| irisapi 服务 | 服务端 `src/index.ts`、`src/middleware/auth.ts`、`src/router/{notes,categories,auth,user,verify,releases}.ts` | Express 路由、JWT 认证、业务接口和发布接口 |
| PostgreSQL | 服务端 `src/db.ts`、`src/router/{notes,categories,auth,releases}.ts` | pg 连接池及用户、笔记、分类、发布元数据读写 |
| Redis | 服务端 `src/redis.ts`、`src/services/verification-code.ts` | 验证码、TTL、发送冷却、IP/设备维度限流；不是通用笔记缓存 |
| Resend | 服务端 `src/router/verify.ts` | 通过 Resend 发送验证码邮件 |
| MinIO | 服务端 `src/minio.ts`、`src/router/user.ts` | 头像对象存储，后端代理上传与读取；不是 APK 存储 |
| 构建发布 | 客户端 `scripts/release/cli.mjs`、`scripts/release/source.mjs`、`eas.json` | 版本预留绑定完整提交 SHA；本地 Gradle 与 EAS 构建入口并存 |
| 安装包分发 | 客户端 `scripts/release/upload.mjs`、`scripts/release/cos.mjs`、`scripts/release/delta.mjs`；服务端 `src/router/releases.ts`、`src/services/releases.ts` | 完整 APK 上传源站与 COS；差量补丁在源站；版本服务解析下载地址 |
| Android 更新器 | 客户端 `src/features/updates/{release,update-store}.ts`、`modules/irisnote-updater/android/src/main/java/expo/modules/irisnoteupdater/IrisNoteUpdaterModule.kt` | 版本查询、下载、差量合并、SHA-256/包名/签名/版本检查及系统安装入口 |

## 阅读边界

1. “上传队列与 API 客户端”包含两个协作职责：读请求直接调用 Axios；需要暂存的写操作通过 SQLite 队列处理。没有把所有查询画成排队任务，也没有使用独立消息中间件；图例的“消息总线”是 Archify 对队列节点的语义分类。
2. “本地持久化”内的 SQLite 保存笔记业务数据和任务，AsyncStorage 保存会话等键值；并非两套存储都包含所有数据。草稿与显式保存版本有各自边界。
3. 客户端声明 Expo `~57.0.22`、React Native `0.86.3`、React `19.2.3`；本次读取了 [Expo SDK 57 官方文档](https://docs.expo.dev/versions/v57.0.0/)。Android 更新器是原生模块；本图不构成 iOS/Web 完整能力验收。
4. 待办、摘录的创建页面仍为界面骨架，未发现对应完整业务 API/存储链路，因此仅在底部标为“待接入”。设置页面也不能据此视为具备云同步。
5. 更新策略按已发布版本距离计算，不能用 buildCode 差值代替。跨主版本或落后超过 3 个已发布版本使用完整包；同主版本且落后 1–3 版使用差量；落后至少 3 版要求更新。缺少可用差量或基础包不匹配时不能据图推断会自动下载完整包。
6. 完整 APK 优先使用经过可用性检查的 CDN 候选地址，不可用时回到源站；差量包 URL 来自源站。CDN 到源站的完整包切换，与差量失败后擅自改下完整包是两回事。
7. EAS 在此表示现有构建渠道。没有将其画成已接入的 EAS Update OTA；上传完仍为草稿，正式发布需发布命令。构建工具还调用发布 API 预留/管理版本，这类管理连线为避免掩盖主链路在总览中省略。
8. 图示保持 Archify classic 的类型配色：客户端青色、后端绿色、数据库紫色、云服务琥珀色、队列橙色、外部系统灰色。待接入状态在文字卡片明确标注，未虚构运行连线。

## 验收与可追溯记录

- 修改前 `npm run typecheck`：通过。
- `npm run check`：通过，包括 TypeScript、ESLint、主题同步检查及 224/224 测试。对应应用代码为客户端上述提交；本次新增文件仅为架构图和文档。
- Archify `validate` / `deliver`：showcase 9/9，0 错误，0 警告；客户端 14 个源码引用验证通过。
- [交付收据](delivery-receipt.json) 记录 JSON 与 HTML 的 SHA-256、字节数和确定性验收结果。
- [浏览器收据](irisnote-architecture.visual-check.json)：`status: pass`；1440×900、1600×1000、1920×1080、2048×1320 均无水平或垂直页面溢出。
- [浅深色截图索引](irisnote-architecture.visual-check.html) 包含 1440×900 和 2048×1320 下的四张截图。图像审阅确认文字与节点完整、连线无交叉遮挡、图例与工具栏分离，最大尺寸无明显下部空白带。
- 浏览器自动收据始终保留 `visualReview: pending`，这是工具的固定语义；人工/图像能力审阅单独记录为 `visual_review: passed`，不篡改自动收据。视觉布局修正 `correction_rounds: 1`。
- `visual-check` 不支持 `--headed --persistent`，本次使用其默认自动浏览器截图方式；未声称启用了这些参数。截图验收不包含实际导出文件或全部交互功能的端到端测试。
- 没有执行 APK 构建、上传、发布、Git 提交或服务重启。

## 再生成

在项目根目录执行，Archify 路径按本机安装位置设置：

```powershell
$archify = 'C:\Users\mouqiandi\.codex\skills\archify\bin\archify.mjs'
$spec = 'docs\架构指南\系统架构图\irisnote.architecture.json'
$html = 'docs\架构指南\系统架构图\irisnote-architecture.html'
node $archify validate architecture $spec --quality showcase --repo-root . --json
node $archify deliver architecture $spec $html --quality showcase --repo-root . --json
node $archify visual-check $html --json
```

任何修改都必须重新验证并交付；交付失败时不能对已有旧 HTML 宣称新版本验收通过。更新架构时同步刷新提交版本、源码依据和收据。
