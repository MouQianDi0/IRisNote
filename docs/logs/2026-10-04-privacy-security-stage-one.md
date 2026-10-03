# 隐私与安全第一阶段：页面与账户安全入口迁移

- 时间：2026-10-04 02:15:46（Asia/Shanghai）
- 授权：用户在分阶段计划后明确要求“完成第一阶段”。
- 基点：`54c73ef7edecd9cdc6e56e3f256c5cefca737de8`。修改前，本轮涉及的既有代码文件无工作区差异；通过 `git diff 54c73ef7edecd9cdc6e56e3f256c5cefca737de8 -- <本轮文件>` 核对改前与改后，新文件逐项读取核对。结果为未提交工作区，不虚构结果提交 SHA。
- 原有导航组件、morphicons 补丁、测试和日志等未提交改动保留；CHANGELOG 仅前置本轮条目，保留原有历史。

## 改动清单（按层）

### src/features

- `src/features/settings/screens/PrivacySecurityScreen.tsx`：新增 108 行；账户安全页面，包含登录加载、未登录提示、修改密码与脱敏安全邮箱入口，使用现有 UI 组件和底部安全区。
- `src/features/settings/screens/SettingsScreen.tsx`：启用隐私与安全入口，文案改为管理登录密码与安全邮箱。
- `src/features/profile/screens/PersonalInfoScreen.tsx`：移除邮箱和修改密码操作行及对应导入、路由常量；保留平台绑定，将其分组更名为关联账户。头像区域原有脱敏邮箱展示保留。
- `src/features/profile/screens/ChangePasswordScreen.tsx`：指定返回隐私与安全，更新返回按钮无障碍文案。
- `src/features/profile/screens/ChangeEmailScreen.tsx`：指定返回隐私与安全，更新返回按钮无障碍文案。
- `src/features/profile/hooks/useUnsavedLeaveGuard.ts`：新增可选返回目标；指定时使用 `router.dismissTo` 返回栈中目标或替换当前页；未指定时继续历史返回或个人资料兜底。

### src/core / src/shared / modules

本轮无修改，不新增原生依赖、实体字段或数据库迁移。

### src/app（路由组合层）

- `src/app/pages/user/privacy-security.tsx`：新增 1 行，导出功能页面。
- `src/app/_layout.tsx`：注册新路由并隐藏默认导航栏，避免与自定义 PageHeader 重复。
- 原 `profile/password` 与 `profile/email` 路由文件保留，兼容旧链接；新操作入口仅在隐私与安全页面。

### tests

- `tests/profile/unsaved-leave-guard.test.cjs`：新增 138 行，载入真实 Hook，以持久 Hook 状态及模拟导航端口验证 6 项行为：返回栈中目标、旧链接保存后兜底、未保存确认/继续/放弃、提交中阻止离开、系统返回与会话退出、其他资料页原返回逻辑。
- 模拟端口按本地 Expo Router 的 dismissTo 文档语义实现；不将此测试等同于原生导航或真机验证。

### docs

- 本文：记录范围、基点、行为对比、调用链及验证。
- 根目录 `CHANGELOG.md`：前置本轮变更记录。

## 与原代码对比及原因

1. 原隐私与安全为禁用占位项；现可进入只包含已实现账户安全能力的页面，以交付用户确认的第一阶段。
2. 原邮箱与密码操作位于个人资料；现迁至隐私与安全，消除重复操作入口，个人资料中的只读账户识别信息继续保留。
3. 原共用离开保护优先返回历史、无历史时回个人资料；密码/邮箱页现指定隐私与安全目标，避免保存成功或直接链接进入后的标题返回落到旧归属页面。其他资料编辑页不传目标，行为保持原样。
4. 保留原子页面路由及业务 Hook，减少本次迁移对验证码、请求门控、凭据更新与旧链接的影响。
5. 未保存输入仍触发确认，提交中仍拦截离开，登录失效仍允许退出；系统返回/手势仍沿原导航动作处理，正常新入口的上一页为隐私与安全。
6. 默认值/开关：仅将原禁用入口改为可用；没有加入应用锁、后台遮挡、通知隐私或隐私政策占位项，也未改变这些功能的默认行为。

## 完整调用链路

```text
设置 ListRow
  → useDebouncedNavigation
  → /pages/user/privacy-security（根 Stack 隐藏默认标题）
  → PrivacySecurityScreen
      → useAuth：已有上下文中的加载、登录状态与 user.email
      → maskEmail：脱敏显示；进入本页不主动发起业务 API 请求
      → 修改密码 / 安全邮箱 ListRow
          → useDebouncedNavigation
          → 原 profile/password 或 profile/email 路由
          → 原修改页面与 Hook、API
```

密码：`ChangePasswordScreen → usePasswordChange → account-security.api → 统一 HTTP 客户端（认证/云授权门控）→ POST /user/password/change`；重设分支先发送验证码，再 `POST /user/password-reset/confirm`。成功后 `AuthProvider.applyToken → 令牌存储 + 用户缓存 + React 登录上下文 → leaveAfterSave → dismissTo(隐私与安全)`；令牌写入失败沿原逻辑退出并返回欢迎页。请求失败保留输入并显示错误，不假定服务端已回滚，不新增自动重试。

邮箱：`ChangeEmailScreen → useEmailChange → 原邮箱验证码或密码验证 API → 内存一次性凭据 → 新邮箱验证码 API → POST /user/email-change/confirm → AuthProvider.applyUser → 用户缓存 + React 登录上下文 → leaveAfterSave → 隐私与安全显示更新后的脱敏邮箱`。验证过期按原逻辑返回第一步；网络结果未知时沿原 `syncProfile` 核对结果。流程中已有防重复提交引用保持不变。

返回：`PageHeader → guard.goBack → dismissTo(隐私与安全) → usePreventRemove`；未保存时显示原确认弹窗，继续编辑取消待执行动作，放弃则放行原动作；提交中阻止离开。成功保存先允许离开再导航。新页面标题返回使用 `dismissTo(设置)`，直接链接进入时可替换到设置。

本轮入口迁移不读写笔记/待办 SQLite，也不触发其同步。业务仍在既有 profile Hook/API 层；没有新增平台镜像实现。

## 验证情况

- 修改前 `npm run typecheck`：通过，退出码 0。
- `node --test tests/profile/unsaved-leave-guard.test.cjs`：6/6 通过。
- 修改后 `npm run check`：退出码 0；TypeScript、theme:check 通过，815/815 测试通过。Lint 零错误，唯一警告为未改动的 `PermissionSettingsScreen.tsx:173` 中既有 `liveUpdateCapable` 未使用（此前 CHANGELOG 亦有记录）。
- `git diff --check`：通过；仅提示 CHANGELOG 的 LF/CRLF 转换。
- `src`、`tests`、本轮日志及 CHANGELOG 冲突标记扫描：无匹配。
- 入口引用扫描：密码、邮箱入口仅在新隐私与安全页面中引用。
- Android 构建、模拟器/真机、截图视觉验收、真实账户密码和邮箱修改：未执行。
- 未执行 Git 提交、推送、发布。后续提交时本日志需与对应代码一起入库。
