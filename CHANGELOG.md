# CHANGELOG

---

## 2026-09-14 04:30:43 | 新增功能

- **「真机布局实测验收」固化为规范强制步骤**
    - 将已验证的 uiautomator dump → px/dp 对账流程写入四份规范文档顶部（§0）：截图判读、提出修改要求、验证改动三个场景必须先真机实测再下结论；无 adb 环境跳过实测，但不得编造数值。
    - 判读规则随文档固化：px 须除以「密度/160」换算 dp；文本 bounds 非触摸热区；原生树经 RN 扁平化看不到组件名与 padding 来源，定位原因须回源码；clickable 计数天然多于 RN 触摸组件数。
- **修改文件列表**
    - `scripts/ui-dump-parse.mjs` - 新增一键实测脚本：自动读密度（Override 优先）→ uiautomator dump → 解析输出每个元素的 class/文本/无障碍描述与 px、dp 边界，`--serial` 指定多设备目标机。
    - `docs/IRisNote视觉设计规范.md` - 顶部新增 §0，版本 1.11 → 1.12。
    - `docs/公共组件规范.md` - 顶部新增 §0，版本 1.4 → 1.5。
    - `docs/公共组件审计基线.md` - 顶部新增 §0（作为 `design:audit` 静态扫描的真机复核手段）。
    - `docs/样式开发规范.md` - 顶部新增 §0。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - 脚本真机实跑通过（PLQ110，476dpi，1dp=2.975px），输出格式与预期一致；`npx eslint --no-cache --no-warn-ignored scripts/ui-dump-parse.mjs` 通过（0 警告）。
    - 文档为纯 Markdown 变更，不涉及代码逻辑；§0 正文与落稿范围（含《样式开发规范》、无 adb 跳过条款）均经用户确认。

---

## 2026-09-14 04:27:39 | 优化代码

- **登录/注册页"发送验证码"按钮迁移为公共 AppButton**
    - 登录页与注册页的"发送验证码"按钮调用点由 `AuthButton`（薄封装）改为直接使用公共 `AppButton`（`variant="tonal"` 显式声明），与组件库统一迁移方向一致。
    - 属性同步：`busy` → `loading`（AppButton 原生命名）；`className="w-[120px]"`、label 三态（发送中…/倒计时/发送验证码）、disabled 逻辑（邮箱无效/倒计时中/提交中）全部保持不变，布局与视觉零变化（120×48dp、surfaceControl 底、16dp 连续圆角）。
    - `AuthButton` 组件本身保留：登录主按钮、注册主按钮、WelcomeScreen 仍在使用，迁移去留待后续决策。
- **修改文件列表**
    - `src/features/auth/screens/LoginScreen.tsx` - "发送验证码"改用 `AppButton`，新增 import。
    - `src/features/auth/screens/RegisterScreen.tsx` - 同款同步迁移，新增 import。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建；按钮三态（默认/禁用/发送中）视觉与交互由用户在设备上验收（需重新构建后查看，旧构建显示为纯文字样式）。

---

## 2026-09-14 04:00:30 | 优化代码

- **分类弹窗名称输入框升级为公共 InputSave**
    - 分类操作弹窗（重命名）与新建分类弹窗的名称输入框由公共 `Input` 迁移到公共 `InputSave`（52dp 输入框 + 52×52dp tonal 保存按钮，Save 图标 20dp），与笔记详情页 `NoteRename` 的保存输入约定统一。
    - 分类操作弹窗：保留自动聚焦、10 字限制、失焦/键盘提交保存；新增保存按钮点击保存（`onSave`），三路保存共用 `handleRename`。
    - 新增一次性提交锁 `renameLockRef`：Android 上点保存按钮会先触发输入框 blur 再触发 press，锁可防止重命名被重复调用；锁在每次进入编辑态时复位。
    - 新建分类弹窗：保存按钮与键盘"完成"均触发 `handleSubmit`（沿用空名称拦截）；底部"确定"按钮及其禁用态保持不变；未使用 `disabled` 属性（`InputSave.disabled` 会连同输入框一起禁用，空名称时会锁死输入），空名称由 `handleSubmit` 拦截。
    - 编辑态标题行高度 48dp → 52dp（进入编辑瞬间微增高，与 `NoteRename` 一致）。
- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 重命名输入改用 `InputSave`，新增提交锁。
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 名称输入改用 `InputSave`，接 `onSave`/`onSubmitEditing`。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建/设备验收；保存按钮视觉与交互由用户验收。

---

## 2026-09-14 03:25:46 | 优化代码

- **分类新建与重命名输入框接入公共 Input**
    - 将分类操作弹窗的重命名输入框和新建分类弹窗的名称输入框从私有 `TextInput` 样式迁移到公共 `Input`。
    - 两处字段统一使用 48dp 高度、`radii.field = 16dp`、1dp 常驻边框、主题表面色、17sp 文字和聚焦主色边框；页面不再重复声明输入框身份颜色、圆角和字号。
    - 保留分类名称 10 字限制、输入值、自动聚焦、失焦保存、键盘提交、空名称拦截和分类接口逻辑不变。
    - 同步公共组件待办、设计审计迁移状态和架构索引。
- **修改文件列表**
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 新建分类名称字段改用公共 `Input`。
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 分类重命名字段改用公共 `Input`。
    - `待办事项.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md` - 更新分类输入迁移状态和审计快照。
    - `CHANGELOG.md` - 记录本次分类输入框迁移。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、两个分类组件与公共 Input 的目标 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 设计审计中直接包含 `TextInput` 的文件由阶段 0 的 11 个降至 9 个；主题目录外固定颜色 14、裸字号 19，均未增加。
    - 未运行测试、构建、导出、浏览器或设备验收；输入框自动聚焦、键盘和视觉效果由用户主动验收。

---

## 2026-09-14 03:04:36 | 新增功能 / 优化代码

- **推进公共组件阶段 2 并完成认证域首批接入**
    - 新增 `AppText`、`AppButton`、`IconButton`、`BackButton`、`Input` 五个公共基础组件，并统一从 `@/shared/ui` 导出；颜色读取语义 Token/组件配方，圆角读取用途 Token，页面只保留布局扩展入口。
    - `AppButton` 实现 primary/secondary/tonal/danger/text、44/48dp 尺寸、加载锁定、显式禁用配色和 16dp 圆角；危险禁用态保持浅红背景 `#F8D7D2` 与红色内容 `#E94634`。
    - `IconButton` 实现 ghost/tonal/selected、40/48dp 尺寸、紧凑触控补偿、加载/选中/禁用无障碍状态；`BackButton` 统一 24dp ArrowLeft，并保留纯图标和带文字模式。
    - `Input` 实现单行 48dp、多行最小 96dp、16dp 圆角、常驻 1dp 边框，以及聚焦/错误/禁用/只读、前后内容、清空、原生 ref、键盘和自动填充属性透传。
    - 认证域的按钮、字段、密码显隐和返回入口已接入公共组件；`AuthButton`、`AuthField` 保留为业务薄适配，认证校验、接口、系统返回与键盘逻辑不变。旧 `Button`、`TextField` 继续作为迁移兼容入口。
    - 依据 Expo SDK 56 文档评估 `@expo/ui` Universal API；普通输入为保持现有受控字符串和原生 TextInput 契约使用 React Native 原语封装，后续 Picker/Switch/BottomSheet 仍优先评估 `@expo/ui`。
    - 同步待办、公共组件规范、审计基线、架构索引；记录用户已完成此前浮动工具栏 16dp 圆角验收。
- **修改文件列表**
    - `src/shared/ui/AppText/*`、`AppButton/*`、`IconButton/*`、`BackButton/*`、`Input/*`、`src/shared/ui/index.ts` - 新增阶段 2 基础组件、类型与公共出口。
    - `src/features/auth/components/AuthButton.tsx`、`AuthField.tsx`、`AuthScreenLayout.tsx` - 将认证视觉接入公共组件，保留业务适配和返回流程。
    - `待办事项.md`、`docs/公共组件规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md` - 更新接口、技术选型、迁移状态、审计快照和用户验收记录。
    - `CHANGELOG.md` - 记录本次阶段 2 变更。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、新增组件及认证适配文件的 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 审计快照为 242 个源码文件、18,490 行；主题目录外固定颜色 14、裸字号 19，均未因本批增加。
    - `npx prettier --write` 因项目当前命令解析到 `jest-snapshot-prettier` 并报 `getPlugin() requires astFormat to be set`，未改写源码；已以目标 ESLint 和手工格式复核替代，未新增格式化依赖或修改锁文件。
    - 未运行测试、构建、导出、浏览器或设备验收；阶段 2 新组件的视觉与交互仍由用户主动验收。

---

## 2026-09-14 02:25:12 | 优化代码

- **浮动编辑器工具栏圆角调整为 16dp**
    - 将无键盘浮动工具栏从复用旧 `radius.hyperControl = 14dp` 改为独立语义 Token `radii.editorToolbar = 16dp`，避免继续与按钮圆角耦合。
    - 保持浮动工具栏 225×48dp、底部 40dp 间距、白色背景、阴影、滚动显隐和点击逻辑不变；键盘期 43.2dp 通栏仍为 0dp 圆角并紧贴输入法。
    - 同步默认主题预设、生成后的 CSS Token、公共组件规范、视觉规范、审计基线、架构索引、编辑器进度和公共化待办。
- **修改文件列表**
    - `src/core/editor/components/editor-bottom-toolbar.tsx` - 接入独立 16dp 工具栏圆角 Token。
    - `src/shared/theme/presets/default-light.json`、`src/shared/theme/theme.types.ts`、`global.css` - 新增并同步 `editorToolbar` 圆角。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md`、`待办事项.md` - 更新当前规格、状态与实施记录。
    - `CHANGELOG.md` - 记录本次圆角调整。
- **验证结果**
    - `npx tsc --noEmit`、目标文件 Expo ESLint、`npm run theme:check` 和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；视觉效果由用户主动验收。

---

## 2026-09-14 02:20:22 | 优化代码

- **完成公共组件阶段 0 审计与阶段 1 主题基座首批实施**
    - 新增默认浅色主题预设，将原始色板、语义颜色、组件状态配方、圆角、间距、字号和动效值集中到单一来源；保留旧 `colors`、`radius` 导出作为渐进迁移兼容层。
    - 新增 NativeWind CSS Token 同步与一致性检查脚本，以及可重复执行的设计系统审计脚本；记录 232 个源码文件、18,009 行源码和主要漂移位置的审计基线。
    - 按已确认规范将现有 HyperOS 按钮、有底状态控件、图标选择单元和阅读进度气泡接入 16dp 语义圆角；编辑器浮动工具栏继续使用兼容 14dp，避免旧 `hyperControl` 复用造成连带变化。
    - 危险按钮禁用背景与内容分别由 `destructiveDisabled = #F8D7D2`、`onDestructiveDisabled = #E94634` 统一提供，组件配方不再硬编码状态颜色。
    - 同步公共组件规范、视觉规范、样式开发规范和公共化待办状态；当前尚未开始 AppButton、Input、AppDialog 等组件本体及业务调用方迁移。
- **修改文件列表**
    - `src/shared/theme/presets/default-light.json` - 新增默认主题唯一原始值来源及 CSS 映射表。
    - `src/shared/theme/palette.ts`、`semantic-colors.ts`、`component-recipes.ts`、`theme-preset.ts`、`theme-typography.ts`、`theme.types.ts` - 新增主题解析、类型和组件配方。
    - `src/shared/theme/colors.ts`、`radius.ts`、`spacing.ts`、`typography.ts`、`index.ts` - 接入主题预设并保留旧调用方兼容导出。
    - `global.css`、`package.json`、`scripts/sync-theme-css.mjs`、`scripts/audit-design-system.mjs` - 增加 CSS 托管区块、同步命令和审计命令。
    - `src/features/notes/categories/components/CategoryActionModal.tsx`、`CategoryIconPicker.tsx`、`src/shared/ui/ProgressBubble/ProgressBubble.tsx` - 接入 16dp 语义圆角。
    - `docs/公共组件审计基线.md`、`docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/样式开发规范.md`、`待办事项.md` - 记录审计基线、主题来源、圆角规范与推进状态。
- **验证结果**
    - `npx tsc --noEmit` 通过。
    - 受影响 TypeScript、TSX 与脚本的 Expo ESLint 检查通过。
    - `npm run theme:check`、`npm run design:audit`、脚本语法检查和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；交互与视觉验收仍由用户主动发起。

---

## 2026-09-14 02:01:38 | 优化代码

- **建立公共组件公共化实施待办**
    - 汇总聊天中确认的按钮、返回入口、输入框、图标选择器、弹窗、状态与列表组件需求，并结合当前项目重复实现和主题 Token 漂移情况形成实施基线。
    - 将公共化工作拆分为主题基座、基础组件、组合组件、状态组件、调用方迁移、治理验收六个阶段；每项补充现状来源、实施步骤、依赖关系、迁移范围、排除项和完成标准。
    - 按已确认目标记录普通按钮、有底图标按钮、图标选择单元和阅读进度气泡统一为 16dp 圆角；输入框新增独立 16dp 字段圆角，并要求先拆分旧 `hyperControl` 语义以避免连带修改。
    - 固化危险按钮禁用背景 `#F8D7D2`、文字与图标 `#E94634`，并补充可替换主题、Web/原生映射、一致性检查和用户验收边界。
- **修改文件列表**
    - `待办事项.md` - 新增公共组件公共化的分阶段详细实施方案。
    - `CHANGELOG.md` - 记录本次文档规划变更。

---

## 2026-09-14 01:14:41 | 优化代码

- **建立可替换主题的公共组件规范**
    - 新增公共组件目标规范，明确按钮、图标按钮、返回按钮、输入框、表单字段、图标选择器和弹窗的形状、尺寸、颜色映射、状态优先级、无障碍及 TypeScript 接口。
    - 建立 ThemePreset、基础色板、语义颜色和组件配方三层契约；规定后期手动修改主题时集中替换主题预设，页面不得逐项覆盖组件身份色。
    - 明确当前源码尚未完成公共组件迁移，保留 `global.css` 与 `src/shared/theme` 双向同步边界，并记录后续单一主题源及一致性检查目标。
    - 按用户确认，将危险按钮禁用态固定为浅红背景 `#F8D7D2`、红色文字与图标 `#E94634`。
- **修改文件列表**
    - `docs/公共组件规范.md` - 新增公共组件、主题、状态、接口和迁移规范。
    - `docs/IRisNote视觉设计规范.md` - 升级至 1.9，接入公共组件规范并修正危险按钮禁用字色。
    - `docs/样式开发规范.md` - 增加可替换主题及调用方样式约束。
    - `CHANGELOG.md` - 记录本次规范变更。

---

## 2026-09-12 11:28:07 | 优化代码

- **欢迎与认证参考布局验证完成**
    - TypeScript、相关页面及路由 ESLint、差异空白检查通过；Web 生产导出成功，包含欢迎页在内的 16 个路由。
    - 浏览器确认欢迎页品牌居中和底部双按钮、登录/注册居中标题、返回入口及字段排版。
    - 320×568 注册表单与 320×360 欢迎页可以滚动访问底部；1280×800 注册页宽屏居中正常。
    - 验证欢迎页进入登录、登录与注册互相替换、表单返回欢迎页、直接打开注册后返回欢迎页，以及未登录从根路径进入欢迎页。
    - 已恢复浏览器视口并停留欢迎页。浏览器工具不提供 --headed --persistent 参数，采用可见的现有浏览器会话。
    - Android 系统返回、iOS 手势/键盘、真实认证及退出登录后的完整联调未进行，仍待真机与账户验收。
- **修改文件列表**
    - `CHANGELOG.md` - 记录检查结果与验证边界。

---

## 2026-09-12 11:23:50 | 新增功能 / 优化代码

- **按参考图布局重构欢迎与认证页面**
    - 新增欢迎页：复用 IRisNote 图标，品牌区居中，注册/登录双按钮置底，短屏可滚动。
    - 登录注册新增 44dp 返回入口、居中标题与说明，表单边距改为 16dp，字段及主按钮间距改为 28dp。
    - 未登录 Tabs 入口转向欢迎页；表单切换替换路由，返回欢迎页时支持无历史栈回退；Android 返回键同步处理。
    - 沿用现有认证字段、接口、配色与错误反馈，未调整工作区中已有的横幅组件改动。
- **修改文件列表**
    - `src/features/auth/screens/WelcomeScreen.tsx`
    - `src/app/auth/welcome.tsx`
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/app/_layout.tsx`
    - `src/app/(tabs)/_layout.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：实施完成，静态检查与浏览器验证进行中。

---

## 2026-09-12 11:23:08 | 优化代码

- **确认参考图布局适配规格**
    - 新增欢迎页居中品牌区及底部双按钮规范；登录注册改为左上返回、居中标题、16dp 页边距和 28dp 字段间距。
    - 保留 IRisNote 内容、配色和认证字段，记录欢迎入口与返回规则。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md`
    - `CHANGELOG.md`

---

## 2026-09-12 09:43:04 | 优化代码

- **登录注册重构验证收口**
    - `npx tsc --noEmit`、认证组件及页面 ESLint、`git diff --check` 均通过。
    - `npx expo export --platform web --output-dir .expo/auth-web-export` 成功导出 15 个路由。
    - 浏览器验证通过：初始禁用、邮箱失焦错误及修正、密码显隐、注册密码最短长度与一致性、修正后按钮启用、登录注册切换。
    - 320×568 窄屏注册表单可滚动访问底部；1280×800 宽屏实测字段宽 440dp、左右居中。已恢复原视口并清空测试表单。
    - 浏览器工具不提供 `--headed --persistent` 参数，实际复用并显示现有浏览器。
    - 未发送真实验证码、未提交真实认证；接口成功/失败反馈、加载时序及 Android/iOS 键盘交互仍需联调与真机验收。
    - 格式化通过直接调用项目 Prettier API 完成；现有 npx prettier 入口指向 jest-snapshot-prettier，未改动工具链。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `CHANGELOG.md`

---

## 2026-09-12 09:39:37 | 优化代码

- **登录注册页面统一为 HyperOS 风格**
    - 新增认证共用页面、字段和按钮组件，统一 440dp 内容宽度、48dp 控件、字体、圆角、间距及密码显隐触控区。
    - 表单增加滚动、键盘避让、聚焦/失焦错误、明确的加载与禁用状态。
    - 字段及接口错误就地展示，发送成功使用横幅，认证成功保存刷新会话后直接跳转用户页。
    - 保留认证接口与字段，使用 Ref 锁防止重复请求；注册页面直接打开时提供登录路由回退。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：TypeScript 检查通过，相关 ESLint 与浏览器验证继续执行。

---

## 2026-09-12 09:37:01 | 优化代码

- **确认登录注册 HyperOS 视觉规格**
    - 记录已确认的页面布局、dp 间距、字段顺序、按钮层级及反馈方案，作为后续实现依据。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md` - 新增登录注册页面规格。
    - `CHANGELOG.md` - 记录已确认规格。

---

## 2026-07-26 02:05:47 | 新增功能

- **初始化 CodeGraph 项目索引**
    - 为 IRisNote 建立本地代码知识图谱，首次索引覆盖 129 个文件，生成 948 个节点和 1,687 条关系边。
    - 使用 CodeGraph 验证应用入口调用链，成功解析 `RootLayout → AppProviders → AuthProvider` 及相关影响范围。
    - 保留 CodeGraph 自动生成的目录级忽略规则，使数据库、日志和运行时文件仅保存在本机，不进入版本控制。

- **修改文件列表**
    - `.codegraph/.gitignore` - 新增 CodeGraph 生成文件忽略规则。
    - `.codegraph/codegraph.db` - 新增本地代码图谱数据库（已忽略，不提交）。
    - `CHANGELOG.md` - 记录 CodeGraph 初始化与验证结果。

---

## 2026-07-19 01:18:27 | 优化代码

- **使用 Tailwind Variants 重构状态样式，保持现有视觉与交互不变**
    - 接入 `tailwind-variants` 默认构建并补齐 `tailwind-merge`，统一解决调用方样式覆盖冲突。
    - 将 Button、Card、ModalPanel、Screen、TextField 的手写变体映射迁移为类型安全的 `tv()` 定义；Button 的原生 `disabled` 属性同步驱动禁用外观，TextField 通过 `invalid` 驱动错误边框。
    - 将浮动菜单、分类操作、分类按钮、图标选择器、新建分类和笔记上下文菜单中的条件类名迁移为 boolean variants 或 slots。
    - 保留原有颜色、尺寸、间距、圆角、透明度、状态条件和业务行为，不调整设计 Token 或页面视觉。
    - 为 VS Code 配置 `tv()` 内的 Tailwind CSS IntelliSense，并更新样式开发规范。

- **修改文件列表**
    - `package.json`
    - `package-lock.json`
    - `.vscode/settings.json`
    - `src/shared/ui/Button/Button.tsx`
    - `src/shared/ui/Card/Card.tsx`
    - `src/shared/ui/ModalPanel/ModalPanel.tsx`
    - `src/shared/ui/Screen/Screen.tsx`
    - `src/shared/ui/TextField/TextField.tsx`
    - `src/core/navigation/components/FloatingMenu.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/features/notes/categories/components/CategoryActionModal.tsx`
    - `src/features/notes/categories/components/CategoryButton.tsx`
    - `src/features/notes/categories/components/CategoryIconPicker.tsx`
    - `src/features/notes/categories/components/CreateCategoryModal.tsx`
    - `src/features/notes/components/viewer/NoteContextMenu.tsx`
    - `docs/样式开发规范.md`
    - `CHANGELOG.md`

---

## 2026-07-12 13:35:31 | 优化文档

- **重写项目介绍并建立当前源码开发文档体系**
    - 重写 `README.md`，仅保留项目介绍、真实功能状态、技术栈、环境变量、安装启动和文档入口。
    - 新增项目架构与文件索引，逐项记录路由、Core、Shared、Feature、根配置和资源文件职责。
    - 新增业务模块与运行逻辑，说明认证、笔记、分类、头像和主导航的数据流、事件流及状态边界。
    - 新增后续开发指南，提供“修改目标到文件”的查询表，以及新增页面、Feature、API、组件、Hook 和状态方案的示例。
    - 更新样式开发规范，使目录、导入示例和 NativeWind/Theme Token 分工与当前源码一致。

- **修改文件列表**
    - `README.md`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `docs/后续开发指南.md`
    - `docs/样式开发规范.md`

---

## 2026-07-12 13:07:25 | 优化代码

- **阶段八：收敛分类操作弹窗的重复实现**
    - `CategoryActionModal` 复用共享 `CategoryIconPicker`，删除内部重复的图标分组与图标行渲染逻辑。
    - 抽出 `CategoryDeleteConfirmModal`，保留既有拖动确认、取消、二次确认和删除回调行为。
    - 使用分类常量判断“全部”虚拟分类，避免在操作弹窗中维护重复字面值。

- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 收敛图标选择并保留分类操作编排。
    - `src/features/notes/categories/components/CategoryDeleteConfirmModal.tsx` - 新增删除二次确认弹窗。

---

## 2026-07-12 12:02:45 | 优化代码

- **阶段七：清理迁移后的遗留入口**
    - 删除全项目无调用方的 `useSwipeSelect` Hook。
    - 清理 Notes、Categories、HTTP API 和 data 迁移后不再承载文件的旧目录。
    - 不改变应用功能、路由或状态行为。

- **修改文件列表**
    - `src/hooks/useSwipeSelect.ts` - 删除无引用的通用滑动选择 Hook。
    - `src/api`、`src/data`、`src/components/Note`、`src/components/FloatingBarComponents`、`src/hooks/notes`、`src/hooks/FloatingBar` - 删除完成迁移后的空目录。

---

## 2026-07-12 11:57:53 | 优化代码

- **阶段六：迁移 Excerpt Feature 的页面入口**
    - 将剪贴板摘录列表和新建摘录的占位页面迁入 `src/features/excerpts/screens`。
    - 保留 `/(tabs)/excerpt` 和 `/pages/excerpt/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 移除原摘录占位页面中没有业务用途的 Reanimated 状态。

- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx`、`src/features/excerpts/screens/CreateExcerptScreen.tsx`、`src/features/excerpts/index.ts` - 新增 Excerpt Feature 页面和入口。
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/pages/excerpt/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:47:14 | 优化代码

- **阶段五：迁移 Todo Feature 的页面入口**
    - 将待办列表和新建待办的占位页面迁入 `src/features/todos/screens`。
    - 保留 `/(tabs)/todo` 和 `/pages/todo/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 未新增尚无真实业务需求的 API、状态管理、Hooks 或类型文件。

- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx`、`src/features/todos/screens/CreateTodoScreen.tsx`、`src/features/todos/index.ts` - 新增 Todo Feature 页面和入口。
    - `src/app/(tabs)/todo/index.tsx`、`src/app/pages/todo/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:39:53 | 修复问题

- **修复 FloatingBar 遗留文件导致的 TypeScript 解析失败**
    - 删除重新出现在 `src/components/FloatingBarComponents/FloatingBar.tsx` 的废弃实现；该文件第 125 行 JSX 属性已损坏，且项目内不存在对旧路径的引用。
    - 正式实现继续使用 `src/features/notes/categories/components/CategoryBar.tsx`，避免同时维护两份 FloatingBar。

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 删除无引用且语法损坏的旧实现。

---

## 2026-07-12 10:57:57 | 优化代码

- **阶段四：迁移 Notes 与 Notes Categories Feature**
    - 将笔记、分类 API、缓存、事件通知、选择状态、排序逻辑、页面与业务组件迁入 `src/features/notes`，路由文件改为仅转发 Screen 的薄包装。
    - 将笔记缓存与事件订阅拆分为独立模块；保留既有本地缓存、分类删除后的增量移除、置顶/标星乐观更新和失败回滚逻辑。
    - 将分类图标解析与图标分组收口到分类 Feature，并新增共享图标选择器供新建分类使用。
    - 保留 `/pages/note/[id]`、`/pages/note/create` 与 `/(tabs)/note` 路径及既有交互行为；不引入 Zustand。

- **修改文件列表**
    - `src/features/notes/api/*`、`notes.cache.ts`、`notes.events.ts`、`notes.selectors.ts`、`hooks/*`、`components/*`、`screens/*` - 迁入并拆分笔记业务实现。
    - `src/features/notes/categories/api/*`、`categories.constants.ts`、`categories.events.ts`、`category-icons.ts`、`category-selection.ts`、`components/*`、`hooks/*` - 迁入并拆分分类业务实现。
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为路由薄包装。
    - `src/api/notes.ts`、`src/api/categories.ts`、`src/data/notes.ts`、`src/data/categories.ts`、旧 Note/FloatingBar/Category 组件及 Hooks - 删除完成迁移后的旧入口。

---

## 2026-07-12 10:36:09 | 优化代码

- **阶段三：迁移认证、个人资料与设置 Feature**
    - 将认证 API、认证 Context、认证 Provider、认证 Hooks 和登录/注册 Screen 迁入 `src/features/auth`，原有认证路由改为仅转发 Screen 的薄包装
    - 将个人资料页面和头像 Hook 迁入 `src/features/profile`，并将用户资料请求、头像上传、图片采集和头像 URL/数据 URI 工具拆分为独立模块
    - 将设置占位页面迁入 `src/features/settings`，原有设置路由改为薄包装
    - 将用户资料响应归入 Auth 类型，将头像 URL 标准化归入 shared 工具，避免 Auth 与 Profile 形成双向依赖
    - 保留 `/auth/login`、`/auth/register`、`/(tabs)/user` 和 `/pages/user/settings` 路径，以及登录、注册、头像上传、会话恢复和退出登录的既有行为

- **修改文件列表**
    - `src/features/auth/api/auth.api.ts`、`src/features/auth/api/session.api.ts` - 迁入认证与会话 API
    - `src/features/auth/auth.context.ts`、`providers/AuthProvider.tsx`、`hooks/useAuth.ts`、`hooks/useEmailValidation.ts` - 迁入认证状态与 Hooks
    - `src/features/auth/screens/LoginScreen.tsx`、`RegisterScreen.tsx`、`index.ts` - 迁入认证页面与公开入口
    - `src/features/profile/api/profile.api.ts`、`services/avatar-picker.service.ts`、`utils/avatar.ts`、`hooks/useAvatar.ts`、`screens/ProfileScreen.tsx` - 迁入个人资料与头像能力
    - `src/features/settings/screens/SettingsScreen.tsx`、`src/features/settings/index.ts` - 迁入设置页面
    - `src/shared/utils/avatar.ts` - 新增跨 Feature 的头像 URL 标准化工具
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx`、`src/app/(tabs)/user/index.tsx`、`src/app/pages/user/settings.tsx` - 改为路由薄包装
    - `src/core/providers/AppProviders.tsx`、`src/app/(tabs)/_layout.tsx`、`src/components/FloatingBarComponents/FloatingBar.tsx` - 改为使用新的认证与个人资料入口
    - `src/api/auth.ts`、`src/api/user.ts`、`src/hooks/useAuth.tsx`、`src/hooks/useAvatar.ts`、`src/hooks/useEmailValidation.ts` - 删除已迁移的旧入口

## 2026-07-12 02:16:59 | 优化代码

- **阶段二：迁移共享能力与应用导航基础设施**
    - 将 HTTP client、错误规范化、主题令牌、动效令牌和基础 UI 组件迁入 `src/shared`，统一跨 Feature 的依赖入口
    - 新增共享 storage key，收口认证 token、用户信息和设备标识的存储键，保持现有存储值和会话行为不变
    - 新增 `AppProviders`，以等值方式统一认证 Provider 与手势根容器的应用级装配
    - 将浮动菜单、浮动操作按钮、Android 返回退出处理和导航 Hooks 迁入 `src/core/navigation`
    - 合并原本分散在菜单、手势和操作按钮中的 Tab 顺序、路径识别与主操作配置，保留当前单数路由和现有 URL
    - 删除完成迁移后的旧 HTTP、主题、UI、导航配置与导航 Hook 源文件；未改动 Notes、Categories、Auth 和 Profile 的业务实现

- **修改文件列表**
    - `src/shared/http/client.ts`、`src/shared/http/errors.ts` - 迁入 HTTP 请求与错误处理能力
    - `src/shared/storage/storage.keys.ts` - 新增共享 AsyncStorage 键定义
    - `src/shared/theme/*` - 迁入颜色、间距、圆角、排版和动效令牌
    - `src/shared/ui/*` - 迁入 Button、Card、ModalPanel、Screen 和 TextField 基础组件及统一导出
    - `src/shared/hooks/useDebouncedAction.ts` - 迁入通用操作防抖 Hook
    - `src/core/providers/AppProviders.tsx` - 新增应用级 Provider 组合
    - `src/core/navigation/*` - 新增导航配置、可见性状态、浮动导航组件、返回处理组件和导航 Hooks
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 改为使用 AppProviders、核心导航组件和共享主题
    - `src/app/**`、`src/components/**`、`src/hooks/**`、`src/api/**` - 更新为使用新的 shared/core 导入路径与 storage key
    - `src/api/client.ts`、`src/api/errors.ts`、`src/theme/*`、`src/components/ui/*`、`src/data/actions.ts`、`src/data/floatingMenuVisibility.ts`、相关旧导航组件与 Hooks - 删除已迁移源文件

## 2026-07-12 01:57:17 | 优化代码

- **阶段一：统一领域类型并修正依赖方向**
    - 新增共享 `User` 类型，以及认证、笔记、笔记分类与个人资料的领域类型模块，消除同一数据模型在 API、缓存、页面和组件中的重复声明
    - 将笔记缓存、笔记列表、详情查看器、滑动项和置顶/收藏 Hook 统一改为依赖 `Note` 类型，移除 Hook 对 UI 组件类型的反向依赖
    - 将分类 API、分类组件与分类操作 Hook 统一改为依赖分类领域类型，移除 API 对 `data` 层类型的反向依赖
    - 将认证 Context 和个人资料 API 统一改为依赖共享 `User` 类型，并将个人资料响应、头像上传和采集类型归入 Profile 模块
    - 保持现有路由、API 请求地址、缓存/事件机制和交互行为不变；Zustand 状态迁移留待后续独立阶段处理

- **修改文件列表**
    - `src/shared/types/user.ts` - 新增认证与个人资料共用的用户模型
    - `src/features/auth/auth.types.ts` - 新增认证 DTO 与认证上下文类型
    - `src/features/notes/notes.types.ts` - 新增笔记及创建、更新载荷类型
    - `src/features/notes/categories/categories.types.ts` - 新增分类及创建、更新载荷类型
    - `src/features/profile/profile.types.ts` - 新增个人资料与头像相关响应类型
    - `src/api/auth.ts`、`src/api/categories.ts`、`src/api/notes.ts`、`src/api/user.ts` - 改为使用并转出领域类型
    - `src/data/categories.ts`、`src/data/notes.ts` - 移除重复模型声明并引用统一类型
    - `src/hooks/useAuth.tsx` - 改为使用认证状态与共享用户类型
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为从 Notes 领域类型模块导入类型
    - `src/components/Note/NoteViewer.tsx`、`src/components/Note/SwipeableNoteItem.tsx` - 移除重复笔记类型声明
    - `src/components/FloatingBarComponents/FloatingBar.tsx`、`src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx`、`src/hooks/FloatingBar/*` - 改为从分类领域类型模块导入类型
    - `src/hooks/notes/useNotePin.ts`、`src/hooks/notes/useNoteStar.ts` - 移除对 UI 组件类型的依赖

## 2026-07-11 20:46:07 | 优化代码

- **重构 NativeWind 样式管理结构（保持现有视觉与布局）**
    - 在 `global.css` 中使用 NativeWind v5/Tailwind CSS v4 `@theme` 建立语义化颜色和圆角令牌，所有令牌沿用原始视觉值
    - 新增 `src/theme` TypeScript 令牌层，集中管理图标、SVG、动画和原生对象样式使用的颜色、间距、圆角与字号
    - 新增 `src/components/ui` 基础组件层，集中管理按钮、输入框、卡片、弹窗面板和页面容器的重复样式结构
    - 将页面和业务组件中散落的十六进制、RGB、RGBA 颜色迁移到主题令牌，并将 6 处 `StyleSheet.create` 等值迁移为 NativeWind 类名
    - 保留所有现有颜色值、组件尺寸、间距、圆角、阴影、排列、动画和交互逻辑，不进行视觉风格调整
    - 新增项目样式开发规范，并为旧 NativeWind 手册补充当前 v5/Tailwind CSS v4 配置提示

- **修改文件列表**
    - `global.css` - 新增 NativeWind 语义化颜色和圆角令牌
    - `src/theme/colors.ts` - 新增原生颜色令牌
    - `src/theme/spacing.ts` - 新增对象样式间距令牌
    - `src/theme/radius.ts` - 新增圆角令牌
    - `src/theme/typography.ts` - 新增字号与字重令牌
    - `src/theme/index.ts` - 新增主题统一导出
    - `src/components/ui/Button.tsx` - 新增按钮基础组件及背景变体
    - `src/components/ui/TextField.tsx` - 新增表单输入框基础组件
    - `src/components/ui/Card.tsx` - 新增卡片基础组件
    - `src/components/ui/ModalPanel.tsx` - 新增弹窗面板基础组件
    - `src/components/ui/Screen.tsx` - 新增页面根容器组件
    - `src/components/ui/index.ts` - 新增基础组件统一导出
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 使用主题颜色令牌
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/(tabs)/todo/index.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/(tabs)/note/index.tsx`、`src/app/(tabs)/user/index.tsx` - 使用语义类名、主题令牌和基础组件
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx` - 复用按钮与输入框基础组件
    - `src/app/pages/excerpt/create.tsx`、`src/app/pages/todo/create.tsx`、`src/app/pages/user/settings.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/pages/note/create.tsx` - 将静态 `StyleSheet` 等值迁移为 NativeWind 类名
    - `src/components/ActionButton.tsx`、`src/components/AddCategoryButton.tsx` - 使用语义类名与主题颜色
    - `src/components/addNoteClass.tsx`、`src/components/CategoryActionModel.tsx` - 复用按钮、弹窗面板和主题令牌
    - `src/components/FloatingMenu.tsx` - 使用浮动菜单语义令牌
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 使用主题颜色与圆角令牌
    - `src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx` - 使用主题颜色与语义圆角
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 使用分隔线语义颜色
    - `src/components/Note/Card/NoteCard.tsx`、`src/components/Note/Card/NoteSwipeActions.tsx` - 使用笔记卡片语义令牌
    - `src/components/Note/SwipeableNoteItem.tsx` - 使用卡片语义圆角
    - `src/components/Note/Viewer/NoteDetailStateView.tsx` - 复用按钮与主色令牌
    - `src/components/Note/Viewer/NoteViewerHeader.tsx`、`src/components/Note/Viewer/NoteViewerMeta.tsx` - 使用主题颜色令牌
    - `src/components/PinBadge.tsx`、`src/components/StarBadge.tsx` - 使用 SVG 主题颜色令牌
    - `src/hooks/FloatingBar/CategoryIndicator.tsx` - 使用状态与阴影颜色令牌
    - `docs/样式开发规范.md` - 新增项目样式维护与新增页面指南
    - `docs/NativeWind-Tailwind-完整手册.md` - 补充项目当前配置入口提示
    - `CHANGELOG.md` - 记录本次样式结构重构

---

## 2026-07-10 19:04:02 | 修复问题

- **修复笔记详情分类名称一直显示为全部**
    - 移除 `NoteViewerMeta` 中对全局当前选中分类名称的依赖，避免详情页把侧边栏选中状态误当作笔记所属分类
    - 根据当前笔记的 `categoryId` 获取分类列表并匹配真实分类名称，未找到或获取失败时显示“未知分类”
    - 将原本写在组件外部的 `useState` 和 `useEffect` 移入组件内部，修复 React Hook 使用位置错误

- **修改文件列表**
    - `src/components/Note/Viewer/NoteViewerMeta.tsx` - 按笔记分类 ID 解析分类名称并修复 Hook 位置
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-10 18:14:59 | 优化代码

- **按 API 文档更新前端接口调用**
    - 新增认证、验证码、笔记、分类和错误解析的统一 API 封装，减少页面与 Hook 中散落的请求路径
    - `client` 请求拦截器改为读取 `EXPO_PUBLIC_BASE_URL`，并为验证码、注册、登录链路自动携带稳定的 `X-Device-Id`
    - 登录和注册页改为使用认证接口封装，并统一展示限流等待时间、验证码剩余尝试次数等后端错误信息
    - 笔记列表、笔记创建/删除、分类列表/创建/更新/删除、笔记置顶/标星等调用点改为使用统一接口函数
    - 保留前端现有的笔记分类、置顶和标星行为，其中 `PUT /notes/:id` 属于现有功能兼容封装

- **修改文件列表**
    - `src/api/client.ts` - 支持环境变量 API 地址与验证码链路设备标识
    - `src/api/auth.ts` - 新增认证与验证码接口封装
    - `src/api/categories.ts` - 新增分类接口封装
    - `src/api/errors.ts` - 新增 API 错误信息解析工具
    - `src/api/notes.ts` - 新增笔记接口封装
    - `src/app/auth/login.tsx` - 接入认证封装与统一错误提示
    - `src/app/auth/register.tsx` - 接入认证封装与统一错误提示
    - `src/app/(tabs)/note/index.tsx` - 接入笔记和分类封装
    - `src/app/pages/note/create.tsx` - 接入创建笔记封装
    - `src/app/pages/note/[id].tsx` - 接入获取笔记封装与统一错误提示
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 接入获取分类封装
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 接入删除分类和删除笔记封装
    - `src/hooks/FloatingBar/useCategoryPin.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryStar.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryRename.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryChangeIcon.ts` - 接入更新分类封装
    - `src/hooks/notes/useNotePin.ts` - 接入更新笔记封装和统一错误提示
    - `src/hooks/notes/useNoteStar.ts` - 接入更新笔记封装和统一错误提示
    - `CHANGELOG.md` - 记录本次接口更新变更

---

## 2026-07-08 19:05:28 | 修复问题

- **修复笔记页语法结构损坏导致编译失败**
    - 清理 `note/index.tsx` 中残留的重复和不完整代码块，恢复完整的 `fetchNotes` 请求逻辑
    - 移除页面内重复的置顶和标星内联实现，重新使用已抽离的 `useNotePin` 与 `useNoteStar`
    - 保留笔记列表刷新、分类变更订阅、删除笔记、缓存同步和返回顶部动画等原有行为

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 修复损坏的组件结构并恢复 hook 调用
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-08 01:11:19 | 优化代码

- **抽离笔记置顶与标星 Hook**
    - 新增 `useNotePin`，封装笔记置顶的乐观更新、置顶顺序维护、后端同步和失败回滚逻辑
    - 新增 `useNoteStar`，封装笔记标星的乐观更新、后端同步和失败回滚逻辑
    - `note/index.tsx` 改为调用独立 Hook，减少页面组件中的业务逻辑长度
    - 保留原有缓存同步、打开操作栏关闭、错误提示和排序行为

- **修改文件列表**
    - `src/hooks/notes/useNotePin.ts` - 新增笔记置顶 Hook
    - `src/hooks/notes/useNoteStar.ts` - 新增笔记标星 Hook
    - `src/app/(tabs)/note/index.tsx` - 接入独立 Hook，移除内联置顶/标星回调
    - `CHANGELOG.md` - 记录本次优化代码变更

---

## 2026-07-05 11:56:48 | 修复问题

- **修复删除分类后全部列表残留未知分类笔记**
    - 新增按分类移除本地笔记缓存的事件通知，避免删除分类后全量刷新全部笔记
    - 分类下笔记和分类本身在服务端删除成功后，再通知笔记页本地移除对应分类下的笔记
    - 笔记页订阅分类笔记移除事件，仅过滤当前本地 `notes` 状态中匹配分类的笔记
    - 保持用户手动刷新时从服务端重新校准数据的能力，避免本地删除失败后误隐藏服务端数据

- **修改文件列表**
    - `src/data/notes.ts` - 新增按分类移除笔记的本地事件机制
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 分类删除成功后广播本地笔记移除事件
    - `src/app/(tabs)/note/index.tsx` - 订阅分类笔记移除事件并增量更新笔记列表
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-05 04:09:50 | 优化代码

- **优化 FloatingBar 分割线样式**
    - 将 `FloatingBarDivider` 从 1px 普通灰色长线调整为 2px 短胶囊分割线
    - 缩短宽度并增加上下间距，让分类分组更轻、更清晰
    - 使用更柔和的冷灰色与透明度，降低侧边栏视觉噪音

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 调整 FloatingBar 分割线样式
    - `CHANGELOG.md` - 记录本次样式优化变更

---

## 2026-07-04 16:46:35 | 优化代码

- **优化删除分类时的笔记删除请求压力**
    - 将分类下笔记的逐条删除从无限并发 `Promise.all` 调整为小批量限流执行
    - 每批最多删除 3 条笔记，批次之间间隔 100ms，降低服务器瞬时请求峰值
    - 保留后续替换为服务端批量删除接口的代码标记
    - 分类下笔记删除完成后，再继续删除分类本身，保持原有删除顺序

- **修改文件列表**
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 增加分类笔记删除限流逻辑
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 16:06:19 | 新增功能

- **新增笔记列表滚动时隐藏 FloatingMenu**
    - 新增跨组件菜单显示状态通知，笔记页滚动时发布隐藏状态，滚动停止后恢复显示
    - `FloatingMenu` 订阅隐藏状态，并使用 Reanimated `withTiming` 控制整体向屏幕右侧滑出/滑回
    - 在笔记页 `FlatList` 的 `onScroll` 中加入 180ms 停止滚动防抖，覆盖拖拽滚动和惯性滚动场景
    - 页面卸载时清理恢复定时器并强制显示菜单，避免菜单状态残留

- **修改文件列表**
    - `src/data/floatingMenuVisibility.ts` - 新增 FloatingMenu 隐藏/显示状态通知模块
    - `src/components/FloatingMenu.tsx` - 新增菜单横向滑出/滑回动画和状态订阅
    - `src/app/(tabs)/note/index.tsx` - 在笔记列表滚动时触发菜单隐藏，停止滚动后恢复
    - `CHANGELOG.md` - 记录本次新增功能变更

---

## 2026-07-04 15:39:59 | 优化代码

- **优化笔记列表渲染性能**
    - 将 `filteredNotes` 改为 `useMemo`，避免滚动按钮、弹窗等无关状态变化时重复过滤笔记数组
    - 新增 `NoteListItem` 并使用 `memo` 包裹，减少父组件状态变化导致的笔记卡片重复渲染
    - 将删除、刷新、滚动到顶部、`renderItem`、`keyExtractor` 等回调改为稳定引用，降低 FlatList 内部重复更新成本
    - 固定列表头部、空态和内容容器样式对象，减少 FlatList 子节点重复创建
    - 为 FlatList 增加 `initialNumToRender`、`maxToRenderPerBatch`、`updateCellsBatchingPeriod`、`windowSize`、`removeClippedSubviews` 等批量渲染约束
    - 新增 `showScrollTopRef`，仅在滚动阈值状态变化时更新 `showScrollTop`，避免滚动中重复触发 state 更新

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 优化笔记列表过滤、渲染、滚动状态与 FlatList 批量渲染参数
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 15:13:49 | 优化代码

- **优化笔记页重复请求问题**
    - 移除分类列表获取成功后再次广播分类变更的逻辑，避免形成重复刷新链路
    - 分类点击仅更新当前分类状态，不再触发全局分类变更事件
    - 笔记页移除聚焦时无条件全量刷新，改为初次加载、笔记变更事件和手动刷新时更新
    - 为 `/notes` 与 `/categories` 请求增加 in-flight 去重，复用尚未完成的同类请求

- **修改文件列表**
    - `src/components/FloatingBar.tsx` - 清理分类点击广播与分类请求重复触发
    - `src/app/(tabs)/note/index.tsx` - 调整笔记页刷新时机并增加请求去重
    - `src/app/pages/note/create.tsx` - 新建笔记成功后发送笔记变更通知
    - `src/data/notes.ts` - 新增笔记变更通知机制
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-04 15:07:22 | 优化代码

- **优化滑动切换页面的导航方式**
    - 将滑动切换底部 Tab 时使用的 `router.push` 调整为 `router.replace`
    - 避免连续滑动切换页面时不断堆积导航栈
    - 降低页面返回栈膨胀带来的切换卡顿风险

- **修改文件列表**
    - `src/hooks/FloatingMenu/useSwipeTab.ts` - 优化滑动切换 Tab 的导航方式
    - `CHANGELOG.md` - 记录本次优化变更

---

## 2026-07-02 15:00:00 | 重构优化

- **将头像逻辑抽离为独立 Hook `useAvatar`**
    - 新建 `src/hooks/useAvatar.ts`，封装头像上传、URL 处理、缓存破坏等全部逻辑
    - 对外暴露 `avatarSource`（含 cache-busting 的 Image source）、`avatarUploading`、`showAvatarOptions`
    - `user/index.tsx` 从 ~45 行内联逻辑缩减为单行 Hook 调用
    - `tsconfig.json` 添加 `skipLibCheck: true` 排除 node_modules 类型干扰

- **修改文件列表**
    - `src/hooks/useAvatar.ts` — 新建，独立头像 Hook
    - `src/app/(tabs)/user/index.tsx` — 使用 `useAvatar` 替换内联逻辑
    - `tsconfig.json` — 添加 `skipLibCheck`

---

## 2026-07-02 14:30:00 | 修复问题

- **修复头像上传后无法实时显示的问题**
    - 根因：`normalizeAvatarUrl` 将 `127.0.0.1` 头像 URL 映射到错误路径 `/avatars/xxx.png`，实际应为 `/api/user/avatar/xxx.png`
    - 修复：从原始 URL 提取文件名，映射到 `GET /api/user/avatar/:filename` 接口路径
    - 根因：`Image` 组件按 URI 做 HTTP 缓存，上传后同一 URL 不刷新
    - 修复：添加 `avatarKey` state，每次上传后递增，通过 `?t=N` 参数破坏缓存

- **新增服务端用户数据同步**
    - 在 `useAuth` 中新增 `syncProfile()` 方法，首次加载时调用 `GET /api/user/profile` 同步最新用户数据（含头像）
    - 登录/注册成功后调用 `syncProfile()` 确保数据一致
    - 上传头像成功后调用 `syncProfile()` 获取服务端最新头像 URL

- **清理冗余代码**
    - 移除 `user/index.tsx` 中上传头像后多余的 `AsyncStorage.setItem` 和手动拼接 avatar（已被 `syncProfile` 覆盖）
    - 移除未使用的 `refresh` 引用

- **修改文件列表**
    - `src/api/user.ts` — 修正 `normalizeAvatarUrl` 中 127.0.0.1 映射逻辑
    - `src/hooks/useAuth.tsx` — 新增 `syncProfile`、`getUserProfile` 引入、首次加载同步
    - `src/app/(tabs)/user/index.tsx` — 移除冗余代码、添加 cache-busting、调用 `syncProfile`
    - `src/app/auth/login.tsx` — 登录成功后调用 `syncProfile`
    - `src/app/auth/register.tsx` — 注册成功后调用 `syncProfile`
    - `src/components/FloatingBar.tsx` - 在 `handlePress` 的 `setCurrentCategory` 之后添加 `notifyCategoriesChanged()` 调用
