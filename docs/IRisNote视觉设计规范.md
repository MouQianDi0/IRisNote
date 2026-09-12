# IRisNote 视觉设计规范（HyperOS 风格）

> 文档版本：1.8（2026-09-12：新增「阅读进度气泡」视觉小节）
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
标题行 mb-3 · flex-row justify-between：标题 text-xl · Regular · 黑色，左侧可选 leading 标识图标（24dp、textPrimary，如草稿箱 Inbox，与分类标题图标同规格，静态不可点）；右侧可选 headerExtra（如图标按钮，28x28 触控区）
内容  （选择列表 / 文案 / 状态，见 §5–§7）
提示  单行图标行（共享 DraftLocalNotice，蓝灰 13px）：CloudOff +「草稿仅本机保存，不会同步到云端。」（仅本地数据弹窗需要时）；提示行到按钮行 12dp（页脚 mt-3，浏览/删除两模式统一）
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

## 新建分类表单与图标选择

- 新建分类采用 §4 弹窗外壳：24dp 内边距与圆角、最大宽 440dp、可用区域最大高度 85%；标题左对齐、24sp 常规字重。键盘展开或高度不足时表单内容滚动，底部按钮固定在卡片内。
- 分类名称标签 14sp 蓝灰，与输入框间隔 8dp；输入框高 48dp、浅灰 hyper-card 底、16dp 圆角、左右内边距 16dp、文字 17sp。
- 输入框到图标展开行间隔 16dp；展开行高 48dp、宽度铺满内容区，整行可点击。「选择图标」与 24dp 深灰 Lucide 图标在左侧相邻排列，间距 4dp。每次打开默认折叠，使用 ChevronRight；展开使用 ChevronDown；收起保留已选图标。
- 展开行到面板间隔 8dp；图标面板最高 240dp，按分组纵向滚动；分组标题 13sp 蓝灰，与图标间隔 8dp；组间距 12dp。图标块 48×48dp、圆角 14dp、图标 24dp，以 8dp 间距自动换行，取消组内横向滚动。未选中浅灰底灰图标，选中浅蓝 hyper-card-selected 底、主题蓝图标与 1dp 蓝色边框。
- 面板或收起行到按钮间隔 16dp；取消在左、确定在右，等宽、高 48dp、间隔 10dp，采用 DialogButton secondary/primary 及其禁用样式。

## 分类操作与删除确认

- 分类操作沿用 24dp 圆角与内边距、最大宽 440dp、最大高度 85% 的弹窗外壳。标题行高 48dp：行首为当前分类图标按钮 48×48dp（内含 24dp 图标、textPrimary 色，点击切换图标面板展开/收起），分类名称不加装饰引号、24sp 常规字重、垂直居中，右侧重命名编辑触控区 48×48dp；编辑态整行被改名输入框替换，图标按钮不显示。改名输入框高 48dp，浅灰底、16dp 圆角、17sp 文字，保留失焦与键盘提交方式。
- 标题到状态控件间距 12dp；置顶/标星等宽，高 48dp、圆角 14dp、间距 10dp、文字 17sp。未启用浅灰底，启用浅蓝底、主题蓝文字和图标。
- 「更改图标」行已删除：图标面板由标题行分类图标按钮切换，展开时位于标题行之下、置顶/标星之前（面板与状态行间 8dp，mb-2；收起时不占位），复用最高 240dp 的分组纵向网格；选完图标随父级状态更新自动收起。
- 图标区到删除入口间隔 16dp。删除入口用 secondary 浅灰底黑字，高 48dp；保留右滑到垃圾桶再二次确认的流程，删除引导用浅灰卡片和蓝灰文案。取消按钮高 48dp，距引导卡片 12dp。
- 最终确认弹窗改用共享 DeleteConfirmDialog（见「删除确认弹窗」节）：标题 24sp，提示 14sp 蓝灰两行，提示到按钮 12dp。取消在左、红色确认删除在右，等宽、高 48dp、间距 10dp；危险强调仅用于最终执行按钮。确认后进入 2 秒倒计时再执行。

## 笔记操作窗口

- AppModal 外壳：30% 遮罩、24dp 外边距与内边距、24dp 圆角、最大宽 440dp、最大高 85%；内容超高滚动。
- 左上角「笔记操作」24px 常规字重。标题行：标题文字在行首占满（flex-1，最多两行），编辑图标触控区 44dp 在行尾；图标仅改标题，展开 48dp 输入框。输入框的外层恒预留 2dp 安全区，获得焦点时在该区内显示主题色连续圆角矩形，避免被滚动父容器裁切且不改变聚焦前后布局；右侧以 8dp 间距放置宽 48dp、高 52dp 的浅灰保存图标触控区，按钮背景高度按输入框完整视觉边界计算（2dp 选中安全区 + 48dp 灰色本体 + 2dp 选中安全区 = 52dp），使用 Lucide `Save` 20dp、主题色，点击复用自动保存。失焦、键盘完成、点击弹窗外部或系统返回时也自动保存，本地先保存再同步，不再显示「放弃修改」「保存标题」文字按钮。改名成功一律静默（编辑框收起、标题即时更新），失败错误红字显示在提示行；标题为空时保留编辑态并阻止关闭。
- 结构顺序与间距节奏（对齐退出笔记弹窗）：标题行下隔 16dp 为信息区，信息区在置顶/标星之前；信息区内部两行行距 12dp；信息区到置顶/标星 12dp；置顶/标星到操作条 12dp。
- 信息区第一行：云同步按钮（云图标 20dp 与状态文字间隔 4dp）与文件大小之间固定 20dp，1dp × 20dp 浅灰竖线在 20dp 内垂直居中。状态为已同步/等待中/未同步/云同步已关闭，上传时显示同步中；点击触发一次上传，保留未知创建防重复保护。未接入独立云同步开关，关闭态仅对应无账号情况。
- 同步反馈三态原地显示，不单独成行：成功一律静默（仅图标状态流转 ☁↑同步中… → ☁✓已同步）；失败时按钮内文字替换为错误文案，图标与文字同用错误红 `text-hyper-error`；重试清错恢复「同步中…」。
- 文件大小按标题与正文 UTF-8 字节数计算，不含外部附件；1024 进制，超过 1024MB 显示 GB，两位小数，非空且不足 0.01MB 显示 <0.01MB。
- 信息区第二行：Clock、预计阅读时间、上次阅读百分比；CircleAlert 14dp 浅灰紧跟文字后 8dp，与文字行中线垂直居中（兄弟节点 + items-center，不得嵌入 Text 内基线对齐）；整行打开现有字数统计模块。阅读进度按滚动位置估算、分账号和笔记本地记录；未记录显示尚未阅读。

## 笔记查看与编辑合并页

- 顶栏总高保持 64dp，左侧为 40dp Lucide 返回图标触控区，右侧保留 40dp 空位使中间标题严格居中；不提供右上角进入编辑入口。正文滚动容器左右内边距 20dp、顶部 18dp，标题与元信息间距 12dp，元信息与正文间距 24dp；无键盘时底部浮动工具栏为 225×48dp、`rounded-hyper-control`（14dp）圆角矩形，距底部 40dp；键盘打开后切换为 43.2dp 通栏工具栏并紧贴输入法，不保留额外间距。
- 标题与正文始终使用与阅读排版一致的可编辑文本节点。单击在触点插入主题色光标但不弹出软键盘；同一输入区 300ms 内第二次点击保留光标位置并调起输入法。读屏开启时遵循系统焦点与激活动作，不要求用户执行自定义双击。
- 输入期间继续按 750ms 防抖、5 秒最长等待写入本地恢复草稿；系统返回或顶部返回收起输入法后执行本地优先正式保存，保存完成仍停留当前笔记页。无变化不创建版本、不重复上传；保存失败保留草稿并使用全局重要通知。
- 既有笔记的普通本地草稿直接载入，不显示「发现本地草稿」整页提示。基础版本冲突时只显示紧凑错误提示与「使用本地草稿」确认入口，未经确认不得自动覆盖当前稳定版本；新建笔记草稿箱及其恢复、删除流程不受影响。
- 置顶/标星等宽、高 48dp、间距 10dp，选中浅蓝底、主题蓝文字图标。下隔 12dp 为编辑 | 复制 | 分享 | 删除容器，四项等宽、图标在上文字在下，触控高度至少 48dp。分隔线 1dp × 20dp，两侧内容各留 10dp。删除走共享删除确认弹窗；主窗口无取消按钮，通过遮罩或系统返回关闭。
- 分享格式、图片设置保留原功能与返回入口，图片捕获节点继续独立挂载。
- 行高与触控约定：小行保持内容高度（图标 20dp + 文字），禁止用 min-h 撑高后垂直居中（居中留白使视觉间距失真）；触控区不足约 44dp 时用 hitSlop 上下外扩 12dp 补偿，不占布局。
- 弹窗内兄弟组件 key 带语义前缀（如 `rename-`/`info-`）＋ `${visible}:${id}` 结构：防 key 冲突，并在弹窗重开或切换对象时强制重挂载、重置子组件内部状态。

## 删除确认弹窗（DeleteConfirmDialog）

- 笔记删除与分类删除共用共享组件 DeleteConfirmDialog，两处像素级一致；DraftDialog 外壳，标题「确认删除？」24sp。
- 警示正文 14sp 蓝灰两行：「删除后无法找回」＋「笔记“X”将被永久删除」或「分类“X”下的笔记将被永久删除」；提示行到按钮行 12dp。
- 按钮行：取消（secondary 浅灰）在左、确认删除（danger 错误红）在右，等宽、高 48dp、间距 10dp；红色仅用于不可逆删除的最终执行步。
- 2 秒倒计时（与草稿删除统一）：首按「确认删除」→ 按钮变「删除中…」＋白色小 spinner，2 秒后执行并关闭；倒计时中再按按钮、点遮罩或返回键仅打断倒计时不关弹窗；删除执行中遮罩与返回不响应。
- 失败反馈：错误以 `text-sm text-hyper-error` ＋ `accessibilityRole="alert"` 红字显示在弹窗内（含登录不可用与接口错误的具体原因），不使用系统 Alert。数据流：入口仅打开弹窗，删除逻辑收进异步 onConfirm，失败抛错由弹窗展示。

## 阅读进度气泡（ProgressBubble）

- 跟随手指的坐标浮层（不走 AppModal）：拖动快速滚动条时出现在手指**左上方**，锚点为气泡外框右下角，距手指横向 50dp、纵向 100dp；越界时在正文容器安全边距 8dp 内自动避让。
- 外观：白底 `colors.surface` · 圆角 14px（hyper-control 档）· `borderCurve: "continuous"` · 边框 1px `hyperDivider` · 阴影 `0 2px 8px rgba(0,0,0,0.12)`。
- 内边距水平 12dp、垂直 8dp；宽度随内容自适应，上限 **200px**（窄屏取容器宽 −16dp），下限 44px。
- 文字：标题与书签名 14px 黑色（textPrimary），最多**两行**换行截断；书签行 Bookmark 图标 14dp 主色，图标与文字间距 8dp，行与行间距 4dp。
- 无标题且无书签时：居中显示进度 `36.28%`（保留两位小数），14px 黑色。
- 生命周期：按住／拖动期间常显；松开快速滚动条后 **1 秒**消失（正文滚动不重置该计时）；快速滚动条本体维持停止交互 5 秒隐藏。交互规格见 [笔记查看进度组件](./笔记查看进度组件.md)。

## 8. 落地状态与迁移路线

| 界面 | 状态 |
| --- | --- |
| 草稿箱弹窗（draft-list-modal） | ✅ 1.0 已落地（本规范首个实现） |
| 新建笔记三个草稿弹窗（new-note-editor） | ✅ 1.0 随外壳一并落地 |
| 编辑页 NoteEditor 恢复/放弃对话框 | ❌ 未迁移（仍是 @expo/ui Button + 旧样式） |
| 新建分类（CreateCategoryModal） | ✅ 已迁移，含图标选择面板展开/收起 |
| 分类操作与删除弹窗 | ✅ 已迁移，覆盖改名、图标网格和右滑删除引导 |
| 笔记操作、分享格式与图片设置 | ✅ 已迁移，含置顶与标星状态操作 |
| 删除确认弹窗（笔记/分类共享 DeleteConfirmDialog） | ✅ 已迁移，含 2 秒倒计时与弹窗内错误反馈 |
| 全局横幅通知 | ❌ 未迁移 |

迁移原则：接触某弹窗时按本规范重写；新弹窗一律按本规范实现。深色模式、squircle（`react-native-figma-squircle`，需 dev build 重建）在 `TODO.md` §2 立项后另行推进。
