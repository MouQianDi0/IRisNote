# 摘录会话卡新增「保存剪贴板」按钮

## 基点与范围

- 基点：合并提交 7285493（codex-a B 档合入后的 kroos_todo HEAD），工作区干净。
- 用户确认的方案：在摘录会话状态卡（ID 7003）上增加「保存剪贴板」按钮，点击进入既有 B 档透明确认窗口；「随时可存」落地为「卡在即可存」——保存动作不依赖应用内检测器状态或待存候选，但不引入无 sessionId 的会话外捕获身份链（评估后否决，见「改动原因」）。
- 对比依据：`git diff 7285493..HEAD`（本次改动）；原行为对照 7285493 的 `ExcerptSessionNotifications.kt` / `ExcerptCaptureActivity.kt` / `ExcerptCaptureScreen.tsx`。

## 一、改动清单（按层）

### modules/irisnote-system（2 个文件）

- `excerpt/ExcerptSessionNotifications.kt`（+9）：新增 `ENTRY_EXTRA`/`ENTRY_CARD_BUTTON`/`CAPTURE_REQUEST_CODE`（= ID+1）常量；`post()` 在卡主体 intent 基础上构造 `saveIntent`（同一 `ExcerptCaptureHostActivity`，附加入口 extra），以独立请求码注册第二个 Activity PendingIntent，`addAction`「保存剪贴板」置于「停止」之前；停止/划除/到期/主体验证逻辑零改动。
- `excerpt/ExcerptCaptureActivity.kt`（+6）：新增 `captureEntry` 属性（读取入口 extra，缺省 `card_body`），`getLaunchOptions` 透传 `captureEntry` 给 JS Surface。

### src/features/excerpts（1 个文件）

- `screens/ExcerptCaptureScreen.tsx`（+12/−1）：新增可选 `captureEntry` prop；挂载时 `recordDiagnostic("excerpt_capture", "window_opened", { entry })` 记录入口枚举（`card_button`/`card_body`），不记录剪贴板正文、账号、令牌或会话 ID；写入走诊断日志既有异步队列。检测/保存/忽略/返回链路零改动。

### tests（1 个文件）

- `tests/excerpts/excerpt-capture.test.cjs`（+41）：新增源码契约用例「会话卡携带保存剪贴板按钮」——断言 Kotlin 侧按钮文案、独立请求码、IMMUTABLE flag、入口 extra、停止按钮保留；Activity 透传 `captureEntry`；TSX 侧 prop 与诊断事件仅含入口枚举。

### docs（3 个文件）

- `docs/架构指南/系统通知模块负责说明.md`：§十「原生展示」补按钮说明；调用链首行改为「点通知主体或卡上按钮」、Surface 参数补 `captureEntry`；新增「诊断」条目；末段编译现状更新为开发机已通过 `:irisnote-system:compileReleaseKotlin`，真机验收清单补卡上按钮项。
- `docs/logs/2026-09-29-merge-codex-a-be7d88c-into-kroos-todo.md`：修正 Manifest 描述措辞（声明的是宿主类 `ExcerptCaptureHostActivity`，实现类在模块内）。
- `CHANGELOG.md`：新增本条目。

## 二、与原代码对比

- 原行为（7285493）：会话卡仅一个「停止」动作按钮；进入捕获窗口的唯一通知入口是点卡片主体（contentIntent，请求码=ID，无入口标记）；捕获窗口 JS 仅收到 `sessionId/captureId`；摘录域无任何诊断调用。
- 现行为：卡片两个动作按钮「保存剪贴板」「停止」；按钮与主体进入同一捕获宿主，按钮附带 `captureEntry=card_button`；窗口 JS 额外收到 `captureEntry`；窗口打开时记录一条仅含入口枚举的诊断事件。
- 无默认值/开关反转：不改渠道、优先级、提升请求、到期/停止/划除语义，不新增权限、表或后端接口；`postProgressNotification` JS→原生签名零变化（按钮纯原生侧构造）。

## 三、改动原因

- 用户需求：通知上提供直白的「保存剪贴板」入口，提高 B 档可发现性（此前只有卡片主体点击，无可发现性提示）。
- 「无会话可存」评估：捕获窗口 onCreate 即校验 `captureRemaining>0`（`ExcerptCaptureActivity.kt`），全部剪贴板操作经 `captureAllowed` 会话校验；支持会话外保存需要一条无 sessionId 的捕获身份链并重写校验模型，动刚合入的 B 档安全设计，且无会话外常驻通知面承载按钮，故按「卡在即可存」落地并留档。

## 四、完整调用链路

```text
用户点会话卡「保存剪贴板」按钮
  → PendingIntent.getActivity(CAPTURE_REQUEST_CODE=ID+1, saveIntent)
      saveIntent = 主体同款显式 Intent（ExcerptCaptureHostActivity）
                   + data irisnote://excerpt-session/capture/<sessionId>
                   + extra captureEntry=card_button
  → ExcerptCaptureHostActivity（app 源集，prebuild 生成）→ ExcerptCaptureActivity
      → captureRemaining 校验（活动会话/未停止/未划除/未到期）
      → captureEntry 随 launch options 进 JS
  → ExcerptCaptureScreen(sessionId, captureId, captureEntry)
      → recordDiagnostic("excerpt_capture","window_opened",{entry})（异步、脱敏）
      → 数据库租约 → createExcerptCapture → detectClipboard（焦点门控）
      → 确认卡 → saveDetectedOffer → 本机 SQLite（与既有 B 档完全一致）
```

- 双入口唯一落点：按钮与卡主体最终走同一 Activity、同一确认窗口、同一保存服务；按钮不经过广播/标记/JS 消费链路（与待办卡动作按钮的 `LiveTodoActionReceiver` 模式无关）。
- 降级分支：会话停止/划除/到期时 `captureRemaining=0`，窗口直接关闭；通知权限拒绝/渠道关闭时卡片本就不存在，入口自然消失。

## 五、验证情况

- 修改前基线：`npm run typecheck` 0 错误（工作区干净于 7285493）。
- `node --test tests/excerpts/excerpt-capture.test.cjs` 8/8（7 项既有 + 1 项新增源码契约；首轮因 CRLF 断言失败，修正正则后通过，业务代码未因此改动）。
- `npm run check` 全过：typecheck、lint、theme:check 通过，node --test **684/684**（683 + 新增 1）。
- `npm run gradle -- :irisnote-system:compileReleaseKotlin --init-script "$PWD/.expo/gradle-aliyun-init.gradle"` BUILD SUCCESSFUL（1m 08s）。
- 未执行：staging 包真机验证（按钮渲染、点按到保存 E2E）；完整 APK 构建与合并 Manifest 生成。需要重新 prebuild 并构建原生安装包后真机验收。
