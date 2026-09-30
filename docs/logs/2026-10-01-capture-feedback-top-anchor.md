# 快速摘录反馈胶囊改锚状态栏下方 30dp

- 日期：2026-10-01
- 基点：`kroos_todo` @ 5b40ced（合并 origin/master 开发者模式之后的 HEAD）
- 类型：优化代码（纯视觉锚点，无行为/数据变化）

## 1. 改动清单（按层）

| 层 | 文件 | 改动 |
|---|---|---|
| src/features | `excerpts/components/ExcerptCaptureFeedback.tsx` | 外层容器 `justifyContent: "center"` → `"flex-start"`，新增 `paddingTop: (StatusBar.currentHeight ?? 0) + 30`；`StatusBar` 加入 react-native 导入；`padding: 24` 保留（水平与底部边距） |

## 2. 与原代码对比

- 原来：反馈胶囊在透明捕获窗口**正中央**（`flex:1` + `justifyContent: "center"` + `alignItems: "center"`），垂直与水平都居中。
- 现在：胶囊**顶部对齐**，上边距为状态栏高度 + 30dp，水平仍居中；成功/失败/加载三种反馈与淡出动画全部不变。

## 3. 改动原因

用户反馈胶囊悬在屏幕中部过于突兀，希望贴近通知来源位置：点通知后反馈应出现在状态栏下方，视线移动距离最短。

## 4. 完整调用链路

```
点通知卡主体/「保存剪贴板」按钮
  → ExcerptCaptureHostActivity（透明窗口）
    → ExcerptCaptureScreen（Pressable 全屏，点按=close）
      → ExcerptCaptureFeedback（本改动：容器顶部对齐，paddingTop=状态栏高+30dp）
        → 反馈胶囊（icon + 文案，淡入/淡出动画不变）
```

坐标基线说明：主应用启用 `react-native-edge-to-edge`（app.json 插件），捕获透明窗口与主应用同一坐标系，`StatusBar.currentHeight` 即顶部状态栏 inset（与 `core/editor/use-keyboard-overlap.ts` 的取法一致）。

## 5. 验证情况

- `npm run typecheck`：0 错误。
- `node --test tests/excerpts/excerpt-capture-screen.test.cjs`：4/4 通过（该文件无布局断言，未需更新）。
- 全量 `npm run check`：未跑（单文件纯视觉改动，无测试/类型面变化）。
- 真机 adb 布局核对实际 y 坐标：未做，待真机验收。
