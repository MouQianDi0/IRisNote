# 可配置差量版本范围

记录时间：2026-10-02 11:53:33（Asia/Shanghai）。用户已确认跨仓库实施，并要求执行前提交已有修改；重新检查时两仓库均干净，无文件可提交，未创建空提交。

## 基点与对比依据

- IRisNote 基点：`042a93e5ab699354200e26b0e0ec040f00b08614`。
- irisapi 基点：`00a0504be635cb82d8b6a23e869f3a38fbc0328d`。
- 对比使用各仓库 `git diff <上述基点> -- <改动文件>`，结果为本次工作区修改，尚未提交。没有合并操作。

## 改动清单（按层）

- src/features：`src/features/updates/release.ts` 增加策略 4 的类型和正安全整数 `deltaWindow` 校验，依范围验证完整包/差量包，屏障识别支持策略 3/4。
- src/features：`src/features/updates/update-store.ts` 在既有 `updatePolicy=3` 查询添加 `deltaWindowPolicy=4` 能力标记，保留单次请求及旧服务端兼容。
- src/core、src/shared、modules：未修改；原生合并、摘要和安装身份校验未修改。
- scripts：`scripts/release/cli.mjs` 移除超过三个基础包即报错的限制，验证 `/bases` 返回数组，并沿原有循环处理服务端选定的全部基础包。
- tests：`tests/releases/releases.test.cjs` 增加策略 4 边界、非法字段、屏障、主版本和摘要拒绝测试；执行真实发布函数验证超过三版的基础包与重试跳过；验证新策略下载、安装、离线强制缓存和旧服务端兼容查询。
- docs：`docs/构建发布/android-releases.md` 说明配置位置、即时影响、旧客户端兼容和发布切换边界；`docs/构建发布/更新说明编写规范.md` 同步差量数量与强制更新独立的规则。
- docs：本文件新增 64 行，负责跨仓库变更追溯；`CHANGELOG.md` 顶部新增本次记录，保留实施期间其他任务追加的 GitHub 发布日志。
- 服务端改动文件：`.env.example`、`src/services/releases.ts`、`src/router/releases.ts`、`tests/releases.test.ts`、`docs/releases.md`、`CHANGELOG.md` 及对应 `docs/logs/2026-10-02-configurable-delta-window.md`，详见服务端日志。

## 与原代码对比及改动原因

1. 原来服务端差量范围固定 3，且同一常量也决定强制更新；现在 `IRIS_RELEASE_DELTA_WINDOW` 控制范围，强制阈值独立保留 3。避免扩大或缩小覆盖数量时意外改变强制更新。
2. 原来 `/bases` 和发布校验通过固定 LIMIT 3 选择历史基础包；现在二者使用同一参数化 LIMIT 与环境配置，防止生成列表和发布要求不一致。
3. 原来 CLI 拒绝超过三个基础包；现在按服务端返回数量生成，依然跳过 `patch_ready`、校验合并输出并允许草稿重试，不由本机再设置第二份范围。
4. 原来客户端只识别策略 2/3，落后超过三版必需完整包；现在策略 4 按 `deltaWindow` 校验。旧策略保留原校验，避免误把缺补丁或摘要不符当成完整包回退。
5. 原来检查只请求策略 3；现在增加能力标记。新版服务端返回策略 4，旧服务端仍按策略 3 响应，避免直接请求未知策略被旧服务端当成无策略请求而丢失强制状态。
6. 服务端对策略 2/3 客户端仍使用三版规则；配置缩小时，超出配置范围但旧客户端仍要求差量的请求查询历史可达版本，按中间版本重算强制状态，无可达版本则给官网下载提示而不新增无法下载的强制要求。

默认值与开关：未配置仍是 3，无默认行为反转；空值不是默认值，非法配置阻止服务启动；不改变云存储授权或完整包屏障开关。

## 完整调用链路

```text
irisapi 启动加载 dotenv → releaseDeltaWindow 校验环境变量
发布 upload / patches → GET /:code/bases（发布令牌认证）
  → 服务端 RELEASE_BASES_SQL + N → 同主版本/已发布历史/屏障过滤
  → CLI 逐个下载基础 APK → HDiffPatch 生成并回合校验 → 上传补丁
发布 publish → 同一 RELEASE_BASES_SQL + N → 检查缺包与文件 → 发布记录
App 启动或手动检查 → update-store → GET /latest?updatePolicy=3&deltaWindowPolicy=4
  → 服务端计算已发布距离、屏障、N → 策略 4 + delivery
  → parseRelease 镜像校验 → Zustand 状态与既有强制更新 AsyncStorage 缓存
  → 下载 → 原生摘要/合并/身份校验 → 保存活动草稿 → 安装器
```

兼容分支：旧服务端返回策略 3；旧客户端继续收到策略 2/3，必要时通过既有历史补丁过渡。基础包列表与发布校验统一入口，客户端和服务端对范围/屏障/强制阈值保持镜像语义。

本地笔记、待办、SQLite 和云同步授权数据不变；更新检查仍沿现有专用 fetch、去重、超时和错误状态链路。网络或下载失败可按原流程重试，草稿保存失败继续阻止跳转安装器。没有修改原生 API。

## 使用边界

在服务端 `.env.local`、`ENV_FILE` 指定文件或进程环境配置，例如 `IRIS_RELEASE_DELTA_WINDOW=5`，重启生效。未写入任何真实环境文件或改变线上数量。

配置是运行时策略：扩大不会给已发布版本补齐历史补丁，窗口内缺补丁仍不可用。配合新草稿发布调整并补齐补丁，不在生成/发布中途改变范围；保留历史 APK 和补丁。旧客户端已缓存的强制要求不会因服务器配置回退立即消失。

## 验证情况

- 修改前：客户端 `npm run typecheck` 与服务端 `npx tsc --noEmit`、`node node_modules/typescript/bin/tsc --noEmit` 通过，无既有类型错误。
- 客户端 `npm run check`：通过；TypeScript、theme:check 与 718/718 测试通过；Lint 0 错误、1 条未改动文件 `PermissionSettingsScreen.tsx:171` 中既有 `liveUpdateCapable` 未使用警告。
- 服务端 `npm run build` 通过；`npm run test:releases` 28/28、`npm run test:installer` 4/4 通过。构建触及已跟踪的旧 `dist/index.js`，已撤回本次构建的无关生成差异。
- 服务端测试严格检查：`node node_modules/typescript/bin/tsc --noEmit --strict --esModuleInterop --target ES2020 --module commonjs --types node --ignoreConfig tests/releases.test.ts` 通过。首次自定义命令遗漏 `--types node` 导致环境类型报错，补齐参数后通过，未修改依赖或放宽类型检查。
- `git diff --check` 通过。冲突标记搜索只发现未改动的 GitHub 团队开发指南中的冲突教学示例，非遗留合并冲突。
- 未执行：真实 PostgreSQL 查询、真实 APK 差量生成/还原、Android 打包和真机更新；未部署、上传或发布版本。
