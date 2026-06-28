# CHANGELOG

## 2026-06-28

### 新增功能

- **返回顶部按钮增加上下缓动动画**
  - 日期：2026-06-28 23:15:00
  - 修改文件：`src/app/(tabs)/note/index.tsx`
  - 变更内容：为返回顶部按钮添加持续上下浮动动画（0 → -8px → 0，周期约 1.6s），使用 `Animated.loop` + `Animated.sequence` + `Easing.inOut` 实现缓入缓出效果。外层新增 `Animated.View` 承载动画变换，`Pressable` 作为子元素保持不变。新增导入 `Animated`、`Easing`。

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
