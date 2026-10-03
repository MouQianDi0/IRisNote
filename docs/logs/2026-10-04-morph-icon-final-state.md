# 图标变形结束后回跳笔记图标：最终 SVG 状态提交

- 时间：2026-10-04 01:14:45（Asia/Shanghai）。
- 类型：修复问题。
- 授权：用户补充“动画正常切换，播放完后直接变成笔记图标”。提交保留变形动画、同步最终 SVG 状态的修复方案后，用户明确回复“确认”。
- 项目基点：`54c73ef7edecd9cdc6e56e3f256c5cefca737de8`。保留上一轮当前 Tab 同源修改及其测试和日志；本轮只追加依赖补丁、组件适配层测试和文档，没有再次修改业务组件。
- 依赖基点：`package-lock.json` 锁定的官方 `morphicons@1.7.1` 发布包，下载地址及 SHA-512 与锁文件一致。`patch-package` 在临时目录安装干净版本并执行 Git diff，生成对 `dist/react-native.js` 的精确补丁；本轮未创建项目提交，结果以工作区及补丁文件为准。

## 改动清单（按层）

- `src/features`：本轮无改动。
- `src/core`：本轮无追加改动；保留上一轮 `FloatingMenu → FloatingActionButton(activeTab)` 及 `getMainActionForTab` 链路。
- `src/shared`：本轮无改动。
- `modules/`：本轮无改动。
- `patches/morphicons+1.7.1.patch`：新增 31 行，将 React Native 图标适配层的最终路径提交修复持久化；沿用既有 `postinstall: patch-package`，不改变依赖版本或锁文件。
- `node_modules/morphicons/dist/react-native.js`：本机应用补丁的运行时文件，增加终点提交版本状态；仍按原方式逐帧写 SVG。该文件受 Git 忽略，交付以补丁为准。
- `tests/navigation/morph-icon-final-state.test.cjs`：新增 245 行，7 项测试执行真实依赖适配层及变形引擎，注入 React 调度、原生 SVG、帧时钟，分别观察原生路径及 React 最后提交的路径。
- `docs/logs/2026-10-04-morph-icon-final-state.md`：新增 63 行，记录问题证据、基点对比、调用链路、补丁持久化及验证边界。
- `CHANGELOG.md`：顶部追加本轮问题、修复范围、最终验证结果。

## 与原代码对比及原因

1. **原来**：`MorphIcon` 首次渲染确定路径，动画通过 `liveD.current` 和 `setNativeProps` 改变原生图形；动画完成没有触发 React 状态更新。笔记变形成待办后，原生路径正确，但 React 声明的 `Path.d` 仍可能是笔记路径。隔离测试明确观察到这两份状态不一致；再次应用已提交属性会恢复旧图形。
2. **现在**：保持原生逐帧动画；当驱动的 `progress === 1`、或无初始图标的驱动首次创建并绘制新路径时，递增提交版本，让 React 从最新 `liveD.current` 重新提交 `Path.d`。常规动画中间帧不触发 React 状态更新，普通一次切换只在终点更新一次。
3. **为什么使用版本递增**：开发中补充的“首次动画没结束就返回笔记”测试，发现仅把终点字符串写入 state 会因字符串与原值相同被 React 跳过，仍可能残留中间图形。版本递增确保这个终点也会提交，避免同值跳过；渲染读取最新路径，不在延迟回调中保存旧页面目标。
4. **原有行为保留**：图标映射、弹簧参数、变形插值、快速切换时重新指定目标、减少动态效果策略、外层摇摆、按压及导航保持原样。没有以移除变形、固定延时重挂载或逐帧 React 更新来规避问题。
5. **默认值与开关**：本轮没有新增业务开关，也没有反转现有默认值；补丁作用于现有 React Native 适配层，不修改库的核心引擎或其他平台适配文件。

## 完整调用链路

```text
TabRouter 提交当前页面
  → FloatingMenu(activeTab)
  → FloatingActionButton：选择 icon，操作目标仍由同一个 activeTab 决定
  → morphicons/react-native 的 MorphIcon：icon 变化 effect
  → createMorph.morphTo / 减少动态效果时 createMorph.set
  → 原有帧调度器与弹簧计算
  → PathEl.setAttribute("d", path)
      ├─ liveD.current = path
      ├─ Path.setNativeProps → 原生 SVG 更新
      └─ 终点或延迟创建的新路径 → commitPath 版本递增
          → React 重渲染，declaredD 读取最新 liveD.current
          → Path.d 提交最终图形
          → 后续重新应用 React 属性时保留目标图形
```

- 终点判定使用当前驱动的实际进度，不新增超时或轮询任务。已有卸载 `destroy()` 继续取消帧回调，避免卸载后更新 state。
- 减少动态效果、命令式 `set`、受控动画端点以及无初始图标的延迟创建共用适配层路径写入入口，测试覆盖这些分支。未新增双端镜像逻辑。
- 本次链路不进入业务 Store、SQLite、HTTP API 或原生模块，不修改本地数据，不新增请求，不改变云授权门控。用户输入保存、失败重试与业务回滚机制未修改。

## 验证情况

- 修改前 `npm run typecheck`：退出码 0。
- 原始依赖下运行首版 6 项新测试：5 项失败、1 项卸载测试通过；失败明确发生在 React 最终声明路径不等于目标路径，原生路径已到目标。
- 开发中新增“未完成就返回起点”测试：暴露终点字符串同值跳过；改为提交版本递增后通过。
- 最终 `node --test tests/navigation/morph-icon-final-state.test.cjs tests/navigation/floating-action-button.test.cjs`：12/12 通过。测试还断言普通切换中间帧没有 React 状态更新，终点只提交一次，并模拟再次应用 React 属性后图形仍正确。
- `node node_modules/patch-package/index.js morphicons`：成功生成补丁；最终修订使用离线缓存重新生成成功。
- 干净依赖验证：解压官方归档前重新校验锁文件 SHA-512，在独立临时目录运行 `patch-package --error-on-fail` 成功；最终补丁应用后的运行时文件与通过测试的本机文件逐字节相同。此验证不是完整项目 `npm ci` 或 Android 构建。
- 初次 `npm run check`：退出码 0，808/808 通过，Lint 有一条既有 `liveUpdateCapable` 未使用警告。因随后追加边界测试和补丁修订，该结果不作为最终代码验收。
- 最终代码 `npm run check`：退出码 0，809/809 测试通过，类型及主题检查通过，Lint 零错误、一条既有 `PermissionSettingsScreen.tsx:173` 的 `liveUpdateCapable` 未使用警告；检查后没有追加代码或测试修改。
- `git diff --check`：通过；本轮补丁、测试、全链路日志及 CHANGELOG 的冲突标记扫描无匹配。
- Android 打包、模拟器和真机冷启动验证：未执行。测试证明适配层状态不一致及补丁效果，不等同于捕获用户设备上触发旧属性覆盖的那次原生提交，也不宣称已完成真机验收。
- 未执行项目 Git 提交、推送或发布。
