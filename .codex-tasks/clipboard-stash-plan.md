# 任务：剪贴板摘录「编辑后保存」+「暂存合并」完整实施方案

你（Codex）将在 IRisNote 仓库中，按照本文件方案**完整实现全部内容**。本文件是唯一需求来源，所有决策已由用户确认，不要再重新设计或讨价还价。遇到方案与代码现实冲突时，选择对用户可见行为最接近方案的做法，并在最终报告中说明偏差。

## 0. 必读约定

- 开始前先读仓库根目录 `AGENTS.md`（项目规则）。严格遵守其中：TypeScript 明确类型（禁止新增 `any`/`@ts-ignore`）、CHANGELOG 格式、`docs/logs/` 全链路变更日志要求、变更管控流程。
- 本次改动范围限定在：`src/core/database/migrations/`、`src/features/excerpts/**`、`src/features/settings/data/system-preferences.repository.ts`、`tests/excerpts/**`、相关文档。**不改** `modules/`（无原生改动）、不改无关模块、不推送远端。
- 实施基线分支由调用方准备好，你直接在当前检出的分支上工作并提交。

## 1. 背景与目标

现有「动态通知快速摘录」链路（`ExcerptCaptureScreen` 透明窗口）检测到剪贴板新内容后，弹窗只有「忽略/保存」两个动作，保存是直接入库、没有编辑机会。本次改造目标（用户已确认的全部决策）：

1. **删掉「忽略」按钮及整条「已处理标记」逻辑**：点弹窗空白区 / ✕ / 返回键 = 仅关闭弹窗，不写任何持久化标记；未保存未暂存的内容下次仍会提示（这是有意的行为）。
2. **「保存」改为弹出复用的「新建摘录」表单**（`ExcerptFormDialog`），剪贴板全文预填进输入框，用户可编辑后再落库。表现为"自动把剪贴板的字打进去了"。
3. **新增「暂存剪贴板」**：用户可把多条不同文案依次暂存；在**通知弹窗内完成暂存区的全部操作**（查看、排序、单条编辑、删除、清空、合并保存），不必回主应用。
4. **一键保存 = 合并为一条摘录**：暂存条目按顺序拼接成一个文本，经同一个「新建摘录」表单预填、可整体编辑后保存为**一条**摘录，成功后清空暂存。
5. **合并分隔开关**：放在保存表单**输入框下方**，默认开（开 = 条目间空行 `\n\n`，关 = 单换行 `\n`）；切换即按暂存条目重新生成正文，副文案常驻说明"切换将重新生成正文"。该开关**只在合并保存入口显示**。
6. **单条编辑进 v1**：暂存条目可编辑（复用同一表单模组），保存回暂存。
7. **摘录页暂存找回卡片**：会话结束后未合并的暂存要能在主应用找到——摘录页检测卡片/提示条之下、列表之上显示暂存卡片（仅 N>0 时），点开复用同一个暂存面板。
8. **应用内摘录页检测卡片**（`ClipboardDetectedCard`）：删掉「忽略」按钮只留「保存」，点击同样弹预填表单；划掉卡片仅清内存提示。

## 2. 现状事实（已核实，直接采信）

- 捕获窗口：`src/features/excerpts/screens/ExcerptCaptureScreen.tsx`，独立透明原生 Surface，不挂主应用 providers，但通过 `createExcerptCapture`（`services/excerpt-capture.ts`）激活了 `excerptRepository`（ownerKey + generation）。检测走 `ExcerptCaptureController`（`services/excerpt-capture-controller.ts`），`save()` 调 `saveDetectedOffer`（`services/excerpt-service.ts`，source="auto"）直接入库。
- 应用内检测：`hooks/useClipboardDetection.ts` + `screens/ExcerptsScreen.tsx` 的 `ClipboardDetectedCard`（忽略/保存直存）。
- 表单：`components/ExcerptFormDialog.tsx`，新建/编辑共用，只接受 `base: ExcerptEntity | null`，保存走 `excerptRepository.save(ownerKey, clientId, text, "manual", date)`；"已存在相同摘录"用 `banner.show` 提示（透明窗口里 banner 不渲染，需改为表单内提示）。
- 检测域：`domain/clipboard-detection.ts` 的 `evaluateClipboardText` 依据 `isHandled`（handled）与 `savedHashes`（saved）跳过；`domain/clipboard-detection-trigger.ts` 负责触发合并。
- "已处理"链路（本次整体退役）：`services/clipboard-handled.ts`（HMAC + SecureStore）、各处 `markHandled`/`isHandled` 端口、`features/settings/data/system-preferences.repository.ts` 的 `clipboard_last_handled_mark` 与 `clipboard_last_handled_hash`（legacy）键及其清理方法。
- 摘录表约束：`local_excerpts.source` 有 `CHECK(source IN ('paste','auto','manual'))`，**不新增 source 值**；hash 函数复用现有 `hashExcerptContent`。
- 内容上限：单条 20000 字（`EXCERPT_CONTENT_LIMIT`）；`BodyInput` 的 `maxLength` 只拦输入不拦初始预填值，需补超限校验。
- 透明窗口与主应用永不同时可交互（Android 窗口焦点互斥），SQLite 为唯一事实源，界面打开时读取即可，无需跨窗口实时订阅。

## 3. 数据模型（新建迁移 0020）

新文件 `src/core/database/migrations/0020-create-excerpt-stash.ts`，并在 `migrations/index.ts` 登记：

```sql
CREATE TABLE IF NOT EXISTS local_excerpt_stash (
  owner_key   TEXT NOT NULL CHECK(length(owner_key) > 0),
  client_id   TEXT NOT NULL CHECK(length(client_id) = 36),
  content     TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
  local_order INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (owner_key, client_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_local_excerpt_stash_owner_hash
  ON local_excerpt_stash(owner_key, content_hash);
```

- 迁移需可重复执行、考虑旧库升级路径（沿用现有迁移写法与 `DatabaseMigration` 类型）。
- 合并保存产生的摘录 source 记 `"manual"`。
- 暂存与摘录一样仅保存在本机、不同步云端、按 owner_key 账号隔离。

## 4. 检测规则变化

- `clipboard-detection.ts`：`ClipboardDetectionSources` 中 `isHandled` 替换为 `stashedHashes: () => Promise<Set<string>>`（或等效返回集合的端口）；`evaluateClipboardText` 对已在暂存中的内容返回新的 skip 原因（如 `"stashed"`），提示文案归入「没有需要保存的新内容」。
- 捕获控制器与应用内检测的调用点同步传入暂存 hash 集合。
- 删除所有 `markHandled`/`isHandled` 调用与端口；`lastWrittenHash`（排除应用自身写入）保留不动。

## 5. 退役清单（全部删除，不留兼容壳）

| 现有物 | 处置 |
|---|---|
| `services/clipboard-handled.ts` | 整文件删除 |
| `useClipboardDetection.ts` / `excerpt-capture-controller.ts` 的 `ignore()`、`markHandled` 链路 | 删除 |
| `clipboard-detection.ts` 的 `isHandled` 检测源 | 换成 `stashedHashes` |
| `system-preferences.repository.ts` 的 `clipboard_last_handled_mark` / legacy hash 键及 `clearLegacyClipboardHash` | 删除（键只在读取时自然消失，不做数据迁移） |
| 相关测试（跳过原因、ignore 分支） | 同步改写 |

## 6. 表单模组参数化（`ExcerptFormDialog.tsx`）

保持"新建摘录/编辑摘录"现有行为完全不变，新增能力：

- `initialText?: string`：预填初始正文（光标在末尾）。
- `submitText?: (text: string) => Promise<"saved" | "duplicate">` 或等效委托：提供时由调用方决定落库方式（捕获窗保存 / 暂存单条编辑 / 合并保存三处传入各自实现）；不提供时走原有 `base`/新建逻辑。
- `mergeSeparator?: { enabled: boolean; onChange: (on: boolean) => void }` 或等效：仅合并保存入口传入；在**输入框下方**渲染开关行「条目间空行分隔」+ 常驻副文案「切换将按暂存条目重新生成正文」，默认开。切换时由调用方用新分隔符重新生成预填文本（覆盖手动编辑，属预期行为）。
- 超限处理：预填或输入后正文超过 20000 字时，显示字数与「超出上限，请删减」提示并禁用保存。
- 「已存在相同摘录」：当 `banner` 不可用（透明窗口）时在表单内以文字提示；应用内可沿用 banner 或同样表单内提示，二选一保持一致即可。
- 按钮：`[取消→回原界面] [保存]`；取消只是关闭回调，由调用方决定回到哪个界面。

## 7. 暂存仓储与合并纯函数

- 新增 `data/excerpt-stash.repository.ts`：`list(ownerKey)`（按 `local_order` 升序）、`add(ownerKey, content)`（算 hash，插入为最大 order+1；唯一索引冲突时返回"已存在"而非抛裸错）、`move(ownerKey, clientId, direction)`（与相邻条目交换 order）、`update(ownerKey, clientId, content)`（重算 hash，撞 hash 时报"已存在"）、`remove(ownerKey, clientId)`、`clear(ownerKey)`。所有方法沿用现有仓储的 owner/generation 断言风格。
- 新增 `domain/excerpt-stash-merge.ts`：`mergeStashContents(items, separator)` 纯函数——按序以 `"\n\n"`（开）或 `"\n"`（关）拼接；空条目列表返回空串。可独立测试。

## 8. 捕获弹窗（`ExcerptCaptureScreen.tsx`）三状态

**状态 1 · 检测到新内容**

```
┌ 快速摘录 ────────────── ✕ ┐
│ 检测到剪贴板新内容           │
│ （剪贴板预览，最多 3 行）     │
│ 摘录仅保存在本机，暂不同步到云端│
│ 暂存区有 3 条 · 查看          │  ← N>0 时显示
│ [暂存]           [保存]     │
└────────────────────────────┘
```

- 暂存 → 写暂存表 → 短暂提示「已暂存」（重复内容提示「已在暂存中」）→ 关窗（`finishExcerptCapture`，未保存语义）。
- 保存 → 打开表单（预填剪贴板全文）→ 表单保存成功 → 关窗（saved 语义）。
- ✕ / 空白 / 返回键 → 仅关窗，不写任何标记。

**状态 2 · 暂存区**（`ExcerptStashPanel`，点「查看」进入）

```
┌ 暂存区（3 条）────────── ← ┐
│ 1 （内容预览 2 行）           │
│        [上移] [下移] [编辑] [删除]│
│ 2 …                        │
│ [清空]        [合并保存]     │
└────────────────────────────┘
```

- 编辑 → 表单（预填该条正文），保存回暂存（重算 hash，撞 hash 提示）。
- 删除到空 → 自动回状态 1/3 主面板。
- 合并保存 → 表单（预填 `mergeStashContents` 结果 + 分隔开关）→ 保存成功 → 清空暂存 → 关窗（saved 语义）；取消原样回到暂存区，数据一条不动；「已存在相同摘录」在表单内提示且暂存保留。

**状态 3 · 无新内容**

```
┌ 快速摘录 ────────────── ✕ ┐
│ 没有需要保存的新内容         │   （已保存 / 已在暂存都走到这里）
│ 暂存区有 3 条内容            │
│ [返回原应用]  [查看暂存区]    │
└────────────────────────────┘
```

**状态 4 · 表单**：见第 6 节；从主面板取消 → 回主面板；从暂存区取消 → 回暂存区。

## 9. 应用内（主应用）改动

- `ClipboardDetectedCard.tsx`：删「忽略」，只留「保存」，点击弹预填表单（`initialText` = offer.content）。
- `useClipboardDetection.ts`：保存路径改为"取 offer → 表单确认 → 落库（source="manual"）→ 清 offer"；删除 ignore 标记逻辑；卡片消失仅清内存。
- `ExcerptsScreen.tsx`：检测卡片之下、列表之上加**暂存卡片**（仅 N>0）：「暂存区 · N 条未合并」+ 最近一条 2 行预览 + [查看]；点开 DraftDialog 内嵌**同一个** `ExcerptStashPanel`；合并保存同样走带分隔开关的表单；合并/清空后 N=0 卡片消失。数据用轻量 hook（如 `useExcerptStash`）在页面聚焦时从 SQLite 刷新。
- `ExcerptSessionDialog` 等用户可见文案同步：如「点通知可暂存或编辑保存」。

## 10. 新增/修改文件清单（对照用，允许合理的邻近微调）

| 层 | 文件 | 改动 |
|---|---|---|
| core | `migrations/0020-create-excerpt-stash.ts`（新）+ `index.ts` | 建表 + 唯一索引 |
| excerpts/data | `excerpt-stash.repository.ts`（新） | 见第 7 节 |
| excerpts/domain | `excerpt-stash-merge.ts`（新） | 拼接纯函数 |
| excerpts/domain | `clipboard-detection.ts` | `isHandled` → `stashedHashes` |
| excerpts/services | `clipboard-handled.ts` | **删除** |
| excerpts/services | `excerpt-capture-controller.ts` | 删 ignore/markHandled；save 拆"取 offer 预填"+"按最终文本保存"；新增 `stash()` |
| excerpts/services | `excerpt-capture.ts` | 端口增删 |
| excerpts/hooks | `useClipboardDetection.ts` | 见第 9 节 |
| excerpts/components | `ExcerptFormDialog.tsx` | 见第 6 节 |
| excerpts/components | `ExcerptStashPanel.tsx`（新） | 暂存面板（两处复用） |
| excerpts/components | `ClipboardDetectedCard.tsx` | 删忽略 |
| excerpts/screens | `ExcerptCaptureScreen.tsx` | 三状态 + 面板挂载 |
| excerpts/screens | `ExcerptsScreen.tsx` | 暂存卡片 + 表单挂载 |
| settings/data | `system-preferences.repository.ts` | 删已处理键 |
| tests | `tests/excerpts/*.test.cjs` | 见第 12 节 |
| docs | 相关架构文档、`CHANGELOG.md`、`docs/logs/` | 见第 13 节 |

## 11. 执行顺序建议

1. 迁移 0020 + 登记 `migrations/index.ts` → 2. stash 仓储 + merge 纯函数 → 3. 检测域 `stashedHashes` + 退役 `clipboard-handled` → 4. 表单参数化 → 5. 捕获窗三状态 + `ExcerptStashPanel` → 6. 应用内（卡片/页面/会话文案）→ 7. 测试改写与新增 → 8. 文档 + CHANGELOG + logs。

## 12. 测试要求

- 新增：`excerpt-stash-merge` 纯函数（开/关分隔、乱序、空列表）；`excerpt-stash.repository`（沿现有 fake 注入模式：add/move/update/remove/clear/owner 隔离/重复冲突）；controller `stash()` 与"按最终文本保存"路径；检测跳过原因 `stashed`。
- 改写：所有引用 `isHandled`/`ignore`/`markHandled` 的既有测试。
- 测试文件放 `tests/excerpts/`，命名 `*.test.cjs`，用 `node --test` 可运行。

## 13. 文档与记录（仓库硬性要求）

- `CHANGELOG.md`：顶部新增条目，格式严格照现有 `## YYYY-MM-DD HH:MM:SS | 新增功能：…` 五段式（变更概述/修改文件/具体内容/验证），时间用实际时间，未执行的验证如实写。
- `docs/logs/YYYY-MM-DD-clipboard-stash-merge.md`：全链路变更日志——按层改动清单、与原代码对比（基点=当前分支 HEAD，逐点"原来/现在"）、改动原因、完整调用链（UI→Hook/Service→Store→SQLite，标注捕获窗口与应用内两条链路及唯一入口/降级分支）、验证情况。
- 若 `docs/架构指南/` 下有涉及剪贴板摘录/快速摘录的负责说明文档，同步更新到与新代码一致。

## 14. 验证与完成标准

- 依次运行并如实记录：`npm run typecheck`（开始前先跑一次记录既有基线，结束后再跑，不得引入新错误）、`npm run check`（含 lint、theme:check、node --test；如环境导致某项无法执行，如实写明原因，不得谎称通过）。
- 完成标准：第 1–10 节全部落地、退役清单删干净、测试可跑、文档齐备。
- 全部完成后：在当前分支提交（一个或多个语义化 commit，风格参照 `git log`），**不要 push**；最终报告写明：改动文件列表、每条验证命令与真实结果、与方案的偏差点（如有）。

## 15. 边界与禁止

- 不改 `modules/`（Android 原生）、不改 `android/`、不改 CI/构建脚本。
- 不动 Notes/Todos 等无关域；不重构与本次无关的既有代码。
- 不 git push、不建 release、不改远端。
- 遇到无法推进的阻塞（如依赖缺失），停止并在最终输出中说明，不要绕过方案自行发挥。
