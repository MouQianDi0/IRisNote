# IRISNote

基于 Expo SDK 56 + React Native 的跨平台笔记应用，集笔记、待办、剪贴板摘录与个人中心于一体。

## 目录

- [功能特性](#功能特性)
- [开发笔记](#开发笔记)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [后端服务](#后端服务) _注意_：这个必须要看
- [环境要求](#环境要求)

---

## 功能特性

- **笔记** — 创建、编辑和保存笔记，支持标题与正文。笔记可归属到不同自定义分类，按分类筛选查看，所有笔记统一在「全部」视图下可见
- **笔记分类** — 自定义分类（增/删/改/换图标），支持置顶和标星排序，数据持久化到后端 PostgreSQL
- **待办清单** — 快速创建待办事项
- **剪贴板摘录** — 收集和整理摘录内容
- **个人中心** — 用户信息与设置管理
- **悬浮导航菜单** — 右下角动画悬浮菜单，支持上下滑动手势切换页面
- **图标动画** — 切换标签页时图标渐入弹出效果，创建按钮间歇颤抖动画

## 开发笔记

编写或了解开发未来规划，访问[语雀](https://www.yuque.com/g/miaoshuishui-ookut/rs6k2t/collaborator/join?token=MopqlDrYAC7UHe4c#)开发笔记

## 技术栈

| 类别 | 技术                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 框架 | [Expo SDK 56](https://docs.expo.dev/tutorial/create-your-first-app/) / [React Native 0.85](https://reactnative.cn/docs/getting-started) |
| 路由 | expo-router（文件系统路由 + 类型化路由）                                                                                                |
| 样式 | [NativeWind](https://www.nativewind.dev/docs)                                                                                           |
| 动画 | [react-native-reanimated 4](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/)                      |
| 图标 | [lucide-react-native](https://lucide.dev/guide/packages/lucide-react-native)                                                            |
| 手势 | [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/introduction/)                 |
| 语言 | TypeScript                                                                                                                              |

## 项目结构

```
src/
├── app/                        # Expo Router 文件路由
│   ├── _layout.tsx             # 根布局（Stack + GestureHandlerRootView + AuthProvider）
│   ├── index.tsx               # 入口重定向
│   ├── auth/                   # 认证页
│   │   ├── login.tsx           # 登录（邮箱 + 密码 + 验证码）
│   │   └── register.tsx        # 注册
│   ├── (tabs)/                 # Tab 路由组
│   │   ├── _layout.tsx         # Tab 布局（隐藏 tabBar + 登录守卫）
│   │   ├── note/               # 笔记
│   │   │   ├── _layout.tsx     # Stack 子路由
│   │   │   └── index.tsx       # 笔记首页（含 FloatingBar 分类筛选 + FloatingMenu）
│   │   ├── todo/               # 待办
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx       # 待办首页
│   │   │   └── create.tsx      # 新建待办
│   │   ├── excerpt/            # 剪贴板摘录
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx       # 摘录首页
│   │   │   └── create.tsx      # 新建摘录
│   │   └── user/               # 个人中心
│   │       ├── _layout.tsx
│   │       ├── index.tsx       # 用户首页
│   │       └── settings.tsx    # 设置页
│   └── pages/                  # 非 Tab 页面
│       ├── note/create.tsx     # 新建笔记（自动识别当前分类）
│       ├── todo/create.tsx     # 新建待办
│       ├── excerpt/create.tsx  # 新建摘录
│       └── user/settings.tsx   # 用户设置
├── api/                        # HTTP 请求
│   └── client.ts               # axios 实例（自动附加 JWT token）
├── components/                 # 公共组件
│   ├── ActionButton.tsx        # 悬浮操作按钮（长按跳转 + 摇晃动画）
│   ├── addNoteClass.tsx        # 新建分类弹窗
│   ├── CategoryActionModel.tsx # 分类操作弹窗（删除/置顶/标星/重命名/换图标）
│   ├── FloatingBar.tsx         # 悬浮分类筛选栏（支持长按操作 + 选中高亮）
│   └── FloatingMenu.tsx        # 悬浮导航菜单
├── hooks/                      # 自定义 Hook
│   ├── FloatingBar/            # 分类操作 Hook
│   │   ├── useCategoryChangeIcon.ts  # 更换分类图标
│   │   ├── useCategoryDelete.ts     # 删除分类
│   │   ├── useCategoryPin.ts        # 分类置顶/取消
│   │   ├── useCategoryRename.ts     # 分类重命名
│   │   └── useCategoryStar.ts       # 分类标星/取消
│   ├── FloatingMenu/
│   │   └── useSwipeTab.ts           # 滑动切换 tab
│   ├── animations.ts           # 共享动画配置（pulse / shake / easing）
│   ├── useAuth.tsx             # 认证上下文（登录态/用户信息/登出）
│   ├── useDebounceNavigation.ts # 防抖 + 锁定导航
│   ├── useEmailValidation.ts  # 邮箱格式校验
│   ├── useLongPressButton.ts   # 长按导航（Gesture.Pan + 缩放动画）
│   └── useSwipeSelect.ts       # 滑动选择泛型 Hook
├── data/                       # 数据层
│   ├── actions.ts              # 操作路由映射（getAction / getActiveTabKey）
│   └── categories.ts           # 分类数据和共享状态（Category 类型 / ALL_CATEGORY / 分类切换上下文）
└── docs/                       # 文档
    ├── API.md                  # API 接口文档
    ├── JWT认证中间件详解.md
    ├── 数据库设计与用户认证方案.md
    ├── IRisNote 服务端部署手册（Docker 生产版）.md
    └── ...
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npx expo start
```

运行后在终端选择：

- `w` — 打开 Web 版
- `a` — 打开 Android 模拟器（目前主要开发）
- `i` — 打开 iOS 模拟器
- 扫码 — 在 Expo Go 中打开

### 脚本

| 命令              | 说明                 |
| ----------------- | -------------------- |
| `npm start`       | 启动 Expo 开发服务器 |
| `npm run web`     | 启动 Web 版          |
| `npm run android` | 编译并运行 Android   |
| `npm run ios`     | 编译并运行 iOS       |
| `npm run lint`    | 执行 ESLint 检查     |

## 后端服务

本项目配套后端 API：[irisapi](https://github.com/MouQianDi0/irisapi) — 基于 Express + PostgreSQL 的 RESTful API 服务。后端基本开发完成后会部署到服务器中...

```
手机 App (Expo)
    ↓ axios HTTP 请求
irisapi (Express 后端)
    ↓ pg 查询
PostgreSQL 数据库
```

详见 [axios → Express → PostgreSQL 连接文档](./docs/axios-express-postgresql（前端连接到数据库）.md)

## 环境要求

- Node.js 18+
- Expo CLI
- Android Studio / Xcode（如需本地编译）
