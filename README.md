# IRisNote

IRisNote 是一个基于 Expo SDK 57、React Native 和 Expo Router 开发的本地优先跨平台笔记应用。当前以笔记和笔记分类为核心业务，本地数据库离线可用，登录后自动同步云端，并包含用户认证、个人资料、待办、剪贴板摘录和设置页面，支持应用内检查更新与差量升级。

## 当前功能状态

| 模块 | 状态 | 当前能力 |
| --- | --- | --- |
| 用户认证 | 已实现 | 邮箱验证码、密码登录、注册、会话恢复、退出登录 |
| 笔记 | 已实现 | 列表、创建、编辑、查看、删除、分类筛选、置顶、标星、滑动快捷操作、下拉刷新 |
| 笔记编辑与恢复 | 已实现 | 自动草稿、草稿箱、历史版本、误退出不丢内容 |
| 笔记阅读 | 已实现 | 阅读进度记忆、字数与预计阅读时长统计、阅读导航 |
| 笔记分享导出 | 已实现 | 复制、Markdown、TXT、PDF、长图导出 |
| 本地存储与同步 | 已实现 | Expo SQLite 本地数据库、离线优先、自动上传队列、同步任务管理、同步历史 |
| 笔记分类 | 已实现 | 创建、改名、更换图标、置顶、标星、删除分类及其笔记 |
| 个人资料 | 已实现 | 移动端全屏无顶栏个人工作台、头像上传、内容概览、继续阅读、全部/星标笔记与草稿箱快捷入口 |
| 待办 | 开发中 | 日历轨道（周切换、月历跳转、返回今天）、列表与创建页面骨架 |
| 剪贴板摘录 | 占位页面 | 当前仅有列表与创建页面骨架 |
| 应用内更新 | 已实现 | 检查更新、APK 下载与安装、同主版本差量更新 |
| 设置 | UI 已实现 | 账户概览、分组设置、版本信息与退出登录；主题、通知等设置仍需后续接入 |

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 应用框架 | Expo SDK 57、React Native 0.86、React 19 |
| 路由 | Expo Router 57，启用 Typed Routes |
| 语言 | TypeScript，启用严格模式 |
| 样式 | NativeWind 5、Tailwind CSS 4、共享 Theme Token |
| 状态管理 | Zustand |
| 网络 | Axios |
| 本地存储 | AsyncStorage、Expo SQLite 57（Android、iOS、Web） |
| 列表 | Flash List |
| 动画 | React Native Reanimated 4 |
| 手势 | React Native Gesture Handler |
| 图标 | Lucide React Native |
| 图片 | Expo Image、Expo Image Picker |

## 环境要求

- Node.js 18 或更高版本。
- npm。
- 运行 Android 原生版本时需要 Android Studio 和 Android SDK。
- 运行 iOS 原生版本时需要 macOS 和 Xcode。
- 也可以使用 Expo Go 或 Web 模式进行开发预览。

## 安装

```bash
npm install
```

## 环境变量

应用只读取 `EXPO_PUBLIC_BASE_URL` 作为 API 根地址。该地址应包含 `/api`，例如：

```dotenv
EXPO_PUBLIC_BASE_URL=https://example.com/api
```

如果没有设置，应用会使用源码中的默认地址 `https://tech-mou.top/api`。

## 启动项目

启动 Expo 开发服务器：

```bash
npm start
```

启动后可以在终端中：

- 按 `w` 打开 Web 版本。
- 按 `a` 打开 Android 模拟器或已连接设备。
- 扫描二维码在 Expo Go 中打开。

也可以直接运行：

```bash
# Web 开发模式
npm run web

# 本地编译并运行 Android
npm run android

# 仅在 macOS 上本地编译并运行 iOS
npm run ios
```

Web SQLite 依赖 WASM 和 `SharedArrayBuffer`。项目的 Metro 开发服务器与 EAS Hosting 配置已经加入以下跨源隔离响应头：

```text
Cross-Origin-Embedder-Policy: credentialless
Cross-Origin-Opener-Policy: same-origin
```

部署到其他 Web 托管平台时，必须在该平台的服务器或反向代理中配置相同响应头。Web 端 SQLite 仍处于早期阶段，建议优先使用 Android 版，正式 Web 发布前需要单独完成浏览器兼容性和持久化验证。

## 开发检查

```bash
# 一键检查：类型检查 + ESLint + 主题同步校验 + 单元测试（发布构建前必跑）
npm run check

# 单独运行各环节
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint 检查
npm test            # Node 内置测试运行器
npm run theme:check # 主题 CSS 同步校验
```

## Android 构建与应用更新

已接入 EAS / 自有构建共用的发布工具，支持：

- 版本服务统一分配构建号，EAS 与自有 Gradle 构建使用同一正式签名
- 应用内检查更新、APK 下载与安装
- 同主版本差量更新（HDiffPatch），仅下载增量包
- 发布产物自动上传至服务器与 COS

使用步骤、环境变量和验收边界见 [Android 双渠道发布说明](docs/构建发布/android-releases.md)。

## 后端服务

配套后端为 irisapi（同目录独立项目），使用 Express 和 PostgreSQL 提供认证、笔记、分类、用户资料及版本发布接口。

```text
IRisNote（Expo App）
    ↓ Axios HTTP 请求
irisapi（Express API）
    ↓ SQL 查询
PostgreSQL
```

接口细节见 [API 文档](./docs/API后端/API.md) 和 [前后端连接说明](./docs/API后端/axios-express-postgresql（前端连接到数据库）.md)。

## 开发文档

- [项目架构与文件索引](./docs/架构指南/项目架构与文件索引.md)：目录职责、路由映射和逐文件说明。
- [业务模块与运行逻辑](./docs/架构指南/业务模块与运行逻辑.md)：认证、笔记、分类、头像等业务的数据流与调用链。
- [后续开发指南](./docs/架构指南/后续开发指南.md)：新增页面、API、组件、Hook、类型和业务模块的具体方法。
- [样式开发规范](./docs/UI/样式开发规范.md)：NativeWind、Theme Token 和共享 UI 的使用规则。
- [GitHub 团队开发指南](./docs/架构指南/GitHub团队开发指南.md)：分支、提交和协作约定。
- [更新说明编写规范](./docs/构建发布/更新说明编写规范.md)：面向用户的版本更新说明写作规则。

## License

本项目采用 [LICENSE](./LICENSE) 中声明的许可证。
