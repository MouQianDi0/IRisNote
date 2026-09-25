# 修复：退后台动态卡全撤（handoff/persist 原生调用稳定抛错）

- 日期：2026-09-26
- 基点：合并 `f2e84e8` 工作区（兼容档改动后）→ 结果：本工作区改动（待提交）
- 关联：`docs/logs/2026-09-26-live-update-compat-tier.md`；CHANGELOG 2026-09-26 条目

## 一、症状与复现

真机（3B15AL01DR100000，Android 16 / API 36，staging 包）实测：前台发卡正常（逐条卡 + 聚合卡 7002），按 HOME 退后台 **数秒内全部动态卡被撤除**。稳定复现（03:40、03:53、04:02 三次）。

诊断日志（用户导出 `Download/irisnoteLog/`）证据：

- `handoff_failed {cards:4, error:"Error"}` 恰在退后台瞬间；
- `timeline_persist_failed` 在前台每次刷新也稳定失败 → 与前后台无关，是该原生调用本身必抛；
- 初版日志无异常消息，临时在两个 catch 增加脱敏 `message` 字段后复现，拿到根因：

```
[scheduleLiveTodoCards] Cannot convert '[object Object],…' to a Kotlin type.
Value is null, expected an Object
```

## 二、根因

`IrisNoteSystemModule` 的 `scheduleLiveTodoCards` / `updateLiveTodoCards` 签名为
`List<Map<String, Any?>>`（后改单 Map 包装仍失败）：**Expo Modules 无法把 JS 的嵌套对象数组转换为 Kotlin 泛型集合参数**，参数转换在进入函数体前抛错，Promise reject，协调器 `handoff()` 按失败分支清场撤卡。

此前"聚合卡在退后台保留"的观察是假阳性：当时旧待办已全部结束、时间线为空，走 `handoff_completed {cards:0}` 分支（等价取消原生接管），未触发转换路径。09-25 合并带入的聚合卡代码在真机上 handoff 从未成功过。

## 三、修复

- **owner**：模块边界入参协议（`modules/irisnote-system` + JS 调用方）。
- Kotlin：两入口改为 `payload: String`（JSON），`parseLiveTodoCards(String)` 用 `org.json.JSONArray` 解析；解析逻辑抽为 `LiveTodoTimelineCard.fromJson(obj)`，与 `LiveTodoTimelineStore.load()` 共用（load 对单卡损坏保持 mapNotNull 容错），字段常量提升为文件级 `private const`，消除两份解析。
- JS：`handoffLiveTodoTimelines` / `persistLiveTodoTimelines` 改传 `JSON.stringify(timelines)`；`index.ts` 签名改 `payload: string`。
- 诊断（保留的长期改进）：`handoff_failed` / `timeline_persist_failed` 增加脱敏截断的 `message` 字段（`sanitizeText(cause.message)`，导出为 `sanitizeText`）。
- 测试：compat 档测试断言 handoff payload 为 JSON 且可解析；typecheck 通过；49/49 通过；`:irisnote-system:compileReleaseKotlin` 通过。

## 四、验证

- 真机：安装修复包后，前台发卡 → HOME 退后台，**3 分钟内 6 次采样（04:19:55–04:22:28）聚合卡 7002 + 逐条卡 461120706/1701687033 持续存在、零撤回**，期间应用始终不在前台（原生闹钟链接管）。
- 修复前同场景 8 秒内全撤——前后对照成立。
- `npm run check` 全量、退后台跨场景切换（near→active→ended）长时观察、26–35 兼容档真机：**未执行/待验**。

## 五、经验

- 诊断 `error` 只记类别不记消息，导致第一轮无法定位；异常消息（框架/原生层，不含待办正文）经脱敏截断后入库是合理改进。
- 真机行为验证不能只看"卡在不在"：空时间线的 `handoff_completed {cards:0}` 会伪装成成功。
