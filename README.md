# IRISNote（NextNote）

基于 Expo SDK 56 + React Native 的跨平台笔记应用，集笔记、待办、剪贴板摘录与个人中心于一体。

## 功能特性

- **笔记** — 创建、编辑和保存笔记，支持标题与正文
- **待办清单** — 快速创建待办事项
- **剪贴板摘录** — 收集和整理摘录内容
- **个人中心** — 用户信息与设置管理
- **悬浮导航菜单** — 右下角动画悬浮菜单，支持上下滑动手势切换页面
- **图标动画** — 切换标签页时图标渐入弹出效果，创建按钮间歇颤抖动画

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Expo SDK 56 / React Native 0.85 |
| 路由 | expo-router（文件系统路由 + 类型化路由） |
| 样式 | NativeWind（Tailwind CSS for RN） |
| 动画 | react-native-reanimated 4（CSS Keyframes） |
| 图标 | lucide-react-native |
| 手势 | react-native-gesture-handler |
| 语言 | TypeScript |

## 项目结构

```
src/
├── app/                     # Expo Router 文件路由
│   ├── _layout.tsx          # 根布局（Stack）
│   ├── index.tsx            # 入口重定向
│   ├── about.tsx            # 关于页
│   ├── contact.tsx          # 联系我们
│   └── (tabs)/              # Tab 路由组
│       ├── _layout.tsx      # Tab 布局（隐藏 tabBar）
│       ├── note/            # 笔记
│       │   ├── _layout.tsx  # Stack 子路由
│       │   ├── index.tsx    # 笔记首页
│       │   └── create.tsx   # 新建笔记
│       ├── todo/            # 待办
│       │   ├── _layout.tsx
│       │   ├── index.tsx
│       │   └── create.tsx
│       ├── excerpt/         # 剪贴板摘录
│       │   ├── _layout.tsx
│       │   ├── index.tsx
│       │   └── create.tsx
│       └── user/            # 个人中心
│           ├── _layout.tsx
│           ├── index.tsx
│           └── settings.tsx
└── components/              # 公共组件
    └── FloatingMenu.tsx     # 悬浮导航菜单
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
- `a` — 打开 Android 模拟器
- `i` — 打开 iOS 模拟器
- 扫码 — 在 Expo Go 中打开

### 脚本

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 Expo 开发服务器 |
| `npm run web` | 启动 Web 版 |
| `npm run android` | 编译并运行 Android |
| `npm run ios` | 编译并运行 iOS |
| `npm run lint` | 执行 ESLint 检查 |

## 环境要求

- Node.js 18+
- Expo CLI
- Android Studio / Xcode（如需本地编译）
