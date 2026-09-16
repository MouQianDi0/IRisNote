# NativeWind v5 + Tailwind CSS v4 完整开发手册

> IRisNote 项目说明：当前项目使用 NativeWind v5 与 Tailwind CSS v4 的 CSS-first 配置。项目实际配置和日常写法以同目录的 `样式开发规范.md`、项目根目录 `global.css` 以及 `src/theme/` 为准；不要为本项目新增旧版 `tailwind.config.js` 或 `@tailwind` 指令。

> **📱 = App端支持 | 🌐 = Web专用 | 📱🌐 = 两端都支持**
>
> 本手册基于 NativeWind v5 官方文档 + Tailwind CSS v4 官方文档整理

---

## 一、NativeWind 是什么

NativeWind 让你在 React Native 中使用 Tailwind CSS 的 `className` 来样式化组件，跨平台共享样式：

- **Web端**：使用 CSS StyleSheet
- **Native端**：编译为 `StyleSheet.create`
- **运行时**：处理伪类（hover/focus/active）、媒体查询、容器查询

### 核心特性

| 特性 | 说明 |
|------|------|
| 🌐 跨平台 | 一套 className 同时用于 Web 和 Native |
| ✨ 伪类支持 | hover / focus / active 等状态样式 |
| 👪 暗黑模式 | 自动跟随系统或手动切换 |
| 🔥 编译时优化 | 编译为 StyleSheet，运行时开销极小 |

---

## 二、安装配置

### 2.1 Expo 项目安装

```bash
# 安装核心依赖
npx expo install nativewind tailwindcss@^3.4

# 安装 Metro 配置
npx expo install metro-config
```

### 2.2 配置 metro.config.js

```js
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

### 2.3 创建 global.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 2.4 在根布局导入

```tsx
// app/_layout.tsx
import "../global.css";

export default function RootLayout() {
  return (
    // ...你的布局
  );
}
```

### 2.5 配置 tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### 2.6 创建 nativewind-env.d.ts

```ts
/// <reference types="nativewind/types" />
```

---

## 三、布局 (Layout) 📱🌐

### 3.1 Flexbox 基础

| 类名 | CSS对应 | 作用 |
|------|---------|------|
| `flex` | `display: flex` | 设置弹性布局容器 |
| `flex-row` | `flex-direction: row` | 子元素水平排列（从左到右） |
| `flex-col` | `flex-direction: column` | 子元素垂直排列（从上到下），默认方向 |
| `flex-1` | `flex: 1` | 占据父容器所有剩余空间 |
| `flex-wrap` | `flex-wrap: wrap` | 子元素放不下时自动换行 |
| `flex-shrink` | `flex-shrink: 1` | 子元素允许缩小 |
| `flex-grow` | `flex-grow: 1` | 子元素允许放大 |

### 3.2 主轴对齐 (Justify)

```tsx
// justify-center: 主轴居中
<View className="flex-row justify-center">
  <View className="w-10 h-10 bg-blue-500" />
</View>

// justify-between: 两端对齐
<View className="flex-row justify-between">
  <View className="w-10 h-10 bg-red-500" />
  <View className="w-10 h-10 bg-green-500" />
</View>

// justify-around: 分散对齐
<View className="flex-row justify-around">
  <View className="w-10 h-10 bg-yellow-500" />
  <View className="w-10 h-10 bg-purple-500" />
</View>

// justify-start: 起始端对齐（默认）
<View className="flex-row justify-start">

// justify-end: 结束端对齐
<View className="flex-row justify-end">
```

| 类名 | CSS对应 | 作用 |
|------|---------|------|
| `justify-center` | `justify-content: center` | 主轴居中对齐子元素 |
| `justify-between` | `justify-content: space-between` | 两端对齐，间距相等 |
| `justify-around` | `justify-content: space-around` | 分散对齐，两侧间距相等 |
| `justify-evenly` | `justify-content: space-evenly` | 完全均匀分布 |
| `justify-start` | `justify-content: flex-start` | 起始端对齐 |
| `justify-end` | `justify-content: flex-end` | 结束端对齐 |

### 3.3 交叉轴对齐 (Align)

```tsx
// items-center: 交叉轴居中
<View className="flex-row items-center h-20">
  <View className="w-10 h-10 bg-blue-500" />
  <Text className="ml-2">文字</Text>
</View>

// items-start: 交叉轴顶部对齐
<View className="flex-row items-start">

// items-end: 交叉轴底部对齐
<View className="flex-row items-end">

// items-stretch: 交叉轴拉伸（默认）
<View className="flex-row items-stretch">
```

| 类名 | CSS对应 | 作用 |
|------|---------|------|
| `items-center` | `align-items: center` | 交叉轴居中 |
| `items-start` | `align-items: flex-start` | 交叉轴起始端 |
| `items-end` | `align-items: flex-end` | 交叉轴结束端 |
| `items-stretch` | `align-items: stretch` | 交叉轴拉伸（默认） |
| `items-baseline` | `align-items: baseline` | 基线对齐 |
| `self-center` | `align-self: center` | 自身交叉轴居中 |
| `self-start` | `align-self: flex-start` | 自身起始端 |
| `self-end` | `align-self: flex-end` | 自身结束端 |

---

## 四、间距 (Spacing) 📱🌐

### 4.1 Padding（内边距）

> **作用**：控制元素内容与边框之间的距离

```tsx
// p-8: 四个方向内边距 = 32px (8 × 4px)
<View className="p-8 bg-blue-100">
  <Text>内容</Text>
</View>

// px-8: 只设置左右内边距 = 32px
<View className="px-8">

// py-4: 只设置上下内边距 = 16px
<View className="py-4">

// pt-6: 只设置顶部内边距 = 24px
<View className="pt-6">

// pb-8: 只设置底部内边距 = 32px
<View className="pb-8">

// pl-2: 只设置左侧内边距 = 8px
<View className="pl-2">

// pr-4: 只设置右侧内边距 = 16px
<View className="pr-4">
```

| 类名 | 作用 | 计算方式 |
|------|------|---------|
| `p-{n}` | 四边内边距 | n × 4px |
| `px-{n}` | 水平内边距（左右） | n × 4px |
| `py-{n}` | 垂直内边距（上下） | n × 4px |
| `pt-{n}` | 顶部内边距 | n × 4px |
| `pb-{n}` | 底部内边距 | n × 4px |
| `pl-{n}` | 左侧内边距 | n × 4px |
| `pr-{n}` | 右侧内边距 | n × 4px |
| `p-px` | 1px 内边距 | 固定 1px |
| `p-[value]` | 任意值内边距 | 自定义 |

### 4.2 Margin（外边距）

> **作用**：控制元素与外部其他元素之间的距离

```tsx
// m-8: 四个方向外边距 = 32px
<View className="m-8">

// mx-auto: 水平居中（左右外边距自动）
<View className="mx-auto">

// -mt-8: 负值外边距，向上移动 32px
<View className="-mt-8">

// gap-4: 子元素之间间距 = 16px
<View className="flex flex-col gap-4">
  <View className="h-10 bg-red-500" />
  <View className="h-10 bg-blue-500" />
</View>
```

| 类名 | 作用 | 计算方式 |
|------|------|---------|
| `m-{n}` | 四边外边距 | n × 4px |
| `-m-{n}` | 负值四边外边距 | -n × 4px |
| `mx-{n}` | 水平外边距 | n × 4px |
| `my-{n}` | 垂直外边距 | n × 4px |
| `mt-{n}` | 顶部外边距 | n × 4px |
| `mb-{n}` | 底部外边距 | n × 4px |
| `ml-{n}` | 左侧外边距 | n × 4px |
| `mr-{n}` | 右侧外边距 | n × 4px |
| `mx-auto` | 水平居中 | margin: 0 auto |
| `gap-{n}` | 子元素间距 | n × 4px |
| `gap-x-{n}` | 水平间距 | n × 4px |
| `gap-y-{n}` | 垂直间距 | n × 4px |

---

## 五、尺寸 (Sizing) 📱🌐

```tsx
// w-10: 宽度 40px
<View className="w-10 h-10 bg-blue-500" />

// w-full: 宽度 100%
<View className="w-full">

// h-20: 高度 80px
<View className="h-20">

// size-12: 同时设置宽高 = 48px
<View className="size-12 bg-red-500 rounded-full" />

// 任意值
<View className="w-[200px] h-[100px]">
```

| 类名 | 作用 |
|------|------|
| `w-{n}` | 宽度 n × 4px |
| `w-full` | 宽度 100% |
| `w-screen` | 宽度 100vw |
| `w-auto` | 宽度自动 |
| `h-{n}` | 高度 n × 4px |
| `h-full` | 高度 100% |
| `h-screen` | 高度 100vh |
| `h-auto` | 高度自动 |
| `size-{n}` | 宽高同时设置 n × 4px |
| `min-w-{n}` | 最小宽度 |
| `max-w-{n}` | 最大宽度 |
| `min-h-{n}` | 最小高度 |
| `max-h-{n}` | 最大高度 |
| `w-[value]` | 任意宽度值 |
| `h-[value]` | 任意高度值 |

---

## 六、排版 (Typography) 📱🌐

### 6.1 字号

```tsx
<Text className="text-xs">12px 文字</Text>
<Text className="text-sm">14px 文字</Text>
<Text className="text-base">16px 文字（默认）</Text>
<Text className="text-lg">18px 文字</Text>
<Text className="text-xl">20px 文字</Text>
<Text className="text-2xl">24px 文字</Text>
<Text className="text-3xl">30px 文字</Text>
<Text className="text-4xl">36px 文字</Text>
<Text className="text-[18px]">任意字号</Text>
```

| 类名 | 字号 |
|------|------|
| `text-xs` | 12px |
| `text-sm` | 14px |
| `text-base` | 16px（默认） |
| `text-lg` | 18px |
| `text-xl` | 20px |
| `text-2xl` | 24px |
| `text-3xl` | 30px |
| `text-4xl` | 36px |

### 6.2 字重

```tsx
<Text className="font-light">细体 300</Text>
<Text className="font-normal">正常 400</Text>
<Text className="font-medium">中等 500</Text>
<Text className="font-semibold">半粗 600</Text>
<Text className="font-bold">粗体 700</Text>
```

| 类名 | 字重 |
|------|------|
| `font-thin` | 100 |
| `font-extralight` | 200 |
| `font-light` | 300 |
| `font-normal` | 400 |
| `font-medium` | 500 |
| `font-semibold` | 600 |
| `font-bold` | 700 |
| `font-extrabold` | 800 |
| `font-black` | 900 |

### 6.3 文本样式

```tsx
<Text className="text-center">居中对齐</Text>
<Text className="uppercase">全大写 LOWERCASE</Text>
<Text className="capitalize">hello world → Hello World</Text>
<Text className="underline">下划线</Text>
<Text className="line-through">删除线</Text>
<Text className="italic">斜体</Text>
<Text className="tracking-wider">字间距加宽</Text>
<Text className="leading-6">行高 24px</Text>
<Text className="truncate" numberOfLines={1}>超出部分截断...</Text>
```

| 类名 | 作用 |
|------|------|
| `text-left` | 左对齐 |
| `text-center` | 居中对齐 |
| `text-right` | 右对齐 |
| `uppercase` | 全大写 |
| `lowercase` | 全小写 |
| `capitalize` | 首字母大写 |
| `underline` | 下划线 |
| `line-through` | 删除线 |
| `italic` | 斜体 |
| `tracking-{n}` | 字间距 |
| `leading-{n}` | 行高 |
| `truncate` | 文本截断 |

---

## 七、颜色 (Colors) 📱🌐

### 7.1 颜色等级

```
50  → 最浅（背景色）
100 → 浅色
200 → 较浅
300 → 浅
400 → 较浅（次要文字）
500 → 中间（主色调）
600 → 较深
700 → 深色
800 → 较深（深色背景）
900 → 深
950 → 最深
```

### 7.2 使用示例

```tsx
// 背景色
<View className="bg-blue-500">
<View className="bg-red-100">
<View className="bg-gray-900">

// 文字颜色
<Text className="text-blue-500">
<Text className="text-gray-600">
<Text className="text-white">

// 边框颜色
<View className="border border-gray-300">
<View className="border-2 border-red-500">

// 透明度
<View className="bg-blue-500 bg-opacity-50">
<Text className="text-black text-opacity-70">
```

### 7.3 常用颜色

| 颜色名 | 色系 |
|--------|------|
| `red` | 红色 |
| `orange` | 橙色 |
| `yellow` | 黄色 |
| `green` | 绿色 |
| `teal` | 青色 |
| `blue` | 蓝色 |
| `indigo` | 靛蓝色 |
| `purple` | 紫色 |
| `pink` | 粉色 |
| `gray` | 灰色 |
| `slate` | 石板灰 |
| `zinc` | 锌灰色 |
| `white` | 白色 |
| `black` | 黑色 |
| `transparent` | 透明 |

### 7.4 任意颜色值

```tsx
<View className="bg-[#1a1b2e]">
<Text className="text-[rgb(255,100,0)]">
<View className="bg-[oklch(0.637_0.237_25.331)]">
```

---

## 八、圆角 (Border Radius) 📱🌐

```tsx
// 不同程度的圆角
<View className="rounded-sm">2px 圆角</View>
<View className="rounded">4px 圆角</View>
<View className="rounded-md">6px 圆角</View>
<View className="rounded-lg">8px 圆角</View>
<View className="rounded-xl">12px 圆角</View>
<View className="rounded-2xl">16px 圆角</View>
<View className="rounded-3xl">24px 圆角</View>
<View className="rounded-full">完全圆形</View>

// 方向控制
<View className="rounded-t-lg">只有顶部圆角</View>
<View className="rounded-b-lg">只有底部圆角</View>
<View className="rounded-l-lg">只有左侧圆角</View>
<View className="rounded-r-lg">只有右侧圆角</View>

// 任意值
<View className="rounded-[20px]">自定义圆角</View>
```

| 类名 | 圆角大小 |
|------|---------|
| `rounded-none` | 无圆角 |
| `rounded-sm` | 2px |
| `rounded` | 4px |
| `rounded-md` | 6px |
| `rounded-lg` | 8px |
| `rounded-xl` | 12px |
| `rounded-2xl` | 16px |
| `rounded-3xl` | 24px |
| `rounded-full` | 完全圆形 |

---

## 九、阴影 (Shadow) 📱🌐

> **⚠️ App端注意**：shadow-* 映射到 Android 的 `elevation` + iOS 的 `shadowOffset/shadowRadius`，不完全等同 Web

```tsx
<View className="shadow-sm">小阴影</View>
<View className="shadow">默认阴影</View>
<View className="shadow-md">中等阴影</View>
<View className="shadow-lg">大阴影</View>
<View className="shadow-xl">超大阴影</View>
<View className="shadow-2xl">巨大阴影</View>

// 阴影颜色
<View className="shadow-lg shadow-blue-500/25">蓝色阴影</View>
```

| 类名 | 阴影强度 |
|------|---------|
| `shadow-sm` | 小阴影 |
| `shadow` | 默认阴影 |
| `shadow-md` | 中等阴影 |
| `shadow-lg` | 大阴影 |
| `shadow-xl` | 超大阴影 |
| `shadow-2xl` | 巨大阴影 |
| `shadow-none` | 无阴影 |

---

## 十、定位 (Positioning) 📱🌐

```tsx
// 绝对定位
<View className="absolute top-0 right-0 w-10 h-10 bg-red-500" />

// 相对定位
<View className="relative">
  <View className="absolute top-2 left-2">浮动元素</View>
</View>

// 四方向偏移
<View className="absolute top-4">距离顶部 16px</View>
<View className="absolute bottom-4">距离底部 16px</View>
<View className="absolute left-4">距离左侧 16px</View>
<View className="absolute right-4">距离右侧 16px</View>

// inset 覆盖整个父容器
<View className="absolute inset-0 bg-black/50" />

// 层级
<View className="z-10">在上层</View>
<View className="z-0">在下层</View>
<View className="z-[-1]">在最底层</View>
```

| 类名 | 作用 |
|------|------|
| `absolute` | 绝对定位 |
| `relative` | 相对定位 |
| `top-{n}` | 向下偏移 n × 4px |
| `bottom-{n}` | 向上偏移 n × 4px |
| `left-{n}` | 向右偏移 n × 4px |
| `right-{n}` | 向左偏移 n × 4px |
| `inset-{n}` | 四方向偏移 |
| `inset-0` | 覆盖整个父容器 |
| `z-{n}` | 层级 z-index |

---

## 十一、边框 (Border) 📱🌐

```tsx
// 基础边框
<View className="border">1px 边框</View>
<View className="border-2">2px 边框</View>
<View className="border-4">4px 边框</View>

// 方向边框
<View className="border-t">只有上边框</View>
<View className="border-b">只有下边框</View>
<View className="border-l">只有左边框</View>
<View className="border-r">只有右边框</View>

// 边框样式
<View className="border border-dashed">虚线边框</View>
<View className="border border-dotted">点线边框</View>

// 边框颜色
<View className="border border-red-500">红色边框</View>
<View className="border-2 border-blue-300">蓝色粗边框</View>
```

| 类名 | 作用 |
|------|------|
| `border` | 1px 边框 |
| `border-{n}` | n px 边框 |
| `border-t` | 上边框 |
| `border-b` | 下边框 |
| `border-l` | 左边框 |
| `border-r` | 右边框 |
| `border-dashed` | 虚线 |
| `border-dotted` | 点线 |
| `border-solid` | 实线（默认） |

---

## 十二、透明度 (Opacity) 📱🌐

```tsx
<View className="opacity-0">完全透明（看不见）</View>
<View className="opacity-25">25% 透明</View>
<View className="opacity-50">半透明</View>
<View className="opacity-75">75% 不透明</View>
<View className="opacity-100">完全不透明（默认）</View>

// 半透明遮罩
<View className="absolute inset-0 bg-black/50" />
```

| 类名 | 透明度 |
|------|--------|
| `opacity-0` | 0%（完全透明） |
| `opacity-5` | 5% |
| `opacity-10` | 10% |
| `opacity-20` | 20% |
| `opacity-25` | 25% |
| `opacity-30` | 30% |
| `opacity-40` | 40% |
| `opacity-50` | 50% |
| `opacity-60` | 60% |
| `opacity-70` | 70% |
| `opacity-75` | 75% |
| `opacity-80` | 80% |
| `opacity-90` | 90% |
| `opacity-95` | 95% |
| `opacity-100` | 100%（默认） |

---

## 十三、溢出 (Overflow) 📱🌐

> **⚠️ App端注意**：仅支持 `overflow-hidden`，不支持 `scroll`/`auto`

```tsx
// 隐藏溢出内容
<View className="w-32 h-10 overflow-hidden">
  <Text>这段文字如果超出32px宽度会被截断隐藏</Text>
</View>

// 图片裁剪为圆形
<View className="w-20 h-20 overflow-hidden rounded-full">
  <Image source={avatar} className="w-full h-full" />
</View>
```

| 类名 | 作用 |
|------|------|
| `overflow-hidden` | 隐藏溢出内容 |
| `overflow-visible` | 溢出可见（默认） |
| `overflow-scroll` | 🌐 可滚动 |
| `overflow-auto` | 🌐 自动滚动 |

---

## 十四、显示 (Display) 📱🌐

```tsx
// 隐藏元素
<View className="hidden">不显示</View>

// 弹性布局（最常用）
<View className="flex">弹性容器</View>

// 块级显示
<View className="block">块级元素</View>
```

| 类名 | 作用 |
|------|------|
| `hidden` | 隐藏 |
| `flex` | 弹性布局（React Native 默认） |
| `block` | 块级显示 |
| `inline` | 🌐 行内显示 |
| `contents` | 只渲染子元素 |

---

## 十五、伪类状态 (Pseudo Classes) 📱🌐

```tsx
// hover: 鼠标悬停（Web）/ 长按（App）
<Pressable className="bg-blue-500 hover:bg-blue-700">
  <Text className="text-white">悬停变深</Text>
</Pressable>

// active: 按下时
<Pressable className="bg-blue-500 active:bg-blue-900 active:opacity-70">
  <Text className="text-white">按下变深+透明</Text>
</Pressable>

// focus: 获得焦点（输入框）
<TextInput className="border border-gray-300 focus:border-blue-500" />

// disabled: 禁用状态
<Pressable className="bg-blue-500 disabled:opacity-50" disabled>
  <Text className="text-white">禁用时变灰</Text>
</Pressable>

// checked: 选中状态
<Checkbox className="checked:bg-blue-500" />
```

| 前缀 | 触发条件 |
|------|---------|
| `hover:` | 鼠标悬停 / 长按 |
| `active:` | 按下/激活 |
| `focus:` | 获得焦点 |
| `disabled:` | 被禁用 |
| `checked:` | 被选中 |

---

## 十六、暗黑模式 (Dark Mode) 📱🌐

### 16.1 自动跟随系统

```tsx
import { View, Text } from "react-native";

function Card() {
  return (
    <View className="bg-white dark:bg-gray-900">
      <Text className="text-black dark:text-white">
        自动跟随系统主题
      </Text>
    </View>
  );
}
```

> 底层原理：`dark:` 映射到 `@media (prefers-color-scheme: dark)`，App端通过 React Native 的 `Appearance` API 实现。

### 16.2 手动切换主题

```tsx
import { Appearance } from "react-native";

function ThemeToggle() {
  const toggleTheme = () => {
    Appearance.setColorScheme(
      Appearance.getColorScheme() === "dark" ? "light" : "dark"
    );
  };

  return (
    <Pressable
      onPress={toggleTheme}
      className="p-4 bg-gray-200 dark:bg-gray-800"
    >
      <Text className="text-black dark:text-white">切换主题</Text>
    </Pressable>
  );
}
```

### 16.3 读取当前主题

```tsx
import { useColorScheme } from "react-native";

function MyComponent() {
  const colorScheme = useColorScheme();
  // colorScheme = "light" | "dark" | null

  return (
    <View>
      <Text>当前主题: {colorScheme}</Text>
    </View>
  );
}
```

### 16.4 最佳实践

```tsx
{/* ✅ 正确：同时指定浅色和深色样式 */}
<Text className="text-black dark:text-white" />

{/* ❌ 错误：只指定深色样式 */}
<Text className="dark:text-white" />
```

---

## 十七、响应式布局 (Responsive)

> **⚠️ Web端原生支持，App端需用 `useWindowDimensions` 代替**

### 17.1 Web端用法

```tsx
// 手机单列，平板双列，桌面三列
<View className="flex-col sm:flex-row">
  <View className="w-full sm:w-1/2 md:w-1/3">
    <Text>响应式内容</Text>
  </View>
</View>

// 手机全宽按钮，平板半宽
<Pressable className="w-full sm:w-1/2 bg-blue-500 rounded-lg p-4">
  <Text className="text-white text-center">按钮</Text>
</Pressable>
```

### 17.2 断点前缀

| 前缀 | 最小宽度 | 场景 |
|------|---------|------|
| `sm:` | 640px | 手机横屏 |
| `md:` | 768px | 平板竖屏 |
| `lg:` | 1024px | 平板横屏 |
| `xl:` | 1280px | 桌面 |
| `2xl:` | 1536px | 大屏 |

### 17.3 App端替代方案

```tsx
import { useWindowDimensions } from 'react-native';

function ResponsiveComponent() {
  const { width } = useWindowDimensions();

  // 自定义断点
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  const isDesktop = width >= 1024;

  return (
    <View className={`flex-col ${isMobile ? '' : 'flex-row'}`}>
      <View className={`${isMobile ? 'w-full' : 'w-1/2'}`}>
        <Text>
          {isMobile ? '手机布局' : isTablet ? '平板布局' : '桌面布局'}
        </Text>
      </View>
    </View>
  );
}
```

---

## 十八、任意值 (Arbitrary Values) 📱🌐

当预设值不满足需求时，用方括号 `[]` 语法：

```tsx
// 任意颜色
<View className="bg-[#1a1b2e]">
<Text className="text-[rgb(255,100,0)]">
<View className="border-[oklch(0.637_0.237_25.331)]">

// 任意尺寸
<View className="w-[200px]">
<View className="h-[50%]">
<View className="size-[30px]">

// 任意字体大小
<Text className="text-[18px]">

// 任意圆角
<View className="rounded-[20px]">

// 任意间距
<View className="p-[15px]">
<View className="gap-[13px]">

// 任意z-index
<View className="z-[999]">

// CSS 变量
<View className="[--gutter-width:1rem] lg:[--gutter-width:2rem]">
```

---

## 十九、组件样式模板 📱🌐

### 19.1 卡片

```tsx
<View className="bg-white rounded-xl p-4 shadow-md">
  <Text className="text-lg font-bold">卡片标题</Text>
  <Text className="text-gray-500 mt-2">卡片内容描述文字</Text>
  <View className="flex-row mt-4 gap-2">
    <Pressable className="bg-blue-500 rounded-lg px-4 py-2">
      <Text className="text-white text-sm font-medium">确定</Text>
    </Pressable>
    <Pressable className="border border-gray-300 rounded-lg px-4 py-2">
      <Text className="text-gray-600 text-sm">取消</Text>
    </Pressable>
  </View>
</View>
```

### 19.2 按钮

```tsx
// 主按钮
<Pressable className="bg-blue-500 rounded-lg px-6 py-3 items-center">
  <Text className="text-white font-semibold">主要操作</Text>
</Pressable>

// 次要按钮
<Pressable className="border border-blue-500 rounded-lg px-6 py-3 items-center">
  <Text className="text-blue-500 font-semibold">次要操作</Text>
</Pressable>

// 文字按钮
<Pressable className="px-4 py-2">
  <Text className="text-blue-500 font-medium">文字按钮</Text>
</Pressable>

// 圆形按钮
<Pressable className="w-12 h-12 bg-blue-500 rounded-full items-center justify-center">
  <Text className="text-white text-xl">+</Text>
</Pressable>
```

### 19.3 输入框

```tsx
<TextInput
  className="border border-gray-300 rounded-lg px-4 py-3 text-base"
  placeholder="请输入..."
/>

// 带图标的输入框
<View className="flex-row items-center border border-gray-300 rounded-lg px-3 py-2">
  <Text className="text-gray-400 mr-2">🔍</Text>
  <TextInput className="flex-1 text-base" placeholder="搜索..." />
</View>
```

### 19.4 列表项

```tsx
<View className="flex-row items-center py-3 px-4 border-b border-gray-100">
  <Image className="w-10 h-10 rounded-full" source={avatar} />
  <View className="ml-3 flex-1">
    <Text className="font-medium text-base">标题</Text>
    <Text className="text-gray-400 text-sm mt-0.5">副标题或描述</Text>
  </View>
  <Text className="text-gray-300">›</Text>
</View>
```

### 19.5 Flex 网格

```tsx
<View className="flex-row flex-wrap gap-2 p-4">
  {items.map(item => (
    <View key={item.id} className="w-[48%] bg-gray-100 rounded-lg p-3">
      <Image className="w-full h-20 rounded-md" source={item.image} />
      <Text className="font-medium mt-2">{item.name}</Text>
    </View>
  ))}
</View>
```

### 19.6 浮动操作按钮 (FAB)

```tsx
<Pressable className="absolute bottom-6 right-6 w-14 h-14 bg-blue-500 rounded-full items-center justify-center shadow-lg">
  <Text className="text-white text-2xl">+</Text>
</Pressable>
```

### 19.7 空状态

```tsx
<View className="flex-1 items-center justify-center p-8">
  <Text className="text-6xl mb-4">📭</Text>
  <Text className="text-xl font-bold text-gray-800">暂无内容</Text>
  <Text className="text-gray-500 mt-2 text-center">点击下方按钮添加第一条</Text>
</View>
```

---

## 二十、与 StyleSheet 对比 📱

```tsx
// ❌ 传统 StyleSheet 写法
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
});

<View style={styles.container}>
  <Text style={styles.title}>Hello</Text>
  <View style={styles.card}>
    <Text>卡片内容</Text>
  </View>
</View>

// ✅ NativeWind className 写法
<View className="flex-1 justify-center items-center bg-white">
  <Text className="text-2xl font-bold text-gray-800">Hello</Text>
  <View className="bg-gray-100 rounded-xl p-4 shadow-md">
    <Text>卡片内容</Text>
  </View>
</View>
```

---

## 二十一、平台兼容性速查表

| 功能 | App端 | Web端 | App端替代方案 |
|------|-------|-------|-------------|
| Flexbox | ✅ | ✅ | - |
| 间距 (p/m/gap) | ✅ | ✅ | - |
| 尺寸 (w/h) | ✅ | ✅ | - |
| 排版 (text/font) | ✅ | ✅ | - |
| 颜色 (bg/text) | ✅ | ✅ | - |
| 圆角 (rounded) | ✅ | ✅ | - |
| 阴影 (shadow) | ✅ | ✅ | - |
| 定位 (absolute) | ✅ | ✅ | - |
| 边框 (border) | ✅ | ✅ | - |
| 透明度 (opacity) | ✅ | ✅ | - |
| 暗黑模式 (dark:) | ✅ | ✅ | - |
| 伪类 (hover/active) | ✅ | ✅ | - |
| 任意值 [] | ✅ | ✅ | - |
| overflow-scroll | ❌ | ✅ | ScrollView |
| CSS Grid | ❌ | ✅ | flex + flex-wrap |
| float | ❌ | ✅ | flex 布局 |
| transition | ❌ | ✅ | react-native-reanimated |
| backdrop-blur | ❌ | ✅ | 不支持 |
| ring-* | ❌ | ✅ | shadow-* |
| outline-* | ❌ | ✅ | border |
| cursor-* | ❌ | ✅ | 不需要（手机无鼠标） |
| divide-* | ❌ | ✅ | border + gap |
| space-x/y | ❌ | ✅ | gap |
| filter | ❌ | ✅ | 不支持 |
| gradient | ❌ | ✅ | 不支持 |
| sm:/md:/lg: | ⚠️ | ✅ | useWindowDimensions |

---

## 二十二、注意事项

1. **组件映射**：NativeWind 默认将 `className` 映射到 `style`，复杂组件需用 `remapProps` 或 `cssInterop`

2. **动画**：App端不能用 `transition-*` / `duration-*`，需用 `react-native-reanimated` 实现

3. **响应式**：App端不能用 `sm:` / `md:` 等断点前缀，需用 `useWindowDimensions` 手动判断

4. **阴影**：App端 `shadow-*` 映射到 `elevation`(Android) + `shadowOffset/shadowRadius`(iOS)

5. **性能**：NativeWind 在编译时生成 `StyleSheet`，运行时开销极小

6. **TypeScript**：需创建 `nativewind-env.d.ts` 文件获得类型支持

7. **热重载**：修改 className 后需重启 Metro bundler 才能生效

8. **间距**：App端不能用 `space-x/y`，需用 `gap` 代替

9. **溢出**：App端 `overflow` 只支持 `hidden`，不支持 `scroll`/`auto`

10. **暗黑模式**：始终同时指定浅色和深色样式，不要只写 `dark:` 前缀

---

## 参考链接

- NativeWind v5 官方文档：https://www.nativewind.dev/v5
- Tailwind CSS v4 官方文档：https://tailwindcss.com/docs
- NativeWind Expo Router：https://www.nativewind.dev/v5/getting-started/expo-router
- Tailwind CSS 工具类：https://tailwindcss.com/docs/utility-first
