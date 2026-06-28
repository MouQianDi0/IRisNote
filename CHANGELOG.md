# CHANGELOG

## 2026-06-29

### 修复问题

- **初始化时「全部」分类不显示笔记**
  - 日期：2026-06-29 15:00:00
  - 修改文件：`src/app/(tabs)/note/index.tsx`
  - 问题：`currentCategory` 初始值为 `"all"`，与筛选条件 `String(ALL_CATEGORY.id)`（`"0"`）不匹配，导致首次加载走错分支
  - 修复：初始值改为 `String(ALL_CATEGORY.id)`

### 新增功能

- **笔记支持 category_id 分类归属**
  - 日期：2026-06-29 14:30:00
  - 修改文件：`src/data/categories.ts`、`src/components/FloatingBar.tsx`、`src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`
  - 变更内容：
    - `categories.ts`：新增 `setCurrentCategory`、`getCurrentCategoryId`、`getCurrentCategoryName` 三个函数，用模块级变量共享当前选中分类状态（FloatingBar → create 页跨组件传递）
    - `FloatingBar.tsx`：`handlePress` 中调用 `setCurrentCategory` 同步当前分类 ID 和名称
    - `note/index.tsx`：`Note` 类型 `category`（string）→ `category_id`（number\|null）；新增分类列表获取和 `categoryNameMap`（id→名称映射）；筛选逻辑改为 `String(category_id)` 比较；分类标签从 nameMap 查找显示
    - `note/create.tsx`：创建笔记时读取 `getCurrentCategoryId()`，非「全部」分类时在 POST body 中传入 `category_id`；页面显示当前分类名称提示

- **分类功能接入后端 API**
  - 日期：2026-06-29 11:00:00
  - 修改文件：`src/data/categories.ts`、`src/components/FloatingBar.tsx`、`src/components/addNoteClass.tsx`、`src/hooks/FloatingBar/useCategoryPin.ts`、`src/hooks/FloatingBar/useCategoryStar.ts`、`src/hooks/FloatingBar/useCategoryDelete.ts`、`src/hooks/FloatingBar/useCategoryRename.ts`、`src/hooks/FloatingBar/useCategoryChangeIcon.ts`
  - 变更内容：
    - `categories.ts`：`Category.id` 类型从 `string` 改为 `number`；`noteCategories` 数组替换为 `ALL_CATEGORY` 常量（id=0 虚拟分类）
    - 5 个 FloatingBar hook 全部接入 API：置顶/标星/重命名/换图标 → `PUT /api/categories/:id`，删除 → `DELETE /api/categories/:id`；采用先调 API 成功后更新本地状态的模式
    - `FloatingBar.tsx`：`useState(noteCategories)` 改为 `useState<Category[]>([])` + `useEffect` 调 `GET /api/categories` 初始化；`handleAddCategory` 改为 `POST /api/categories`；sortedCategories 前插入 `ALL_CATEGORY`
    - `addNoteClass.tsx`：`onAdd` prop 改为 `(name: string, icon: string)`，删除 `Date.now()` 生成临时 ID 的逻辑，由后端返回真实 ID

### 优化代码

- **拆分 FloatingBar 删除/重命名/换图标逻辑为独立 hook**
  - 日期：2026-06-29 10:30:00
  - 修改文件：`src/hooks/FloatingBar/useCategoryDelete.ts`（新建）、`src/hooks/FloatingBar/useCategoryRename.ts`（新建）、`src/hooks/FloatingBar/useCategoryChangeIcon.ts`（新建）、`src/components/FloatingBar.tsx`
  - 变更内容：将 `FloatingBar` 组件内的 `handleDeleteCategory`、`handleRename`、`handleChangeIcon` 三个内联函数提取为独立的 `useCategoryDelete` / `useCategoryRename` / `useCategoryChangeIcon` hook，与已有的 `useCategoryPin` / `useCategoryStar` 保持一致的参数接口和返回风格。各 hook 使用 `useCallback` 包裹，接收显式参数而非依赖闭包。`FloatingBar` 中删除约 35 行内联逻辑，改为调用三个 hook，JSX 中包装箭头函数传入 `longPressVisible` 作为第一个参数。

## 2026-06-28

### 优化代码

- **拆分 FloatingBar 置顶/标星逻辑为独立 hook**
  - 日期：2026-06-28 23:45:00
  - 修改文件：`src/hooks/useCategoryPin.ts`（新建）、`src/hooks/useCategoryStar.ts`（新建）、`src/components/FloatingBar.tsx`
  - 变更内容：将 `FloatingBar` 组件内的 `handleTogglePin` 和 `handleToggleStar` 提取为独立的 `useCategoryPin` / `useCategoryStar` hook，接收 `setCategories` 和 `setLongPressVisible` 作为参数，返回 `togglePin` / `toggleStar` 回调。`FloatingBar` 中删除约 30 行内联逻辑，改为调用两个 hook。

### 新增功能

- **返回顶部按钮迁移至 Reanimated 上下缓动动画**
  - 日期：2026-06-28 23:30:00
  - 修改文件：`src/app/(tabs)/note/index.tsx`
  - 变更内容：将返回顶部按钮的动画实现从 React Native `Animated` API 迁移到 `react-native-reanimated`（v4）。使用 `useSharedValue` + `withRepeat(withTiming())` 实现持续上下浮动（0 → -8px 往复，周期 1.5s），通过 `useAnimatedStyle` 驱动 `translateY` 变换。`Animated.View` 承载动画，`Pressable` 作为子元素。新增导入 `Animated`、`useAnimatedStyle`、`useSharedValue`、`withRepeat`、`withTiming`。

- **返回顶部按钮增加上下缓动动画（已废弃）**
  - 日期：2026-06-28 23:15:00
  - 修改文件：`src/app/(tabs)/note/index.tsx`
  - 变更内容：为返回顶部按钮添加持续上下浮动动画，原始实现使用 RN `Animated.loop` + `Animated.sequence` + `Easing.inOut`。后续已迁移至 Reanimated。

## 2026-06-25

### 修复问题

- **修复 Git pre-commit 钩子报错导致提交失败**
  - 日期：2026-06-25
  - 修改文件：`.git/hooks/pre-commit`（删除）
  - 问题描述：pre-commit 钩子尝试执行 `./node_modules/pre-commit/hook`，但 `pre-commit` 包未安装且在 `package.json` 中无声明，导致每次提交都失败。
  - 修复方案：删除无效的 pre-commit 钩子文件。

- **修复 lucide-react-native 图标 `color` 属性 TypeScript 类型错误**
  - 日期：2025-06-25
  - 修改文件：`package.json`
  - 问题描述：安装 `moti` 后，`npm` 在重排依赖时移除了 `react-native-svg` 包，导致 `lucide-react-native` 的 `LucideProps` 接口无法解析其父接口 `SvgProps`（来自 `react-native-svg`），从而丢失 `color`、`stroke` 等 SVG 原生属性，触发 TypeScript 类型错误：`类型"LucideProps"上不存在属性"color"`。
  - 修复方案：显式安装 `react-native-svg` 作为项目依赖，恢复类型定义。
