# IRisNote 视觉设计规范（HyperOS 风格）

> 文档版本：1.3（2026-09-10 四轮：§6 按钮背景色强调层级与文字规格）
> 本文档定义 IRisNote 的视觉规格（"长什么样"）；样式代码组织规则见 [样式开发规范](./样式开发规范.md)（"怎么写"）；完整 HyperOS 原始规格与色板见 [miuix设计参考（HyperOS风格）](./miuix设计参考（HyperOS风格）.md)。
> 修改任何视觉规格必须先更新本文档并记录 `CHANGELOG.md`，再动代码。

## 1. 总则

- 风格基线：HyperOS / miuix 设计语言（分组卡片、squircle 观感的连续圆角、克制的单主色、分割线不贯通、弹层遮罩统一）。
- **主色决策（已定）**：沿用项目现有 `#007AFF`（iOS 蓝），不采用 miuix 的 `#3482FF`。主色切换属全局产品决策，另行立项（见 `TODO.md` §2）。
- 当前仅浅色模式；深色模式缺失是已知债务（`TODO.md` §2），本文档所有 Token 暂只有浅色值。
- 单一数据源：所有颜色/圆角值只定义在 `global.css` 的 `@theme`；`src/shared/theme/colors.ts`、`radius.ts` 做对象值镜像，修改必须双向同步。

## 2. 设计 Token（hyper-* 前缀）

| Token（global.css） | 镜像（colors/radius） | 值 | 出处 |
| --- | --- | --- | --- |
| `--color-hyper-card` | `hyperCard` | `#f0f0f0` | miuix secondaryContainer（浅色） |
| `--color-hyper-card-selected` | `hyperCardSelected` | `#eaf2ff` | miuix tertiaryContainer（选中行底） |
| `--color-hyper-divider` | `hyperDivider` | `#e0e0e0` | miuix dividerLine（浅色） |
| `--color-hyper-text-secondary` | `hyperTextSecondary` | `#8c93b0` | miuix onBackgroundVariant（蓝灰辅助文字） |
| `--color-hyper-error` | `hyperError` | `#e94634` | miuix error（浅色） |
| `--color-hyper-outline` | `hyperOutline` | `#d9d9d9` | miuix outline（未选中 radio 描边） |
| `--color-hyper-scrim` | —（仅 className） | `rgba(0,0,0,0.3)` | miuix windowDimming（浅色 30%） |
| `--color-hyper-primary-disabled` | `hyperPrimaryDisabled` | `#c2d9ff` | miuix disabledPrimary（primary 禁用底） |
| `--color-hyper-danger-disabled` | `hyperDangerDisabled` | `#f8d7d2` | danger 禁用底（error 30% 淡化推导） |
| `--color-hyper-secondary-disabled` | `hyperSecondaryDisabled` | `#f7f7f7` | secondary 禁用底（比卡片更浅一档） |
| `--color-hyper-label-disabled` | `hyperLabelDisabled` | `#b2b2b2` | 非强调禁用字色 |
| `--color-hyper-primary-faded` | `hyperPrimaryFaded` | `#80bfff` | 弱化（text）变体禁用字色 |
| `--radius-hyper-modal` | `hyperModal` | `24px` | 弹窗卡片圆角 |
| `--radius-hyper-card` | `hyperCard` | `16px` | 分组卡片圆角 |
| `--radius-hyper-control` | `hyperControl` | `14px` | 按钮圆角 |

## 3. 字体

沿用 miuix 字号梯度，RN 中直接用 `text-[Npx]`：

| 层级 | 字号 | 字重 | 用途 |
| --- | --- | --- | --- |
| 弹窗标题 | 24（`text-2xl`） | Regular | 弹窗/小节标题，**不用粗体**做层级 |
| 列表主文字 | 17（`text-[17px]`） | Regular | 列表行标题 |
| 辅助正文 | 14（`text-sm`） | Regular | 说明、错误文案 |
| 脚注/元信息 | 13（`text-[13px]`） | Regular | 时间戳、提示性小字（`hyper-text-secondary`） |

原则：层级靠字号与颜色区分，禁止随意加 `font-bold`；例外仅限警示句中的关键词（如"丢弃本次修改"，用户指定）。

## 4. 弹窗规范（已落地：草稿弹窗族）

结构（自上而下）：

```text
遮罩  bg-hyper-scrim（30% 黑），内容居中，外边距 24；点遮罩空白处关闭（closeOnScrimTap=false 可禁用，用于二次确认）
卡片  白底 · rounded-hyper-modal(24) · p-6 · max-w-[440px] · max-h-[85%]；卡片自身拦截触摸不冒泡到遮罩
标题行 mb-3 · flex-row justify-between：标题 text-xl · Regular · 黑色；右侧可选 headerExtra（如图标按钮，28x28 触控区）
内容  （选择列表 / 文案 / 状态，见 §5–§7）
提示  单行图标行（共享 DraftLocalNotice，蓝灰 13px）：CloudOff +「草稿仅本机保存，不会同步到云端。」（仅本地数据弹窗需要时）
警示  破坏性警示行（如离开确认）：Trash2 图标 + 文案，蓝灰 13px，关键词可加粗；次行补充说明不挂图标、不缩进
按钮  见 §6 容器规则（1 个通栏 / 2 个左右等分 / 3 个两容器 / 多个纵向列表）
```

- 必须使用 `AppModal`（`@/shared/ui/Overlay/app-modal`）承载——全局通知插槽依赖它，禁止直接用 RN `Modal`。
- 动画：`animationType="fade"`；关闭回调透传 `onRequestClose`。

## 5. 选择列表规范（DraftChoices 模式）

```text
滚动视口  wrapper：bg-hyper-card · rounded-hyper-card(16) · overflow-hidden（圆角恒在，内容超限时在圆角内滚动）
          内层 ScrollView：style maxHeight 300dp ≈ 3.7 行（每行约 80dp），露出部分第 4 行提示下方还有内容
行        min-h-[56px] · flex-row · items-center · gap-3 · px-4 py-3（行间无分割线）
  主文字  text-[17px] · numberOfLines=1
  元信息  text-[13px] hyper-text-secondary · mt-1 · numberOfLines=1

浏览态（单选）：选中行 = 浅蓝底 bg-hyper-card-selected + 主文字与副文本变 text-primary + 行尾 Check 图标 20（主色）
删除态（多选）：不加底色；勾选行 = 主文字与副文本变 text-hyper-error + 行尾 Check 图标 20（hyperError）
入口：标题行右侧 Trash2 图标（20 号，hyperTextSecondary，28x28 触控区），列表非空且浏览态才显示
```

> 实现注意：ScrollView 的 max-height 必须写原生 `style={{ maxHeight: ... }}`，NativeWind 的 `max-h-[Npx]` 任意值类对 ScrollView 自身尺寸实测不编译生效（2026-09-10 真机证据）。

## 6. 弹窗按钮规范（DialogButton）

单一组件 `DialogButton`（`features/notes/components/editor/draft-dialog.tsx`，带 `label` 字符串属性），禁止字符串 children。
组件提升时机：当前位于 notes feature 内；当第三个 Feature（分类弹窗、编辑页对话框等）采用时，按《样式开发规范》的提升规则上移 `src/shared/ui`。

### 6.1 层级与配色（含字体）

| 层级 | 变体 | 背景 | 字色 | 禁用底色 | 禁用字色 |
| --- | --- | --- | --- | --- | --- |
| 强调 · 下一步操作 | `primary` | 品牌蓝 `#007AFF` | 白 | `#C2D9FF` 浅蓝（`hyper-primary-disabled`） | 白 |
| 强调 · 错误 | `danger` | 错误红 `#E94634` | 白 | `#F8D7D2` 浅红（`hyper-danger-disabled`） | 白 |
| 非强调 | `secondary` | 浅灰 `#F0F0F0`（hyper-card） | 黑 | `#F7F7F7`（`hyper-secondary-disabled`） | `#B2B2B2`（`hyper-label-disabled`） |
| 弱化 · 带底 | `tonal` | 浅灰 `#F0F0F0`（hyper-card） | 品牌蓝 `#007AFF` | `#F7F7F7`（`hyper-secondary-disabled`） | `#80BFFF`（`hyper-primary-faded`） |
| 弱化 · 无底 | `text` | 透明 | 品牌蓝 `#007AFF` | 透明 | `#80BFFF`（`hyper-primary-faded`） |

**字体（全层级统一）**：17px（miuix button 档）· Regular 字重（HyperOS 不以粗体做强调）· 单行截断（`numberOfLines=1`）· 水平垂直居中；不设显式行高。

**交互态**：

- 按压：整体 `opacity 0.85`，松开恢复（全变体统一）。
- 禁用：原生 `disabled` 属性 + 上表"禁用底色/字色"显式 token（不用透明度叠加，颜色不受背景影响）；禁用即拦截点击。

- `className` 透传：DialogButton 接受 className 做布局扩展（如 flex-1），语义颜色仍只能通过 variant 切换。
- 无障碍：`accessibilityRole="button"` + `accessibilityLabel={label}` + `accessibilityState.disabled`（浏览器回归按可访问名称点击，改名需同步测试）。

### 6.2 danger 使用边界

danger（红色强调）**只用于不可逆操作的最终确认步**——即二次确认框内的执行按钮（如草稿删除确认的「删除」）。入口层的破坏性动作（如离开确认框的「不保存」）一律用 secondary 浅灰，把红色留给最后一步。

### 6.3 按钮容器布局规则

按弹窗内**交互按钮数量**决定容器结构（容器 = 一行按钮的包裹 View）：

| 按钮数 | 容器数 | 布局 |
| --- | --- | --- |
| 1 | 1 个容器 | 按钮独占一行（通栏） |
| 2 | 1 个容器 | 两按钮左右排列，等分宽度（flex-row · gap-2.5 · 各 flex-1） |
| 3 | 2 个容器 | 第 1 容器：两按钮左右排列；第 2 容器：位于第 1 容器下方，按钮独占一行（通栏） |
| 4 个及以上 | 按钮列表 | 每个按钮独占一行，纵向排列 |

- 容器之间纵向间距 `gap-2.5`；同容器内左右按钮 `gap-2.5`。
- 每个容器内的按钮高度仍按变体规格（h-12 / h-11）。

### 6.4 按钮归属原则

- **互斥的两个操作固定同容器**：确认/取消、进入编辑/关闭、保存草稿/不保存、退出删除/确认删除这类"二选一"操作，放同一容器内左右两按钮。
- 3 个及以上按钮时：先识别互斥对放入第 1 容器（左右排列），其余操作归入第 2 容器（或 4+ 时的列表）。
- **归属有歧义时必须询问用户**（哪个操作与哪个互斥、第 2 容器放什么），不得自行决定。
- 现有实例对照：离开确认弹窗 = 第 1 容器「保存草稿 / 不保存」（互斥）+ 第 2 容器「继续编辑」（通栏）。

## 7. 状态规范

| 状态 | 规格 |
| --- | --- |
| 加载 | `ActivityIndicator`，`color={colors.primary}`，上下留白 my-8 |
| 空状态 | 居中 `Inbox` 图标 28（hyperTextSecondary）+ `text-sm` 蓝灰文案，如"暂无草稿" |
| 错误 | `text-sm text-hyper-error` + `accessibilityRole="alert"`；重试用 `text` 变体按钮 |

## 8. 落地状态与迁移路线

| 界面 | 状态 |
| --- | --- |
| 草稿箱弹窗（draft-list-modal） | ✅ 1.0 已落地（本规范首个实现） |
| 新建笔记三个草稿弹窗（new-note-editor） | ✅ 1.0 随外壳一并落地 |
| 编辑页 NoteEditor 恢复/放弃对话框 | ❌ 未迁移（仍是 @expo/ui Button + 旧样式） |
| 分类三个弹窗（CreateCategoryModal 等） | ❌ 未迁移（旧 overlay 样式） |
| 全局横幅通知 | ❌ 未迁移 |

迁移原则：接触某弹窗时按本规范重写；新弹窗一律按本规范实现。深色模式、squircle（`react-native-figma-squircle`，需 dev build 重建）在 `TODO.md` §2 立项后另行推进。
