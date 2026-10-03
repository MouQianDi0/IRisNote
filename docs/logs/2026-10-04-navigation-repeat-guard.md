# 页面选项重复入栈修复

- 时间：2026-10-04 00:15:09（Asia/Shanghai）。
- 后续调整：2026-10-04 00:22:46（Asia/Shanghai），用户反馈延迟并再次确认取消 100ms 前置等待；本文按最终代码更新，初次验证记录单独保留。
- 授权：用户确认本轮七个页面接入现有防重复导航、补充测试及记录日志的方案后执行。
- 基点：`79af0e1ea55b1dcc73a4ef2960a31b6475aef680`。修改前七个业务文件与 HEAD 一致，工作区已有 AGENTS.md、CHANGELOG.md 修改，原样保留。
- 结果：当前未提交工作区；通过 `git diff 79af0e1ea55b1dcc73a4ef2960a31b6475aef680 -- src/features` 实测核对改前及改后行为。尚无结果提交，未虚构提交间比较或执行 Git 提交。
- 公共 Hook 在第二轮修改前与同一基点一致，通过 `git diff 79af0e1ea55b1dcc73a4ef2960a31b6475aef680 -- src/core/navigation/hooks/useDebouncedNavigation.ts` 核对 100ms 延迟的移除；第二轮未再修改七个业务页面。

## 一、改动清单（按层）

### src/features

以下七个页面均在组件顶层、条件返回之前调用一次 `useDebouncedNavigation`，同页各入口共享该实例。

- `src/features/settings/screens/SettingsScreen.tsx`：替换七处直接入栈，覆盖个人资料、权限设置、同步与备份、数据与存储、帮助与反馈、关于、开发者选项。
- `src/features/settings/screens/CloudStorageSettingsScreen.tsx`：同步队列入口接入防重复导航。
- `src/features/settings/screens/PermissionSettingsScreen.tsx`：管理云存储入口接入防重复导航；系统授权开关及权限恢复逻辑未变。
- `src/features/settings/screens/DeveloperOptionsScreen.tsx`：诊断日志入口接入防重复导航；原开发者模式门控和通知测试逻辑未变。
- `src/features/profile/screens/ProfileScreen.tsx`：四处直接入栈替换，涵盖个人资料、笔记/星标/草稿共用跳转、继续阅读和垃圾桶；继续阅读的笔记 ID 参数保持不变。
- `src/features/profile/screens/PersonalInfoScreen.tsx`：用户名、地区、简介、邮箱、密码、平台绑定六个入口接入防重复导航。
- `src/features/sync/screens/SyncQueueScreen.tsx`：管理云存储授权入口接入防重复导航；原返回锁及队列业务逻辑未变。

### src/core

- `src/core/navigation/hooks/useDebouncedNavigation.ts`：删除前置 100ms 计时器及其清理；当前路径判断提前，同步加锁后立即调用 `router.push`；保留 500ms 解锁和卸载清理，同步异常时释放锁并重新抛出错误。
- 影响所有现有使用方，包括本轮七个页面，以及 `NotesScreen`、`note-collection-screen`、`drafts-screen`、`CategoryBar` 和 `FloatingActionButton`，这些已有入口也不再等待 100ms。

### src/shared → modules

无文件修改；没有新增原生桥接、系统通知权限或双端镜像逻辑。

### tests

- `tests/navigation/debounced-navigation.test.cjs`：新增文件最终 118 行、七项导航行为测试。第二轮将等待后的断言改为不推进计时器就验证跳转，保留连点、参数、重渲染、返回、当前路径及卸载覆盖，将已不适用的延迟取消用例替换为同步异常释放锁和重试。复用已有 `tests/editor/history-test-host.cjs` 加载真实 Hook，注入路由端口及可控计时器；测试不等同于原生路由栈或真机动画验证。

### docs

- `docs/logs/2026-10-04-navigation-repeat-guard.md`：新增本次全链路记录。
- 根目录 `CHANGELOG.md`：顶部追加本次修复记录，保留历史及原工作区修改。

## 二、与原代码对比

1. 原来：上述 21 处调用直接执行 `router.push`，每次点击均可能请求入栈；现在：通过每页共享的 Hook，同步锁定后过滤后续连点。
2. 原来：七个页面内不同选项之间没有共用的导航锁；现在：快速交替点击时，只接受本次锁定周期的首次选择。
3. 首轮接入后：首次选择等待 100ms 后入栈，入栈后 500ms 解锁；第二轮最终行为：取消前置等待，首次选择在同一调用中立即导航，成功后仍 500ms 解锁。来源组件卸载清理解锁计时器。
4. 公共 Hook 原来：`router.push` 抛错会跳过解锁计时器注册，锁可能一直保持；现在：同步错误先释放锁，再交还调用方处理，后续允许重试。
5. 保持：目的路径、路由参数、登录及开发者模式门控、返回/替换路由、业务操作和页面视觉。没有默认值或开关语义反转。

## 三、改动原因与取舍

- 设置和资料选项等入口遗漏了项目已有导航防重复机制，快速点击时存在重复入栈路径，表现与用户报告的相同上拉页面叠加一致；本轮未真机复现。
- 在触发层接入已有 Hook，避免改动每个目的页面或依赖弹层绘制后再去重。每页只创建一把锁，兼顾同选项连点和不同选项竞争。
- 首轮沿用的 100ms 等待引发用户反馈；防止连点所需的同步锁不依赖前置等待，因此在公共 Hook 取消延迟，所有使用方统一首次立即执行。保留 500ms 锁定窗口，不更改根路由动画；它只约束同一 Hook 实例的后续点击，不阻塞目的页面首次显示。
- 跳转改为同步调用后，失败仍重新抛出原错误，同时复位导航锁，避免异常导致后续重试永久受阻；此处不写业务数据，无需实体回滚。
- 第一轮覆盖用户确认的七个页面入口，第二轮影响所有使用该公共 Hook 的入口；其他直接导航的原生通知、横幅、长按调用未修改。

## 四、完整调用链路与数据影响

```text
页面选项 Pressable/ListRow.onPress
  → 当前页面唯一的 navigate 实例（useDebouncedNavigation）
  → 已锁定/重复请求：直接返回，不入栈
  → 目标路径等于当前路径：直接返回，不加锁
  → 同步设置 lockRef 与 pendingRouteKeyRef
  → 立即 router.push(原始路由与参数)
      ├─ 同步抛错：释放锁，重新抛出原错误，允许后续重试
      └─ 调用成功 → expo-router 根 Stack → 目标页面
          → 500ms 后释放来源页面的导航锁
来源组件卸载 → effect cleanup → 清理解锁计时器
```

- 普通用户页面、开发者页面原有显示及授权分支保留；Hook 在这些条件返回之前无条件调用。
- 本轮新增逻辑只经过 UI → 导航 Hook → Router，不经过业务 Store、SQLite repository、同步协调器或 HTTP API。目标页面原有查询与加载不在本轮改动之内。
- 没有改动用户输入、实体持久化或云请求，因此未新增数据回滚、上传重试或离线降级分支；原业务的数据保留和云授权门控继续生效。
- 返回及重新打开沿用原路由行为；对重渲染期间保持锁定、解锁返回后再次打开已做端口测试。
- 单次锁定为既有固定时间窗，不声称新增全局导航互斥、转场事件同步或处理所有导航异常。

## 五、验证情况

### 第一轮（接入页面选项，后续调整前）

- 修改前 `npm run typecheck`：通过，无既有类型错误。
- `node --test tests/navigation/debounced-navigation.test.cjs`：七项通过，零失败。
- `git diff --check`：通过；Git 仅提示既有文档的 LF/CRLF 转换信息。
- 受影响业务文件及新增测试的 Git 冲突标记扫描：无匹配。
- 修改后 `npm run check`：退出码 0；其中 `npm run typecheck`、`npm run theme:check` 通过，`npm test` 共 797 项通过、零失败、零跳过。
- `npm run lint`：零错误、一条警告，`PermissionSettingsScreen.tsx:173` 的 `liveUpdateCapable` 未使用；经 `git show HEAD:src/features/settings/screens/PermissionSettingsScreen.tsx` 核实改前已存在，本次仅增加导航 Hook 导入、调用及替换跳转，没有引入该警告。
- Android 打包、模拟器及真机连续点击验证：未执行。

### 第二轮（首次立即导航，最终代码）

- 修改前 `npm run typecheck`：通过。
- `node --test tests/navigation/debounced-navigation.test.cjs`：七项通过，零失败。
- 修改后重新执行 `npm run check`：退出码 0，类型和主题检查通过；797 项测试全部通过，零失败、零跳过；Lint 零错误，仍只有第一轮已确认的 `liveUpdateCapable` 未使用警告。
- 最终代码 `git diff --check` 通过，受影响文件冲突标记扫描无匹配；原有页面接入及无关工作区修改保留，未创建提交。
- Android 打包、模拟器及真机连续点击验证：未执行。
