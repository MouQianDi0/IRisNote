# 暂存条目拖拽松手只回位一次

- 基点：`2c45be979a4ab2ad31daafeeb5697b611c3e1822`，分支 `kroos_todo`，修改前工作区干净。
- 依据：实际 `git diff 2c45be9 -- src/features/excerpts/components/ExcerptStashPanel.tsx`；用户要求现有暂存列表回弹一次即可，作为已确认列表方案的局部动画修正，先说明方案并同步 UI 规范。

## 改动清单（按层）与原因

- `src/features/excerpts/components/ExcerptStashPanel.tsx`：位移回位由 `withSpring(0, { damping: 20, stiffness: 220 })` 改为 `withTiming(0, { duration: 180 })`，删除失去引用的 withSpring 导入。原来弹簧可能在目标附近多次衰减振荡，现在单次平滑回到零位移即停止，响应用户减少回弹的要求。
- `src/core`、`src/shared`、`modules`、`tests`：无改动。本次仅回位曲线替换，不新增镜像实现、接口、权限、库表或依赖；复用现有交互及仓储测试，不添加只检查参数的实现镜像测试。
- `docs/UI/IRisNote视觉设计规范.md`：规定松手 180ms 单次平滑回位，到位停止。
- `CHANGELOG.md`、本日志：记录差异、链路及验证；本日志为新增 27 行。

## 完整链路与边界

长按 250ms → Gesture.Pan.onStart 激活并抬起 → onUpdate 跟手移动/半高阈值交换 → onFinalize 通过 active 守卫只结算一次 → liftProgress 用原有 120ms 缩放/阴影收起 → visualY 单次 180ms 回到零 → scheduleOnRN(onDrop) → 面板 drop → ExcerptsScreen 操作锁与账号校验 → 仓储 reorder 一次 SQLite 事务写 local_order → Hook 刷新列表。取消或写入失败仍恢复原顺序。

只有 UI 线程位移回位曲线改变；位置交换、事务次数、编辑行为、返回原顺序及抬起视觉保持原逻辑。没有 HTTP 请求、云同步或原生模块修改。

静态检查确认原位移回位用了欠阻尼弹簧；本机没有复现真机动画，不能据此排除真机布局或手势的其他问题。新配置不使用弹簧往返振荡；主观手感与实际落位需真机验收。

## 验证

- 修改前 `npm run typecheck`：通过。
- 修改后获准环境 `npm run check`：通过，709 项、707 通过、2 跳过、0 失败；仅既有设置页 Lint 未使用变量警告。
- `node tests/excerpts/excerpt-stash-panel.test.cjs`：7/7 通过（组件回调边界，不代替真机动画验证）。
- `git diff --check`：通过。
- APK 构建、真机动画/手势/滚动验收：未执行。
