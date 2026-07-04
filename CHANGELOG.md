# CHANGELOG

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
