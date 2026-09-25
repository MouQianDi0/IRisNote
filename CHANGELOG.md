## 2026-09-26 06:55:00 | 优化代码：待办聚合动态通知设计稿转已实施存档

- 变更概述：docs/架构指南/待办聚合动态通知设计.md 原为「尚未实施」设计稿，口径已过时（倒计时文案、加星重要口径、逐条卡提升规则）；按文档自身约定转为已实施存档，回写最终展示口径、promoted 策略演进（仅聚合卡→全量提升→按 priority=high 提升）与遗留真机确认项，代码现状仍以负责说明为准。
- 修改文件：`docs/架构指南/待办聚合动态通知设计.md`、`CHANGELOG.md`。
- 具体内容：纯文档改动，无代码行为变化。
- 验证：未执行（纯文档改动，按仓库约定豁免 npm run check 与 docs/logs 全链路日志）。

---

## 2026-09-24 12:08:17 | 新增功能：修改邮箱，并修复会话失效时编辑页拦截跳转（B3c 客户端）

- 变更概述：用户确认 B3c 计划与 P05 文字预览，并追加“原身份可用当前密码验证”。个人资料“邮箱”行可进入修改邮箱页：第 1 步用原邮箱验证码或当前密码验证身份，第 2 步验证新邮箱并提交；所有设备保持登录。同时修复 B3a 遗漏：会话失效跳转欢迎页时，编辑页的离开保护不再弹出「放弃修改？」。依赖后端 B3c 接口（与 B3a/B3b 同批上线，需先执行迁移 013）。
- 修改文件：src/features/profile/screens/ChangeEmailScreen.tsx（新增）、src/features/profile/hooks/useEmailChange.ts（新增）、src/app/pages/user/profile/email.tsx（新增）、src/app/_layout.tsx、src/features/profile/screens/PersonalInfoScreen.tsx、src/features/profile/api/account-security.api.ts、src/features/profile/utils/password-errors.ts、src/features/profile/hooks/useUnsavedLeaveGuard.ts、src/features/auth/providers/AuthProvider.tsx、src/shared/http/session-events.ts、src/shared/http/client.ts、tests/profile/password-change.test.cjs、tests/auth/session-rejected.test.cjs、docs/UI/IRisNote视觉设计规范.md、docs/进度与验证/个人资料页面规划与实施计划.md、CHANGELOG.md。
- 具体内容：① 五个修改邮箱接口调用（15 秒超时，保持云授权受控，附设备标识）；② `useEmailChange`：凭据只存于内存引用（不进状态存储、路由参数或日志），本地 10 分钟计时与服务端 `EMAIL_CHANGE_EXPIRED` 均退回第 1 步；提交结果未知时重新读取资料并提示核对；成功以服务端资料 `applyUser`；③ P05 按预览实现：两种验证方式以文字链接切换并清空输入；修改新邮箱后验证码清空、倒计时重置，只有向当前填写的新邮箱发过验证码才可提交；无「上一步」，返回走离开确认；④ 云存储提示改为按操作命名（`cloudRequiredMessage`）；⑤ 会话失效修复：`session-events` 新增同步标记，AuthProvider 退出前开启、重新登录后关闭，`useUnsavedLeaveGuard` 读到标记即放行。
- 验证：修改前后 `npm run typecheck` 均 0 错误；`npm run check` 类型检查、Lint、主题检查通过，测试 509 通过、2 跳过、1 失败（发布归档 ENAMETOOLONG，既有失败，与本次无关），新增 3 项通过；`useEmailChange` 与页面交互无渲染测试，需真机验收。未做真机验收，未提交 Git。

---

## 2026-09-24 11:15:40 | 新增功能：修改密码与已登录重设密码（B3b 客户端）

- 变更概述：用户确认 B3b 计划与 P06 文字预览。个人资料“修改密码”开放，新增修改密码页（当前密码 / 邮箱验证码重设两种模式同页切换）；注册页改用新密码规则。依赖后端迁移 013 与新接口。
- 修改文件：src/shared/utils/password-policy.ts（新增）、src/features/profile/api/account-security.api.ts（新增）、src/features/profile/utils/password-errors.ts（新增）、src/features/profile/hooks/usePasswordChange.ts（新增）、src/features/profile/components/VerificationCodeField.tsx（新增）、src/features/profile/screens/ChangePasswordScreen.tsx（新增）、src/app/pages/user/profile/password.tsx（新增）、src/app/_layout.tsx、src/features/profile/screens/PersonalInfoScreen.tsx、src/features/profile/utils/profile-validation.ts、src/features/profile/hooks/useUnsavedLeaveGuard.ts、src/features/auth/screens/RegisterScreen.tsx、src/shared/http/client.ts、tests/profile/password-change.test.cjs（新增）、docs/UI/IRisNote视觉设计规范.md、docs/进度与验证/个人资料页面规划与实施计划.md、CHANGELOG.md。
- 具体内容：① 新密码规则 6–64 个字符、UTF-8 ≤72 字节（手动按码点计字节，不依赖 TextEncoder），放在 `shared/utils` 供注册与资料共用（计划原写 profile/utils，为避免 auth 依赖 profile 调整位置）；注册页提示改为“6–64 个字符”；② 三个接口调用（15 秒超时，保持云授权受控），重设接口附加设备标识；③ 错误分类：云存储未开启且未发出 → 提示开启；已发出或无响应 → “修改结果未确认”；锁定/限流按服务端等待时间提示（分钟/秒，不重复拼接）；④ 成功以 `applyToken` 换新令牌；新令牌未能保存时主动退出并提示用新密码登录；⑤ P06 按预览实现，云存储关闭时 InlineHint 提示并禁用按钮（文案指向「同步与备份」，比预览中的「设置」更准确）；有输入离开弹出「放弃修改？」；离开保护新增 `allowLeave`；⑥ `maskEmail` 从个人资料页移至 `profile-validation.ts` 共用；个人资料“修改密码”行可点击。
- 验证：修改前后 `npm run typecheck` 均 0 错误；`npm run check` 类型检查、Lint、主题检查通过，测试 506 通过、2 跳过、1 失败（发布归档 ENAMETOOLONG，既有失败，与本次无关），新增 7 项通过。后端迁移 013 未执行、未部署；未做真机验收，未提交 Git。

---
## 2026-09-26 06:40:00 | 优化代码：逐条待办卡按重要度提升，普通事件降级非提升

- 变更概述：逐条待办卡的提升式（上岛）从「全部提升」改为按创建时重要度（`priority=high`）提升，普通事件降级为非提升动态通知；聚合卡「N条重要」计数同步从加星口径改为 priority 口径；聚合卡自身提升不变；60 秒模拟卡保持提升演示。