# IRisNote

IRisNote 是一个基于 Expo SDK 56、React Native 和 Expo Router 开发的跨平台笔记应用。项目当前以笔记和笔记分类为主要业务，并包含用户认证、个人资料、待办、剪贴板摘录和设置页面。

## 当前功能状态

| 模块 | 状态 | 当前能力 |
| --- | --- | --- |
| 用户认证 | 已实现 | 邮箱验证码、密码登录、注册、会话恢复、退出登录 |
| 笔记 | 已实现主要流程 | 列表、创建、详情、删除、分类筛选、置顶、标星、下拉刷新 |
| 笔记分类 | 已实现 | 创建、改名、更换图标、置顶、标星、删除分类及其笔记 |
| 个人资料 | 已实现主要流程 | 移动端全屏无顶栏个人工作台、头像上传、内容概览、继续阅读、全部/星标笔记与草稿箱快捷入口 |
| 设置 | UI 已实现 | 账户概览、当前设置状态、分组设置、头像入口、版本信息与退出登录；尚未开放的设置明确显示规划中 |
| 待办 | 占位页面 | 当前仅有列表与创建页面骨架 |
| 剪贴板摘录 | 占位页面 | 当前仅有列表与创建页面骨架 |

> “占位页面”表示路由和页面入口已经存在，但尚未接入 API、表单、缓存或状态管理。设置页已经完成信息架构与现有能力接线，但主题、通知、全局同步、存储和隐私等设置仍需后续独立接入。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 应用框架 | Expo SDK 56、React Native 0.85、React 19 |
| 路由 | Expo Router 56，启用 Typed Routes |
| 语言 | TypeScript，启用严格模式 |
| 样式 | NativeWind 5、Tailwind CSS 4、共享 Theme Token |
| 网络 | Axios |
| 本地存储 | AsyncStorage、Expo SQLite 56（Android、iOS、Web） |
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

部署到其他 Web 托管平台时，必须在该平台的服务器或反向代理中配置相同响应头。Expo SDK 56 的 Web SQLite 仍为 Alpha，正式发布前需要单独完成浏览器兼容性和持久化验证。

## 开发检查

```bash
# TypeScript 类型检查
npx tsc --noEmit

# ESLint 检查
npm run lint

# 验证 Web 生产导出
npx expo export --platform web
```

## 后端服务

配套后端为 [irisapi](https://github.com/MouQianDi0/irisapi)，使用 Express 和 PostgreSQL 提供认证、笔记、分类及用户资料接口。

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

## License

本项目采用 [LICENSE](./LICENSE) 中声明的许可证。
# Android 构建与应用更新

已接入 EAS / 自有构建共用的发布工具，以及 App 内检查更新、APK 下载和安装入口。
正式启用需要部署版本服务并配置正式签名。使用步骤、环境变量和验收边界见
[Android 双渠道发布说明](docs/构建发布/android-releases.md)。
