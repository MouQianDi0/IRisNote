# Flash Calendar 调研与自定义方案

> 调研日期：2026-09-16 · 调研方式：官网文档 + GitHub 源码 + npm 元数据核对
> 结论：React Native 日历库中体积/性能第一梯队的候选，自定义体系完整（theme 覆盖、布局 props、组件自组合、行为扩展四个层级）。

## 1. 项目概况

| 项 | 值 |
|---|---|
| GitHub | [MarceloPrado/flash-calendar](https://github.com/MarceloPrado/flash-calendar) |
| npm 包名 | `@marceloterreiro/flash-calendar` |
| 最新版本 | v2.0.0（2026-03-04 发布） |
| Stars / Forks | ⭐ 1505 / 55（2026-09-16 查询） |
| 协议 | MIT |
| 语言 | TypeScript（类型自带） |
| 创建 / 最近提交 | 2024-02 / 2026-03-04（活跃维护） |
| 文档站 | [marceloprado.github.io/flash-calendar](https://marceloprado.github.io/flash-calendar/) |
| Expo | 官方 "Runs with Expo" 徽章，可用 |

作者是 `react-native-calendars` 的老维护者（维护补丁 3 年多），本库是对旧库痛点的重写。

## 2. 核心特点

1. **快**：`Calendar.List` 本质是 Shopify FlashList 的封装，滚动性能继承 FlashList；内部做了细粒度重渲染优化——只有受影响的日期格子会重渲染，长列表依旧流畅。
2. **极小**：全库 18.8kb（gzip 后 6kb），唯一外部依赖是 200 字节的 `mitt`。**不带日期库**（moment/date-fns/dayjs/luxon 由业务侧自选）。
3. **职责聚焦**：只做日历与日历列表，明确不做 agenda 模式等大而全功能。
4. **API 友好**：所有 prop 以 `calendar` 前缀命名，IDE 自动补全即可浏览全部能力；内部用 Date ID（`"2024-03-14"` 字符串）规避时区问题，提供 `toDateId` / `fromDateId` 转换器。

## 3. 组件与核心 API

### 3.1 组件

- `<Calendar>` —— 单月日历
- `<Calendar.List>` —— 多月无限滚动列表（基于 FlashList）
- `CalendarRow` —— 单行

### 3.2 Hooks

- `useDateRange()` —— 内置日期范围选择，返回 `calendarActiveDateRanges` + `onCalendarDayPress`（可直接展开传给 Calendar），另有 `dateRange`、`isDateRangeValid`、`onClearDateRange`
- `useOptimizedDayMetadata` —— 拿到单日元数据标记（`isRangeValid` / `isEndOfWeek` / `isEndOfRange` 等），自组合时用

### 3.3 常用 Props

| Prop | 作用 |
|---|---|
| `onCalendarDayPress(dateId)` | 点击某天的回调，dateId 为 `"YYYY-MM-DD"` 字符串 |
| `calendarActiveDateRanges` | `[{ startId, endId }]` 标记选中范围 |
| `calendarMonthId` / `calendarInitialMonthId` | 控制/初始化显示的月份 |
| `calendarMinDateId` / `calendarMaxDateId` | 可选日期边界 |
| `calendarDisabledDateIds` | 禁用指定日期（如 `["2024-03-14"]`） |
| `calendarFormatLocale` | 本地化，如 `"zh-CN"` |
| `calendarFirstDayOfWeek` | 每周起始日（`"sunday"`） |
| `calendarColorScheme` | 强制 `"light"` / `"dark"`（官方称 escape hatch，理想情况应跟随系统） |
| `calendarInstanceId` | 同屏多日历实例，状态互相独立 |
| `CalendarScrollComponent` | 替换内部滚动宿主（bottom sheet 接入方案） |

### 3.4 格式化函数（兼容任意日期库）

- `getCalendarDayFormat` / `getCalendarMonthFormat` / `getCalendarWeekDayFormat`
- ⚠️ **必须保持引用稳定**：定义在组件外或用 `useCallback` 包裹，内联写法会因引用变化破坏相等性检查（官方 Issue #69）

### 3.5 命令式 API

`CalendarListRef`：`scrollToDate(date, animated)` / `scrollToMonth(month, animated)` / `scrollToOffset(...)`，可做"回到今天"按钮；`onViewableItemsChanged`（FlashList 透传）可追踪当前可见月份做动态标题。

## 4. 自定义方案（四个层级）

### 方案一：`theme` prop —— 最省事，推荐首选

`CalendarTheme` 类型化对象（源码 `Calendar.tsx`），覆盖日历每一层样式：

| 字段 | 控制区域 |
|---|---|
| `rowMonth` | 月标题行文字样式 |
| `rowWeek` | 星期行容器（可加底部分割线） |
| `itemWeekName` | 星期名文字颜色 |
| `itemDayContainer` | 日期容器，含 `activeDayFiller`（范围选中两日之间的连接条颜色） |
| `itemDay` | 日期格子三态：`idle` / `today` / `active` |

关键亮点：**`itemDay` 三态是函数而非静态样式**，按元数据动态返回 `{ container, content }`：

- `idle({ isPressed, isWeekend, isHovered })` —— 周末变灰、按下高亮
- `today({ isPressed })` —— 平时圆形（radius 30）、按下变方形
- `active({ isStartOfRange, isEndOfRange })` —— 范围选择时仅外侧圆角、内侧直角，形成连贯色带

官方示例：用这套 API 完整复刻了 **Linear 应用风格的深色日历**（强调色 `#585ABF`，源码 `LinearCalendar.tsx`）。内置 `lightTheme` / `darkTheme` 色板见源码 `tokens.ts`（含 spacing token 0–24）。

圆角注意事项（官方 Tips）：要圆角需**四个角全写**，不能只写两个：

```ts
itemDay: {
  base: () => ({
    container: {
      borderTopRightRadius: 10,
      borderBottomRightRadius: 10,
      borderTopLeftRadius: 10,
      borderBottomLeftRadius: 10,
    },
  }),
}
```

### 方案二：布局 / 格式 props —— 细节微调

- 尺寸：`calendarDayHeight`、`calendarMonthHeaderHeight`、`calendarWeekHeaderHeight`、`calendarRowHorizontalSpacing` / `calendarRowVerticalSpacing`、`calendarSpacing`
- 文字：`getCalendarDayFormat` 等三件套（见 §3.4 引用稳定警告）；`textProps={{ allowFontScaling: false }}` 关闭字体缩放

### 方案三：组件自组合 —— 最灵活

所有内部积木公开导出，可自由重组/增删：

- 组件：`Calendar.Row.Month`、`Calendar.Row.Week`、`Calendar.Item.Day`、`Calendar.Item.WeekName`、`Calendar.Item.Empty`（补空格）
- 容器：`Calendar.Item.Day.Container` 支持 `dayHeight`、`daySpacing`、`isStartOfWeek`、`shouldShowActiveDayFiller` 等布局 props，并可注入额外子内容
- hooks：`useOptimizedDayMetadata` 等

官方 showcase（源码在仓库 `apps/example` Storybook）：**Windows XP 风格日历**、**渲染计数性能测试日历** —— 证明定制上限很高，非网格形态也能做。

### 方案四：行为级定制

- `CalendarScrollComponent` 替换滚动宿主（官方有 Android 兼容的 bottom sheet 示例，含 `SafeFlashList` 平台分流）
- `CalendarListRef` 命令式滚动（见 §3.5）
- `onViewableItemsChanged` 追踪可见月份
- `calendarInstanceId` 多实例

## 5. IRisNote 集成注意事项

1. **FlashList peer 依赖（最大风险点）**：v2.0.0 要求 `@shopify/flash-list >= 2.0.0`。集成前必须核对项目现有 FlashList 版本；若为 v1 需先升级 FlashList，或改装 flash-calendar v1.x。
2. **选型建议**：按日期筛选笔记 / 日期选择器场景，方案一 + 方案二足够——`itemDay` 三态函数可映射项目 HyperOS 风格（圆角选中态），主题色板映射 `#fbfbfb` / `#007aff` 色系；范围选择直接用内置 `useDateRange()`。仅当设计稿要求日程联动、非网格形态时才需要方案三。
3. **格式化函数引用稳定**（§3.4）是实践中最容易踩的坑。
4. Expo SDK 57 / RN 0.86 下理论兼容（官方支持 Expo），需真机验证后确认。

## 6. 参考链接

- 文档站：<https://marceloprado.github.io/flash-calendar/>
- Usage（组件示例）：<https://marceloprado.github.io/flash-calendar/fundamentals/usage>
- Customization（主题定制）：<https://marceloprado.github.io/flash-calendar/fundamentals/customization>
- Tips and Tricks：<https://marceloprado.github.io/flash-calendar/fundamentals/tips-and-tricks>
- 仓库示例源码：`apps/example`（Storybook，含 LinearCalendar / WindowsXP / Perf 案例）
