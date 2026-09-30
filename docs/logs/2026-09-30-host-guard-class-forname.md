# 摘录卡宿主守卫补 `Class.forName` 加载校验（防「声明在、dex 缺类」崩溃）

- 日期：2026-09-30
- 基点：`kroos_todo` @ 4b92a17（改前守卫只做 `getActivityInfo` 清单校验）
- 类型：修复问题（原生守卫补强 + 测试与文档同步）

## 1. 改动清单（按层）

| 层 | 文件 | 改动 |
|---|---|---|
| modules | `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptSessionNotifications.kt` | `captureHostResolvable` 在 `getActivityInfo` 通过后追加 `Class.forName(CAPTURE_HOST_CLASS, false, context.classLoader)` 实际加载宿主类；注释同步说明"清单在、dex 缺类"的漏洞（+6/-1） |
| tests | `tests/excerpts/excerpt-capture.test.cjs` | 会话卡守卫断言增加 `Class.forName(CAPTURE_HOST_CLASS, false, context.classLoader)` 必须存在（+3） |
| docs | `docs/架构指南/系统通知模块负责说明.md` | 「原生展示」段改写：发卡前守卫由"校验宿主 Activity 可解析"改为"同时校验可解析与宿主类可加载"，写明 `getActivityInfo` 查不出声明在而 dex 缺类的安装包、真机实测日期与降级行为不变（+1/-1） |

## 2. 与原代码对比（逐点）

- 原来守卫：`captureHostResolvable` 仅 `packageManager.getActivityInfo(ComponentName(context, CAPTURE_HOST_CLASS), 0)`，能解析即返回 true。
- 现在守卫：清单解析通过后再 `Class.forName(CAPTURE_HOST_CLASS, false, context.classLoader)` 用宿主 APK 的 ClassLoader 实际加载一次（`initialize=false`，不触发静态初始化），加载失败抛异常走同一 `catch` 返回 false。
- 行为差异只在"宿主声明已合并进 Manifest、但宿主类不在 dex（漏跑 prebuild 的安装包）"这一环境出现：原来 `captureReady=true`、通知卡带「保存剪贴板」按钮，点开 `ClassNotFoundException` 崩进程；现在 `captureReady=false`，卡主体降级为主应用启动入口、不提供捕获按钮，与"宿主整个缺失"环境行为一致。
- 无默认值变化、无开关反转；正常（已 prebuild）安装包两条校验都通过，行为逐字节不变。

## 3. 改动原因

宿主 Activity `ExcerptCaptureHostActivity` 由 config plugin 在 prebuild 时生成到 app 源集（不入库），其声明却写在模块 Manifest、无条件合并进每个包。因此 `getActivityInfo` 只能证明"声明过"，证明不了"类在"：漏跑 prebuild 的旧工程编译照常通过，真机点「保存剪贴板」按钮时显式 Intent 找不到类直接崩（真机实测于 2026-09-30）。守卫必须加载类本身才能覆盖该环境。

## 4. 完整调用链路

```
用户点通知卡「保存剪贴板」按钮 / 卡主体
  → ExcerptSessionNotifications.postStateCard（发卡前）
    → captureHostResolvable(context)
      → getActivityInfo(ComponentName(CAPTURE_HOST_CLASS), 0)   // 清单可解析
      → Class.forName(CAPTURE_HOST_CLASS, false, context.classLoader) // 新增：类可加载
      → 任一失败 → false
    → captureReady=false → 卡主体降级为主应用启动入口，不渲染「保存剪贴板」按钮
    → 停止按钮与倒计时不受影响
唯一入口：captureHostResolvable；降级分支：主应用深链（原 A 档行为），不进透明捕获窗口。
```

测试断言在 `tests/excerpts/excerpt-capture.test.cjs` 的会话卡用例中锁定 `Class.forName` 必须存在，防止后续回退成只查清单。

## 5. 验证情况

- `node --test tests/excerpts/excerpt-capture.test.cjs`：8/8 通过。
- `npm run typecheck`：0 错误。
- `npm run check`：全过（node --test 684/684，typecheck/lint/theme:check 通过）。
- `:irisnote-system:compileReleaseKotlin`：BUILD SUCCESSFUL（1m 6s；任务 UP-TO-DATE，当前源码与上次成功编译产物一致，即该改动此前已通过同任务编译）。
- 真机复现"漏跑 prebuild 的包点按钮降级不崩"：未执行（沿用发现该问题的真机环境描述，构建该环境成本高）。
