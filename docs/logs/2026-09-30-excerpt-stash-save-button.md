# 暂存多行 Input 保留一个保存按钮

- 基点：`7b061e6e72f1c26a3073012834ac8aad4ead502f`，分支 `kroos_todo`，修改前工作区干净；对比依据为实际 `git diff 7b061e6 -- src/features/excerpts/components/ExcerptStashPanel.tsx tests/excerpts/excerpt-stash-panel.test.cjs`。
- 用户补充要求保留一个 Save 按钮；先说明位置、公共组件规格及验证方案，并同步 UI 规范，再实施。

## 改动清单与原因（按层）

- `src/features/excerpts/components/ExcerptStashPanel.tsx`：原来多行 Input 无尾部操作，现在通过 Input.trailing 加一个公共 IconButton（Save 20dp、标准 48dp 触控区、ghost 默认样式），保存中原位加载并禁用。点击直接复用 finishEditing，补充用户需要的主动保存入口，不创建另一套业务逻辑。
- `src/core`、`src/shared`、`modules`：无改动；复用公共组件和既有仓储，无表结构、API、权限、通知或原生修改。
- `tests/excerpts/excerpt-stash-panel.test.cjs`：将无保存按钮契约更新为仅有 Save、无取消；新增显式保存与失焦同帧去重及加载/禁用回归，组件测试由 12 项增至 13 项。
- `docs/UI/IRisNote视觉设计规范.md`：同步尾部单个 Save 入口与同一保存流程。
- `CHANGELOG.md`、本日志：记录本次局部 UI 补充与实际验证；本日志为新增 26 行，记录保存按钮的局部补充及调用链。

## 完整链路与边界

点击 Save → finishEditing → 正文未改直接恢复预览 / 加入已有保存任务 / 创建一次保存任务 → ExcerptsScreen.runStashAction 的 ready、操作锁与账号代次校验 → ExcerptStashRepository.update → 正文校验、哈希去重与 SQLite 事务更新 → 刷新本机暂存快照 → 成功恢复预览，失败/重复保留输入并重新聚焦。按钮与 onBlur 同帧仍共用一个 Promise。

离开自动保存、关闭等待、最新快照合并、旧 Input 事件守卫、列表同宽和一次 180ms 拖拽回位保持既有实现。只补充显式入口，不添加取消按钮、文字按钮或后端请求；Input.trailing 占用输入框内部空间，外边缘仍与列表对齐。

## 验证

- 修改前 `npm run typecheck`：通过。
- `node tests/excerpts/excerpt-stash-panel.test.cjs`：13/13 通过。
- 最终获准环境 `npm run check`：通过，715 项、713 通过、2 跳过、0 失败；类型、Lint、主题检查通过，仅既有设置页未使用变量警告。
- `git diff --check`：通过。
- APK 构建、真机 Save 点击/加载、键盘及布局宽度验收：未执行。
