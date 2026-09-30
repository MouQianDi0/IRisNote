# 通知一键摘录与应用内暂存区入口迁移

## 基点与需求

基点为 `0581989a40354d72deeb323a69b2c427b30aea1c`（当前 `kroos_todo`）。用户确认透明捕获、直接摘录、短反馈和应用内二次处理；暂存区入口最终确定在摘录页右上角，按钮顺序为暂存区、快速摘录、粘贴、搜索。方案、文字预览和确认完成后实施；修改前工作区干净，fetch 后远端与基点一致。对比依据为工作区相对基点的实际 `git diff`，新增文件另按实际内容核验。

## 改动清单（按层）

### src/features

- `excerpts/screens/ExcerptCaptureScreen.tsx`：移除主面板、正文预览、暂存及编辑/合并表单；一次捕获任务、直接显示短反馈、淡出后关闭。处理期间拦截返回/空白，结果阶段允许提前关闭；卸载清理反馈计时器和返回订阅。Effect 重挂共享任务；已受理保存完成前持有数据库资源租约。
- `excerpts/components/ExcerptCaptureFeedback.tsx`（新增，101 行）：Activity 内直接绘制主题反馈胶囊，图标 24dp、文字 14sp/20dp、主题 control 圆角与 surface 底；背景全透明，无 Modal 第二窗口；主题动画时长、遵循 Reanimated 默认系统减弱动态设置。
- `excerpts/domain/excerpt-capture-feedback.ts`（新增，29 行）：保存、重复、暂存、空内容和超限对应文案/色调/停留时间的纯映射。
- `excerpts/services/excerpt-capture-controller.ts`：由可检测/暂存/编辑保存的控制器精简为 `capture()` 一次处理。缓存终态 Promise（含失败），重复调用不重新读取；读取前、结果处理前核验会话、账号、窗口及仓库代次；有效候选直接保存 source=paste，成功/仓库重复后消费相同内存候选。
- `excerpts/services/excerpt-service.ts`：`saveDetectedOffer` 增加可选来源参数，默认仍为 manual；通知显式传 paste，应用内确认保存语义保持。
- `excerpts/screens/ExcerptsScreen.tsx`：暂存入口接工具栏，移除正文区域暂存预览大卡；应用内粘贴暂存，提示 2 秒、保持弹窗并刷新。以账号/仓库代次重置暂存弹窗状态；操作 ref 阻止同一事件周期重复提交。合并冻结条目快照，清理失败返回暂存列表并显示已保存的准确状态。
- `excerpts/components/ExcerptToolbar.tsx`：右侧固定 Inbox / Timer / ClipboardPaste / Search；暂存有内容选中、条数放无障碍名称与弹窗标题，空也可打开；四个公共 compact 图标按钮，只有 Timer 受原生环境支持条件限制。
- `excerpts/components/ExcerptStashPanel.tsx`：顶部增加「粘贴到暂存区」，补充空状态；保持限高滚动、正文点击编辑、垃圾桶删除、250ms 长按排序及拖拽锁滚动。
- `excerpts/services/excerpt-stash-service.ts`（新增，48 行）：粘贴一次读取并前后核验账号代次；合并先保存摘录，再清理快照，区分 duplicate、saved 和 cleanupFailed。
- `excerpts/data/excerpt-stash.repository.ts`：新增 `removeMerged`，一个事务按 owner_key/client_id/content_hash 删除快照中的未修改条目；保存期间新增或已修改条目保留。没有表结构迁移。
- `excerpts/hooks/useExcerptStash.ts`：暂存列表以 ownerKey 存快照、查询序号阻止旧查询覆盖新结果；焦点订阅失效后不发布迟到结果。
- `excerpts/components/ExcerptSessionDialog.tsx`、`services/excerpt-session-notifications.ts`：新能力说明明确点通知直接保存本机；通知正文改为「复制内容后点通知，直接摘录并返回原应用」。旧能力的应用内降级说明保留。
- `excerpts/components/ExcerptFormDialog.tsx`：更新职责注释，移除捕获表单描述；已有「条目间换行」主题开关继续使用，默认开为单换行，关直接拼接。

### src/core / src/shared

无代码改动。复用数据库资源、诊断枚举入口、系统通知发卡、共享主题和公共 IconButton/AppButton/AppModal。已核对系统通知 service 与负责说明，未修改待办行为。

### modules

- `irisnote-system/android/src/main/java/expo/modules/irisnotesystem/excerpt/ExcerptSessionNotifications.kt`：通知动作从「保存剪贴板」改为「摘录剪贴板」。独立 immutable Activity PendingIntent、宿主可解析/可加载守卫、停止广播、HIGH 静默渠道及到期撤卡保持原链路。
- 原生 Activity 与桥接 API 无改动；JS 退出使用 `finishExcerptCapture(captureId, false)`，成功反馈已经在 Surface 显示，因此不调用旧的原生成功 Toast。

### tests

- `tests/excerpts/excerpt-capture.test.cjs`：直接保存 paste、并发/重复调用一次读取与写入、受理后退出仍完成保存、失效与账号换代阻止新写入、失败后新窗口重试、所有 skip 分支、仓库并发重复与反馈文案；更新通知按钮及捕获无表单的入口约束。
- `tests/excerpts/excerpt-capture-screen.test.cjs`（新增，134 行）：实际执行 TSX Screen 的 Effect，模拟宿主边界；验证 StrictMode 重挂仅一次任务、成功只在写入完成后、关闭时机、处理中卸载保留租约到完成、不发布迟到反馈、不关闭其他窗口、初始化时卸载释放资源、错误保持 2 秒并清理计时器。测试不代表 Android 布局或焦点真机验收。
- `tests/excerpts/excerpt-stash.test.cjs`：增加应用内粘贴一次读取/重复/空内容/账号切换，合并快照清理保留新增及修改内容，保存失败或重复不清暂存，清理失败返回已保存状态。沿用原有 merge、排序事务回滚及隔离测试。

### docs

- `docs/UI/IRisNote视觉设计规范.md`：先更新工具栏、透明反馈、应用内暂存区、文案和焦点边界，再动代码。
- `docs/架构指南/系统通知模块负责说明.md`：重写 B 档调用链、反馈、资源退出与暂存入口迁移；明确本次原生编译环境限制。
- `docs/架构指南/业务模块与运行逻辑.md`：替换捕获窗暂存留窗描述，记录直接捕获、应用内粘贴暂存及快照合并清理。
- `CHANGELOG.md` 与本日志：记录实际改动和验证。

## 与原行为对比及原因

1. 原来点通知后仍需暂存或进入表单保存；现在有效新文字直接写本机摘录，再显示「已将剪贴板摘录完成」约 1 秒。点击通知是明确的摘录动作，用户在摘录页统一整理，减少跨应用操作步骤。
2. 原来捕获 Surface 挂 DraftDialog/AppModal、多面板与表单；现在仅透明 Activity 内的小胶囊反馈，不创建第二个抢焦点窗口。正文只读一次，写入成功前没有成功反馈，失败不误报完成。
3. 原来暂存内容通过正文大卡及捕获窗管理；现在统一右上角 Inbox，空时仍可进入。移除捕获窗后原本失去唯一新增暂存入口，因此补上弹窗「粘贴到暂存区」；不额外增加主工具栏按钮。
4. 原来合并完成清空该账号全部暂存；现在只删除本次合并快照中未修改条目，保留期间新增/编辑内容。清理失败单独提示已保存，避免把已提交摘录当失败重试。
5. 原来工具栏顺序为 Timer/Search/Paste；现在按用户最终确定为 Inbox/Timer/Paste/Search。尺寸与主题沿用公共规范。
6. 上一版已经完成默认开启的单换行开关，本次不反转、不恢复空行，不新增合并开关实现；沿用主题胶囊 Switch 与常驻副文案。

## 完整调用链与边界

```text
Timer → 会话弹窗选时长 → 权限检查 → SQLite 会话偏好 → postStateCard → 原生 HIGH 静默倒计时卡
复制 → 点卡主体/摘录剪贴板 → 显式 Activity PendingIntent → 独立透明 HostActivity
 → 捕获 Surface → 数据库租约 → createExcerptCapture → controller.capture（缓存一次 Promise）
 → 会话/账号/当前原生窗口/停止标记校验 → 仓库 activate
 → detectClipboard → 最多 5 秒焦点等待 → hasText → 复核 → readText 一次
 → 规范化/20000 字上限/本应用写入/已保存/已暂存判断
 → 有效新文字 → 再查会话和代次 → saveDetectedOffer(paste) → SQLite 保存事务 → 快照/Store
 → 清相同内存候选 → 成功 1 秒/中性 1 秒/错误超限 2 秒 → 主题淡出 → 身份校验关闭 → 原应用

摘录页 → Inbox → SQLite 当前 ownerKey 暂存列表 → 标准暂存弹窗
 → 粘贴到暂存区 → 前后代次校验 → 剪贴板读一次 → add 事务 → 刷新/2 秒提示且不关窗
 → 编辑/删除/清空 → 仓库 → 刷新
 → 长按拖拽 → 锁滚动、显示换位 → 松手 reorder 事务 → 刷新/失败恢复
 → 合并 → 固定快照 → 默认单换行或关闭直接拼接 → 共享表单确认
 → 保存一条 manual 摘录 → removeMerged 未改快照 → 刷新/成功关闭
 → 重复或保存失败保留；清理失败显示已保存并回暂存列表
```

捕获 Surface 不挂主路由、AuthProvider、同步或待办 providers；本机令牌和缓存用户只用于身份核验。热启动共用 runtime，主应用现有 providers 按原生命周期运行。捕获自身不发网络请求，摘录和暂存均仅本机，API、表结构和权限不变。

主应用自动检测仍遵循唯一入口和捕获窗口让出规则：摘录页检测卡/其他页去摘录横幅，用户确认后保存 manual；不会因为本次通知行为调整而自行保存。停止、到期、通知权限拒绝后的应用内降级、账户隔离保持原链路；受理后写入固定原账号，窗口退出不回滚已经受理的事务，资源租约持有至处理结束。

## 验证

- 修改前 `npm run typecheck`：通过，无基线类型错误。
- 修改后类型检查和摘录定向测试：通过。
- 最终获准环境 `npm run check`：通过，693 项测试中 691 通过、2 跳过、0 失败；类型、lint、theme:check 通过。Lint 仅有既有 PermissionSettingsScreen.tsx 的 liveUpdateCapable 未使用变量警告。沙箱内四个测试文件受本地监听/子进程 EPERM 限制（COS、release source、system notifications、todo API），直接复现原因后在获准环境完整复核；最终关闭按钮/列表收缩调整后再次完整检查通过。
- `git diff --check`：通过。
- 尝试 `npm run gradle -- :irisnote-system:compileReleaseKotlin --offline`：未完成，当前环境无 JAVA_HOME/java（常见 JDK/SDK 目录亦不存在）；这不是 Kotlin 编译通过。
- APK 构建、安装、合并 Manifest 检查、透明程度/冷热启动焦点/返回原应用/反馈动画/拖拽手感/窄屏工具栏真机 dp 实测：未执行，待新原生安装包真机验收。
