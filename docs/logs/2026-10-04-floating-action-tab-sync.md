# 底部蓝色操作按钮与当前 Tab 同步

- 时间：2026-10-04 00:38:27（Asia/Shanghai）。
- 类型：修复问题。
- 授权：用户报告启动后从笔记快速切换页面时蓝色按钮图标不更新，提交分析、文件计划与界面文字预览后，用户明确回复“确认”。
- 基点：排查开始时 HEAD 为 `79af0e1ea55b1dcc73a4ef2960a31b6475aef680`；执行期间观察到 HEAD 已变为 `54c73ef7edecd9cdc6e56e3f256c5cefca737de8`。本任务未执行 Git 写操作。通过两提交间的定向 diff 核对，本次涉及的三个生产文件内容相同，既有导航防连点改动已在后一个提交内。
- 对比方法：读取修改前工作区源码，执行 `git diff` 核对本次三个生产文件；执行 `git diff 79af0e1ea55b1dcc73a4ef2960a31b6475aef680..54c73ef7edecd9cdc6e56e3f256c5cefca737de8 -- src/core/navigation/components/FloatingActionButton.tsx src/core/navigation/components/FloatingMenu.tsx src/core/navigation/navigation.constants.ts`，无差异。本次结果尚未提交，以工作区 diff 为准，不虚构结果提交 SHA。

## 改动清单（按层）

- `src/features`：无改动。
- `src/core/navigation/components/FloatingMenu.tsx`：从导航器已提交的 `state.routes[state.index].name` 匹配类型明确的 Tab，将同一个 `activeTab` 传入蓝色按钮。
- `src/core/navigation/components/FloatingActionButton.tsx`：接收必填 `TabKey` 属性，用它选择变形图标及操作配置，不再独立通过 `usePathname()` 判断当前业务页面。
- `src/core/navigation/navigation.constants.ts`：新增 `getMainActionForTab(tab)`，复用原四类操作映射；路径入口 `getMainAction(path)` 委托此函数，保留原有路径兼容行为。
- `src/shared`：无改动。
- `modules/`：无改动。
- `tests/navigation/floating-action-button.test.cjs`：新增 207 行，5 项测试执行真实组件与映射代码并注入 UI、导航端口；另执行真实 morphicons 动画引擎，覆盖快速切换与帧延迟的最终收敛。
- `docs/logs/2026-10-04-floating-action-tab-sync.md`：新增 58 行，记录授权、基点、逐层改动、行为对比、完整链路及验证边界。
- `CHANGELOG.md`：顶部追加本次修复概述、文件列表、行为及验证结果。

## 与原代码对比及改动原因

1. 原来菜单按导航器状态选中 Tab，按钮独立按全局 pathname 选择图标和目标；现在两者共用导航器已提交的 Tab。全局路径滞后时，旧实现会继续显示笔记图标并配置笔记操作，统一来源消除这一依赖。
2. 原来 `getMainAction` 内直接按路径解析结果分支；现在提取类型明确的 Tab 入口，旧路径入口仍调用同一映射。这样避免为按钮拼接假路径或复制操作配置，四个目的路由和名称均不变。
3. 原来有效但未知的 route.name 会直接作为菜单 activeTab；现在只接受已配置的四个 Tab，否则回退笔记。正常四页行为不变；未知路由的兜底由菜单与按钮统一采用笔记，空路由原有笔记兜底继续保留。
4. 变形图标仍使用 `MorphIcon`、`spring="snappy"` 和 `reducedMotion="user"`，按钮摇摆、尺寸、颜色、位置及手势保持原样。测试中的真实引擎能在首帧前多次换目标与后续帧延迟后到达最终图形，因此本次没有改动依赖或添加强制重挂载。
5. 无业务开关或持久化默认值反转。新增回归测试验证旧源码在模拟路径滞后的条件下失败，防止仅检查静态映射而遗漏父组件传值链路。

## 完整调用链路

```text
点击底部 Tab / 完成页面横滑 / 完成底部拖动导航
  → 既有 navigation.navigate 或 SwipeTabsNavigator.onIndexChange
  → TabRouter 提交 state.index
  → FloatingMenu 匹配当前路由名（四个 Tab；缺失/未知回退 note）
     ├─ 菜单选中状态及既有选择动画
     └─ FloatingActionButton(activeTab)
         ├─ ACTION_ICONS[activeTab] → MorphIcon → SVG 图形更新
         └─ getMainActionForTab(activeTab)
             ├─ label → 按钮无障碍名称
             ├─ 点击 → useDebouncedNavigation → router.push(目的页)
             └─ 长按 → useLongPressNavigation → router.push(目的页)
```

- 单一来源为已提交的 Tab；点击请求尚未提交、拖动尚未完成时，不提前替换操作目标。
- 点击继续沿用既有立即导航及防连点 Hook；长按沿用原手势 Hook。两个 Hook 内的 pathname 用于既有导航判断，不再承担按钮图标或操作目标的选择。
- 本次修改链路不经过业务 Store、SQLite、API 或原生模块，不修改本地数据，不发起云请求，也不改变账号/云授权门控。目标编辑页面原有输入保存、失败处理与重试不受本次修改影响。
- 没有新增异步请求、乐观写入或回滚逻辑。没有新增双端镜像逻辑、计时器或高频 React 状态更新；共享组件用于现有运行平台。

## 验证情况与边界

- 修改前 `npm run typecheck`：通过，无既有类型错误。
- `node --test tests/navigation/floating-action-button.test.cjs`：5/5 通过。
- 旧组件对照：通过内存中的文件读取替换，将两个组件载入为基点 `79af0e1` 的源码，其余测试与映射代码保持当前版本；3 项状态同步测试失败、2 项兼容/引擎测试通过。未将旧文件写回工作区。
- 修改后 `npm run check`：退出码 0；类型检查与主题检查通过，完整测试 802/802 通过，Lint 零错误且有一条既有 `PermissionSettingsScreen.tsx:173` 的 `liveUpdateCapable` 未使用警告（核对当前基点源码存在该变量）。生产代码及测试在该次检查后没有追加修改。
- `git diff --check`：通过；三个生产文件与新增测试的冲突标记扫描无匹配。
- Android 打包、模拟器和真机冷启动/快速切页验证：未执行。注入滞后路径验证的是状态来源缺陷，并不证明已复现用户设备的全部触发条件；动画引擎测试不覆盖 React Native SVG 的实际原生绘制。
- Git 提交、推送和发布：未执行。
