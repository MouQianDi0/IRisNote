# CHANGELOG

---

## 2026-07-04 16:06:19 | 新增功能

- **新增笔记列表滚动时隐藏 FloatingMenu**
    - 新增跨组件菜单显示状态通知，笔记页滚动时发布隐藏状态，滚动停止后恢复显示
    - `FloatingMenu` 订阅隐藏状态，并使用 Reanimated `withTiming` 控制整体向屏幕右侧滑出/滑回
    - 在笔记页 `FlatList` 的 `onScroll` 中加入 180ms 停止滚动防抖，覆盖拖拽滚动和惯性滚动场景
    - 页面卸载时清理恢复定时器并强制显示菜单，避免菜单状态残留

- **修改文件列表**
    - `src/data/floatingMenuVisibility.ts` - 新增 FloatingMenu 隐藏/显示状态通知模块
    - `src/components/FloatingMenu.tsx` - 新增菜单横向滑出/滑回动画和状态订阅
    - `src/app/(tabs)/note/index.tsx` - 在笔记列表滚动时触发菜单隐藏，停止滚动后恢复
    - `CHANGELOG.md` - 记录本次新增功能变更

---

## 2026-07-04 15:39:59 | 优化代码

- **优化笔记列表渲染性能**
    - 将 `filteredNotes` 改为 `useMemo`，避免滚动按钮、弹窗等无关状态变化时重复过滤笔记数组
    - 新增 `NoteListItem` 并使用 `memo` 包裹，减少父组件状态变化导致的笔记卡片重复渲染
    - 将删除、刷新、滚动到顶部、`renderItem`、`keyExtractor` 等回调改为稳定引用，降低 FlatList 内部重复更新成本
    - 固定列表头部、空态和内容容器样式对象，减少 FlatList 子节点重复创建
    - 为 FlatList 增加 `initialNumToRender`、`maxToRenderPerBatch`、`updateCellsBatchingPeriod`、`windowSize`、`removeClippedSubviews` 等批量渲染约束
    - 新增 `showScrollTopRef`，仅在滚动阈值状态变化时更新 `showScrollTop`，避免滚动中重复触发 state 更新

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 优化笔记列表过滤、渲染、滚动状态与 FlatList 批量渲染参数
    - `CHANGELOG.md` - 记录本次优化变更

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
