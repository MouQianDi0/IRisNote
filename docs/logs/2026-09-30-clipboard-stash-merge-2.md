# 快速摘录暂存流程与暂存区 UI v4

记录时间：2026-09-30 04:17:18 +08:00（2026-09-29 20:17:18 UTC）。对比基点：`f0416835cbeb9f4856431253d7e28d9a2f3c995f`（远端复核提交快进后的 HEAD）；逐项核对 `git diff` 后记录。

## 改动清单（按层）

- `src/features/excerpts/screens/ExcerptCaptureScreen.tsx`：暂存后清除候选、刷新暂存数、停留在无新内容面板；2 秒提示及定时器卸载清理；移除 650ms 关窗和暂存区左上返回图标。
- `src/features/excerpts/screens/ExcerptsScreen.tsx`：暂存排序改传完整 clientId 顺序，并把操作成功/失败回传面板以支持回滚。
- `src/features/excerpts/components/ExcerptStashPanel.tsx`：320dp 滚动列表、整行编辑、44dp destructive 垃圾桶；250ms 长按拖拽与抬起动画，半高阈值换位，拖拽时锁定滚动，松手提交一次排序；手势取消时恢复旧顺序。
- `src/features/excerpts/components/ExcerptFormDialog.tsx`：仅合并表单展示「条目间换行」主题色原生 Switch 与常驻副文案，切换重生成正文。
- `src/features/excerpts/services/excerpt-capture-controller.ts`：捕获窗排序入口从逐条 move 改为 `reorderStash`，继续校验会话账号。
- `src/features/excerpts/data/excerpt-stash.repository.ts`：新增 `reorder(ownerKey, orderedClientIds)`；在单个 SQLite 事务内核对完整排列并重写 `local_order`，拒绝缺失、重复、跨账号 ID。
- `src/features/excerpts/domain/excerpt-stash-drag.ts`：新增 8 行纯拖拽落点算法，按各条目中心判断多条跨越。
- `src/features/excerpts/domain/excerpt-stash-merge.ts`：开关开时用单换行，关时不用分隔符。
- `src/core`、`src/shared`、`modules/`：没有修改。
- `tests/excerpts/excerpt-stash.test.cjs`：覆盖新分隔语义、半高拖拽阈值、跨多条重排、无效排列拒绝和事务中途失败回滚。
- `tests/excerpts/excerpt-capture.test.cjs`：覆盖重复暂存消耗候选、刷新不重读剪贴板，以及暂存处理器不关窗的源码契约。
- `tests/releases/source.test.cjs`：将中文长文件名夹具缩至单段文件名合法字节数；仍覆盖 Unicode 归档。
- `docs/UI/IRisNote视觉设计规范.md`、`docs/架构指南/业务模块与运行逻辑.md`：同步当前捕获、暂存、合并 UI 与数据链路。
- `docs/logs/2026-09-30-clipboard-stash-merge-2.md`：新增 41 行全链路记录；`CHANGELOG.md`：新增顶部条目。

## 与原代码对比及原因

1. 原来点「暂存」显示提示 650ms 后关闭透明窗口；现在成功或重复均清候选、留窗显示「没有需要保存的新内容」，顶部提示 2 秒后消失。这样用户可继续查看暂存区，不再被迫重新点通知；只更新本地状态与暂存列表，不再读剪贴板。
2. 原来暂存区 360dp 列表每条有上移、下移、编辑、删除文字按钮；现在限高 320dp，整行点击编辑、右侧 44dp 垃圾桶删除，长按约 250ms 拖拽。排序期间视觉实时换位，松手只写一次事务，失败恢复旧顺序；旧 `move` 留在仓储供原有测试，不再由 UI 调用。捕获窗标题左侧旧箭头移除，底部「返回」继续回主面板。
3. 原来合并开写两个换行、关写一个换行，默认开且 UI 是「条目间空行分隔 开/关」文字触区；现在默认开写一个换行、关直接拼接，UI 是主题色 Switch 与常驻「关闭后条目将直接拼接」。默认开这个布尔值不变，分隔语义明确反转；两处入口打开合并表单时仍重置为开。
4. 原来发布归档测试构造的中文文件名超过文件系统单段长度；现在夹具仍保留长 Unicode 路径但合法。待办迁移测试的 0020 版本断言已由基点 `f041683` 修正，本次未改待办文件或业务代码。

## 完整调用链路

透明捕获窗「暂存」→ `ExcerptCaptureController.stash` 校验会话和 owner → `ExcerptStashRepository.add` 写本机 SQLite（重复哈希返回 duplicate）→ controller 清内存 offer/消费标记 → 画面本地切为 skip/stashed → `listStash` 刷新数量 → 顶部 2 秒提示；刷新失败保留已暂存结果并显示错误。此链路不发 API、不上传、不重读剪贴板；关闭只由现有关闭/返回动作触发。

摘录页或捕获窗打开共用暂存面板 → 点击行进既有编辑表单，垃圾桶删本机暂存 → 长按进入手势、在 UI 线程更新位置和抬起动画 → 越过相邻中心阈值时在 JS 更新显示顺序 → 松手把完整 ID 排列传给对应屏幕/控制器 → 仓储校验账号并在一个事务中重写 `local_order` → 刷新 SQLite 列表；失败则事务回滚、显示错误并恢复旧显示顺序。拖拽时禁用列表滚动。

合并入口默认开 → `mergeStashContents(items, true)` 用 `\n` 生成正文 → 合并表单 Switch 切换时从暂存条目重新生成正文（关为 `""`）→ 仍走既有摘录本机保存/重复校验路径，成功后清空暂存；没有表结构、权限、通知或服务端接口改动。

## 验证情况

- 修改前后 `npm run typecheck`：通过；`node --test tests/excerpts/excerpt-stash.test.cjs tests/excerpts/excerpt-capture.test.cjs`：通过。
- `npm run check`：获准环境通过，测试 682 通过、2 跳过、0 失败；类型、Lint、主题检查通过。Lint 仍报告设置页既有未使用变量警告。沙箱初次执行遇到本地监听和子进程 EPERM，已在获准环境重跑通过。
- `git diff --check`：通过。Android APK 构建、透明捕获窗口暂存留窗与拖拽手感真机验收：未执行。
