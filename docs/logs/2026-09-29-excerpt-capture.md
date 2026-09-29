# 快速摘录 B 档：通知透明确认保存

- 日期：2026-09-29 UTC；记录时间 14:54:26。
- 授权：用户「开始 b 通道的实施」，延续既定的快速摘录分期、UI 文档与提交推送要求。
- 基点：`ffe88280fb93df8d89b1afc356a0b53dfd018446`（A 档已提交/推送的 HEAD）。本次在 `kroos_vps/codex-a` 实施。
- 修改前 `npm run typecheck` 通过，工作树干净；已读根 AGENTS、公共组件、视觉、样式和通知负责文档，发出实现计划与确认卡文字预览后按实施授权推进。

## 改动清单（按层）

### src/features

| 文件 | 改动与原因 |
| --- | --- |
| `src/features/excerpts/excerpt-capture-entry.ts`（新增 7 行） | 注册独立 `IRisNoteExcerptCapture` Surface，避免捕获时挂主应用导航。 |
| `src/features/excerpts/screens/ExcerptCaptureScreen.tsx`（新增 187 行） | 数据库租约、加载/确认/错误 UI、保存/忽略互斥、返回处理与释放；复用 DraftDialog/AppModal/AppButton 和主题 Token。加载不先开 Modal，保留读取焦点。 |
| `src/features/excerpts/services/excerpt-capture-controller.ts`（新增 135 行） | 可注入端口的检测/保存控制器；核验会话、账号、原生窗口、仓库代次，复用原有检测与保存服务；失败保留候选，不重读后来的剪贴板。 |
| `src/features/excerpts/services/excerpt-capture.ts`（新增 106 行） | 冷/热启动本机身份、数据库、原生焦点读取门面与 HMAC 去重；同账号仓库激活、按 owner/generation/hash 清共享候选。无捕获上传或资料请求。 |
| `src/features/excerpts/services/excerpt-session-notifications.ts` | 新原生能力检查；B 档通知正文；旧原生安装包保持 A 档回到应用文案。 |
| `src/features/excerpts/hooks/useClipboardDetection.ts` | 捕获窗口存在时主应用检测让出读取/发布权，读取正文前再次门控，避免同 runtime 两个 Surface 竞争候选。 |
| `src/features/excerpts/components/ExcerptSessionDialog.tsx` | 支持 B 档时说明点通知确认并返回原应用；时长、布局与 A 档兜底维持既定规范。 |

### src/core / src/shared

无源码改动。复用 `applicationDatabaseResource` 的共用初始化和租约释放、既有 SQLite 端口/队列及公共弹窗/按钮/主题；没有修改待办源码、数据库迁移、HTTP 或同步服务。

### modules

| 文件 | 改动与原因 |
| --- | --- |
| `modules/irisnote-system/index.ts` | 捕获窗口状态与四个 native bridge 方法类型；窗口身份 captureId 独立于 sessionId，旧调用不能关闭新窗口。 |
| `modules/irisnote-system/android/build.gradle` | 明确依赖现有 `com.facebook.react:react-android`，编译底层 ReactActivity，不引入新 npm 原生库。 |
| `modules/irisnote-system/android/src/main/AndroidManifest.xml` | 非导出捕获宿主 Activity、空 taskAffinity、singleTask、excludeFromRecents 与透明主题；权限不新增。 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/IrisNoteSystemModule.kt` | 主线程 AsyncFunction 暴露状态、hasText、readText、finish；只读主窗口查询不解除捕获窗口启动超时。 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptSessionNotifications.kt` | 新通知主体用直接 Activity PendingIntent；原生登记 endsAt/入口版本；捕获权限核验；停止/划除/撤卡使对应窗口退出。仍不重发正在展示的旧卡。 |
| `modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptCaptureActivity.kt`（新增 112 行） | 焦点与 session/capture 身份门控、只读文字且不解引用 URI、独立任务退出、到期/15 秒启动超时/Home 清理；成功 Toast。正文不进入持久存储。 |
| `modules/irisnote-system/android/src/main/res/values/excerpt-capture-styles.xml`（新增 15 行） | 可焦点透明 Activity 主题，无 NoDisplay、浮动窗或权限。 |

### 应用入口 / plugins

| 文件 | 改动与原因 |
| --- | --- |
| `package.json` | main 从 expo-router/entry 改为 index.js，注册两个 Surface；依赖与锁文件不变。 |
| `index.js`（新增 3 行） | 先注册捕获，再加载 Expo Router 主入口，保留路由安装约定。 |
| `app.json` | 加入 with-excerpt-capture config plugin；permissions 不变。 |
| `plugins/with-excerpt-capture.js`（新增 21 行） | prebuild 生成 app 宿主源码，干净源码构建不依赖本机忽略的 android 文件。 |
| `plugins/android/ExcerptCaptureHostActivity.kt`（新增 11 行） | app 侧 Expo Delegate 包装。Expo 本身 api 依赖各本地模块，包装层放 app 避免模块反向依赖 Expo 的构建环。 |

### tests

| 文件 | 改动与原因 |
| --- | --- |
| `tests/excerpts/excerpt-capture.test.cjs`（新增 264 行） | 7 项行为测试覆盖只检测不保存、无效会话不读取、异步身份变化、失败原候选重试/重复提交、保存时再次门控、忽略与取消区别、共用去重/长度规则。 |
| `tests/excerpts/excerpt-capture-build.test.cjs`（新增 38 行） | 真实调用 config plugin，在全新临时目录生成宿主，再执行验证幂等、不改主 Activity；覆盖干净构建所需的生成路径。 |

### docs

- `docs/UI/IRisNote视觉设计规范.md`：B 档开启说明、确认卡、加载/动作/错误/退出尺寸与焦点边界。
- `docs/架构指南/系统通知模块负责说明.md`：A/B 当前入口、捕获全链路、生命周期、账号/窗口隔离、生成宿主与实际验证限制。
- `docs/构建发布/本地测试包构建.md`：首次引入 config plugin 须重新 prebuild、恢复 staging 块与镜像配置，再构建原生包。
- `CHANGELOG.md`：新增本次功能记录，保留 A 档历史。
- 本日志（新增 113 行）：记录基点、逐文件差异、原因、链路与检查事实。

## 与基点代码对比

通过 `git diff ffe88280fb93df8d89b1afc356a0b53dfd018446` 核对既有文件，再以 `git diff --cached ffe88280fb93df8d89b1afc356a0b53dfd018446` 核对完整补丁（含新增文件）：26 个文件、1146 行新增/17 行删除，逐层清单与源码一致。

1. 原来通知主体启动 MainActivity 的 `irisnote://excerpt`；现在新会话用显式 Activity PendingIntent 打开独立透明宿主，确认后移除该独立任务。已展示的 A 档卡保持原入口到会话结束，避免重复提升请求。
2. 原来只有主应用根布局检测与共享 offer store；现在多一个仅通知启动的 Surface/controller，主应用检测器在该窗口期间让出检测权。应用内会话及摘录页自动检测保留。
3. 原来 package main 直接 Expo Router；现在自定义入口先注册捕获组件再导入原入口。没有新增路由页、改主应用导航或 Tab 状态。
4. 原来原生仅存会话 ID/停止/关闭标记；现在补充 endsAt/入口版本供窗口在冷启动、到期与旧通知检查中使用。剪贴板正文仍不落 SharedPreferences、Intent、日志。
5. 原来保存必须进摘录页内嵌卡；现在通知窗口调用同一 `saveDetectedOffer → excerptRepository.save`，仍是用户确认后的本机 SQLite 保存，没有摘录上传。
6. 原来没有捕获宿主生成器；现在 plugin 从入库模板生成 app 源码，在干净 prebuild 下可恢复。原生模块反向依赖 Expo 会造成构建环，所以 Expo 包装层留在 app。

默认行为变化单列：**支持 B 档的新原生安装包，新开启会话的通知主体默认进入透明确认窗口**。旧原生能力仍保留 A 档文案/行为；不新增档位切换 UI，不改 15/30/60/120 时长或通知权限拒绝降级。

## 完整调用链与门控

```text
开启会话 → 原 A 档 coordinator → system_preferences 会话 → 独立 HIGH 静默计时通知
复制文字 → 点击通知主体（停止动作保持原 Receiver）
  → 直接 Activity PendingIntent → ExcerptCaptureHostActivity（独立任务）
  → ExcerptCaptureActivity → React Surface IRisNoteExcerptCapture
  → 数据库 lease → 初始化/复用数据库 → createExcerptCapture
  → SQLite 会话 + 本机账号 + 原生当前 captureId/停止标记核验
  → 同账号仓库 activate → detectClipboard（原有去重规则）
  → 窗口焦点 → native hasText/readText → 候选仅保留内存
  → DraftDialog/AppModal 确认卡
      保存 → 再核验身份/到期 → saveDetectedOffer → SQLite commit → Store
           → HMAC 已处理 → 消费同一候选 → 成功 Toast → 关闭独立任务
      忽略 → HMAC 已处理 → 消费同一候选 → 关闭独立任务
      返回/遮罩 → 关闭独立任务，不保存、不标记
```

- 服务端：不经过摘录 API/同步/上传，表结构不变。热启动主应用既有 providers 仍可能响应系统生命周期；捕获 Surface 不挂这些 providers，不新增捕获网络链路。
- 唯一性：同一捕获 controller 重复保存共用 Promise；主应用检测在窗口存在时不读取或发布候选。保存失败保留原候选，不读取更晚的复制内容。
- 隔离：SQLite 会话 ownerKey/sessionId；仓库 generation；原生窗口 captureId；读与发布前再次检查。Intent 只含随机会话 ID，不带正文/账号；窗口初始 Bundle 仅随机 sessionId/captureId。
- 终止：停止先写 native 标记并撤卡，窗口退出；通知到期仍由系统 setTimeoutAfter 撤卡，窗口也有绝对期限计时器；清 SQLite 仍在主应用回前台对账。不恢复过期捕获。Home/返回移除独立任务，启动 15 秒未就绪退出，焦点等待 5 秒失败显示可关闭错误。
- 数据释放：数据库 lease 释放等待队列排空；已经受理的用户保存按原账号完成，关闭不抹掉已 commit 的摘录；未受理的旧操作拒绝。旧 captureId 不能关闭新窗口。
- UI：复用公共 24dp/24sp/48dp 规范及主题 Token；透明仅表示保留原应用画面，窗口会短暂取得前台焦点，原应用可能被系统暂停，不保证音视频持续运行。

## 验证情况

- 修改前 `npm run typecheck`：通过。
- 新增 7 项 controller 测试、1 项真实 config plugin 干净目录/幂等测试：通过。
- 最终 Android JS export：使用 `EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/irisnote-excerpt-capture-export-final --no-bytecode --max-workers 2`；成功，4492 模块、Android bundle 6.8 MB（关闭 bytecode 仅用于源码打包验证）。此项不代表 Kotlin/APK 编译。
- 最终 `npm run check`：TypeScript、theme:check 通过；Lint 0 错误/1 个既有 PermissionSettingsScreen.tsx:171 未使用变量警告；667 项测试 664 通过、2 跳过、1 个既有 `tests/releases/source.test.cjs` 超长中文文件名 ENAMETOOLONG 失败（本次未修改对应源码）。新增 8 项均通过；完整日志 `/tmp/irisnote-excerpt-session-final-check.log`。沙箱外使用此前授权的相同检查命令，因为部分测试需本机 HTTP 监听。
- `npm run gradle -- :irisnote-system:compileReleaseKotlin :app:processStagingMainManifest -PreactNativeArchitectures=arm64-v8a --offline`：失败在 Java 启动前，环境无 Java/JAVA_HOME；未进入 Kotlin 编译，未生成合并 Manifest/APK。
- 模块 Manifest/主题 XML 解析通过；与基点逐项对比 uses-permission（含 maxSdkVersion）一致，捕获 Activity 为非导出、空 affinity、不进最近任务；`git diff --check` 通过，相关源码无冲突标记。此静态检查不代表已生成合并 Manifest。
- 未执行：新原生包安装、冷/热启动真机双 Surface、通知停止/到期/返回原应用、Android API/ROM 差异、UI dp/字体缩放实测。当前环境无 adb/Android 设备。

## 提交与推送

按前文用户要求提交并推送同一 `kroos_vps/codex-a` 分支。提交前已 fetch，远端目标没有新增提交；最终结果以本次 Git 提交与远端 SHA 核对为准，不宣称未经执行的 native 验收通过。
