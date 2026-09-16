# miuix 设计参考（HyperOS 风格）

> 用途：为 IRisNote 提供 HyperOS / MIUI 视觉风格的**设计规格参考**。miuix 本身是 Kotlin/Compose Multiplatform 库，无法直接用于本项目（Expo / React Native），本文提取的是可移植的视觉规格与组件模式。
>
> 数据来源：[compose-miuix-ui/miuix](https://github.com/compose-miuix-ui/miuix)（Apache-2.0，参考版本 0.8.8），规格数值取自仓库 `docs/guide/colors.md`、`docs/guide/textstyles.md`、`docs/guide/squircle.md`；组件模式来自官方在线 Demo 实测（2026-09-10）。
>
> 在线体验：[JsCanvas Demo](https://compose-miuix-ui.github.io/miuix-jsCanvas/) · [WasmJs Demo](https://compose-miuix-ui.github.io/miuix-wasmJs/)

---

## 1. 风格总览

HyperOS 设计语言的关键特征：

- **大面积分组卡片**：设置类内容以"分组卡片"承载，卡片浮于页面背景之上（浅色模式白卡 + 浅灰背景；深色模式深灰卡 + 近黑背景）。
- **Squircle 连续圆角**：卡片与图标使用"超椭圆"圆角，曲率连续过渡，无普通圆角的接缝感，是 HyperOS 最强的辨识符号。
- **克制的品牌蓝**：单一主色（蓝）贯穿交互控件（开关、滑块、选中态、进度），不使用多彩强调。
- **分割线不贯通**：卡片内条目之间的分割线从文字起始位置开始，**不顶到卡片左右边缘**。
- **胶囊分段控件**：Tab / Segmented 控件为胶囊形（pill），选中项为浅一档的胶囊底色而非高对比色块。
- **弹层遮罩调暗背景**：下拉菜单 / 对话框弹出时背景加 30%（浅色）/ 60%（深色）黑色遮罩。
- **细线图标**：outline 风格、圆头端点、约 1.5–2px 描边（与 lucide 天然同路）。

---

## 2. 调色板（Light / Dark 双模式）

ARGB 十六进制省略前缀 `FF`（不透明）；带透明度的值保留完整。摘自官方 Color System 文档。

### 2.1 品牌色与功能色

| 语义色 | 用途 | Light | Dark |
| --- | --- | --- | --- |
| `primary` | 主色（交互控件、选中态） | `#3482FF` | `#277AF7` |
| `onPrimary` | 主色上的文字 | `#FFFFFF` | `#FFFFFF` |
| `primaryVariant` | 主色变体（更深，按压/强调） | `#3482FF` | `#0073DD` |
| `onPrimaryVariant` | 主色变体上的文字 | `#AECDFF` | `#99C7F1` |
| `primaryContainer` | 主色容器 | `#5D9BFF` | `#338FE4` |
| `error` | 错误 | `#E94634` | `#F12522` |
| `onError` | 错误色上的文字 | `#FFFFFF` | `#690005` |
| `errorContainer` | 错误容器 | `#FDF6F4` | `#2E0603` |
| `onErrorContainer` | 错误容器上的文字 | `#410002` | `#FFDAD6` |

### 2.2 中性面（背景与卡片）

| 语义色 | 用途 | Light | Dark |
| --- | --- | --- | --- |
| `background` | 页面背景 | `#FFFFFF` | `#242424` |
| `surface` | 表面（顶栏/底栏区） | `#F7F7F7` | `#000000` |
| `surfaceVariant` | 表面变体 | `#FFFFFF` | `#242424` |
| `surfaceContainer` | 容器卡片 | `#FFFFFF` | `#242424` |
| `surfaceContainerHigh` | 高层级容器 | `#E8E8E8` | `#242424` |
| `surfaceContainerHighest` | 最高层级容器 | `#E8E8E8` | `#2D2D2D` |
| `secondary` | 次级面（控件底：滑轨、分段底） | `#E6E6E6` | `#505050` |
| `secondaryVariant` | 次级面变体 | `#F0F0F0` | `#434343` |
| `secondaryContainer` | 次级容器（分组卡片） | `#F0F0F0` | `#434343` |
| `secondaryContainerVariant` | 次级容器变体 | `#F0F0F0` | `#4F4F4F` |
| `tertiaryContainer` | 三级容器（浅蓝底、菜单选中底） | `#EAF2FF` | `#2B3B54` |
| `tertiaryContainerVariant` | 三级容器变体 | `#EAF2FF` | `#505050` |

**深色模式分层规律**：页面背景 `#242424`，卡片 `#434343`（比背景更亮，而非更暗）——卡片是"浮起来"的；顶/底栏用纯黑 `#000000` 与内容区分。这与 Material 深色习惯（卡片比背景暗）相反，是 HyperOS 的显著特征。

### 2.3 文字层级

| 语义色 | 用途 | Light | Dark |
| --- | --- | --- | --- |
| `onBackground` | 正文主文字 | `#000000` | `#FFFFFF` @ 90%（`E6FFFFFF`） |
| `onBackgroundVariant` | 次要文字（时间、辅助说明） | `#8C93B0` | `#787E96` |
| `onSurface` | 表面主文字 | `#000000` | `#F2F2F2` |
| `onSurfaceSecondary` | 表面次文字 | `#000000` @ 80% | `#FFFFFF` @ 80% |
| `onSurfaceVariantSummary` | 摘要文字 | `#000000` @ 60% | `#FFFFFF` @ 50% |
| `onSurfaceVariantActions` | 操作文字 | `#000000` @ 40% | `#FFFFFF` @ 40% |
| `onSurfaceContainer` | 容器主文字 | `#000000` | `#FFFFFF` @ 90% |
| `onSurfaceContainerVariant` | 容器次文字 | `#959595` | `#737373` |
| `onSurfaceContainerHigh` | 高层容器文字 | `#A2A2A2` | `#666666` |
| `onSurfaceContainerHighest` | 最高层容器文字 | `#000000` | `#E9E9E9` |
| `onSecondaryVariant` | 次级面变体上的文字 | `#303030` | `#D9D9D9` |
| `onSecondaryContainer` | 次级容器文字 | `#A9A9A9` | `#7C7C7C` |
| `onSecondaryContainerVariant` | 次级容器变体文字 | `#A8A8A8` | `#959595` |
| `onTertiaryContainer` | 三级容器文字（浅蓝底上的蓝字） | `#3482FF` | `#4788FF` |

**文字透明度阶梯**：次要文字统一用主文字色加不透明度（80% → 60% → 50% → 40%），而非另调灰色。`onBackgroundVariant`（蓝灰 `#8C93B0`）是唯一例外，专用于页面级辅助文字。

### 2.4 边线、遮罩与禁用

| 语义色 | 用途 | Light | Dark |
| --- | --- | --- | --- |
| `outline` | 边框 | `#D9D9D9` | `#404040` |
| `dividerLine` | 分割线 | `#E0E0E0` | `#393939` |
| `windowDimming` | 弹层遮罩 | `#000000` @ 30% | `#000000` @ 60% |
| `disabledPrimary` | 禁用主色（开关/滑块） | `#C2D9FF` | `#253E64` |
| `disabledOnPrimary` | 禁用主色上的文字 | `#F3F8FF` | `#677993` |
| `disabledPrimaryButton` | 禁用按钮底 | `#C2D9FF` | `#253E64` |
| `disabledOnPrimaryButton` | 禁用按钮文字 | `#FFFFFF` | `#677893` |
| `disabledPrimarySlider` | 禁用滑块 | `#B8CFF5` | `#44587C` |
| `disabledSecondary` | 禁用次级面 | `#F0F0F0` | `#3F3F3F` |
| `disabledOnSecondary` | 禁用次级面文字 | `#FCFCFC` | `#797979` |
| `disabledSecondaryVariant` | 禁用次级面变体 | `#F2F2F2` | `#404040` |
| `disabledOnSecondaryVariant` | 禁用次级面变体文字 | `#B2B2B2` | `#707170` |
| `sliderKeyPoint` | 滑块刻度点 | `#A3B3CD` @ 30% | `#7A8AA6` @ 30% |
| `sliderKeyPointForeground` | 滑块刻度点前景 | `#6EB5FF` | `#5DAAFF` |
| `sliderBackground` | 滑轨底 | `#000000` @ 6% | `#FFFFFF` @ 15% |
| `disabledOnSurface` | 禁用表面文字 | `#B2B2B2` | `#666666` |

> 禁用色规律：浅色模式用"褪色蓝"（`#C2D9FF` 系），深色模式用"暗蓝灰"（`#253E64` 系），始终保持色相与主色一致，只是降饱和/降亮度。

---

## 3. 字体层级

共 14 级，全部默认 Normal 字重（仅 subtitle 为 Bold），颜色统一由 `onBackground` 运行时注入。

| 样式 | 字号 | 字重 | 行高 | 建议用途 |
| --- | --- | --- | --- | --- |
| `title1` | 32sp | Normal | - | 页面大标题（HyperOS 顶栏大标题） |
| `title2` | 24sp | Normal | - | 区块大标题 |
| `title3` | 20sp | Normal | - | 卡片组标题 |
| `title4` | 18sp | Normal | - | 小节标题 |
| `main` | 17sp | Normal | - | 列表主文字（iOS 默认正文号） |
| `headline1` | 17sp | Normal | - | 列表标题（同 main，语义区分） |
| `headline2` | 16sp | Normal | - | 列表次级标题 |
| `button` | 17sp | Normal | - | 按钮文字 |
| `paragraph` | 17sp | Normal | **1.2em** | 正文段落（唯一显式行高） |
| `body1` | 16sp | Normal | - | 正文 |
| `body2` | 14sp | Normal | - | 辅助正文 |
| `subtitle` | 14sp | **Bold** | - | 副标题（唯一粗体） |
| `footnote1` | 13sp | Normal | - | 脚注/说明 |
| `footnote2` | 11sp | Normal | - | 最小辅助文字 |

**特征**：字号梯度平缓（11/13/14/16/17/18/20/24/32），几乎不用粗体做层级，靠字号与颜色透明度阶梯（见 2.3）区分信息权重。

---

## 4. 形状系统（Squircle）

Squircle = 连续曲率圆角。普通圆角在直线与圆弧交界处曲率突变；squircle 把曲率分布到更宽的角部区域，视觉更"圆润饱满"。

| 参数 | 默认值 | 范围 | 说明 |
| --- | --- | --- | --- |
| `cornerRadius` | 按组件定 | - | 角部半径（等效基准圆角） |
| `extension` | **1.1** | [1, 2] | 角部曲率区相对半径的倍数；`1.0` = 普通圆弧，越大越"方圆" |

- Demo 实测卡片圆角视觉量级约 **18–24dp**；按钮/输入框约 **12–16dp**；胶囊控件 = 高度的一半。
- 支持每角独立半径（如"顶部 24、底部 0"的贴顶卡片）。
- Android 原生实现要求 API 33+（shader），更低版本自动降级普通圆角。
- 边框版本 `squircleBorder` 为 path 实现，描边按半径内缩半宽与填充版对齐。

---

## 5. 组件视觉模式（Demo 实测）

### 5.1 分组卡片（设置页模式）

```
页面背景
└─ 分组标题（footnote 级灰字，卡片外、左对齐）
└─ 卡片（secondaryContainer 底，squircle 18–24dp）
   ├─ 条目行（icon + 标题 main 17sp + 右侧控件/箭头/值）
   ├─ 分割线 ── 从标题文字 x 坐标开始，不到卡片边缘
   ├─ 条目行 …
```

- 条目内边距约 16dp；行高约 48–52dp。
- 右侧控件：Switch / 箭头 `>` / 当前值文字（灰色）。
- 分组间距约 24dp，卡片通栏（左右 16dp 页边距）。

### 5.2 顶栏与底部导航

- **顶栏（大标题模式）**：页面顶部直接大标题（title1 级），右侧图标动作区，无底色、无分割线；滚动后标题收缩到标题栏。Demo 首页"Home"即此模式。
- **底部导航**：5 个 Tab，图标在上文字在下（footnote 级）；选中项图标实心/加粗 + 文字主色，未选中灰（`onBackgroundVariant`）；底栏深色模式纯黑，与内容区分。

### 5.3 交互控件

| 控件 | 视觉规格 |
| --- | --- |
| Switch | 胶囊轨道；开启 = 主色轨道 + 白色圆钮；关闭 = `secondary` 轨道 + 灰钮；禁用 = `disabledPrimary` |
| Checkbox | 选中主色、圆角约 4dp 的方框 + 勾 |
| Slider | 白色圆形手钮（带细描边）；已滑过主色、未滑 `sliderBackground`；可选刻度点 |
| Progress | 线性：圆角细条，槽 `secondary`、填充主色；圆形：主色圆环 |
| Tabs / Segmented | 胶囊容器（`secondary` 底）内嵌胶囊选中块（`secondaryVariant`/更亮一档），文字白/灰，无滑动指示条 |
| Button | 主按钮：主色底 + 白字（button 17sp），squircle 12–16dp；次级：`secondary` 底 |
| SearchBar | 圆角搜索框 + 右侧 Cancel 文字按钮；聚焦时展开建议列表卡片 |
| Dropdown | 锚定弹出的白色/深灰卡片，圆角 12dp+，条目行 + 选中项打勾（主色），支持分组标题与二级子菜单（箭头），背景加 `windowDimming` 遮罩 |
| Dialog | 居中卡片 + 背景遮罩；按钮为文字按钮（主色/灰色） |

### 5.4 动效与质感

- 弹出物（菜单、对话框、底部弹层）统一**背景调暗遮罩**（30%/60%）。
- 毛玻璃（miuix-blur 模块）：Android API 31+，用于顶栏/底栏悬浮内容的背景模糊。
- 开关、滑块等控件状态切换用弹簧曲线（spring），无生硬线性过渡。

---

## 6. RN / Expo 落地映射（IRisNote）

对齐现有体系（见 `docs/UI/样式开发规范.md`：NativeWind 5 + Tailwind 4 `global.css` @theme 静态 token + `src/shared/theme` 动态 token 双轨同步）。

### 6.1 颜色 token

在 `global.css` @theme 与 `src/shared/theme/colors.ts` 成对新增（命名建议带 `hyper` 前缀避免与现有 token 冲突）：

| 建议 token | 取值来源 | 示例 |
| --- | --- | --- |
| `--color-hyper-primary` | `primary` | light `#3482FF` / dark `#277AF7` |
| `--color-hyper-card` | `secondaryContainer` | light `#F0F0F0` / dark `#434343` |
| `--color-hyper-bg` | `background` | light `#FFFFFF` / dark `#242424` |
| `--color-hyper-text-2` | `onBackgroundVariant` | light `#8C93B0` / dark `#787E96` |
| `--color-hyper-divider` | `dividerLine` | light `#E0E0E0` / dark `#393939` |

> 注意：项目当前主色为 `#007aff`（iOS 蓝），miuix 主色 `#3482FF` 偏亮偏紫。是否替换主色是产品决策，本文档只提供规格，不预设结论。深色模式分层（卡片比背景亮）需要检查现有深色卡片是否符合，方向相反时按本文 2.2 规律调整。

### 6.2 字体

`src/shared/theme/typography.ts` 已定义但使用较少。若引入 HyperOS 层级，优先落地 5 个高频级：`title1 32 / title3 20 / main 17 / body2 14 / footnote1 13`，其余按需。RN 中 sp→ 直接用 React Native `fontSize` 数值（与 dp 等价）。

### 6.3 Squircle 实现

| 方案 | 说明 |
| --- | --- |
| `react-native-figma-squircle`（首选） | 原生 shader 实现，参数 `cornerSmoothing` 0–1（对应 miuix extension ≈ 0.6–0.7 视觉等效；1.1 的"标准 squircle"≈ cornerSmoothing 2/3）；Android 需 API 33+（新架构）或走 SVG 遮罩降级 |
| SVG path 自绘 | 跨版本一致，但列表大量使用时有性能成本，适合少量大卡片 |
| 降级 | 普通圆角（miuix 官方在低版本 Android 也是这么降级的） |

### 6.4 其他对应

- **毛玻璃**：`expo-blur` 的 `BlurView`（Android API 31+，之下降级半透明底色）。
- **图标**：`lucide-react-native` 已是细线圆头风格，与 HyperOS 图标气质一致，无需更换；选中态用主色 + 提高描边宽度近似"实心感"。
- **动效**：Reanimated 4 `withSpring`（阻尼弹簧）承担控件状态过渡；弹层遮罩用 `FadeIn`/`FadeOut` + 30%/60% 黑。
- **分割线**：`marginLeft` 对齐文字起点，不用通栏 `border-b`。

### 6.5 实施顺序建议（如采用）

1. 只读规格阶段：笔记列表卡片引入 squircle + 分组卡片底色（改动最小、辨识度最高）。
2. 控件层：Switch/Slider/分段控件换 HyperOS 配色与胶囊形态。
3. 全局：调色板 token 化（含深色重分层）、字体层级接入、弹层遮罩统一。

每一步均按《变更管控工作准则》走"计划 → 确认 → 实施 → 日志"流程。

---

## 7. 资源链接

- 仓库：<https://github.com/compose-miuix-ui/miuix>（Apache-2.0；实验性库，API 会变，但视觉规格稳定）
- 官方规格文档：仓库 `docs/guide/colors.md`、`docs/guide/textstyles.md`、`docs/guide/squircle.md`
- 在线 Demo：<https://compose-miuix-ui.github.io/miuix-jsCanvas/> · <https://compose-miuix-ui.github.io/miuix-wasmJs/>
- 官方截图：仓库 `assets/001.webp` ~ `006.webp`
- 基于 miuix 的真实应用（风格参考）：GitHub Topic [miuix](https://github.com/topics/miuix)
