## 2026-09-23 13:17:39 | 新增功能：0.4.1 版本更新说明

- 变更概述：已获用户确认。按更新说明编写规范对比 0.4.0（构建 16，提交 cda98eb）到 HEAD（c8027a0）的实际差异，范围内仅"关于页版本记录改为服务端拉取"（60bbc6f）一项用户可见改动，c8027a0 为纯测试格式化不计入；判定为补丁更新，建议并确认版本号 0.4.1；生成面向普通用户的中文更新说明并保存。
- 修改文件：releases/notes-0.4.1.txt（新增）、CHANGELOG.md。
- 具体内容：正文含体验优化 1 条（版本记录联网获取、离线降级显示）、问题修复 1 条（新版本"关于"页显示"该版本暂无更新说明"）。0.4.0 基线以 dist/releases/0.4.0/IRisNote-0.4.0-16.apk.json 的 commit 字段为准（cda98eb），工作区干净无未提交改动。
- 发布依赖：该功能依赖 irisapi 后端 GET /api/releases/history 接口，后端须先部署，否则"关于"页进入错误态（可重试、有缓存时降级显示）。纯文档任务未运行 npm run check；未执行 reserve/build/upload/publish 及 Git 提交或推送。

---

## 2026-09-23 04:09:23 | 修复问题：关于页版本记录改为服务端数据源，根治硬编码

- 变更概述：已获用户确认（方案 C）。0.4.0 发布后发现"关于"页版本记录仍读取硬编码数组，本机新版本不在其中时显示"该版本暂无更新说明"。现将版本记录改为从服务端拉取已发布历史，发布流程不再需要同步维护前端硬编码。
- 修改文件：src/features/settings/data/release-history.ts、src/features/settings/screens/AboutScreen.tsx、src/features/settings/hooks/use-release-history.ts（新增）、tests/settings/release-history.test.cjs（新增）、CHANGELOG.md。
- 具体内容：① 删除 RELEASE_HISTORY 硬编码数组及 intro/footer 专属渲染；② release-history.ts 保留类型与 compareVersions，新增 parseReleaseNotes（纯文本说明按标题行 + “- ”列表项解析为分组结构，跳过“IRisNote x.y.z 更新说明”占位标题，散落条目归入“更新内容”）和 parseReleaseHistory（校验服务端列表：条数 1～100、版本号格式、构建号范围、notes 长度 ≤12000、版本去重，提取发布日期；任何非法字段返回 null 走降级）；③ 新增 use-release-history hook：进入页面时拉取 GET /api/releases/history（地址复用 EXPO_PUBLIC_RELEASE_API_URL，去掉尾部 /latest 后拼 /history，未配置时回落 API_BASE_URL），12 秒超时；成功后写入 AsyncStorage 缓存（仅成功数据入库）；失败回退缓存并标记"未能刷新，显示上次内容"；无缓存进入错误态显示重试按钮；使用 useFocusEffect 触发，每次进入页面刷新；④ 本机版本尚未出现在服务端历史时（刚发布的新版本）保留占位条目，行为与旧版一致。
- 验证：npm run typecheck 通过；npm run check 全量通过——typecheck、lint、theme:check 与 448/448 测试（新增 4 项：解析分组/占位标题跳过/散落条目归组、字段校验与去重/日期提取/条数上限、版本比较、断言不再引用 RELEASE_HISTORY）。后端 irisapi 同步新增 /history 接口与测试（见 irisapi 仓库变更）。
- 部署依赖：前端此改动需后端先部署 /api/releases/history 才能正常拉取，否则进入错误态（可重试、有缓存时降级显示）；随下个版本发布生效。未执行构建、发布或推送。

---

## 2026-09-23 03:47:01 | 新增功能：IRisNote 0.4.0 正式发布

- 变更概述：已获用户确认（含 publish 授权）。完成 0.4.0 版本全流程发布：预留 → 构建 → 双端上传 → 差量包 → 核对 → 发布。
- 发布信息：构建号 16，绑定提交 cda98eb（含构建阻断修复）；APK SHA-256 cbd9472605a53aa4fa8fbd8a7a4cdb69e581969638d6e13773f6cc0c8a430b12，大小 126913174 字节，签名证书与 0.3.0 相同（7319b25...）；CDN 地址 https://download.tech-mou.top/IRisNote-0.4.0-16.apk。
- 修改文件：CHANGELOG.md（本记录）。本次发布无新的源码修改，发布内容为 0.4.0 说明所列功能（垃圾桶、我的页面内容管理、数据与存储、同步与备份、权限设置等）。
- 具体内容：① doctor 环境检查通过；② 本机 npm run check 全量通过（444/444）后提交修复 0c68247、cda98eb；③ reserve 分配构建 16 并保存更新说明；④ build 构建成功（Gradle 16m47s），构建环境内检查再次通过、patch-package 自动应用；⑤ 服务器与 COS 上传并通过 SHA-256 双端校验；⑥ 为基础版本 15/13/12 生成并上传差量包（15→16 为 5.3%，13→16 为 18.5%，12→16 为 18.7%），本机实际合并还原校验全部通过；⑦ inspect/status 核对包名、版本、签名、摘要一致；⑧ publish 发布成功，服务端状态 published。
- 验证边界：构建环境类型检查、lint、主题检查与单元测试全部通过；真机安装验收仍未执行（发布期间无连接设备），建议更新推送后在真机核对差量升级与垃圾桶等功能；未推送 Git 远程。

---

## 2026-09-23 03:03:46 | 修复问题：0.4.0 发布前构建阻断项修复

- 变更概述：已获用户确认（含 publish 授权）。发布前 `npm run check` 失败的三个阻断项全部修复，全量检查恢复通过，为 0.4.0 发布扫清构建阻断。
- 修改文件：global.css、tests/navigation/page-seam.test.cjs、CHANGELOG.md（另：本机 node_modules 应用既有补丁，无仓库文件变化）。
- 具体内容：① theme:check 失败：提交 282122d 代码风格重排将 global.css 管理块色值改为小写，与主题预设 default-light.json 大写不一致；逐行比对确认 58 处差异全部为十六进制大小写、语义差异为 0，按项目标准方式 `npm run theme:sync` 重新同步为大写；② page-seam.test.cjs 失败：该测试以固定 className 顺序断言待办页分层结构，同一格式化提交把 border-t/border-r/border-b 排序改变导致断言过时；分层绘制逻辑本身未变，将正则放宽为顺序无关匹配，保留结构锁定能力；③ swipe-tabs.test.cjs 失败：仓库既有补丁 patches/react-native-tab-view+4.3.2.patch（DEAD_ZONE 12→100）未应用到本机 node_modules，执行 `npx patch-package` 应用，无仓库文件修改。
- 验证：修复后 `npm run check` 全量通过——typecheck、lint、theme:check 通过，444/444 测试通过（此前失败的三项均恢复）。global.css 与 page-seam.test.cjs 的修复需进入构建源码，随本次提交进入安装包；补丁项仅本机环境，构建环境 npm ci 自动应用。

---

## 2026-09-23 02:49:08 | 新增功能：0.4.0 版本更新说明

- 变更概述：已获用户确认。按更新说明编写规范对比 0.3.0（构建 15，提交 dd5ae04）到目标提交 40b6215 的实际差异，判定为功能更新，建议并确认版本号 0.4.0；生成面向普通用户的中文更新说明并保存。
- 修改文件：releases/notes-0.4.0.txt（新增）、CHANGELOG.md。
- 具体内容：正文含新增功能 5 条（笔记垃圾桶、我的页面内容管理、数据与存储、同步与备份、权限设置与诊断导出）、体验优化 4 条、问题修复 2 条、升级提醒 1 条（云同步升级后默认关闭需重新授权）。0.3.0 构建基线以 dist/releases/0.3.0/IRisNote-0.3.0-15.apk.json 的 commit 字段为准（dd5ae04），tag v0.3,0_IRisNote 指向 a256b3c 仅为线索；界面名称均按 HEAD 源码核对。
- 范围边界：仅生成说明文件，未执行 reserve/build/upload/publish 等发布命令，未修改 app.json（仍为 0.2.4，发布时需单独传 --version 0.4.0），未执行 Git 提交或推送。

---

## 2026-09-22 21:17:21 | 新增功能：个人资料页面规划与实施计划（仅文档）

- 变更概述：按用户“目前先做规划，写成一个 md 文件”的要求，新增个人资料页面规划与持续更新的实施进度表；具体产品方案、UI 文字预览和业务实施仍待确认。
- 修改文件：docs/进度与验证/个人资料页面规划与实施计划.md（新增）、CHANGELOG.md。
- 具体内容：核实现有「我的」首卡、设置页、用户模型、头像上传、认证刷新与云存储授权；规划两个入口、7 个页面与4类弹层，覆盖头像、用户名、邮箱、密码、平台占位、简介、地区和性别，补充用户 ID/注册时间、未保存返回、单项保存、身份验证与会话处理；提供 dp 文字预览、候选接口、文件清单、分阶段依赖与粗估人日、任务勾选、验收与待确认决策。
- 证据与边界：基于 Timmi / 40b6215e863f2086035988fdbda2a64593b10eeb 的当前源码，明确区分已有客户端链路与待核实后端能力。仅修改文档，未改动业务代码、接口、依赖或数据库，未发送验证码、构建、部署或发布。
- 验证：修改前后 npm run typecheck 均通过；核对7个页面、4类弹层、8个阶段及全部需求，Markdown围栏完整，无冲突标记与尾随空格，git diff --check 通过。工作区仅上述两份文档变化；纯文档任务未运行 npm run check、打包或真机验收，不表示个人资料功能已经实现。

---

## 2026-09-22 18:02:12 | 新增功能：15 天笔记垃圾桶（代码完成，未部署）

- 变更概述：已按用户确认的规则与文字预览实现“我的 → 垃圾桶”、15×24 小时保留、恢复与到期清理。云端按服务器时间，App 启动/回前台/联网恢复与前台周期检查处理持久任务；离线或云存储关闭会延迟云端清理。纯本地笔记独立处理到期。
- 修改文件：src/app/_layout.tsx、src/app/pages/user/trash.tsx、src/core/database/migrations/index.ts、src/core/database/migrations/0012-create-note-trash.ts、src/core/notifications/notification-provider.tsx、src/core/sync/upload-queue.repository.ts、src/features/notes/api/notes-trash.api.ts、src/features/notes/api/notes-trash.types.ts、src/features/notes/data/note-trash.repository.ts、src/features/notes/data/note-local.repository.ts、src/features/notes/data/note-sync.repository.ts、src/features/notes/data/note-draft.repository.ts、src/features/notes/data/new-note-draft.repository.ts、src/features/notes/data/note-cache.repository.ts、src/features/notes/services/note-trash.service.ts、src/features/notes/services/note-save.service.ts、src/features/notes/services/note-sync-coordinator.ts、src/features/notes/screens/NotesScreen.tsx、src/features/notes/screens/TrashScreen.tsx、src/features/notes/categories/components/CategoryDeleteConfirmModal.tsx、src/features/profile/screens/ProfileScreen.tsx、src/features/sync/note-upload-queue.ts、src/features/sync/upload-task-adapters.ts、tests/trash/notes-trash.test.cjs、tests/sync/notes-sync.test.cjs、tests/todos/todo-local.test.cjs、src/core/database/migrations/0013-add-note-purge-markers.ts、CHANGELOG.md。
- 数据与同步：归档笔记、排序、历史指针及草稿，撤销未运行上传任务；在途上传及结果未知的新建笔记拒绝删除。恢复保留较新本地编辑与冲突草稿，并重新排队需要上传的版本。分类删除覆盖本地未上传笔记，分类消失时恢复到未分类。明确保存的关联文件草稿在垃圾桶期间隐藏，到期一并清理。
- 并发保护：删除与清理绑定身份、版本、删除时间；超时后重试同一批次。恢复未确认的删除时先取得删除回执再恢复，阻止迟到删除回写。无正文清理标识阻止旧编辑页、草稿和同步快照重新创建已清理内容；账号代际与 SQLite 事务保护跨账号和失败回滚。
- 迁移：0012 创建垃圾桶；期间外部操作已提交首版实现，因此保持已提交迁移不变，追加 0013 创建无正文清理标识，兼容已经升级到 0012 的本地库。客户端自动顺序迁移，不清空本地数据。
- 界面：保留我的页面其他区块，新增垃圾桶入口；卡片含标题、两行摘要、剩余天/小时/分钟及恢复操作。覆盖加载、空列表、恢复中、失败重试、待联网确认和到期待清理状态；笔记与分类删除提示改为保留 15 天。
- 最终检查：npm run check 中 typecheck、lint 通过；theme:check 因当前 global.css 生成块格式差异失败，逐项比较颜色/圆角语义差异为 0。独立 npm test：444 项中 442 通过、2 失败、0 跳过；垃圾桶专项 16/16 通过，包含真实 SQLite 文件关闭/重开、迁移保留、恢复与清理、过期边界、账号隔离、错误身份拒绝及队列/草稿保护。
- 范围外失败：page-seam.test.cjs 固定 className 顺序断言与同期格式化后的 border-t/border-r/border-b 顺序不符；swipe-tabs.test.cjs 期望已安装依赖 DEAD_ZONE=100，实际仍为 12，仓库补丁要求 100。未修改这些导航文件、依赖或测试来掩盖失败。
- 验收版本：288e266 加本轮工作区增量；最终检查前后本功能 27 个源码/测试文件 SHA256 无变化，范围内 git diff --check 与冲突标记扫描通过。最初方案阶段类型检查基线为 47bedd6，确认后实施起点为 a2af26c；期间 282122d/288e266 来自外部 Git 操作，本任务未执行提交或推送。
- 验证记录：系统临时目录 irisnote-trash-final-check.log、irisnote-trash-final-tests.log；后端笔记单元 11 项与独立 PostgreSQL 18.4 集成 20 项通过，临时实例已核验并停止。当前 adb devices -l 无已连接设备，真机与 APK 打包未验收。
- 上线边界：后端须另行执行 migrations/008_notes_trash.sql 并部署；未执行生产迁移、部署或真实数据清理，不能据上述检查宣称可发布。

---

## 2026-09-22 17:59:12 | 新增功能：我的页面独立笔记与草稿列表

- 变更概述：将全部笔记、星标笔记和草稿箱接入独立二级页面，保留返回我的页面的导航历史。
- 修改文件：src/app/_layout.tsx、src/app/pages/user/notes.tsx、src/app/pages/user/starred.tsx、src/app/pages/user/drafts.tsx、src/features/profile/screens/ProfileScreen.tsx、src/features/notes/screens/note-collection-screen.tsx、src/features/notes/screens/drafts-screen.tsx、src/features/notes/hooks/use-draft-manager.ts、src/features/notes/components/draft-manager-dialog.tsx、CHANGELOG.md。
- 具体内容：全部与星标笔记共用本机优先列表，在云存储授权下复用同步服务；页面返回时刷新，按账号和会话隔离异步结果。草稿列表展示本机主动草稿与自动恢复内容，复用现有草稿仓储，并将单选续写、批量删除和 2 秒倒计时抽取为页面/弹窗共享 hook；离开页面或应用退到后台取消未执行的倒计时。
- 界面：沿用 64dp 返回栏、16dp 页面/卡片内边距、12dp 卡片间距和 48dp 操作按钮，补充加载、空态、错误重试及底部安全区。
- 验证：对应基于 288e266 的未提交工作区。修改前后 npm run typecheck 通过，完整 npm run check 的类型检查和 ESLint 通过，但 theme:check 因既有 global.css 色值大小写与主题生成结果不一致而失败；从 288e266 原文件复核可复现，本次未修改主题文件。单独执行 npm test：443 项中 441 通过、2 失败，分别为既有待办页 className 字符串断言不匹配（基线提交同样不匹配）和 react-native-tab-view 运行依赖 DEAD_ZONE=12、测试要求100；均不涉及本次修改文件。最终类型检查、定向 ESLint、git diff --check 及本次源码冲突标记检查通过。检查日志：系统临时目录 irisnote-profile-pages-check.log、irisnote-profile-pages-tests.log。ADB 无设备，现有预览端口8081的浏览器导航和状态读取均超时，未完成视觉或真机验收；未重启现有服务，未构建、提交或发布。

## 2026-09-22 22:17:17 | 优化代码：按项目现状重写测试包构建指南新电脑从零构建章节

- 变更概述：已获用户确认（从系统环境变量之后写起，环境配置部分不展开；按项目改动后现状重新参考）。项目统一云存储改造（47bedd6）后旧开关 `EXPO_PUBLIC_TODO_CLOUD_SYNC` 已从代码移除，且此前写入文档的"新电脑从零搭建"章节已随 330780b 移除。本次按当前代码现状重写该章节：不含软件清单与环境变量小节（引言一句带过前提），从克隆代码到产出 APK 组织为步骤 1–7 流水线。
- 修改文件：docs/构建发布/本地测试包构建.md、CHANGELOG.md。
- 具体内容：① 新增「二、新电脑从零构建」——步骤 1 克隆与 npm install（含 npmmirror、postinstall patch-package 横滑补丁说明）；步骤 2 `.env.local` 改为**可选**（按新代码事实：`EXPO_PUBLIC_CLOUD_STORAGE_ENABLED` 未配置/空/`1` 时云存储开放、API 默认 `https://tech-mou.top/api`，仅显式覆盖时才建文件，并注明旧 `EXPO_PUBLIC_TODO_CLOUD_SYNC` 已废弃）；步骤 3 `npx expo prebuild -p android --no-install`；步骤 4 就地给出完整 staging 构建块及漏加症状（`Task 'assembleStaging' not found`）；步骤 5 debug.keystore 公开证书说明与 keytool 指纹核对命令（SHA256 FA:C6:17:45:…:9C）；步骤 6 镜像脚本 PowerShell 重建命令（英文注释避免编码问题）；步骤 7 构建命令（`"$PWD\.expo\..."` 绝对路径展开、Gradle 9.3.1 发行版腾讯镜像、冷构建约 19 分钟、产物路径）+ 尾注"日常只重复步骤 7"；② 原二~~六节顺延为三~~七节，「构建命令」改为速查定位并保留既有 `EXPO_PUBLIC_CLOUD_STORAGE_ENABLED` 语义说明；③ Git 忽略表补 `.env*.local`、`*.keystore`/`*.jks`；④ 常见问题补 Gradle 发行版卡住、npm install 慢、跨机器签名一致性三条；⑤ 第一节"登录同一账号云端数据不隔离"的举例由"Todo 云同步"更新为"云存储同步"。
- 验证：纯文档改动，未触及 TS 源码，无需 typecheck/测试。文档事实按当前 HEAD（0f42f65）实测核实：staging 块仍在 android/app/build.gradle L125、Gradle 9.3.1、JDK 17/Node 24.18.0 环境变量不变、镜像脚本与 debug.keystore 在位、`parseCloudStorageEnabled` 默认开放语义、`DEFAULT_API_BASE_URL` 仍为 https://tech-mou.top/api、patches/react-native-tab-view+4.3.2.patch 在位。新电脑全流程未实测，文档已附指纹核对等自助验证命令。

---

## 2026-09-22 22:10:55 | 修复问题：同步 master 固有的两处过期测试断言

- 变更概述：已获用户确认（更新测试断言以匹配 master 新事实，不修改任何源码）。修复合并验证中暴露的 2 项 master 固有测试失败，使全量检查恢复全绿。
- 修改文件：tests/navigation/page-seam.test.cjs、tests/todos/todo-local.test.cjs、CHANGELOG.md。
- 具体内容：① page-seam 测试对 TodosScreen.tsx 的正则断言中 border 类顺序由 `border-b border-r border-t` 更新为 `border-t border-r border-b`——master 提交 282122d 统一代码风格时 prettier 重排了 tailwind 类顺序，类集合与"填充层/圆角边框层分离"结构意图均未变；② todo-local 测试 `CURRENT_DATABASE_VERSION` 断言由 11 更新为 12——master 新增迁移 0012-create-note-trash 后版本常量由迁移数组末项自动推导为 12，注释同步补充 0012 说明。
- 验证：定向 node --test 两文件 14/14 通过；全量 npm run check 通过（typecheck、lint、theme:check、438/438 测试，exit code 0）。未修改任何 src/ 源码，无需真机验收。

---

## 2026-09-22 21:54:23 | 优化代码：合并 master 主分支并解决冲突

- 变更概述：已获用户确认（先提交暂存改动→合并→检查通过即推送）。将 origin/master 领先的 9 个提交（15 天笔记垃圾桶、数据存储页面、云存储授权统一、全项目代码风格统一、PR #117 等）合入 kroos_todo，解决 CHANGELOG.md 冲突。合并前先将暂存区未提交改动（删除「新电脑从零搭建」章节）提交为独立提交 330780b。
- 修改文件：CHANGELOG.md、global.css、docs/构建发布/本地测试包构建.md（master 侧自动合并）。
- 具体内容：① 提交 330780b：移除本地测试包构建指南中「新电脑从零搭建」整章（-208 行）并保留表格对齐格式化；② git merge origin/master，唯一冲突 CHANGELOG.md 按"双侧条目全保留、时间倒序"解决；③ npm run theme:sync 刷新 global.css 主题块（50 行，仅 hex 颜色小写→大写规范化，修复 master 固有的 json/css 不同步）；④ 重新生成 .expo/types/router.d.ts（本地生成产物过期，不含 master 新增的 trash/cloud-storage/data-storage 路由导致 TS2345，短暂启动 expo start 触发类型生成）。
- 验证：npm run typecheck 通过（路由类型再生成为 0 错误）；npm run lint 通过；npm run theme:check 通过。npm test 438 项中 436 通过、2 项失败——失败为 master 固有（src/ 与 tests/ 相对 origin/master 零差异）：① tests 断言 TodosScreen.tsx 旧 JSX 结构（master 重构后已不存在）；② tests/todos/todo-local.test.cjs 断言迁移数 11（master 新增 0012 后实际 12）。git status 无未解决冲突；全仓冲突标记仅命中 GitHub 教程既有演示内容与二进制字体误报。未做真机验收。

---

## 2026-09-22 21:05:24 | 优化代码：本地测试包构建指南补全新电脑从零搭建章节

- 变更概述：已获用户确认。`docs/构建发布/本地测试包构建.md` 原先只覆盖"本机已有环境"的构建命令，缺少在另一台电脑从零构建所需的前置信息。新增完整「新电脑从零搭建」章节，把环境变量、软件版本、脚本内容、Git 忽略文件重建步骤全部写清，使任何新 Windows 电脑可仅凭该文档从零打出 staging 测试包。
- 修改文件：docs/构建发布/本地测试包构建.md、CHANGELOG.md。
- 具体内容：① 新增「二、新电脑从零搭建」8 个子节——软件清单（Expo SDK 57 要求 Node ≥22.13.x，本机实测 24.18.0；新电脑建议 JDK 17，本机 JDK 21 已通过编译；Android SDK Platform 36 + Build-Tools 36.0.0 + Platform-Tools、Gradle 9.3.1 wrapper 自动下载）、必设系统环境变量（JAVA_HOME/ANDROID_HOME 含 setx 与验证命令）及项目自动注入变量说明（JAVA_TOOL_OPTIONS 回环修复、IRIS_GRADLE_SOCKET_DIR）、克隆与 npm ci（npmmirror 切换、postinstall patch-package）、创建 .env.local（完整内容与 EXPO_PUBLIC_TODO_CLOUD_SYNC / BASE_URL / RELEASE_API_URL 变量作用表）、`npx expo prebuild -p android --no-install` 生成工程并指引加回 staging 块、debug.keystore 公开调试证书说明（SHA256 指纹与 keytool 核对命令）、.expo/gradle-aliyun-init.gradle 的 PowerShell 重建命令（英文注释避免跨机器编码问题）、Gradle 发行版腾讯镜像替换方案；② 原二~~六节顺延为三~~七节，交叉引用同步更新；③ 构建命令节去掉 D:\IRisNote 硬编码，--init-script 改用 PowerShell "$PWD\.expo\..." 自动展开写法；④ Git 忽略说明表补 .env*.local 与 _.keystore/_.jks 两行；⑤ 常见问题补 Gradle 发行版下载卡住、npm install 慢两条排查项，签名注意补跨机器证书一致性指引。
- 验证：纯文档改动，未触及 TS 源码，无需 typecheck/测试。文档中全部事实（环境变量值、工具版本、SDK 版本 36/24、Gradle 9.3.1、debug.keystore SHA256 指纹、.env.local 内容、镜像脚本内容、仓库地址）均在本机实测核实；新电脑全流程未实测，文档已附指纹核对等自助验证命令。

---

## 2026-09-22 17:20:13 | 新增功能：15 天笔记垃圾桶（实施中）

- 用户已确认方案和界面预览，新增本地垃圾桶迁移、严格响应校验、删除/恢复/清理服务。
- 文件：src/core/database/migrations/0012-create-note-trash.ts、src/core/database/migrations/index.ts、src/features/notes/api/notes-trash.types.ts、src/features/notes/api/notes-trash.api.ts、src/features/notes/data/note-trash.repository.ts、src/features/notes/services/note-trash.service.ts、src/features/notes/data/note-local.repository.ts、src/features/notes/data/note-sync.repository.ts、src/features/notes/services/note-save.service.ts、src/features/notes/services/note-sync-coordinator.ts、src/features/notes/screens/NotesScreen.tsx、CHANGELOG.md。
- 删除时在本地事务中归档笔记/草稿、保留历史并撤销未运行上传任务；同步处理合法的更高版本恢复，到期清理依赖服务器确认；仍在上传或结果未知的新笔记拒绝删除。
- 尚待界面接入、回归检查和最终记录；未执行线上迁移、部署或真实数据清理。

---

## 2026-09-22 17:03:13 | 修复问题：存储统计兼容 SQLite 原生目录路径

- 变更概述：修复已确认的数据与存储功能在 Android 扫描 SQLite 目录时出现 Exception in HostFunction / URI is not absolute 的问题。
- 修改文件：src/core/storage/storage-files.ts、tests/storage/storage.test.cjs、CHANGELOG.md。
- 问题根因：项目已安装的 expo-sqlite Android/iOS 实现返回不带协议的绝对本地路径；原实现直接交给 Expo FileSystem Directory，并在 try/catch 之外访问原生 uri getter。原测试替身自动为所有路径补 file:///，掩盖了真实模块边界。
- 具体内容：① 仅在文件系统统计入口把 SQLite 绝对本地路径转换为 file URI，按路径段编码中文、空格、百分号、#、? 等字符，保留已有 file:/// URI，不改变 SQLite 打开数据库时的路径；② 目录初始化及遍历时的 uri getter 均纳入异常处理，单个目录失败计入部分统计并继续其他目录；③ 缓存规范化后的 SQLite 与草稿目录用于分类和去重；④ 测试替身不再凭空补协议，模拟裸路径 uri getter 抛错；增加裸路径、已有 URI、特殊字符、无效路径及目录 getter 异常回归。清理白名单、数据库数据、界面布局与默认选择保持原方案。
- 验证：对应基于 47bedd6 的未提交工作区。修改前 npm run typecheck 通过；node --test tests/storage/storage.test.cjs 为 13/13 通过。npm run check 的 typecheck、lint、theme:check 通过，428 项测试中 427 通过、1 失败，唯一失败仍为既有横滑依赖补丁未生效（运行依赖 DEAD_ZONE=12、原测试要求100），与本次路径修复无关。git diff --check 与本次文件冲突标记检查通过。完整日志位于系统临时目录 irisnote-storage-uri-check.log。ADB 未列出设备；原生根因已核对已安装 Kotlin/Swift 源码，但修复尚未通过真机复验，未构建、安装或发布。

---

## 2026-09-22 16:50:39 | 新增功能：数据与存储及可选缓存清理

- 修改文件：src/app/_layout.tsx、src/features/notes/components/NoteShare/NoteShareManager.tsx、src/features/notes/components/NoteShare/NoteShareToImage.tsx、src/features/notes/components/NoteShare/NoteShareToMarkdown.tsx、src/features/notes/components/NoteShare/NoteShareToPdf.tsx、src/features/notes/components/NoteShare/NoteShareToTxt.tsx、src/features/notes/data/note-local.repository.ts、src/features/notes/services/note-sync-coordinator.ts、src/features/settings/screens/SettingsScreen.tsx、src/features/updates/update-store.ts、tests/releases/releases.test.cjs、tests/sync/notes-sync.test.cjs、src/app/pages/user/data-storage.tsx、src/core/storage/share-cache.ts、src/core/storage/storage-files.ts、src/core/storage/storage-policy.ts、src/features/notes/data/note-cache.repository.ts、src/features/notes/services/note-cache.service.ts、src/features/settings/screens/DataStorageSettingsScreen.tsx、tests/storage/storage.test.cjs、CHANGELOG.md。
- 变更概述：已获用户确认页面文字预览与清理边界，接通设置中的“数据与存储”。用户可以勾选更新缓存、分享临时文件与笔记缓存；笔记缓存默认不勾选，每次重新进入页面恢复默认选择。
- 具体内容：① 读取应用文档、缓存与 SQLite 实际目录，重叠路径去重，展示已统计占用、分类明细、可清理文件容量；读取失败明确标为部分统计，不包含应用安装体积，不把 SQL 内容字节数当成系统已释放空间；② 更新文件复用已安装构建号白名单，保留较新安装包及使用中的文件，清理前复核大小、修改时间与更新状态；③ 分享文件归入专用目录，TXT/Markdown 保留笔记标题文件名；记录正在使用及结束时间，保护并发分享和跨进程中断标记，仅清理超过 24 小时的已结束文件，保留未能确认来源的历史文件；④ 笔记缓存清理仅处理当前账号，要求已有云存储授权并联网读取完整快照验证身份、版本与正文，在事务内再次核实同步状态、草稿和上传队列；保留仅本机、未同步、恢复副本、历史版本及其他账号内容，不发送云端删除请求；⑤ 暂停并等待现有笔记同步，清理本地副本与对应镜像，重置下载游标；使用现有 system_preferences 保留稳定客户端 ID、排序和历史指针，完整同步重新下载时恢复，数据库空间留供复用，不执行 VACUUM 或删除数据库；⑥ 页面提供加载、禁用、确认、清理结果、跳过与部分失败反馈，支持重新统计，账号/授权/页面变化中止后续清理；⑦ 补充 18 项默认选择、文件白名单、使用中保护、并发分享、SQL 回滚、草稿队列保护、离线失败、账号切换及身份恢复测试。无依赖、数据库结构、后端或发布配置变更。
- 验证：基于提交 47bedd6 的未提交工作区。修改前 npm run typecheck 通过；最终 npm run check 的 typecheck、lint、theme:check 通过，425 项测试中 424 通过、1 失败，新增 18 项全部通过。唯一失败为既有 tests/navigation/swipe-tabs.test.cjs：本机 node_modules/react-native-tab-view/lib/module/PanResponderAdapter.js 仍为 DEAD_ZONE=12，仓库原有补丁与测试要求100；本次未修改相关依赖、补丁和测试。git diff --check 通过，本次变更文件无 Git 冲突标记。完整检查日志：系统临时目录 irisnote-storage-final-check.log。ADB 未列出已连接设备；尚未进行真机容量/视觉/离线重新下载验收，未构建、安装、部署或发布。

---

## 2026-09-22 15:58:51 | 新增功能：统一云存储授权与构建环境开关

- 修改文件：docs/待办/Todo前后端交接与验收.md、docs/待办/待办后端API预留契约.md、docs/待办/待办逻辑层设计.md、docs/构建发布/本地测试包构建.md、release.env.example、scripts/release/cli.mjs、src/app/_layout.tsx、src/core/notifications/notification-provider.tsx、src/core/providers/AppProviders.tsx、src/core/sync/upload-queue-coordinator.ts、src/features/auth/providers/AuthProvider.tsx、src/features/auth/screens/LoginScreen.tsx、src/features/auth/screens/RegisterScreen.tsx、src/features/notes/categories/components/CategoryBar.tsx、src/features/notes/components/editor/new-note-editor.tsx、src/features/notes/components/viewer/NoteDetailStateView.tsx、src/features/notes/components/viewer/NoteViewerMeta.tsx、src/features/notes/components/viewer/note-operation-info.tsx、src/features/notes/hooks/useNotePin.ts、src/features/notes/hooks/useNoteStar.ts、src/features/notes/screens/NoteDetailScreen.tsx、src/features/notes/screens/NotesScreen.tsx、src/features/notes/services/note-save.service.ts、src/features/notes/services/note-sync-coordinator.ts、src/features/profile/hooks/useAvatar.ts、src/features/profile/hooks/useProfileOverview.ts、src/features/profile/services/avatar-picker.service.ts、src/features/settings/data/system-preferences.repository.ts、src/features/settings/screens/PermissionSettingsScreen.tsx、src/features/settings/screens/SettingsScreen.tsx、src/features/sync/category-upload-queue.ts、src/features/sync/screens/SyncQueueScreen.tsx、src/features/sync/upload-task-adapters.ts、src/features/todos/components/TodoSyncQueueRow.tsx、src/features/todos/state/todo-sync-provider.tsx、src/shared/http/client.ts、src/shared/http/errors.ts、tests/editor/drafts.test.cjs、tests/editor/revisions.test.cjs、tests/releases/release-env.test.cjs、tests/sync/notes-sync.test.cjs、tests/todos/todo-api.test.cjs、src/app/pages/user/cloud-storage.tsx、src/core/cloud-storage/cloud-storage-consent-controller.ts、src/core/cloud-storage/cloud-storage-policy.ts、src/core/cloud-storage/cloud-storage-provider.tsx、src/features/settings/screens/CloudStorageSettingsScreen.tsx、tests/sync/cloud-storage.test.cjs、tests/sync/upload-consent.test.cjs、.env.release.local（仅云存储变量，Git忽略）、CHANGELOG.md。
- 变更概述：已获用户确认，笔记、待办、分类、头像及后续业务云存储共用当前账号在本机的主动授权；构建变量只开放功能，不代表用户同意。未授权仍可保存本地笔记/待办，保留待同步任务。
- 具体内容：① 统一变量 EXPO_PUBLIC_CLOUD_STORAGE_ENABLED，未配置/空值/1 开放功能，0及非法值关闭，移除原待办独立开关及其EAS透传，迁移样例和本机发布变量；② 复用 system_preferences 按账号持久化授权，首次/旧用户升级无授权记录时关闭，读取失败关闭，启用须先持久化，撤销立即生效并串行保存最后一次选择；③ 公共HTTP调用时同步捕获账号与授权代际，实际发送前复核，默认保护未来API，基础认证端点例外；中止在途传输、阻止迟到响应和跨账号发包，区分发送前拒绝与发送后未知回执；④ 笔记/待办/上传协调器、手动同步、重试及分类任务统一门控，同账号重新授权等待旧执行确认结束，保留未知创建保护，避免重复创建；⑤ 新增同步与备份页面，权限设置及首页概览使用同一状态，关闭时队列仍可见、按钮准确禁用，本地状态及云依赖功能提示与实际能力一致，远程头像读取和上传也受控；⑥ 登录/注册替换Token前和退出登录前立即撤销旧会话，快速关闭再开启按授权代际重建读取；⑦ 保留当前本地能力，未新增完整离线分类/元数据/删除体系或独立历史备份，未更改依赖版本、数据库结构或后端。
- 验证：修改前 e4929d8 的 npm run typecheck 通过；实现中修复授权保存/读取/退出、同tick账号切换和队列重启竞态。最终 npm run check 的 typecheck、lint、theme:check 通过；407 项测试中 406 通过、1 项失败，授权/HTTP/Provider 专项 39/39、队列专项 5/5 均通过。git diff --check 通过，本次修改文件无冲突标记；全仓扫描仅命中既有 GitHub 教程中的冲突演示代码。验收对应基于 e4929d8 的未提交工作区；检查日志在系统临时目录 irisnote-cloud-final-check.log。唯一失败是本机既有横滑测试：node_modules/react-native-tab-view/lib/module/PanResponderAdapter.js 为 DEAD_ZONE=12，而仓库已有补丁与测试要求100；该测试、补丁及依赖清单本次均未改动。未启动或重启开发服务器，未构建APK、安装、发布或进行真机验收。

---

## 2026-09-22 01:01:08 | 修复问题：启动时清理已安装及更旧的更新包

- 变更概述：已获用户确认。修复成功更新后完整 APK 长期留在缓存目录、跨版本累积的问题；每次进程首次检查更新时，在联网之前尝试清理一次，离线启动同样生效。
- 修改文件：src/features/updates/update-store.ts、tests/releases/releases.test.cjs、CHANGELOG.md。
- 具体内容：① 从当前运行的原生安装包读取并严格校验构建号；② 只处理缓存根目录中严格匹配 irisnote-release-正整数.apk / .hdiff 且构建号不高于当前安装版本的文件，跳过目录、异常名称与其他数据；③ 保留更高版本的待安装文件，不在启动系统安装器后立即删除；④ 单文件或目录读取失败记录警告，不阻断更新检查，下次进程启动重试；⑤ 增加离线清理、删除边界、无效构建号、并发和重复调用、错误隔离及重启重试测试。
- 验证：修改前 npm run typecheck 通过；最终代码 npm run check 的 typecheck、lint、theme:check 与 347/347 项测试全部通过，git diff --check 与冲突标记检查通过。首轮定向测试的事件记录混入原有退出顺序断言，已拆分测试记录并通过回归。验收对应基于 7956b5f 的未提交工作区改动；尚未构建、安装或执行真机缓存回收验收。

---

## 2026-09-21 22:58:35 | 优化代码：顶部安全区背景色随页面动态切换

- 变更概述：已获用户确认（方案 A：根布局路由映射）。根布局 SafeAreaView 原先固定使用灰色 appBackground 填充顶部安全区，导致白色页面（auth 登录/注册/欢迎、笔记新建/编辑/详情）顶部出现灰白分界。现改为按当前路由动态取色：命中 `/auth/`、`/pages/note/` 前缀时使用白色（colors.surface，即 #FFFFFF），其余页面维持灰色默认值。
- 修改文件：src/app/_layout.tsx、CHANGELOG.md。
- 具体内容：① 引入 expo-router 的 usePathname 读取当前路由；② 新增 WHITE_SURFACE_ROUTES 白名单常量（`["/auth/", "/pages/note/"]`），集中维护白色页面清单，未命中的新页面自动回落灰色；③ SafeAreaView 的 backgroundColor 由固定 colors.appBackground 改为动态 safeAreaBackground；④ 不改动任何布局、间距与状态栏图标颜色。
- 验证：修改前 npm run typecheck 通过（基线 0 错误）；中途发现 legacy colors 无 white 键（TS2339），改用等值的 colors.surface 后复检通过；npm run check 的 typecheck、lint 与 343/343 项测试全部通过。已知轻微瑕疵：fade_from_bottom 切页动画期间安全区颜色存在一帧跳变。未执行真机目视验收。

## 2026-09-22 03:35:33 | 优化代码：审查修正——权限单一来源、类型语义、写库短路与导入别名

- 变更概述：应用户"全修正"要求，落实代码审查报告的全部建议项（建议 1–4）与提示项（3/5）：app.json 恢复 HEAD 消除全文件格式重排 diff；`SCHEDULE_EXACT_ALARM` 权限收敛为模块 Manifest 单一来源；同名类型改名消歧；偏好写库增加值未变短路；统一模块导入别名；清理 Kotlin 文件名正则冗余字符。
- 修改文件：app.json（git checkout 恢复）、modules/irisnote-system/index.ts、modules/irisnote-system/android/src/main/java/expo/modules/irisnotesystem/IrisNoteSystemModule.kt、src/core/system-notifications/system-notification.types.ts、src/core/system-notifications/system-notification.service.ts、src/core/system-notifications/system-notification-native-provider.tsx、src/features/settings/screens/HelpFeedbackScreen.tsx、tsconfig.json、tests/todos/system-notifications.test.cjs、CHANGELOG.md。
- 具体内容：① app.json 整体恢复 HEAD（撤销缩进重排与 permissions 中的权限声明，diff 归零）；② 权限唯一来源改为 modules/irisnote-system 的 AndroidManifest（经 gradle manifest merger 合并进 APK），模块 AndroidManifest 保持不动；③ 模块侧 `ExactAlarmAccess` 改名 `NativeExactAlarmAccess`（3 值原生态），`system-notification.types.ts` 改为 `NativeExactAlarmAccess | "unavailable"` 组合表达继承关系（import type，无运行时导入）；④ Provider 中 `setExactAlarmAccess` 仅在值变化时写库（含 null→值的首次落盘），消除每次前台切换的冗余写入与 iOS 写 "not-required"；⑤ tsconfig paths 新增 `@modules/*`，service 与 HelpFeedbackScreen 的多级相对导入统一为 `@modules/irisnote-system`；⑥ Kotlin 文件名白名单正则 `[A-Za-z0-9T-]`→`[A-Za-z0-9-]`（T 冗余，行为不变）；⑦ 同步测试：introspect 断言反转为"app 原生配置不含 SCHEDULE_EXACT_ALARM"以锁定单一来源不回退，模块断言测试更名，测试 stub key 改为别名。
- 验证：`npm run typecheck` 通过（0 错误，中途发现并修复改名遗漏的方法签名引用）；定向测试 30/30 通过；`npm run check` 全量通过（typecheck、lint、theme:check、354/354 测试）；`gradlew :app:processDebugMainManifest` BUILD SUCCESSFUL，合并后 Debug Manifest 含 `SCHEDULE_EXACT_ALARM` 且 app 源 manifest（prebuild 产物）不含——node_modules 全量搜索确认无第三方库声明该权限，合并来源 100% 为本模块。未做真机验收（Android 14+ REQUEST_SCHEDULE_EXACT_ALARM 弃用行为仍建议真机验证）。

---

## 2026-09-22 02:56:31 | 新增功能：系统通知模块负责说明文档

- 变更概述：应代码审查与模块梳理需求，新增通知模块架构文档，覆盖文件职责、UI 到系统通知的全链路时序、通知分级、精确闹钟权限专节与五个端到端示范案例，供团队开发与排障参考。
- 修改文件：docs/架构指南/系统通知模块负责说明.md（新增）、CHANGELOG.md。
- 具体内容：① 模块总览分层图与逐文件职责清单（core/system-notifications 5 文件、modules/irisnote-system 本地模块含 Kotlin 行为契约、features 消费方、diagnostics 支撑）；② 待办提醒/常驻通知/测试通知 × Android 渠道对照表与 importance 档位语义；③ 四条全链路时序（待办保存→排程→到点→点击、常驻开关、测试通知、冷启动 refresh 对账）；④ 精确闹钟权限专节（SCHEDULE_EXACT_ALARM 背景、双处声明、四态语义、forceReschedule 强制重排机制、用户触点与平台差异）；⑤ 五个示范案例与边界降级矩阵（Expo Go/Web/iOS/权限拒绝/模块缺失）。文档基于当前工作区现状（含未提交的精确闹钟改动）并在文首标注。
- 验证：纯文档新增，无代码改动；无需 typecheck/测试。

---

## 2026-09-22 02:48:43 | 修复问题：Android 待办精确提醒权限与诊断日志下载导出

- 变更概述：已获用户确认，为 Android 待办提醒接入“闹钟和提醒”特殊权限与授权后的全量重排，避免 Expo 在无精确权限时使用的非精确闹钟被系统/OPlus 长时间调整；同时将诊断日志直接保存到公共 `Download/irisnoteLog` 后显示全局横幅并自动打开系统分享面板。
- 修改文件：app.json、modules/irisnote-system/**（新增）、src/core/diagnostics/diagnostic-log.ts、src/core/system-notifications/{system-notification-native-provider,system-notification.service,system-notification.types}.ts(x)、src/features/settings/data/system-preferences.repository.ts、src/features/settings/screens/{HelpFeedbackScreen,PermissionSettingsScreen}.tsx、src/features/todos/services/todo-reminder.service.ts、src/features/todos/state/todo-reminder-coordinator.ts、tests/todos/{system-notifications,todo-reminders}.test.cjs、CHANGELOG.md。
- 具体内容：① 声明 `SCHEDULE_EXACT_ALARM`，新增本地 Expo Android 模块读取 `AlarmManager.canScheduleExactAlarms()`，权限设置页新增“准时提醒”状态与系统设置入口；② 明确保存未来提醒且缺少权限时显示“去开启”横幅，授权返回后持久化状态并强制取消、重建已有未来提醒，使 Expo SDK 57 重新按精确闹钟调度；③ 日志导出改为返回缓存文件及文件名，Android 10+ 通过 `MediaStore.Downloads` 写入 `Download/irisnoteLog`，Android 9 及以下按需申请旧版存储权限，保存成功后显示实际路径并继续调用系统分享面板；④ 补充权限读取、设置跳转、重排、下载保存和分享结果的脱敏日志及回归测试。
- 验证：修改前、修改后 `npm run typecheck` 均通过；通知/提醒定向测试 30/30 通过；`npm run check` 的 typecheck、lint、theme:check 与 354/354 项测试全部通过；Expo 本地模块自动链接识别 `irisnote-system` 且无重复；`:irisnote-system:compileDebugKotlin` 与 `:app:processDebugMainManifest` 均 `BUILD SUCCESSFUL`，合并后的 Debug Manifest 含 `SCHEDULE_EXACT_ALARM`；未构建 APK、未安装或执行真机权限/到点通知/下载分享验收，安装包构建由用户完成。

---

## 2026-09-22 01:53:02 | 新增功能：staging 测试包独立包名共存与构建指南文档

- 变更概述：已获用户确认，为本地 staging 测试包启用独立包名 `com.mouqiandi.irisNote.staging`（applicationIdSuffix），实现与正式包双应用共存、数据隔离，桌面显示名改为"IRisNote 测试"以作区分；并新增测试包构建指南文档，固化阿里云镜像用法、命令与注意事项。
- 修改文件：android/app/build.gradle（Git 忽略目录，仅本机生效）、docs/构建发布/本地测试包构建.md（新增）、CHANGELOG.md。
- 具体内容：① staging 构建块新增 `applicationIdSuffix ".staging"` 与 `resValue "string", "app_name", "IRisNote 测试"`，包名独立后应用内更新器经 `updateSupported()`（校验 applicationId === com.mouqiandi.irisNote）自动禁用，测试包无更新误装风险；② 文档覆盖：staging 与正式包差异对照表、构建命令（含 arm64 瘦身参数与镜像绝对路径要求）、阿里云镜像脚本位置与原理（规避 dl.google.com TLS 握手中断）、.expo/ 与 android/ 的 Git 忽略说明、staging 块参考代码（供 prebuild 重新生成后找回）、限制与常见问题（http 明文不可用、Debug 签名、依赖下载失败排查、残留进程清理）。
- 验证：`npm run gradle -- help --init-script D:\IRisNote\.expo\gradle-aliyun-init.gradle` 配置阶段通过（验证 Groovy 语法与 resValue 合并有效，结果见后续汇报）；未触及 TS 源码，typecheck/lint 不受影响；正式发布链路使用重新生成的 Android 工程，不含 staging 配置。APK 构建由用户自行执行。

---

## 2026-09-22 01:49:00 | 新增功能：本地构建阿里云镜像脚本固定至 .expo

- 变更概述：已获用户确认，将原先临时存放于系统 Temp 的 Gradle 阿里云镜像 init 脚本固定到项目 `.expo/`（整目录已被 Git 忽略），避免系统清理临时文件后脚本丢失。当日 staging 测试包构建曾因直连 dl.google.com 下载 androidx 依赖 TLS 握手中断而失败，需本脚本镜像兜底。
- 修改文件：.expo/gradle-aliyun-init.gradle（新增，位于 Git 忽略目录，不入版本库）、CHANGELOG.md。
- 具体内容：脚本内容沿用原 Temp 版本——在 google()/mavenCentral() 之前追加阿里云 google/public 镜像仓库（allprojects 的 buildscript 与项目仓库均追加）；头部注释由"仅为本次临时"改为固定用途说明，并补充用法示例（--init-script 需用绝对路径，npm run gradle 的工作目录在 android/ 下，相对路径不生效）。
- 验证：文件已写入 `D:\IRisNote\.expo\gradle-aliyun-init.gradle`；`git check-ignore` 确认 .expo/ 整目录被忽略（.gitignore 第 8 行）；镜像仓库地址与原 Temp 脚本一致。本记录仅为构建辅助文件落位，不触及应用源码，未运行 typecheck/check（无代码变更），构建由用户自行执行。

---

## 2026-09-22 01:23:32 | 新增功能：通知全链路诊断、常驻通知与测试通知

- 变更概述：已获用户确认，为 Android 系统通知补齐应用内可导出的诊断链路，在权限设置中增加可持久化的常驻通知开关，并在帮助与反馈中增加诊断日志导出和普通测试通知入口。
- 修改文件：src/core/diagnostics/{diagnostic-log,index}.ts、src/core/database/migrations/{0011-create-system-preferences,index}.ts、src/core/system-notifications/{system-notification-context,system-notification-native-provider,system-notification-provider,system-notification.service,system-notification.types}.ts(x)、src/features/settings/components/SettingsRow.tsx、src/features/settings/data/system-preferences.repository.ts、src/features/settings/screens/{HelpFeedbackScreen,PermissionSettingsScreen}.tsx、src/features/todos/services/todo-reminder.service.ts、src/features/todos/state/todo-reminder-coordinator.ts、tests/todos/{system-notifications,todo-local,todo-reminders}.test.cjs、CHANGELOG.md。
- 具体内容：① 记录通知权限、渠道、待办保存与资格判断、对账、排程、取消、前后台切换、接收和点击等事件，日志仅保留计数、布尔值、时间与不可逆短标识，不记录待办正文、账号标识或令牌；② 诊断日志以最多 400 条 JSONL 持久化，并可从“帮助与反馈 → 诊断与排障”调起系统分享；③ 新增 `irisnote.runtime.v1` LOW 渠道和“IRisNote正在运行”不可侧滑通知，开关通过共享 SQLite 的 `system_preferences` 表持久化；④ 新增 `irisnote.diagnostics.v1` DEFAULT 渠道，点击“发送测试通知”会发送一条可关闭的普通通知并自动写入诊断日志；⑤ 前台通知处理器分别处理待办、常驻状态和测试通知，保持待办点击跳转与账号隔离逻辑。
- 验证：修改前、修改后 `npm run typecheck` 均通过；定向通知/提醒/迁移测试 39/39 通过；`npm run check` 的 typecheck、lint、theme:check 与 350/350 项测试全部通过；`git diff --check` 通过。按用户要求中止本地 Debug 构建，未生成、安装或真机验收新的安装包。

---

## 2026-09-21 23:55:23 | 修复问题：合并 master 设置模块与测试串行化的两处冲突

- 变更概述：已获用户确认，将 master（PR #115 设置模块、测试串行化等 8 个提交）合入 kroos_todo，解决 2 个文件的内容冲突，17 个文件（设置新页面、_layout、release.env.example 移根目录等）自动合并成功。
- 修改文件：package.json、CHANGELOG.md（冲突解决）；合并带入 src/features/settings/**、src/app/pages/user/{about,help-feedback,permissions}.tsx、releases/notes-0.3.0.txt、release.env.example（rename）等。
- 具体内容：① package.json 取双方并集——保留本侧 patch-package 依赖与 postinstall 脚本（横滑手势补丁依赖），采纳 master 的 test 脚本 --test-concurrency=1 串行参数，统一 2 空格缩进；② CHANGELOG.md 双方 11 条日志按时间倒序交叉合并（22:17→…→18:03），一条不丢；③ 清理合并过程残留的 >>>>>>> 标记并补齐条目分隔线。
- 验证：全仓冲突标记扫描清零；package.json JSON 解析有效；合并后 npm run typecheck 通过；npm test（已固化串行）348/348 全部通过。

---

## 2026-09-21 22:17:04 | 修复问题：待办分页横滑时的内容区细线

- 变更概述：将待办页面的白色填充与圆角边框分层绘制，消除 Android 横滑分页过程中可能露出的灰色或黑色竖线。
- 修改文件：docs/UI/IRisNote视觉设计规范.md、src/features/todos/screens/TodosScreen.tsx、tests/navigation/page-seam.test.cjs、CHANGELOG.md。
- 具体内容：① 视觉规范升至 1.13，明确分页表面、15dp 顶部留白、75dp 右侧栏、30dp 单侧圆角、1dp 边框及填充/边框层 0dp 间隙约束；② 待办页外层仅绘制白色填充和右上圆角，内层仅绘制上/右/下边框与内容内边距，移除 `height: 100%` 与底部 margin 留缝；③ 新增静态回归测试，锁定分页白色表面和待办页的分层结构。
- 验证：修改前后 `npm run typecheck` 通过；定向 `node --test --test-concurrency=1 tests/navigation/page-seam.test.cjs` 通过；`npm run check` 的 typecheck、lint、theme:check 通过，并行测试仅复现既有 Node IPC 反序列化错误，随后全仓串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 348/348 通过；`git diff --check` 通过。未连接 adb 设备，未做真机滑动显示验收。

---

## 2026-09-21 22:00:51 | 优化代码：权限项目统一直达系统设置

- 变更概述：已获用户确认，权限设置页中的通知、相机、照片访问和更新安装项目统一改为点击后直接进入手机系统设置，不再优先触发应用内授权弹窗。
- 修改文件：src/features/settings/screens/PermissionSettingsScreen.tsx、CHANGELOG.md。
- 具体内容：① 通知项目直接进入 IRisNote 系统通知设置；② 相机与照片访问直接进入 IRisNote 系统应用设置页，由系统提供权限开关；③ Android 更新安装继续进入“允许来自此来源的应用”专用设置；④ 保留只读权限状态和从系统设置返回后的自动刷新；⑤ 页面说明文字同步改为“直接打开系统设置”。
- 验证：修改前 npm run typecheck 通过；修改后 npm run check 的 typecheck、lint、theme:check 与 343/343 项测试全部通过；git diff --check 与相关文件冲突标记扫描通过。未执行 Android/iOS 真机系统设置跳转与返回刷新验收。

---

## 2026-09-21 21:27:07 | 优化代码：移除设置首页重复的通知设置入口

- 变更概述：已获用户确认，通知授权已统一并入“权限设置”，因此从设置首页“偏好设置”分组移除重复的“通知设置”栏。
- 修改文件：src/features/settings/screens/SettingsScreen.tsx、CHANGELOG.md。
- 具体内容：删除“通知设置”设置行及其权限状态依赖；“编辑与阅读”调整为偏好设置卡片末行，避免保留多余分割线；顶部“通知 / 站内”概览和“数据与隐私 → 权限设置”入口保持不变。
- 验证：修改前 npm run typecheck 通过；修改后 npm run check 的 typecheck、lint、theme:check 与 343/343 项测试全部通过；git diff --check 与相关文件冲突标记扫描通过。未执行真机页面目视验收。

---

## 2026-09-21 20:52:51 | 新增功能：设置页手机权限、版本记录与反馈入口

- 变更概述：已获用户确认，完善设置页的手机权限管理、关于 IRisNote 版本时间线、帮助与反馈联系方式，并将 ICP 备案号作为设置首页独立可点击栏。
- 修改文件：src/app/_layout.tsx、src/app/pages/user/about.tsx、src/app/pages/user/help-feedback.tsx、src/app/pages/user/permissions.tsx、src/features/settings/components/SettingsPageHeader.tsx、src/features/settings/data/release-history.ts、src/features/settings/data/support-links.ts、src/features/settings/screens/AboutScreen.tsx、src/features/settings/screens/HelpFeedbackScreen.tsx、src/features/settings/screens/PermissionSettingsScreen.tsx、src/features/settings/screens/SettingsScreen.tsx、CHANGELOG.md。
- 具体内容：① 新增“权限设置”二级页，集中读取和管理通知、相机、照片访问及 Android 更新安装授权，返回应用时自动刷新状态，并区分 Expo Go、非移动平台和缺少原生更新模块等不可用状态；② 新增“关于 IRisNote”二级页，显示本机版本与构建号，按本机版本过滤更新历史，以左侧竖向时间线展示当前版本及旧版本，旧版本支持展开和收起；③ 新增“帮助与反馈”二级页，接入已核实的反馈邮箱、复制邮箱和预填版本信息的邮件入口，帮助内容保持“整理中”，未找到真实 Discord 地址时明确显示“待配置”且禁用；④ 设置首页接通三个二级页，并新增独立“ICP备案号”栏，点击“湘ICP备2026022882号-2A”跳转 https://beian.miit.gov.cn，失败时显示横幅；⑤ 抽取设置子页共用顶栏，三个新页面保持 16dp 页面边距、560dp 最大宽度、64dp 顶栏与可滚动窄屏布局。
- 验证：修改前 npm run typecheck 通过；最终 npm run check 的 typecheck、lint、theme:check 与 343/343 项测试全部通过；Expo Web 静态导出成功并生成 /pages/user/settings、/pages/user/permissions、/pages/user/about、/pages/user/help-feedback 路由；git diff --check 与源码冲突标记扫描通过。未执行 Android/iOS 真机权限、系统设置返回、邮件应用、Discord 或工信部外部跳转验收。

---

## 2026-09-21 20:33:24 | 优化代码：主页面横滑开始跟手门槛提高至 100dp

- 变更概述：进一步降低主页面横滑误触；水平位移不足 100dp 时不再由页面切换控件接管。
- 修改文件：patches/react-native-tab-view+4.3.2.patch、tests/navigation/swipe-tabs.test.cjs、CHANGELOG.md。
- 具体内容：① `react-native-tab-view@4.3.2` Pager 的 `DEAD_ZONE` 从 50dp 提高至 100dp；② 保留松手仅按 `layout.width / 1.75` 位移切页的规则，快速短甩仍不切页；③ 静态回归测试同步更新为 100dp。
- 验证：修改前后 `npm run typecheck` 通过；将依赖临时还原为完整原始状态后执行 `npx patch-package --error-on-fail` 成功重放；定向手势测试通过；`npm run check` 的 typecheck、lint、theme:check 通过，并行测试仅触发既有 Node IPC 反序列化错误，随后全仓串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 347/347 通过。

---

## 2026-09-21 20:12:26 | 修复问题：主页面横滑切换不再由甩动速度触发

- 变更概述：移除主页面横滑松手后的速度捷径，避免短距离快速甩动直接切换页面。
- 修改文件：patches/react-native-tab-view+4.3.2.patch、tests/navigation/swipe-tabs.test.cjs、CHANGELOG.md。
- 具体内容：① 删除 `react-native-tab-view@4.3.2` Pager 的 `swipeVelocityThreshold`；② 松手切页仅在横向位移超过既有 `layout.width / 1.75` 阈值时触发；③ 保留 50dp 起滑门槛以及横纵向手势意图识别；④ 回归测试覆盖运行时速度阈值不存在且距离判定保留。
- 验证：修改前后 `npm run typecheck` 通过；将依赖临时还原为原始状态后执行 `npx patch-package --error-on-fail` 成功重放；定向手势测试通过；`npm run check` 的 typecheck、lint、theme:check 通过，并行测试仅触发既有 Node IPC 反序列化错误，随后全仓串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 347/347 通过。

---

## 2026-09-21 19:24:30 | 优化代码：主页面横滑切换的最小位移提高至 50dp

- 变更概述：降低主页面左右滑动切换 Tab 的误触概率；手势累计水平位移未达到 50dp 时，不再由页面切换控件接管。
- 修改文件：package.json、package-lock.json、patches/react-native-tab-view+4.3.2.patch、tests/navigation/swipe-tabs.test.cjs、CHANGELOG.md。
- 具体内容：① 使用 `patch-package` 固化 `react-native-tab-view@4.3.2` 运行时 Pager 的 `DEAD_ZONE`，由 12dp 调整为 50dp；② `postinstall` 自动重新应用补丁，避免重装依赖后阈值回退；③ 新增静态回归测试，校验补丁内容、安装脚本及运行时模块均为 50dp。原有页面切换方向判断、长距离阈值和释放速度阈值不变。
- 验证：修改前后 `npm run typecheck` 通过；补丁还原后执行 `npx patch-package --error-on-fail` 成功重新应用；定向手势阈值测试通过；`npm run check` 的 typecheck、lint、theme:check 通过，并行测试仅触发既有 Node IPC 反序列化错误，随后全仓串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 347/347 通过。

---

## 2026-09-21 18:47:04 | 新增功能：待办列表下拉云同步与实际变更统计

- 变更概述：待办列表接入与笔记列表一致的顶部下拉云同步；同步完成准确展示本轮实际变更项数，全程复用现有 Todo 同步协议与后端接口。
- 修改文件：src/features/notes/components/NotesSyncHeader.tsx、src/features/notes/screens/NotesScreen.tsx、src/features/todos/{data/todo-sync-history.ts,data/todo-sync.repository.ts,services/todo-sync.service.ts,state/todo-sync-coordinator.ts,state/todo-sync-provider.tsx,screens/TodosScreen.tsx}、tests/todos/todo-sync.test.cjs、CHANGELOG.md。
- 具体内容：① 笔记下拉同步头泛化为可传入实体名称和成功文案的复用组件，笔记文案保持不变；② 待办 `SectionList` 仅在滚动到顶部时可下拉，展示待办数量、同步状态、上次成功同步时间与“同步 N 项待办/暂无待办变更”；③ 同步服务统计成功上传与真正写入、更新或删除本地待办的远端变更，陈旧回包、同版本回显和未覆盖本地的冲突不重复计数；④ 手动同步加入既有单一协调器，等待当前轮结果且不另发并发或后继请求；⑤ 上次同步时间仅存为可失败的本地展示元数据，不影响同步事实。
- 验证：修改前后 `npm run typecheck` 通过；`node --test --test-concurrency=1 "tests/todos/todo-sync.test.cjs"` 27/27、全仓串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 346/346 通过；`npm run check` 的 typecheck、lint、theme:check 通过，并行测试仅触发既有 Node IPC 克隆错误，随后串行验证通过；`git diff --check` 和源码/测试目录冲突标记扫描通过。

---

## 2026-09-21 18:22:57 | 优化代码：补充发布环境变量模板维护约定

- 变更概述：明确发布相关环境变量的文档同步责任，避免发布脚本或构建配置变更后模板缺项或误放密钥。
- 修改文件：docs/构建发布/android-releases.md、CHANGELOG.md。
- 具体内容：在 `.env.release.local` 配置步骤中规定：新增、删除或调整发布构建/发布工具读取的环境变量时，必须同步更新 `docs/构建发布/release.env.example`；密钥示例仅保留空值和用途注释。
- 验证：复核 Markdown 内容、模板现有变量和 Git 差异；纯文档改动，未运行类型检查、测试、构建或设备验收。

---

## 2026-09-21 18:21:30 | 修复问题：测试脚本固化串行参数规避 Windows 并行 IPC 错误

- 变更概述：已获用户确认执行。0.3.0 发布构建两次在"完整代码检查"阶段因 Node 测试运行器并行 IPC 错误中断（tests/releases/workspace.test.cjs 报 Unable to deserialize cloned data，其余 343 项测试全部通过，该文件单独串行运行 9/9 通过），系 Node v24 Windows 并行子进程结果回传的管道字节流错位缺陷，非应用代码问题。按方案将 npm test 默认改为串行执行（--test-concurrency=1），该参数为项目多次使用的稳定回退方案，彻底消除此类偶发阻断。
- 修改文件：package.json、release.env.example（由 docs/构建发布/release.env.example 移动至项目根目录，内容 100% 一致）、CHANGELOG.md。
- 具体内容：① test 脚本由 `node --test "tests/**/*.test.cjs"` 改为 `node --test --test-concurrency=1 "tests/**/*.test.cjs"`；② 发布配置模板文件移动到根目录（用户工作区已有移动，按确认提交为 rename）；③ 实测对比：并行约 17.2 秒、串行约 19.6-21.0 秒，代价约 2-4 秒，测试覆盖与断言完全不变。
- 验证：修改后 npm test 343/343 通过（exit 0）；npm run typecheck 通过。影响后续所有 npm run check（本地与发布构建内检查均串行）。
- 发布上下文：受此提交影响，0.3.0 原 build 14（reserved，绑定 8e60ebd）作废不再使用，将重新预留构建号；用户已在 .env.release.local 配置 EXPO_PUBLIC_TODO_CLOUD_SYNC=1，发布工具自动加载并透传进构建。

---

## 2026-09-21 18:03:59 | 优化代码：release 环境变量模板补充待办云同步开关

- 变更概述：已获用户确认，在发布环境变量模板中新增 EXPO_PUBLIC_TODO_CLOUD_SYNC=1 示例，与上一条待办云同步功能配套；同时修正 HPatchz 注释笔误（"路径s"→"路径"）。
- 修改文件：docs/构建发布/release.env.example、CHANGELOG.md。
- 具体内容：① 模板新增 EXPO_PUBLIC_TODO_CLOUD_SYNC=1 # Expo 代办云同步 一行，使发布构建可参照开启该开关；② 修复 IRIS_HPATCHZ_PATH 行尾注释的误加字符 "s"；③ 以 docs(release): 补充待办云同步环境变量示例 提交至 kroos_todo 分支（e8e928f）。
- 验证：git diff --cached 复核改动内容；纯文档模板变更，不涉及代码逻辑，未运行 typecheck/测试。

---

## 2026-09-21 14:55:42 | 新增功能：待办云同步回包追踪与全局成功横幅

- 变更概述：已获用户确认，为登录账号启用本机待办云同步，补齐服务端请求 ID 回包关联、上传数量汇总和全局成功横幅；保留现有离线队列、冲突处理与失败横幅。
- 修改文件：.env.local（忽略，不入 Git）、scripts/release/cli.mjs、src/features/todos/api/todos.api.ts、src/features/todos/services/todo-sync.service.ts、src/features/todos/state/todo-sync-banner.ts、src/features/todos/state/todo-sync-coordinator.ts、src/features/todos/state/todo-sync-provider.tsx、src/features/todos/sync.types.ts、tests/releases/release-env.test.cjs、tests/todos/todo-api.test.cjs、tests/todos/todo-sync.test.cjs、CHANGELOG.md；配套服务端修改位于 D:\irisapi-1。
- 具体内容：① 本机 Expo 会话设置 EXPO_PUBLIC_TODO_CLOUD_SYNC=1，发布脚本把该显式开关传入 EAS preview/production 构建；② Todo HTTP 传输层读取并校验 X-Request-Id，成功写入与批量回包携带关联元数据，开发日志仅记录请求/操作标识和结果摘要；③ 同步服务汇总本轮服务端已接收的修改数，全部完成时显示 4 秒“待办已同步”成功横幅，无上传不打扰，仍有待处理项时继续显示可跳转同步队列的持久重要横幅；④ 错误继续保留本地事实与冻结操作，不记录正文、令牌或游标。
- 验证：修改前后 npm run typecheck 均通过；待办 API/同步定向测试 32/32、发布环境测试 4/4、串行全量测试 343/343 通过；npm run check 的 typecheck、lint、theme:check 均通过，并行测试 336/337，唯一失败为 tests/releases/workspace.test.cjs 触发 Node 测试运行器 Unable to deserialize cloned data 的已知 IPC 偶发错误，随后使用项目稳定参数 --test-concurrency=1 全量复跑通过。客户端与服务端 git diff --check、冲突标记扫描均通过，服务端 npm run build 通过。
- 验收边界：未部署或重启后端，未执行生产数据库迁移，未构建 APK，也未做真机网络、横幅显示或多设备同步验收；修改环境变量后需重启 Metro 才能进入新配置。

---

## 2026-09-21 13:30:55 | 修复问题：合并 PR #113 笔记同步的迁移号冲突

- 变更概述：将远端 561acc6（PR #113，Timmi 的笔记快照/增量同步）合入 kroos_todo，解决 2 个文件的合并冲突。核心冲突为双方同时占用数据库迁移号 7（本地 0007-0009 为 Todo 链，远端 0007 为笔记同步）；已获用户确认采用"远端让位重编号"方案。
- 修改文件：src/core/database/migrations/index.ts、src/core/database/migrations/0010-add-note-sync-state.ts（由 0007 重命名，version 7→10）、CHANGELOG.md、tests/sync/notes-sync.test.cjs、tests/todos/todo-local.test.cjs、tests/todos/todo-reminders.test.cjs。
- 具体内容：① 迁移链合并为 0001-0006 → 0007 create_local_todos → 0008 提醒绑定 → 0009 todo 同步 → 0010 add_note_sync_state，本地链保持连续使本机设备无缝续跑 0010；② 笔记迁移文件重命名为 0010 并置 version: 10（附注释），测试引用路径同步修正；③ todo-local 测试的 CURRENT_DATABASE_VERSION 断言 9→10（合并后终版号）；④ todo-reminders 测试"链尾可重入"由 `.at(-1)` 改为显式重放 0009 createTodoSync——合并后链尾是 0010（PR #113 设计为非可重入，不越权改变）；⑤ CHANGELOG 双方条目按时间倒序合并，远端 9 条插入 09-20 07:57 与 09-19 16:10 之间。
- 验证：npm run typecheck 通过；针对性测试（notes-sync、todo-local、todo-sync、todos、system-notifications、todo-reminders、todo-api）117/117 通过；git diff --check 通过；全仓冲突标记扫描干净（docs/架构指南/GitHub团队开发指南.md 中的标记为文档教学示例，非真实冲突）。
- 已知边界：曾以 PR #113 构建做过真机验证的设备（Timmi 的 Xiaomi，Expo Go 会话）账本记录为 version=7 add_note_sync_state，与合并后期望的 7=create_local_todos 不符，该设备下次启动会触发账本校验错误，需清除应用/Expo Go 数据重建后从正式后端重新拉取笔记（云端有镜像，无云端数据丢失）；本机 kroos_todo 设备不受影响。

---

## 2026-09-21 12:30:07 | 优化代码：数据库事务回滚失败升级为可识别错误并增强账本校验诊断

- 变更概述：修复审查发现的路径 3 隐患——迁移/事务失败后 ROLLBACK 自身失败时原先仅打日志并抛原始错误，可能留下账本与 user_version 分裂的不确定状态。现已升级为可识别的 `DatabaseTransactionRollbackError` 并导出供上层复用；同时账本不匹配错误的文案附带实际/期望账本详情，命中时无需拉库即可定位差异。已获用户确认执行。
- 修改文件：src/core/database/transaction.ts、src/core/database/run-migrations.ts、src/core/database/index.ts、CHANGELOG.md。
- 具体内容：① `transaction.ts` 新增导出 `DatabaseTransactionRollbackError`（携带 `originalError` 与 `rollbackError` 双层原因，消息明示数据库状态不确定、可能需重建），`runPlatformTransaction` 回滚失败分支由"仅 console.error 后抛原始错误"改为抛出该错误类型；② `run-migrations.ts` 的 `assertLedgerMatchesVersion` 抛错消息附上 `user_version`、`actual=[version:name,...]`、`expected=[...]`；③ `index.ts` 导出该错误类型，供后续版本升级/恢复流程按类型捕获并决策。
- 验证：修改前 `npm run typecheck` 通过（基线 exit 0）；修改后 `npm run check`：typecheck、lint、theme:check 通过，测试 305/306，唯一失败 `tests/releases/workspace.test.cjs` 为 Node 测试运行器 IPC 反序列化偶发错误（与本次数据库修改无关），单独复跑 `node --test --test-concurrency=1 tests/releases/workspace.test.cjs` 9/9 全过。未做真机验证（属错误类型与诊断增强，不改变正常路径行为）。

---

## 2026-09-20 22:26:37 | 新增功能：dsh-webhook-remote 远程下发任务插件

- 变更概述：新增 DSH Cordis 插件 `dsh-webhook-remote`，支持从脚本/手机快捷指令通过签名或静态令牌保护的 HTTP 接口远程下发任务，由 DSH webhook 运行时自动创建根会话并执行。已获用户确认按详细设计执行。
- 修改文件：dsh-webhook-remote/{package.json,lib/index.js,README.zh.md}（新增）、scripts/Send-DshTask.ps1（新增）、C:\Users\31268\.dsh\profiles\web\cordis.patch.yml、C:\Users\31268\.dsh\.credentials.yaml、CHANGELOG.md。
- 具体内容：插件在 DSH Web 服务器注册精确路由 `POST /webhook/remote`（body 上限 128KiB），鉴权双通道：`X-DSH-Signature: sha256=<HMAC-SHA256(body,secret)>` 计时安全比较，或 `X-DSH-Token` 静态令牌；payload `{"prompt":"…","title":"…"}`；dispatch 到 `@deepseek-ai/dsh-webhook` 运行时（该运行时经用户 patch 首次启用），规则 `remote-task` 将投递转为 `WebhookSessionRequest`（workspace=D:\IRisNote、agentPreset=standard、permissionPreset=workspace-write、标题前缀 `[Remote]`、60 字节截断）。另注册 `GET /webhook/remote/status`（令牌保护）暴露规则诊断。密钥 `DSH_REMOTE_WEBHOOK_SECRET`/`DSH_REMOTE_WEBHOOK_TOKEN` 已生成并写入 `.credentials.yaml` refs。插件经 `dsh plugin --profile web add D:\IRisNote\dsh-webhook-remote` 以 link 方式装入 profile，并在插件目录内建 junction（指向 npx 缓存 dsh 安装目录的 @deepseek-ai 各包）解决 link 直连导致的 peer 解析失败。
- 验证：`node --check` 语法通过；profile 上下文 `import('dsh-webhook-remote')` 加载成功（exports/inject 正确）；`dsh --profile web --dump-config` 确认 webhook-runtime 与 webhook-remote 两行进入合并配置树；热加载后实测路由：无鉴权 401、错误令牌 401、GET 405、有效令牌 POST 202。⚠️ 遗留：202 后未观察到新会话目录，会话创建在 webhook 运行时内部失败且 warn 仅输出到宿主控制台不可读；已加 status 诊断路由但模块级代码热重载（HMR）无法在运行中生效，需重启 `dsh web` 后复测。

---

## 2026-09-20 21:58:21 | 新增功能：本地独立测试包 staging 构建类型

- 变更概述：新增 Android `staging` 构建类型，产出免 Metro 开发服务器、免电脑、可分发的本地独立测试 APK：release 式打包（内嵌 JS bundle + Hermes 字节码 + 符号裁剪），使用 Debug 证书签名。已获用户确认按方案 B2 执行。
- 修改文件：android/app/build.gradle、CHANGELOG.md。
- 具体内容：`buildTypes` 内新增 `staging { initWith release; matchingFallbacks = ['release']; signingConfig signingConfigs.debug }`（含注释说明用途与边界）。staging 继承 release 的全部打包配置（本项目未启用 R8 压缩，无混淆差异），但显式改用 Debug 签名；库模块变体经 `matchingFallbacks` 匹配 release 产物。日常 Debug/Metro 开发流程与正式发布管控（assembleRelease 生产证书守卫）均不受影响——`assembleStaging` 不进入发布工具流程。
- 构建方式：`npm run gradle -- assembleStaging --init-script <阿里云镜像>`；产物 `android/app/build/outputs/apk/staging/app-staging.apk`。如需瘦身可追加 `-PreactNativeArchitectures=arm64-v8a`。
- 验证：`assembleStaging` BUILD SUCCESSFUL（19m14s，1061 任务）；APK 118.2MB，确认内嵌 `assets/index.android.bundle`（6.59MB Hermes 字节码）；apksigner 验签为 Debug 证书（SHA-256 fac61745…33b9c）；修改后 `npm run typecheck` 通过（本次未触及 TS 源码）。真机独立启动验证未执行（当时无 adb 设备连接），expo-dev-client 在非 debuggable 构建中的运行时行为待装机确认；staging 使用 main manifest，不含 Debug 变体的 cleartext 等配置，连接 http 明文地址不可用。

---

## 2026-09-20 21:54:14 | 修复问题：代码审查发现的同步契约与通知加载缺陷

- 变更概述：按 5 个本地提交（e374f4b…123dd29）的代码审查结论修复 2 项严重缺陷与 3 项建议缺陷。
- 修改文件：src/core/system-notifications/system-notification-provider.tsx、src/features/todos/api/todos.api.ts、src/features/todos/data/todo-sync.repository.ts、src/core/database/migrations/0009-create-todo-sync.ts、src/shared/http/client.ts。
- 具体内容：① Suspense `fallback={children}` 改为 `fallback={null}`，避免原生通知模块加载期间整棵应用树卸载重挂导致屏幕 state 丢失与 effect 双跑；② 批量回执与错误回执中 `current_version` 校验改为仅在字段存在时校验相等，服务端错误路径缺失该字段不再误判 `INVALID_RESPONSE` 触发全量重建；③ `prepareOperations` 移除 completed_at 仅随 is_completed 成对变化才入 patch 的过滤器，完成时间差异始终交服务端裁决，消除对 repo 层校验的隐式依赖；④ 迁移 0009 的 `INSERT…SELECT *` 改为 16 列显式清单，消除两表列序一致的隐式依赖；⑤ HTTP 拦截器判断已有 Authorization 改用 AxiosHeaders 大小写不敏感读取（带普通对象降级），避免未来小写注入产生重复认证头。
- 验证：修改前后 `npm run typecheck` 均通过；`node --test --test-concurrency=1 "tests/**/*.test.cjs"` 314/314 通过、0 失败。未进行设备验收。

---

## 2026-09-20 21:19:42 | 修复问题：Expo Go 安全降级系统待办提醒

- 变更概述：Android Expo Go 运行时不再加载 `expo-notifications` 原生模块，避免 SDK 57 通知包初始化触发远程推送限制并中断 Expo Router 路由加载；开发构建和正式包保留原有待办系统提醒。
- 修改文件：src/core/system-notifications/{system-notification-provider.tsx,system-notification-native-provider.tsx,system-notification-context.ts}、src/features/settings/screens/SettingsScreen.tsx、tests/todos/system-notifications.test.cjs、CHANGELOG.md。
- 具体内容：安全入口使用 `isRunningInExpoGo()` 选择实现。Expo Go 直接透传页面、不创建渠道、不申请权限、不监听点击、不对账或调度；保存带提醒的待办仍会保存并显示开发构建提示。通知原生 Provider 被移至按需加载文件。设置页通知行保持既有 56dp 最小行高、16dp 内边距与 12dp 图文间隔，在 Expo Go 显示“Expo Go 中不可用”、禁用点击且不展示跳转箭头。
- 验证：修改前、后 `npm run typecheck` 均通过；`expo lint`、主题检查与通知定向测试 8/8 通过。`npm run check` 的类型、Lint、主题均通过，但默认并行 Node 运行器在 `tests/releases/workspace.test.cjs` 复现既有反序列化错误；串行 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 最终 314/314 通过。未启动 Expo Go、未构建或进行真机验收。

---

## 2026-09-20 19:35:19 | 新增功能：Todo 前后端交接与客户端云同步

- 变更概述：按用户确认的云同步及冲突界面方案，将既有本地 Todo 接入后端正式契约；基线 `8ea6cca1c1e7fa7d0b367762c04dd312a945b34c`，本条对应未提交工作区。默认关闭网络同步，构建环境 `EXPO_PUBLIC_TODO_CLOUD_SYNC=1` 才启用登录账号同步。
- 数据文件：src/core/database/migrations/{0009-create-todo-sync.ts,index.ts}、src/features/todos/{sync.types.ts,data/todo-local.repository.ts,data/todo-sync.repository.ts,state/todo-store.ts}。新增独立同步镜像、outbox、游标与快照暂存表；本地修改与待提交意图同事务；已冻结操作保持原键和请求，后续编辑保存独立序号；迁移保留原 Todo 数据并对齐后端通用 UUID 契约，设备提醒绑定独立保留。
- 接口与生命周期文件：src/features/todos/api/{todo-wire.ts,todos.api.ts}、src/features/todos/services/todo-sync.service.ts、src/features/todos/state/{todo-sync-coordinator.ts,todo-sync-provider.tsx,todo-sync-events.ts,todo-sync-runtime.ts}、src/core/providers/AppProviders.tsx、src/shared/http/client.ts。校验资源身份、版本、分页和批量回执；复用共享 HTTP 客户端并保留显式捕获的账号 token；全量完整后原子对账，增量事件和游标同事务；账号切换取消、前台/联网/本地变化唤醒、退避重试、401 暂停；仅拉取成功不能宣称上传已完成。
- 界面文件：src/features/todos/components/{TodoConflictDialog.tsx,TodoSyncQueueRow.tsx}、src/features/sync/screens/SyncQueueScreen.tsx。同步队列显示待办及重试/冲突入口；保留本机、基础、云端版本，提供采用云端、保留本地重试、另存新身份；删除冲突禁止原身份复活。沿用 24dp 内边距/圆角、440dp 最大宽度、85% 最大高度、16dp 区块间隔、10dp 按钮间隔；Todo 任务不提供直接删除队列功能。
- 测试与文档：tests/todos/{todo-local.test.cjs,todo-sync.test.cjs,todo-api.test.cjs}、docs/待办/{待办逻辑层设计.md,待办后端API预留契约.md,Todo前后端交接与验收.md,TODO.md}、CHANGELOG.md。覆盖真实隔离 SQLite、本机 HTTP、请求冻结、旧回执、增量回滚、部分批量成功、账号切换和删除冲突。
- 当前验证：修改前类型检查通过；新增 23 项同步与 8 项本机 HTTP 测试通过。最终 `npm run check` 的类型检查、Lint 与主题检查通过；其默认并行 Node 测试在 `tests/releases/workspace.test.cjs` 复现运行器反序列化错误（非断言失败），故命令退出 1。按项目稳定回退 `node --test --test-concurrency=1 "tests/**/*.test.cjs"` 复跑，313/313 通过、0 失败。早期 SQLite 文件测试清理钩子先删目录后关连接导致 Windows EPERM，已修正关闭顺序并复测通过。
- 边界：未连接生产数据库、迁移 006/007、部署后端、构建/发布 App 或开展浏览器/设备验收；正式环境启用和真实 APK 双端联调仍待完成。云端通知副作用复用本地提醒协调器，不上传通知 ID，不请求新的系统权限；游客/预览数据不上传、不自动迁入账号。

---

## 2026-09-20 10:08:19 | 新增功能：Android/iOS 本地系统通知与待办开始提醒

- 已获用户确认附件中的实现方案、48dp 提醒行预览及 iOS Bundle ID `com.mouqiandi.irisNote`；基线为 `e6ca2d5`，本记录对应未提交工作区。
- 依赖与原生配置：package.json、package-lock.json、app.json、plugins/with-local-notification-entitlements.js、assets/images/notification-icon.svg、assets/images/notification-icon.png、scripts/generate-notification-icon.cjs。使用 Expo 安装 expo-notifications ~57.0.20，其依赖令 expo-constants 锁定至 57.0.19；白色透明 96px 图标可由脚本重建。Android 为 Git 忽略的预构建目录，无强制加入生成文件；iOS 本地通知插件移除官方插件默认 APNs entitlement，不接入远程推送或后台推送模式。
- 通知核心：src/core/system-notifications/{system-notification.types.ts,system-notification.service.ts,system-notification-provider.tsx,index.ts}、src/core/providers/AppProviders.tsx。建立 irisnote.reminders.v1 HIGH 渠道，默认声音/振动、PRIVATE、无角标；sync 只保留语义。启动不请求权限；前台系统展示、不重复横幅；冷启动/运行中点击等待归属与导航就绪，进入对应日期，失效通知仅显示通用提示。
- 持久化与恢复：src/core/database/migrations/{0008-create-todo-reminder-bindings.ts,index.ts}、src/features/todos/data/todo-reminder.repository.ts、src/features/todos/services/todo-reminder.service.ts、src/features/todos/state/todo-reminder-coordinator.ts。独立设备绑定表保存 owner/todo、系统 ID、实体版本、触发时刻、状态和错误，不污染实体/后端契约；调度前写意图、串行对账、取消失败阻止重建、删除保留清理记录、系统孤儿清理、账号切换保护。按设备民用时刻解析，DST 缺失报错，重复小时采用较早时刻；失败不回滚保存。
- 交互：src/features/todos/hooks/useTodoForm.ts、src/features/todos/components/TodoFormDialog.tsx、src/features/todos/screens/TodosScreen.tsx、src/features/settings/screens/SettingsScreen.tsx。明确确认未来提醒后才申请权限，自动保存仅提供“开启”横幅操作；增加 @expo/ui 原生 Switch，无开始时间禁用；设置入口显示权限状态并进入系统设置；通知导航重置列表筛选并滚动对应日期，不打开编辑。
- 测试与文档：tests/todos/{todo-local.test.cjs,todo-reminders.test.cjs,system-notifications.test.cjs}、docs/UI/通知渠道适配.md、docs/待办/待办创建弹窗与列表设计.md、docs/待办/待办逻辑层设计.md、CHANGELOG.md。覆盖时间/DST、调度幂等、修改/完成/删除、取消失败、权限、会话竞态、重启恢复、SQLite 文件重开、原生配置及图标。
- 验证：修改前 npm run typecheck 通过；最终检查与 Android 本地编译结果在完成后补充。iOS 配置 introspect 已证明无 aps-environment / remote-notification；Windows 未编译 iOS，未进行真机/浏览器验收、EAS 构建、上传、发布、暂存或提交。
- 已知偏差：当前 expo-notifications 的本地调度输入及 iOS 原生构造不支持 threadIdentifier，只有结果读取字段；iOS 使用 active，自定义分组尚未实现。未宣称支持 timeSensitive/critical、精确闹钟或准点必达。前台恢复前的时区变动、系统容量限制、专注模式与 OEM 行为仍需设备验收。

---

## 2026-09-20 08:31:35 | 修复问题：整周分组列表滚动时序、跨午夜跟随与重试生命周期

- 依据用户提交的外部代码审查意见（P0×2、P1×2、P2×2）修复，已获用户确认修复范围（P0+P1+P2 全部）。仅审查方未改文件，本次修复均落在上一条新增的整周分组功能改动内。
- 跨周选日滚动时序（P0-1）：src/features/todos/screens/TodosScreen.tsx。原实现跨周选日时在旧 `sections` 里定位必然失败，选日只切周不滚动。改为 `deferredScrollDateId` 挂起意图 + `useLayoutEffect([weekId, sections])` 统一消费：目标不在当前渲染则挂起，新数据渲染后滚动；有挂起目标优先滚目标，无目标换周后回顶部（原 `scrollToTop` 移入该 effect）；目标所在周与当前周不符（用户又导航离开）时丢弃陈旧意图。effect 无 setState，仅 ref 与滚动命令，时钟 tick 重建 `sections` 只空跑短路判断。
- 跨午夜跟随（P0-2）：`onWeekChange` 写入 `browsedWeekId` 时归一为 `next === derivedWeekId ? null : next`——点"返回今天"或浏览回派生周即清除覆盖、恢复跨午夜跟随今天所在周；停留其它周时覆盖保留。逻辑层设计 §6.3 同步为现状语义，审查问题 10（文档写意图非现状）一并消除。
- 滚动重试生命周期（P1-3）：重试状态收敛为 `{ dateId, attempts, issuedAt, timer }`——2 秒窗口内最多重试 3 次、重试期间不叠加定时器、卸载时 `clearTimeout`；每次主动发起滚动重置状态，避免陈旧目标被无关失败触发。已知不对称：换周回顶部仍不加重试（首屏失败概率极低）。
- 分组头可见性与无障碍（P2）：`scrollToLocation` 增加 `viewOffset` 补偿（分组头显式 `lineHeight: 18`，常量推算首组 26dp、非首组 42dp），定位后"M月D日"分组头不再被顶出可视区；分组头增加 `accessibilityRole="header"`。
- 测试：tests/todos/todos.test.cjs 新增"整周查询组内排序与单日一致，筛选、空周与非周一 weekId 行为确定"用例，覆盖组内置顶/时刻/优先级三种排序、`filter: "pending"` + 整周、关键词无结果、非周一 `weekId` 的 7 天窗口语义与空周返回 `[]`。初版断言误算 09-21（下周一）在周一周边界内，已按实际周边界语义修正。
- 验证：修改后 `node --test "tests/todos/*.test.cjs"` 35/35 通过；`npm run check` 结果见本条目验证说明（类型、Lint、主题检查及全量测试）。
- 限制：未运行应用或真机交互验收；挂起滚动在"目标日被筛选条件排除且停留当前周"期间保持等待，行为可预期但属新边界。

---

## 2026-09-20 07:57:34 | 新增功能：待办列表按周条可见周整周分组展示

- 已获用户确认实施方案及保持整体布局的文字预览（空白天选择"只显示有待办的天"）。列表从"选中单日"改为跟随右侧周条可见周：周一至周日整周范围内的待办按所属日期分节展示，每天显示"M月D日 周X"分组头（13sp；今天组追加主题蓝"今天"标记，分组头右侧接 1dp `divider` 通栏分隔线；非首节分组头上间距 16dp，头部下缘距首卡 8dp，节内卡片间距 12dp 不变），当天无待办的日期不显示分节；整周无结果显示"本周暂无待办"（搜索无结果仍为"无匹配待办"）。
- 类型与查询层：src/features/todos/todos.types.ts、src/features/todos/domain/todo-query.ts。按逻辑层设计"引入日期范围需新增明确查询类型"的约定新增 `TodoWeekQuery` 与 `queryTodosByWeek`（weekId 起覆盖 7 天，日期升序在前，节内沿用置顶/时刻/优先级统一排序）；原 `queryTodos` 单日查询保留不动，筛选与排序逻辑抽取为共用内部函数，语义不变。
- 组件与页面：src/features/todos/components/TodoCalendarRail.tsx、src/features/todos/screens/TodosScreen.tsx。日期轨道新增受控 `weekId`/`onWeekChange`（不传时保持内部自持，行为不变），可见周状态上提到页面；页面换用 SectionList 按天分节渲染，点选轨道某天滚动到对应分节（`scrollToLocation` + `onScrollToIndexFailed` 延时重试兜底），滑动换周后列表回到顶部；未主动浏览其他周时列表默认跟随今天所在周并随跨午夜更新（`browsedWeekId` 覆盖派生周，无 effect 内 setState）。点选日期仍不改变列表查询范围语义之外的业务：`selectTodoDate` 保留用于周条高亮、滚动定位与新建默认日期。
- 测试与文档：tests/todos/todos.test.cjs、docs/待办/待办逻辑层设计.md、docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。新增整周查询用例（周边界过滤、跨周数据不串、日期升序、关键词过滤）；逻辑层设计更新到 1.2（§2、§6.3、§9.1–9.3 同步整周查询与分节语义），界面基线更新到 1.3（§10 分组头规格、空态与滚动联动）。
- 限制：未运行应用或真机交互验收；`scrollToLocation` 在卡片高度不定时的远距离定位依赖失败重试兜底，极端情况落点可能略偏，待真机验证。

---

## 2026-09-20 05:24:33 | 修复问题：历史笔记空值兼容及正式接口真机验证通过

- 用户已确认修复，并要求使用 npx expo start 局域网调试。文件：src/features/notes/api/notes-sync.types.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 根因证据：设备连接 https://tech-mou.top/api；05:16:50、05:17:32 的真实 /api/notes/snapshot HTTP 200 响应校验失败，data[0].is_pinned 为 null。后端 NoteSyncDTO 明确允许 is_pinned/is_starred 为 boolean|null，原客户端校验不匹配。
- 修复：CloudNote 和解析器仅对这两个字段接受合法 null，镜像保留原值，cloudNoteToLocal 映射为 false；true/false 原样保留。缺失、数字、字符串、对象仍拒绝，其他字段及分页校验不变。未修改线上笔记或数据库结构。
- 自动验证：基于 88495fe 加前轮已授权未提交改动，修改前 typecheck 通过；最终 npm run check 通过（类型、lint、主题、251 项测试，0 失败/0 跳过）。同步测试 27 项通过，包括九种标星/置顶组合、非法类型、SQLite 原值镜像、增量转换、重复事件和编辑时间保持。
- 真机结果：Xiaomi 23113RKC6C（ADB 77b6a943）05:22:15 日志确认正式 API；05:22:18 首次 sync_completed，count=11，elapsedMs=1263；05:23:46 手动刷新 sync_completed，count=11，elapsedMs=655。修复后这两次操作未出现响应校验失败或账号变化警告；未做线上新增/编辑/删除实验，不代表完整多端冲突验收。
- 环境：停止本任务先前的 localhost 服务，执行 npx expo start，默认 LAN 地址 192.168.31.67:8081，按 s 切至 Expo Go；设备以 exp://192.168.31.67:8081 加载，移除本任务的 USB 8081 reverse。开发服务保持运行，加载入口 http://192.168.31.67:8081/_expo/loading。
- 证据边界：同步完成来自实际设备日志；没有取得独立逐请求网络抓包，Inspector WebSocket 返回 401 后未继续。未提交、推送、打包、发布或更改服务端配置，保留此前修复。

---

## 2026-09-20 05:20:44 | 修复问题：历史笔记置顶与标星空值兼容（实施中）

- 用户明确确认修复，并指定后续使用 npx expo start 局域网调试、连接正式后端。此前真机正式请求 /api/notes/snapshot 返回 HTTP 200，data[0].is_pinned 为 null；后端 NoteSyncDTO 继承 boolean|null，与客户端原 boolean 校验不一致。
- 文件：src/features/notes/api/notes-sync.types.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 修改：只允许 is_pinned / is_starred 的合法 null，镜像保留原值，转成本地领域对象时映射为 false；缺失字段、数字、字符串、对象、分页布尔值仍严格拒绝，不修改历史数据库。
- 验证基线：88495fe 加此前未提交修复，修改前 npm run typecheck 通过。新增测试覆盖两个字段的 true/false/null 组合、错误类型拒绝、SQLite 镜像/增量转换和编辑时间不变；最终检查及局域网真机结果待完成。

---

## 2026-09-20 05:11:45 | 修复问题：热更新后笔记同步账号绑定恢复

- 变更概述：用户确认后修复同步模块重新加载、Provider 保留同账号 ref 时直接返回而不恢复 currentOwner 的缺陷；不把本修复等同于原“同步响应无效”问题已解决。
- 文件：src/core/notifications/notification-provider.tsx、src/features/notes/services/note-sync-coordinator.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 具体内容：同账号 layout effect 仍调用幂等 setNoteSyncOwner，不重置通知、不重复欢迎、不取消同账号请求；实际账号变化推进会话代际并 abort 旧请求，阻止 A→B→A 后旧任务继续提交。退出/重登仍使用现有连接会话重置。
- 复现：新增测试执行真实 Provider 源码的 layout effect，模拟保留 refs 与重新加载同步模块；修复前同账号恢复与直接切换再切回两项失败、退出重登通过，修复后三项均通过。使用真实 Node SQLite 和显式网络/React hook 测试替身，不冒充设备运行结果。
- 验证：基于 88495fe 工作区，修改前 npm run typecheck 通过；最终 npm run check 通过（typecheck、lint、theme:check、249 项测试，0 失败/0 跳过），同步测试 25 项通过。git diff --check 通过，修改文件未发现冲突标记。
- 真机边界：ADB 设备 77b6a943 为 device 状态。读取日志仍仅有 05:05:52 的旧“笔记同步账号已变化”；本机未检测到 Expo 启动进程、8081/status 不可达，未重载设备现有应用或宣称真机修复通过。仍需开发服务提供新 bundle 后验证同步及原字段级错误。
- 保留前轮已授权字段诊断改动；本轮未修改后端、数据库、密钥或启动/停止开发服务，未提交、推送、打包、部署。

---

## 2026-09-20 05:10:30 | 修复问题：笔记同步账号重绑定（实施中）

- 用户已确认修复。基于 88495fe 工作区保留前轮字段级诊断改动，修改前 npm run typecheck 通过。
- 文件：src/core/notifications/notification-provider.tsx、src/features/notes/services/note-sync-coordinator.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 同账号 Provider layout effect 重新执行时也绑定同步模块账号，以恢复 Fast Refresh 重建的模块状态，不重复清空通知或显示欢迎提示；setter 同账号幂等，实际账号变化推进会话代际并取消旧请求，阻止 A→B→A 恢复旧任务。
- 修改前新增测试已复现同账号模块重载无法同步、直接切账号再切回未取消旧请求；退出/重新登录场景原先通过。修复后的全量检查与设备验收待完成。
- 本轮不修改响应校验、后端、数据库、密钥或运行中的开发服务，不将账号状态问题视为原响应字段错误已解决。

---

## 2026-09-20 04:57:49 | 修复问题：笔记同步响应字段级诊断完成

- 变更概述：用户确认后，为快照和增量响应校验增加可定位且不含原始数据的错误信息，解决所有不匹配均显示同一句提示、无法确定失败字段的问题；本轮没有修复尚未确认的实际响应差异。
- 文件：src/features/notes/api/notes-sync.types.ts、src/features/notes/api/notes-sync.api.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 解析器：新增 NotesSyncResponseError，标明 data[i] / data[i].data / page / sync 等具体字段路径、预期类型或约束、实际类型；区分缺失、null、格式、账号、序号顺序等问题。所有原校验规则保留，不将非法响应转换成可用数据。
- 请求：只在本地响应校验失败时附加固定接口路径和实际 HTTP 状态。response 仅包含 status，供现有日志显示；不保存响应对象、请求参数、正文、标题、用户 ID、Token、游标或原异常 cause。网络/HTTP 失败与其他异常原样传播。
- 验证：基于提交 88495fe，修改前 npm run typecheck 通过；最终 npm run check 通过（类型、lint、主题、246 项测试，0 失败/0 跳过）。同步测试 22 项通过，新增 3 组覆盖具体字段、嵌套增量、分页结构、敏感值不泄漏、200 响应校验失败上下文，以及 503 错误不被替换；git diff --check 通过，无冲突标记。
- 边界：测试使用显式构造响应和 Axios adapter，并非问题设备的实际响应。需在 App 重载本次代码并再次刷新后，根据新日志确认真正不匹配项。未修改数据库、密钥、后台服务、部署、打包、提交或推送。

---

## 2026-09-20 04:55:01 | 修复问题：笔记同步响应字段级诊断（实施中）

- 用户已确认诊断改造。基线 88495fe，工作区干净，修改前 npm run typecheck 通过。
- 文件：src/features/notes/api/notes-sync.types.ts、src/features/notes/api/notes-sync.api.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 保留现有拒绝规则，错误补充字段路径、预期类型/约束、实际类型以及快照/增量接口和 HTTP 状态。不保存原始响应、正文、标题、用户 ID、Token 或游标，不触及数据、密钥、后端部署。
- 正在补充脱敏诊断与校验回归测试；本轮只增强诊断，原设备响应不匹配的具体原因尚待新日志定位。

---

## 2026-09-20 04:42:02 | 新增功能：App 笔记快照与增量同步接入完成

- 变更概述：用户已确认方案及实施范围。在 a49c363 工作区接入后端 notes/snapshot 与 notes/changes；首次快照后追赶增量，后续复用持久游标，业务读取入口不再调用旧 getNotes()。
- 修改文件：src/core/database/migrations/0007-add-note-sync-state.ts、src/core/database/migrations/index.ts、src/core/notifications/notification-provider.tsx、src/features/notes/api/notes-sync.types.ts、src/features/notes/api/notes-sync.api.ts、src/features/notes/data/note-sync.repository.ts、src/features/notes/data/note-local.repository.ts、src/features/notes/services/note-sync.service.ts、src/features/notes/services/note-sync-coordinator.ts、src/features/notes/services/note-save.service.ts、src/features/notes/notes.events.ts、src/features/notes/screens/NotesScreen.tsx、src/features/notes/screens/NoteDetailScreen.tsx、src/features/profile/hooks/useProfileOverview.ts、src/features/sync/upload-task-adapters.ts、tests/sync/notes-sync.test.cjs、CHANGELOG.md。
- 数据：SQLite v7 新建账号隔离的同步状态、云端镜像和快照暂存表，不改写旧笔记、历史版本和草稿。快照分页暂存，收齐后原子替换云端镜像；增量每页镜像与游标同事务提交，追上本轮及一次新水位后再投影本地，防止中间历史事件回退已接受写入。无变化同步仍需读取本地镜像，不等于本地存储层也只访问变化行。
- 保护：镜像版本识别重复事件、保留删除身份、拒绝异常复活；dirty/syncing 本地内容与云端候选分别保留。云端删除有本地编辑/草稿时保留内容及历史、阻止自动上传；无变化保存不能清除这一保护。旧正文编辑时间冲突协议及不确定创建保护保留，未将客户端时间当作增量顺序。
- 调度：列表、详情、个人页使用共用同步入口；登录、前台恢复、连接恢复及笔记/分类写入后触发，同账号并发请求合并，后台/退出/切账号取消并在事务提交前检查。观察现有 Axios 写入与本地上传回执全过程，写入交叉时停止投影并重试。分类删除仍按最新云端镜像删除分类内笔记后删除分类，未改变既有业务语义。
- 错误：410 有限次重建基线并保留本地候选；401/400/503 等失败不当成空列表、不回退旧全量接口；结构化同步错误按文字显示。密钥留在服务器，App 不持有 SYNC_CURSOR_SECRET。
- 验证：修改前 npm run typecheck 通过；最终 npm run check 通过（typecheck、Expo lint、theme:check、243 项测试，0 失败/0 跳过）。新增 19 项测试使用真实 Node SQLite、可控网络/会话替身和 Axios adapter，覆盖分页续传、事务回滚、快照/游标过期、账号切换、并发上传、删除草稿、旧结构保留、大整数序号等；不能替代生产 HTTP 或 Expo 真机验收。首次完整回归发现静态网络导入影响纯草稿测试，已改为分类删除按需加载，35 项旧草稿测试及最终全量检查均通过。
- 收尾：git diff --check 通过，src 与新增测试未发现 Git 冲突标记。保留原有 package.json、package-lock.json、connection-events.ts 和日志改动；没有新增依赖、提交、推送、服务器迁移、部署、APK 构建/发布，也未停止已有开发服务。
- 上线边界：真实后端需完成 006/007、固定 SYNC_CURSOR_SECRET 及全部实例切换；仍需真实账号、双设备离线/冲突/删除验收。本地状态按账号隔离，测试/生产使用同一 App 数据空间的整体环境隔离不在本轮范围。

---

## 2026-09-20 04:30:50 | 新增功能：App 笔记增量同步接入（实施中）

- 已获用户明确确认。新增账号隔离的云端镜像、快照暂存及游标，分离下载进度与本地编辑。
- 文件：src/core/database/migrations/0007-add-note-sync-state.ts、migrations/index.ts；src/features/notes/api/notes-sync.types.ts、notes-sync.api.ts；data/note-sync.repository.ts、note-local.repository.ts；services/note-sync.service.ts、note-sync-coordinator.ts、note-save.service.ts；notes.events.ts；screens/NotesScreen.tsx、NoteDetailScreen.tsx；src/features/profile/hooks/useProfileOverview.ts；src/core/notifications/notification-provider.tsx；src/features/sync/upload-task-adapters.ts；CHANGELOG.md。
- 增量每页与游标同事务，完整快照先暂存，追上增量后投影；未上传内容与草稿保留，写入期间停止投影。列表、详情和个人页改用共用同步入口；分类删除保留现有删除分类内笔记的语义。
- 修改前基线：a49c363，npm run typecheck 通过。当前实施与测试尚未完成；没有执行服务器迁移、部署或构建发布。保留原有 package.json、package-lock.json、connection-events.ts 与日志改动。

---

## 2026-09-20 04:01:36 | 新增功能：start:test 命令一键切换测试环境启动

- 文件：package.json（新增 start:test 脚本、devDependencies 新增 cross-env）、.env.local（删除）、package-lock.json（cross-env 安装产物）、CHANGELOG.md。
- 已获用户确认。目标：`npm start` 默认连接生产地址（代码默认值 https://tech-mou.top/api），`npm run start:test` 通过命令行注入 EXPO_PUBLIC_BASE_URL=http://test.tech-mou.top/api 连接测试服，实现一条命令切换。
- 删除 .env.local 的原因：Expo CLI 启动时自动加载且优先级最高，其常驻的测试地址会覆盖生产默认值，导致"默认生产"不成立；其中 EXPO_PUBLIC_BASE_URL_LOCAL 无任何代码读取，一并清除。.env.release.local 为发布脚本专用，开发模式不加载，保持不动。
- 使用 cross-env 保证 Windows 下 npm 脚本的变量注入跨平台生效。src/shared/http/client.ts 现有"环境变量优先 + 默认值兜底"逻辑零改动。
- 验证：npm start 启动 Metro 正常（[API] 地址日志需客户端加载 bundle 后出现，未在本次验证）；npm run typecheck 通过，无新增类型错误。未执行构建、上传或发布。

---

## 2026-09-19 16:10:44 | 新增功能：待办 SQLite 本地持久化与异步会话保护

- 已获用户确认实施方案及保持原布局的文字预览；基线 840d7a4881b5820da8e9c560fec4b9dce5a94bd8。范围限本地持久化，不实现云同步、后端 API、通知、系统日历、循环或笔记关联，不新增依赖。
- 数据库文件：src/core/database/migrations/0007-create-local-todos.ts、src/core/database/migrations/index.ts。注册版本 7，创建独立 local_todos 表、所有者与稳定 ID 复合主键、所有者/日期索引及身份、日期时间、布尔、优先级、版本和完成状态检查；已有笔记、草稿、版本及上传队列表不改动。
- 仓库文件：src/features/todos/data/todo-local.repository.ts、src/features/todos/data/todo-memory.repository.ts、src/features/todos/data/todo-repository.port.ts。复用公共数据库生命周期/事务队列；事务内读取当前所有者最新数据，用隔离内存工作集复用既有领域规则，仅差异行执行参数化 SQL。保留稳定 ID 幂等、非重叠字段合并、版本冲突、无变化不写入/不增版本/不广播、批量全部成功或回滚；提交后才发布不可变页面快照。
- 生命周期文件：src/features/todos/state/todo-store.ts、src/features/todos/hooks/useTodoScope.ts。游客采用数据库内稳定 guest:local，账号采用 user:<ID>；切换立即清空快照并加载新归属，落盘数据独立保留且不合并；认证加载、数据库端口更换使旧代次失效，过期加载/写入回执不覆盖新会话。加载失败使用重要横幅重试，旧横幅不能重新激活旧账号。
- 调用方文件：src/features/todos/services/todo-service.ts、src/features/todos/hooks/useTodoForm.ts、src/features/todos/screens/TodosScreen.tsx、src/features/todos/components/TodoFormDialog.tsx、src/features/todos/testing/todo-seeds.ts。保存、完成、批量及删除等待 SQLite 事务回执，失败保留输入/选择并报告；列表抑制重复命令，保存沿用“保存中…”锁定；开发种子按异步回执写入独立 preview 命名空间。布局、配色和 dp 尺寸保持不变。
- 测试与文档：tests/todos/todo-local.test.cjs、tests/todos/todos.test.cjs、docs/待办/待办逻辑层设计.md、CHANGELOG.md。新增 13 项本地仓库/状态层测试并保留 20 项既有领域/内存测试，覆盖 Node SQLite 隔离文件关闭重开、全部字段映射、迁移旧表保留与约束、游客/账号隔离、冲突、批量写入/删除回滚、提交失败重试及切换竞争；设计文档更新到 1.1，明确已实现与后续边界。
- 验证：修改前及第一轮修改后 npm run typecheck 通过；node --test "tests/todos/*.test.cjs" 最终 33/33 通过。追加无变化快照复用和状态层测试后，最终 npm run check 通过（类型、Lint、主题及全部 240 项测试）；git -c core.whitespace=-blank-at-eol diff --check、冲突标记、文档链接/代码围栏及历史日志内容保留检查通过。检查对应上述基线的未提交工作区，不代表新提交或发布版本。
- 限制：旧进程内数据没有可靠迁移来源，首次升级为空表；每次写入读取当前所有者全部待办，大规模数据增量优化未实施；COMMIT 期间切换账号可能留下原所有者的合法写入，但不向新账号发布。Node SQLite 文件测试不代表 Expo 原生 SQLite、真机杀进程恢复或交互验收通过；未运行应用、浏览器、设备、构建、上传或发布，未执行 Git 暂存、提交或推送。

---

## 2026-09-18 17:05:50 | 修复问题：修正时间轮盘的同方向虚拟列表嵌套

- 已获用户确认修复方案及尺寸预览，基线 a967f521ff00ebd75c936db42a269c4c289ddd0e。用户提供的日志与源码一致：时间弹窗的纵向 ScrollView 包含两个纵向 FlatList，触发 React Native 的虚拟列表同方向嵌套告警；此前静态和领域测试未覆盖这项运行时问题。
- 修改文件：src/shared/ui/TimePickerField/TimePickerField.tsx、docs/待办/待办组件实施与提交记录-待审阅.md、CHANGELOG.md。
- 修复内容：小时／分钟轮盘改为普通 ScrollView，固定渲染 24／60 项；初始索引改用固定 contentOffset，点击定位改用 scrollTo。保留 48dp 行高、240dp 可视区、10dp 列间隔、分钟步进、吸附、取消／确定／清除及外层小屏滚动容器，没有改动表单校验和保存逻辑。
- 待审阅记录：新增 C8 根因、修复、检查和未验收边界，补录 C7 的真实 SHA；保留首版检查的历史结果，不将其当作运行时验收。
- 验证：修改前 npm run typecheck 通过；修复后 npm run check 通过类型、Lint、主题检查及全部 227 项测试，失败／跳过均为 0。未新增 UI 自动化测试；未启动应用或复测设备，告警消失、初始位置、滚动吸附、嵌套手势和小屏表现仍待真机验收。
- 按已确认约定追加本地 fix 提交，不推送、不上传、不发布，不改写已有提交历史。

---

## 2026-09-18 04:57:53 | 优化代码：按职责提交待办组件并记录待审阅实施清单

- 已获用户明确授权执行分组本地提交，不推送；分支 kroos_todo，基线 d95fc547c003ac6f77320fb362c9c0e540c345d6。本次不再修改组件逻辑，将此前完成的实现拆成六组代码提交，并将本文档及实现日志单独提交。
- 修改文件：docs/待办/待办组件实施与提交记录-待审阅.md、CHANGELOG.md。
- 实际代码提交：377654e（五色主题令牌）、0ba476f（领域规则／内存仓库／测试）、7bb23f9（公共输入／时间与弹窗组件）、cc2da90（状态／表单会话／时钟 hooks）、e15f3b2（四个列表组件）、4d2ecab（弹窗与页面接入）。待审阅 MD 记录完整 SHA、全部文件范围、依赖、保存退出矩阵、时间与五色判断、筛选排序及批量流程，不将中间提交包装成已独立验收。
- 验证：分组提交前 npm run typecheck 通过；六组代码提交后，对 4d2ecabbb7c1d28c16bece46f125024d0bbaa958 的最终代码运行 npm run check，通过类型、Lint、主题检查及全部 227 项测试（失败／跳过均为 0）。逐组核对暂存范围并运行 git diff --cached --check，通过；本次文件未发现 Git 冲突标记。
- 明确记录未实施持久化、云同步、通知及系统日历；未运行应用、浏览器／真机验收、构建、上传、推送或发布。本文待审阅，静态检查不等于交互验收。

---

## 2026-09-18 04:39:50 | 新增功能：落实待办新建编辑弹窗与五色列表（内存首版）

- 已获用户确认，按待办创建弹窗与列表设计 v1.2、逻辑层设计 v1.0 实现新建／编辑弹窗和列表。数据仅保存在内存，进程重启或所有者切换不保留；未实现持久化、云同步、系统日历、通知调度、关联笔记及循环待办。
- 页面与主题文件：src/app/_layout.tsx、src/features/todos/screens/CreateTodoScreen.tsx、src/features/todos/screens/TodosScreen.tsx、src/features/todos/components/TodoCalendarRail.tsx、src/shared/theme/presets/default-light.json、global.css、CHANGELOG.md。
- 新增业务组件：src/features/todos/components/TodoFormDialog.tsx、src/features/todos/components/TodoCard.tsx、src/features/todos/components/TodoFilterBar.tsx、src/features/todos/components/TodoBatchToolbar.tsx、src/features/todos/components/TodoIconAction.tsx。
- 新增领域与仓库：src/features/todos/todos.types.ts、src/features/todos/todo-colors.ts、src/features/todos/domain/todo-validation.ts、src/features/todos/domain/todo-state.ts、src/features/todos/domain/todo-query.ts、src/features/todos/data/todo-repository.port.ts、src/features/todos/data/todo-memory.repository.ts、src/features/todos/services/todo-service.ts、src/features/todos/state/todo-store.ts、src/features/todos/hooks/useTodoScope.ts、src/features/todos/hooks/useTodoForm.ts、src/features/todos/hooks/useTodoClock.ts、src/features/todos/testing/todo-seeds.ts。
- 公共组件文件：src/shared/ui/Input/Input.tsx、src/shared/ui/index.ts、src/shared/ui/BodyInput/BodyInput.tsx、src/shared/ui/BodyInput/index.ts、src/shared/ui/TimePickerField/TimePickerField.tsx、src/shared/ui/TimePickerField/index.ts、src/shared/ui/Dialog/FormDialog.tsx、src/shared/ui/Dialog/dialog.tsx、src/shared/ui/Dialog/dialog.styles.ts、src/shared/ui/Dialog/DeleteConfirmDialog.tsx。
- 删除确认兼容入口：src/features/notes/components/editor/delete-confirm-dialog.tsx、src/features/notes/components/editor/draft-dialog.tsx、src/features/notes/components/editor/draft-dialog.styles.ts；将通用弹窗、按钮、样式和两秒倒计时删除确认提取到共享 UI，原笔记／分类／草稿调用方通过原入口继续复用，避免待办依赖笔记业务。
- 弹窗：AppModal／Overlay 外壳，24dp 圆角和内距、144dp 正文输入、日期子弹窗、纯 JS 小时／分钟轮盘（1 分钟步进）、优先级、标星与置顶；新建路由透明承载，默认日期继承当前选中日期。确认、取消、遮罩及系统返回遵循统一校验和保存规则；空编辑不删除，保存失败保留输入，保存中锁定，旧所有者／代次禁止提交。
- 列表：主题注册五组底色与强调色，按优先级和完成所属日期显示卡片；按日期及全部／待进行／进行中／已过期筛选，支持搜索、三种排序、置顶、单条完成与编辑。长按进入批量，全选当前结果，标星／置顶按全体开启状态统一取反，删除经共享确认；筛选或日期改变清空选择，外部变更移除隐藏／已删除目标。
- 逻辑：本地日期与任意分钟严格校验，正文统一换行、按 Unicode 码点限制 4000 字，时区缺失不阻断；UUID 会话身份去重、不可变实体、修改字段合并和版本冲突保护、批量全验证后一次广播。统一时钟处理开始／结束边界、午夜、前台刷新和后台暂停。种子仅在开发且 EXPO_PUBLIC_TODO_PREVIEW=1 时进入独立 preview 所有者空间，正常空列表与搜索无结果不注入种子。
- 验证：基于 d95fc547c003ac6f77320fb362c9c0e540c345d6 的未提交工作区；修改前 npm run typecheck 通过，最终 npm run check 通过（类型、Lint、主题及全部 227 项测试）。新增 tests/todos/todos.test.cjs 的 20 项覆盖校验、退出规则、时间边界、五色、创建去重、编辑冲突、所有者、排序和原子批量；共享提取的三项函数与全部样式配方经 AST 对比保持一致（忽略格式）。git diff --check 与本次源码／测试冲突标记检查通过。
- 检查过程：修复本次时间轮盘渲染期 ref 读取的 Lint 错误；全量测试首次因本机缺少已声明的 cos-nodejs-sdk-v5@3.0.0 无法加载 COS 测试，隔离安装并恢复本机该包及依赖后通过。未修改 package.json 或锁文件，未升级应用依赖。
- 未运行应用、浏览器／真机验收、构建、上传或发布；静态检查和领域测试不代表键盘、窄屏、大字体、轮盘、父子弹层及视觉实测已通过。未执行 Git 暂存、提交或推送。

---

## 2026-09-18 03:46:15 | 新增功能：新增待办逻辑层设计与独立后端 API 预留契约（设计文档）

- 文件：docs/待办/待办逻辑层设计.md、docs/待办/待办后端API预留契约.md、docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认。本次仅落地方案文档，不实现页面、组件、数据存储、后端路由、云同步、日历或通知，不新增依赖。
- 逻辑层：定义领域模型、UI/表单/业务/仓库边界、内存首版、校验与时间状态刷新、确认/取消/遮罩/返回退出矩阵、自动保存会话结束、编辑字段合并及并发保护、确定筛选排序、原子批量、账号隔离、开发种子与后续验收清单。
- API 预留：定义独立创建/查询/更新/删除、批量及增量端点；字段和默认值、客户端稳定身份、幂等重试、基础版本冲突、设备字段隔离、快照分页、提交序列、删除防复活、游标过期恢复、错误及后端迁移/联调清单。明确为尚未实现的待评审契约，不作为真实后端已支持的证据。
- 时间规格：按用户要求改为 1 分钟步进，小时 0–23、分钟 0–59，允许 09:01、09:37 等任意分钟；原界面设计 v1.1 → v1.2，更新 §5.2 与文档变更记录，保留其余既有设计内容。
- 验证：文档章节顺序、代码围栏、相对 Markdown 链接、11 段 JSON 示例及冲突标记检查通过；原设计内容逆向还原后 SHA-256 与修改前一致，既有 TodoCalendarRail.tsx 哈希未变。普通 git diff --check 提示原设计元信息的 Markdown 双空格换行，保留既有格式；git -c core.whitespace=-blank-at-eol diff --check 通过。不运行 typecheck、应用测试、构建、真实 API 请求、数据库迁移或浏览器/设备验收；未执行暂存、提交或推送。
- 开放决策：云同步启用策略、跨设备时区及夏令时语义、幂等/快照/墓碑保留期限和真实后端存量迁移，均留待独立立项评审。

---

## 2026-09-18 03:12:47 | 优化代码：待办设计文档升版 v1.1，定稿五色状态卡与筛选批量方案

- 文件：docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认（方向确认后指定先改设计文档，代码未动）。为待办列表新方案定稿设计规范，文档 v1.0 → v1.1。
- 设计要点（按方案推荐值写入，待用户审阅数值）：§10 重写为「五色状态体系（底色/强调色五对：不重要 #C5DFFC/#64A9F7、正常 #FDEBC4/#F9C962 基准、重要 #FCCADB/#F76998、已完成 #CDF9DB/#71EF9B、已结束 #E6E8EA/#ACB2B9）+ 顶部筛选栏（全部/待进行/进行中/已过期 + ⏱排序菜单 + 🔍内联搜索）+ 4dp 强调色竖线卡片 + 长按批量模式（删除/标星/置顶）」；状态推导规则（当日完成浅绿、隔日回看灰+删除线、无时刻当天视为进行中）落入 §10.1。
- 弹窗变更：§3 明确新增/编辑复用同一弹窗（标题「编辑待办」、编辑态删除走共享确认弹窗），新增 §3.4 优先级三段行（替代颜色行）；§6 自由颜色选择器 ContainerColorPicker 移出首版；§5.2 增加纯 JS 时间轮盘实现约束（不引原生依赖，保持 Expo Go 可加载）；§9 增加卡片铃铛为展示态的边界。
- 范围与治理：五色状态色定为业务 Token（palette + nativewindColorRefs，theme:sync 生成）；v1 明确内存 store + 种子数据先行验收，持久化/云同步、循环待办、关联笔记、日历写入、通知调度均不在首版；§12 实现顺序、§13 验收清单、§14 决策（新增「已决 v1.1」小节）同步更新；新增 §15 文档变更记录。
- 验证：纯文档变更，typecheck/eslint 不适用；未修改任何源码与主题文件。

## 2026-09-19 18:19:17 | 新增功能：Archify 交互式系统架构文档

- 文件：docs/架构指南/系统架构图/irisnote.architecture.json、irisnote-architecture.html、README.md、delivery-receipt.json、irisnote-architecture.visual-check.json、irisnote-architecture.visual-check.html、irisnote-architecture.visual-check.1440x900.light.png、irisnote-architecture.visual-check.1440x900.dark.png、irisnote-architecture.visual-check.2048x1320.light.png、irisnote-architecture.visual-check.2048x1320.dark.png（均位于该目录），以及 CHANGELOG.md。
- 用户已确认方案和文字预览。基于客户端 73b664cf543b9bc72c8ff36dd806d36c78dbd310 与服务端 898440c8ea35936e6e355cdce61e5433d448d6a4，绘制页面/本地 SQLite 与 AsyncStorage/上传队列/Axios/Express/PostgreSQL 主链路，补充 Redis、Resend、MinIO，以及本地 Gradle/EAS、源站/COS 分发和 Android 原生更新器。
- HTML 支持浅深色和内置交互，保留可维护 JSON、14 个固定提交源码引用、源码依据与校验收据。明确待办/摘录仍待业务接入；图示为源码架构，不代表线上部署已验收。记录当前完整包与差量策略以及差量补丁由源站分发的边界。
- 验证：修改前 npm run typecheck 通过；npm run check 通过（类型、Lint、主题检查及 224/224 测试）；Archify showcase 9/9、0 错误、0 警告，14 个源码引用验证通过。首版纵向溢出经布局调整解决；最终四种桌面尺寸浏览器检查通过，四张浅深色截图已逐张视觉审阅。
- 仅新增架构文档与生成制品，未修改应用业务逻辑，未执行 APK 构建、上传、发布、Git 提交或服务重启。Archify visual-check 不支持 --headed --persistent，实际使用默认截图检查，未宣称使用上述参数。

---

## 2026-09-18 13:17:10 | 修复问题：临时发布构建工作区结束后自动清理

- 文件：scripts/release/workspace.mjs、scripts/release/cli.mjs、tests/releases/workspace.test.cjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认。默认本地正式构建继续复用当前项目的 reuse-* 缓存；--fresh 和 EAS 的一次性 r-* 工作区在成功、提前返回或构建/上传报错后自动尝试清理，防止正常结束的构建反复累积完整依赖与编译产物。
- 清理能力只绑定本次创建的目录，校验真实父路径、目录类型及文件系统身份，拒绝清理被替换或重定向的工作区。不扫描其他构建，不删除 dist/releases 的正式 APK 或差分基础包。清理失败警告包含残留路径并保留原始结果；强制结束或断电仍可能残留。
- 新增真实临时目录测试，覆盖产物保留、错误退出、上传重试、缓存复用、锁释放、路径替换和目录联接保护。验证：node --test tests/releases/workspace.test.cjs tests/releases/cache.test.cjs 通过（27/27）；npm run check 通过（类型检查、Lint、主题检查、224/224 测试）；另对修改的两个脚本和测试文件直接执行 ESLint，通过；git diff --check 通过，无冲突标记。未执行真实 APK 构建或真机验证。
- 变更前 npm run typecheck 通过（基于 821bc9a）。现有 14 个旧 r-* 的删除预演被工具策略拦截，尚未清理；没有停止已有构建，没有执行正式打包、上传、发布或 Git 提交。

---

## 2026-09-18 12:37:33 | 新增文件：IRisNote 0.2.4 更新说明

- 文件：releases/notes-0.2.4.txt、CHANGELOG.md。
- 已获用户确认。按更新说明编写规范生成 0.2.4（补丁更新，基准 0.2.3 / 86d2955，目标 c7b2b42，工作区干净）：更新应用图标；头像更换改为气泡菜单并增加横幅反馈；更新提示策略对落后较多版本强制更新（用户确认服务端已部署）；修复左右滑动页面时页面边缘灰色细线；修复多设备同步时云端较旧内容可能覆盖本地较新编辑及编辑时间记录问题。排除构建缓存复用、.codegraph 清理等纯开发记录。仅生成文案，未执行预留、构建、上传或发布。

---

## 2026-09-18 12:09:56 | 修复问题：分离圆角背景和边框以避免滑动接缝露灰

- 文件：src/features/notes/screens/NotesScreen.tsx、src/features/todos/screens/TodosScreen.tsx、CHANGELOG.md。
- 用户反馈上一轮调整后滑动时仍有竖向细线，并确认本轮方案及文字预览。当前 React Native 0.86.3 Android BackgroundDrawable 在圆角与边框同时存在时将背景四边各缩进 0.8 个物理像素；笔记右侧、待办左侧没有边框覆盖，可能露出灰色父背景。
- 将笔记和待办的白色背景及对应 30dp 圆角移至现有无边框父容器，内层保留圆角边框和内容布局，避免白色填充触发上述缩进。保留 15dp 顶部间隔、75dp 侧栏、1dp 边框、16dp 内容内边距及 24dp 底部内边距；保留上一轮弹性高度和分页底色修改。
- 验证：基于 6f44167 的未提交修改，修改前 npm run typecheck 通过；修改后 npm run check 通过（类型、Lint、主题一致性及 217/217 测试），git diff --check 通过，修改文件无冲突标记。源码机制与现象吻合，但 ADB 无连接设备，滑动接缝消除效果及圆角外观仍待 Android 真机验证。未构建、发布 APK 或执行 Git 提交。

---

## 2026-09-18 11:58:10 | 修复问题：分页白色底层与内容区高度对齐

- 文件：src/core/navigation/components/SwipeTabsNavigator.tsx、src/features/notes/screens/NotesScreen.tsx、src/features/todos/screens/TodosScreen.tsx、CHANGELOG.md。
- 已获用户确认方案及文字预览。分页承托层和默认场景背景改为纯白主题色 surface，减少页面接缝露出灰底的可能；外层背景及毛玻璃采样结构保持原样。
- 笔记和待办白色容器由 100% 高度加 8dp 底部外边距改为 flex: 1，与摘录页面既有弹性填充规则统一。保留三页 15dp 顶部间距、75dp 侧栏、30dp 外侧圆角、现有边框、内容内边距和底部导航交互。摘录页面本身已符合该规则，无需修改。
- 验证：基于 6f44167 的未提交修改；修改前 npm run typecheck 通过，修改后 npm run check 通过（类型、Lint、主题一致性及 217/217 测试），git diff --check 通过，修改文件无遗留冲突标记。截图接缝的具体来源尚未真机证实，滑动细缝与像素级高度对齐仍需 Android 真机验收；未执行 APK 构建、发布或 Git 提交。

---

## 2026-09-18 11:14:17 | 修复问题：笔记编辑时间记录与新旧内容同步保护

- 文件：src/features/notes/notes.types.ts、src/features/notes/api/notes.api.ts、src/features/notes/data/note-local.repository.ts、src/features/notes/services/note-save.service.ts、src/features/sync/upload-task-adapters.ts、tests/editor/revisions.test.cjs、tests/editor/drafts.test.cjs、CHANGELOG.md。
- 已获用户确认。标题/正文实际变化时生成本地编辑时间，连续编辑与时钟回拨时保持递增；重复保存、置顶、标星、分类调整及上传重试不刷新内容修改时间。
- 上传携带 updated_at；服务端回传时间持久化到已有 server_updated_at 列。较旧云端内容不覆盖本地，较新云端内容生成本地历史版本后合并；同一时间不同内容保留本地并报告冲突。
- 409 冲突快照只对对应笔记及请求版本合并，旧响应不能覆盖新编辑；队列已同步任务不重复上传，旧上传成功但本地还有新版本时继续重试。
- 历史已同步笔记的旧 local_updated_at 可能是同步时间，因此 server_updated_at 为 NULL 时不伪造已知编辑时间；首次有时间的云端同步建立基线。时间规则不能消除不同设备时钟偏差。
- 验证：基于 d00c6b7542aaf22ca29c29d2fd8a8486d8766392 的未提交修改；修改前 npm run typecheck 通过，最终 npm run check 通过（TypeScript、Lint、主题、217/217 测试）。git diff --check 通过，无遗留冲突标记。保留同期出现的 app.json 其他修改。未执行线上迁移、部署、APK 构建或真机验收。

---

## 2026-09-18 11:34:14 | 修复问题：更换头像菜单改为锚点气泡样式

- 文件：src/features/profile/hooks/useAvatar.ts、src/features/profile/screens/ProfileScreen.tsx、CHANGELOG.md。
- 已获用户确认。点击用户中心头像后，“从相册选择/拍照”不再使用 Android 原生系统 Alert 对话框，改为共享 AnchoredPopover 锚点气泡菜单：白底 24dp 圆角面板、三角箭头指向头像、进入/退出动画、点击外部或返回键关闭；行规格为最小高 56dp、内边距 16/12dp、22dp 主题蓝图标、17sp 文字、行间不贯通分割线，触发按钮增加 300ms 防重复打开冷却锁与 expanded 无障碍状态；上传中沿用原位遮罩并禁止打开菜单。
- 附带按《全局横幅通知设计与调用规范》将头像上传成功/失败的系统 Alert 反馈改为全局横幅（稳定 ID avatar-update，成功 success 5 秒自动关闭，失败 important 常驻可关闭并保留具体原因），异步回调经通知会话校验；移除原 Alert 选择菜单的“取消”按钮（点外部即取消）。SettingsScreen 中两处引用原 showAvatarOptions 的代码均在注释块内，未受影响；CategoryBar 只读取头像展示，不受影响。
- 验证：修改前 npm run typecheck 通过（无既有错误）；修改后 npm run typecheck 通过、npm run check 通过（类型、Lint、主题一致性与全部 217 项测试）。静态检查通过不代表真机视觉验收；气泡位置、动画、返回键关闭及横幅反馈待用户在 Android 真机验收。

---

## 2026-09-18 03:04:54 | 新增功能：三版本差分窗口与强制更新

- 文件：src/features/updates/release.ts、src/features/updates/update-store.ts、src/features/updates/UpdateDialog.tsx、scripts/release/cli.mjs、tests/releases/releases.test.cjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 用户已确认规则与原有弹窗交互：落后 1～2 个已发布版本可跳过，落后 3 版强制差分更新，超过 3 版强制完整 APK 覆盖更新；跨主版本仍使用完整 APK。强制弹窗只保留更新按钮，返回或取消安装时先保存草稿再退出。
- 服务端统一限制差分基础版本与发布校验范围；新客户端协商策略版本 2，保留历史补丁供旧客户端兼容升级。保留完整包身份、摘要、签名及安装授权检查。
- 验证：当前源码基于 02d0b6cfff7e2186fb4f9e2b0e95945cbedd7ccd 的未提交改动；修改前 npm run typecheck 通过，最终 npm run check 通过（类型、Lint、主题与全部 207 项测试），其中更新专项 30 项通过。服务端基于 7bc85889019bb5eb71fbffa4b5298a7266540b5d，npm run build、test:releases（15 项）及 test:installer（4 项）通过。git diff --check 通过，无冲突标记。服务端新增路由测试使用注入式数据库/文件响应，未访问生产数据库；UI 断言不是实际渲染验收。未部署服务、未构建上传发布，Android 真机弹窗、退出、完整包覆盖保留数据及旧客户端分步升级待验收。

---

## 2026-09-18 02:27:59 | 优化代码：本地正式 APK 构建缓存复用

- 文件：scripts/release/cli.mjs、scripts/release/workspace.mjs、scripts/release/cache.mjs、tests/releases/cache.test.cjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认。自有渠道使用按项目隔离的固定工作区和互斥锁，按预留提交同步源码并清除过期文件；指纹一致时复用依赖与原生编译输出，依赖、配置、本地模块、构建环境变化或上次构建未完成时重新初始化。
- 每次重新生成 Android 工程后只恢复允许保留的构建输出，避免移除插件后残留原生文件；启用 Gradle Daemon 和构建缓存，增加阶段耗时与 --fresh 全新工作区入口，保留完整检查、版本签名校验及原有上传和差分验证行为。
- 验证：基于 4e9b6292301b9283dbf47fe3b0286490294a075e 的未提交工作区；修改前 npm run typecheck 通过，最终 npm run check 通过（类型、Lint、主题及全部 196 项测试），其中缓存专项 18 项通过；实际 npm 配置读取确认版本号变化不改变配置指纹输入；脚本语法与 git diff --check 通过，无冲突标记。未运行正式 APK 构建、上传或发布，实际冷热构建耗时、Windows Gradle Daemon 下的原生缓存复用和真机差分升级尚未验收。

---

## 2026-09-18 02:08:28 | 新增文件：IRisNote 0.2.3 更新说明

- 文件：releases/notes-0.2.3.txt、CHANGELOG.md。
- 已获用户确认。按更新说明编写规范生成 0.2.3（补丁更新，基准 0.2.2 buildCode 11 / 48bf49a，目标 86d2955）：修复切换底部标签页时毛玻璃区域偶尔出现深灰色闪烁带的问题（a7ba4f9，已通过真机验收）。

---

## 2026-09-17 23:10:03 | 修复问题：Tab 切页毛玻璃采样层稳定化

- 文件：src/core/navigation/components/SwipeTabsNavigator.tsx、src/app/(tabs)/_layout.tsx、src/core/navigation/components/FloatingMenu.tsx、CHANGELOG.md。
- 已获用户确认。将各页面独立的毛玻璃采样目标改为包裹整个切页容器的固定 BlurTargetView，悬浮导航作为同级覆盖层置于采样区域之外，避免采样自身；移除随 activeTab 改变的 BlurView key，切页时复用原生毛玻璃实例。
- 切页容器及采样区域补齐主题背景色，保留页面滑动、懒加载、底栏图标动画、15dp 顶部渐变、66dp 控件高度及 20dp 底部间隔。
- 验证基线：HEAD 48bf49a9b85aa2c6a573b74e98f61fd9f2af9b85 加本次未提交修改；修改前 npm run typecheck 通过，修改后 npm run check 通过（类型、Lint、主题及全部 178 项测试）。首次 Lint 的渲染阶段 ref 传递警告已通过稳定的 Tab 栏组件边界修正并完整重检；git diff --check 通过，无冲突标记。
- 原包复现：USB 真机 Android 17 / API 37，原安装包 0.2.2 buildCode 11 的 712 帧录像中，点击底栏时毛玻璃区域出现横向深灰带（连续第 299～301 帧）；固定采样区域共 30 帧平均亮度低于 150/255，最低 106.05。仅检查按钮下方间隔会漏检；Expo Go 同区域未出现此现象。
- 原生构建：通过本机 Gradle 执行 :app:assembleRelease --offline --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a，并沿用项目 Ninja init script 与正式签名配置，11m 23s BUILD SUCCESSFUL。测试包使用现有构建号 11 / 0.2.2；仅限本机验收，未预留版本、上传、发布或提交 Git。source map 内 3 个改动源码与工作区一致，APK 内 JS bundle 与本次生成产物一致；签名与手机原正式包一致，非 debuggable。
- 修复后真机验收：保留应用数据覆盖安装测试包。首轮混入用户进入设置页的操作，仅采用前 14 秒有效片段（1260 帧），无同类深灰带。用户确认暂停操作后完成独立一轮 21 次底栏点击、4 次横向滑动、2 次纵向滚动，1970 帧中未见同类深灰闪屏（上述阈值异常帧 0）；底栏滚动隐藏与恢复正常。测试进程日志未发现 FATAL EXCEPTION / TypeError / ReferenceError。
- 证据：本机临时目录 irisnote-tab-flash-48bf49a 中保存旧包、测试包、切页录像、异常连续帧、最终时间序列图、操作记录及 source-verification.json / apk-verification.json；测试 APK SHA-256 为 1c108ddba92307eebbe2ea017481202a1ad9169e20b0d05bde91ca58ed8af118。
- 验收收尾：按用户明确选择，以 adb install -r 保留应用数据恢复原正式包 0.2.2 buildCode 11，并通过手机已安装 APK 的 SHA-256 与保存的原包比对确认一致；恢复结果保存在 restoration-verification.json。修复保留在工作区，等待正式发布，手机当前原正式包尚不含此修复。

---

## 2026-09-17 21:26:11 | 优化代码 / 修复问题：原生后台校验与安装授权衔接

- 文件：modules/irisnote-updater/android/src/main/java/expo/modules/irisnoteupdater/IrisNoteUpdaterModule.kt、modules/irisnote-updater/index.ts、modules/irisnote-updater/README.md、src/features/updates/update-store.ts、src/features/updates/UpdateDialog.tsx、src/features/notes/hooks/useNoteDraft.ts、src/features/notes/services/active-draft-flush.ts、tests/releases/releases.test.cjs、tests/releases/active-draft-flush.test.cjs、CHANGELOG.md。
- 已获用户确认。完整目标 APK 摘要校验由正常差量安装流程的 5 次收敛为原生准备完成、实际安装前各 1 次，保留旧包、补丁、目标包身份与签名检查；原生独立线程报告真实读取进度和阶段耗时。
- 更新弹窗可收起并继续编辑笔记；完成后按前台状态衔接安装授权，拒绝授权不循环跳转，授权返回后继续；拉起系统页面前等待草稿写入。
- 后台范围为应用进程存活期间的应用内任务；切到其他应用时延迟拉起安装器，未引入系统常驻服务或自动发布。
- 验证：基于 d70cd4a70fc5f9d95931ec984e48f390d1f324b6 的未提交工作区；修改前后 npm run typecheck 通过，npm run check 通过（类型、Lint、主题及全部 178 项测试），其中更新和草稿协调专项测试 23 项通过。首次 Lint 的计时器纯渲染错误已修正并完整重检。原生 npm run gradle -- :irisnote-updater:compileReleaseKotlin --offline 通过（BUILD SUCCESSFUL，1m 36s）；Debug 检查因 HTTPS 依赖读取长时间等待主动中止，改用已缓存的 Release 依赖完成编译。无冲突标记。
- 真机验收：adb devices -l 无设备，尚未验证实际 UI、授权跳转、编辑流畅度与 10～15 秒校验目标；原生模块编译成功不代表已生成完整 APK 或通过真机安装。

---

## 2026-09-17 22:00:00 | 新增文件：IRisNote 0.2.2 更新说明

- 文件：releases/notes-0.2.2.txt。
- 已获用户确认。按更新说明编写规范生成 0.2.2（补丁更新，基准 0.2.1 buildCode 10 / d70cd4a，目标 301aa45）：修复更新安装授权循环、安装前自动保存活动草稿；优化后台下载衔接与下载进度显示、更新弹窗 UI。仅生成文案，未执行预留、构建、上传或发布。

---

## 2026-09-17 18:30:00 | 优化代码：更新 README 至当前项目状态

- 文件：README.md。
- 已获用户确认。技术栈版本修正为 Expo SDK 57 / React Native 0.86 / Reanimated 4，补充 Zustand、Flash List。
- 功能状态表更新：笔记编辑与恢复、阅读统计、分享导出、本地存储与同步、应用内更新等已实现能力；待办改为开发中（日历轨道）；新增应用内更新模块行。
- 开发检查命令改为实际 npm scripts（check/typecheck/lint/test/theme:check）。
- Android 构建章节更新为已上线能力描述（差量更新、COS 上传）；开发文档链接修正为 docs 重组后的分类路径（架构指南/UI/构建发布/API后端），并新增更新说明编写规范入口；后端描述改为本地同目录项目（GitHub 仓库已不存在）；License 移至文末。

---

## 2026-09-17 18:00:42 | 优化代码：补充更新说明的版本号判断规范

- 文件：docs/构建发布/更新说明编写规范.md、CHANGELOG.md。
- 已获用户确认。更新说明规范新增版本号递增类型判断：按 `X.Y.Z` 区分主版本、第二位功能更新版本号和尾号补丁版本号，并要求先依据上一已发布版本与目标差异判断功能更新、补丁更新、需评估主版本或信息不足。
- 补充功能更新与补丁更新的判定规则、混合更新优先级、纯开发维护记录处理、指定版本号一致性核对，以及维护者交付中需列出的建议版本号和待确认事项。
- 后续调用示例改写为可直接要求 AI 先判断版本类型、再生成用户可见更新说明；交付前检查同步增加版本判断核对项。未修改应用源码、发布脚本或版本配置。

---

## 2026-09-17 11:04:39 | 修复问题：APK 经 CDN 回读并兼容已开启的 COS 版本控制

- 文件：scripts/release/cos.mjs、tests/releases/cos.test.cjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认。COS 默认域名 APK GET 返回 DownloadForbidden，回读改用已配置的 HTTPS CDN 自定义域名，校验 HTTP 200、大小、ETag 与完整 SHA-256；不发送 COS 凭据、禁止重定向，错误时保留远端文件供重试。
- 允许 Enabled 和未开启版本控制；暂停/未知状态仍停止。先检查同名对象，已存在只校验；新上传比对 ETag/版本 ID，校验结束再 HEAD 检查对象稳定性。不修改桶设置、不删除历史版本。Enabled 下禁止覆盖请求头无效，检查不提供跨上传者原子互斥，文档明确并发限制。
- 新增只读 verifyExisting 入口用于已有文件验证；补充 CDN 缓存、大小、摘要、并发版本变化及 Enabled 模式测试。
- 验证：修改前 npm run typecheck 通过；19 项上传专项测试、定向 ESLint 和最终 npm run check（类型、Lint、主题、163 项测试）通过；node --check、git diff --check 及冲突标记检查通过。基于 HEAD d23772fff9dc009db87ae48b07f42cda7425e942 加未提交修改。真实只读下载 CDN 的 IRisNote-0.1.0-6.apk，122182378 字节，SHA-256 c125580baad40ca7f63bbcba43fd5318490be14183ca228ee8eb9cfb6fceff0d，与本地 APK 一致，ETag 和 COS 对象稳定性检查通过。本次未执行真实 PUT、发布、APK 构建或修改云端配置。

---

## 2026-09-17 09:53:59 | 新增功能：APK 自动上传服务器与 COS 并支持失败续传

- 文件：scripts/release/cli.mjs、scripts/release/cos.mjs、scripts/release/upload.mjs、package.json、package-lock.json、tests/releases/cos.test.cjs、tests/releases/upload.test.cjs、docs/构建发布/release.env.example、docs/构建发布/android-releases.md、CHANGELOG.md；本机忽略文件 .env.release.local 仅补齐缺失配置项。
- 已获用户确认。自建 APK 构建并校验成功后串联服务器上传、实际文件回读校验、COS 上传和回读 SHA-256 校验及差量生成；upload 支持匹配草稿重试，不自动发布。
- 默认桶 irisnote-1334342309、地域 ap-guangzhou、CDN https://download.tech-mou.top，无目录前缀；对象名 IRisNote-版本号-构建号.apk。COS 使用官方 SDK 3.0.0，仅作为开发依赖，上传密钥从构建子进程环境移除。
- 同名文件实际内容一致才跳过，冲突禁止覆盖；版本控制开启/暂停时停止，不自动修改桶配置。服务器/COS 已上传文件在失败时保留。下载侧沿用后端 CDN HEAD 检测及服务器回退，不修改后端。
- 配置示例敏感值改为占位符；文档说明权限、回读流量、公开对象与发布状态的区别、30 秒缓存和失败恢复。
- 验证：修改前 npm run typecheck 通过；修改后 npm run check 通过（类型、Lint、主题与 158 项测试，其中新增 14 项上传/COS 测试含真实 SDK 本地 HTTP 验证）；irisapi 的 npm run test:releases 10 项通过；额外对新增 .cjs 测试执行定向 ESLint，补齐显式 Buffer 导入后通过；node --check、git diff --check 及冲突标记检查通过。基于 HEAD d23772fff9dc009db87ae48b07f42cda7425e942 加本次未提交改动。COS 凭据尚未配置，未进行真实云端上传、发布、APK 构建或设备验收。

---

## 2026-09-17 03:22:24 | 优化代码：差量包上传成功后删除基础 APK 并保留补丁记录

- 文件：scripts/release/cli.mjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认。preparePatches() 上传差量包成功后，删除临时下载的基础 APK（rm force），保留 `<构建>-from-<基础构建>-*` 目录及 update.hdiff 与元数据作为本机补丁记录；上传失败仍抛异常并保留现场。
- 文档补充该清理行为说明。验证：node --check、定向 ESLint、修改前后 npm run typecheck、releases 相关 17 项测试、git diff --check 均通过；未执行真实差量上传。

---

## 2026-09-17 01:46:36 | 新增功能：生成 0.2.0 版本更新说明并调整说明文件命名规范

- 文件：releases/notes-0.2.0.txt、docs/构建发布/更新说明编写规范.md、CHANGELOG.md。
- 已获用户确认。按规范核实版本范围（上一发布 0.1.0 构建 6 提交 10b265a，目标为待构建草稿，范围 10b265a..35e48f3），面向用户改写待办日期轨道与标签栏互换两条可见变化，并保留待办/剪贴占位提醒。
- 说明文件命名规范调整为 UTF-8 纯文本 `releases/notes-<版本号>.txt`，文件名不加构建号、draft 等附加词，与现有 0.1.0 文件一致；同版本多次构建复用同一文件。
- 验证：未改应用源码，无需 typecheck；未执行构建、上传、发布或 Git 写操作。目标提交与对比范围见交付说明，0.2.0 构建号尚未预留。

---

## 2026-09-18 03:46:15 | 新增功能：新增待办逻辑层设计与独立后端 API 预留契约（设计文档）

- 文件：docs/待办/待办逻辑层设计.md、docs/待办/待办后端API预留契约.md、docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认。本次仅落地方案文档，不实现页面、组件、数据存储、后端路由、云同步、日历或通知，不新增依赖。
- 逻辑层：定义领域模型、UI/表单/业务/仓库边界、内存首版、校验与时间状态刷新、确认/取消/遮罩/返回退出矩阵、自动保存会话结束、编辑字段合并及并发保护、确定筛选排序、原子批量、账号隔离、开发种子与后续验收清单。
- API 预留：定义独立创建/查询/更新/删除、批量及增量端点；字段和默认值、客户端稳定身份、幂等重试、基础版本冲突、设备字段隔离、快照分页、提交序列、删除防复活、游标过期恢复、错误及后端迁移/联调清单。明确为尚未实现的待评审契约，不作为真实后端已支持的证据。
- 时间规格：按用户要求改为 1 分钟步进，小时 0–23、分钟 0–59，允许 09:01、09:37 等任意分钟；原界面设计 v1.1 → v1.2，更新 §5.2 与文档变更记录，保留其余既有设计内容。
- 验证：文档章节顺序、代码围栏、相对 Markdown 链接、11 段 JSON 示例及冲突标记检查通过；原设计内容逆向还原后 SHA-256 与修改前一致，既有 TodoCalendarRail.tsx 哈希未变。普通 git diff --check 提示原设计元信息的 Markdown 双空格换行，保留既有格式；git -c core.whitespace=-blank-at-eol diff --check 通过。不运行 typecheck、应用测试、构建、真实 API 请求、数据库迁移或浏览器/设备验收；未执行暂存、提交或推送。
- 开放决策：云同步启用策略、跨设备时区及夏令时语义、幂等/快照/墓碑保留期限和真实后端存量迁移，均留待独立立项评审。

---

## 2026-09-18 03:12:47 | 优化代码：待办设计文档升版 v1.1，定稿五色状态卡与筛选批量方案

- 文件：docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 已获用户确认（方向确认后指定先改设计文档，代码未动）。为待办列表新方案定稿设计规范，文档 v1.0 → v1.1。
- 设计要点（按方案推荐值写入，待用户审阅数值）：§10 重写为「五色状态体系（底色/强调色五对：不重要 #C5DFFC/#64A9F7、正常 #FDEBC4/#F9C962 基准、重要 #FCCADB/#F76998、已完成 #CDF9DB/#71EF9B、已结束 #E6E8EA/#ACB2B9）+ 顶部筛选栏（全部/待进行/进行中/已过期 + ⏱排序菜单 + 🔍内联搜索）+ 4dp 强调色竖线卡片 + 长按批量模式（删除/标星/置顶）」；状态推导规则（当日完成浅绿、隔日回看灰+删除线、无时刻当天视为进行中）落入 §10.1。
- 弹窗变更：§3 明确新增/编辑复用同一弹窗（标题「编辑待办」、编辑态删除走共享确认弹窗），新增 §3.4 优先级三段行（替代颜色行）；§6 自由颜色选择器 ContainerColorPicker 移出首版；§5.2 增加纯 JS 时间轮盘实现约束（不引原生依赖，保持 Expo Go 可加载）；§9 增加卡片铃铛为展示态的边界。
- 范围与治理：五色状态色定为业务 Token（palette + nativewindColorRefs，theme:sync 生成）；v1 明确内存 store + 种子数据先行验收，持久化/云同步、循环待办、关联笔记、日历写入、通知调度均不在首版；§12 实现顺序、§13 验收清单、§14 决策（新增「已决 v1.1」小节）同步更新；新增 §15 文档变更记录。
- 验证：纯文档变更，typecheck/eslint 不适用；未修改任何源码与主题文件。

---

> > > > > > > > > Temporary merge branch 2

## 2026-09-17 14:55:23 | 修复问题：固定输入框右侧操作容器的原生层级

- 文件：src/shared/ui/Input/Input.tsx、CHANGELOG.md。
- 已获用户确认。Android 完整原生日志确认：清除应用存储后登录时，密码框右侧眼睛按钮的原生视图仍挂在包装容器 146 下，却被 Fabric 要求插入登录表单容器 182，触发 `The specified child already has a parent` 并使应用退出。
- `Input` 的 `trailing` 包装 `View` 增加 `collapsable={false}`。密码按钮在登录提交时由可点击切换为不可点击、登录完成后恢复时，该包装层将始终保留为独立原生容器，避免视图扁平化改变按钮父级；不改密码显隐、按钮禁用语义、尺寸、间距、登录请求、路由或数据逻辑。
- 调用范围已核对：`trailing` 插槽当前仅由认证字段的密码显隐按钮使用；`InputSave` 明确排除此插槽。无新增依赖。
- 验证：修改前 `npm run typecheck` 通过；修改后 `npm run check` 通过（typecheck、Expo lint、theme:check、147/147 测试，退出码 0），`git diff --check` 通过，未发现 Git 冲突标记。未构建、安装或进行真机登录验证；需使用包含此修复且与原复现包同配置的 Android 安装包验证清除系统数据后的登录、失败后重试和密码显隐。

---

## 2026-09-17 13:57:54 | 优化代码：补充清除系统存储后提交登录闪退的定向诊断日志

- 文件：src/features/auth/screens/LoginScreen.tsx、src/core/navigation/components/SwipeTabsNavigator.tsx、src/features/profile/screens/ProfileScreen.tsx、src/features/notes/screens/NotesScreen.tsx、CHANGELOG.md。
- 已获用户确认。现象为 Android 系统设置清除应用存储后，填写邮箱、验证码和密码并提交登录时闪退；历史崩溃签名为 Fabric `addViewAt` / `The specified child already has a parent`。现有栈未能对应具体业务组件，本次仅补充诊断，不宣称已修复闪退。
- 统一使用 `[IRisNoteCrashTrace]` + JSON 输出阶段与 Unix 毫秒时间戳。登录记录请求返回、会话保存、状态刷新、资料同步、用户中心跳转请求/派发、成功提示请求及失败所在阶段，各阶段包含相对提交开始的耗时；导航记录挂载/卸载、实际激活的 Tab 与索引切换请求；用户中心记录挂载/卸载及存活耗时。
- 笔记页记录挂载/卸载、本地读取、云端获取、对账、列表更新请求、同步完成、失败或账号归属变化导致的跳过，并记录各阶段数量及请求累计耗时；列表数据提交后记录数量。派发路由或提交 React 数据不等同于原生画面成功显示，需与 AndroidRuntime / SurfaceMountingManager 日志对齐判断。
- 新增日志不含邮箱、密码、验证码、Token、用户资料、笔记正文或响应/错误正文；不改 UI、登录请求、会话写入、路由目标、同步对账、排序与列表裁剪策略。无新增依赖、测试或持久化诊断数据。
- 验证：修改前 `npm run typecheck` 未报告错误；修改后 `npm run check` 通过（typecheck、Expo lint、theme:check、147/147 测试，退出码 0），`git diff --check` 通过，四个改动源码未发现 Git 冲突标记。检查基于 HEAD `61054b3cceafc7c98de84545cd30009090d27e70` 加当前工作区；未构建、安装、清除设备数据或进行真机登录复现，需用户使用包含本次日志的应用版本复现后继续定位。

---

## 2026-09-17 13:26:02 | 优化代码：忽略 irisnote-updater Gradle 构建产物并移出误提交缓存

- 文件：.gitignore、CHANGELOG.md（另通过 `git rm -r --cached` 移出 16 个索引文件，本地文件保留）。
- 已获用户确认。`.gitignore` 追加 `modules/*/android/build/` 规则；`git rm -r --cached` 将先前误提交的 16 个构建缓存移出索引：`modules/irisnote-updater/android/build/` 下 8 个 debug 产物（BuildConfig.java、R.jar、R.txt 等）与 `modules/irisnote-updater/android/.gradle/` 下 8 个缓存文件。
- 动机：v3 出包尝试后 git status 被 45 项 build 中间产物刷屏；且规则缺失前已有 16 个缓存文件进入仓库历史。清理后 git status 仅剩真实改动，协作者克隆不再携带二进制垃圾。
- 验证：`git check-ignore -v` 确认 build 与 .gradle 两类路径分别命中新规则（.gitignore:67）与既有规则（.gitignore:64）；暂存删除恰好 16 项。未触碰任何源码，typecheck 不适用。

---

## 2026-09-17 10:31:10 | 优化代码：待办日期轨道间距对齐笔记页轨道节奏

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 已获用户确认（方案+UI 文字预览）。以笔记页左侧分类轨道实测节奏（1272×2800 截图像素扫描+源码互证：条目 50×60、间距 6、节距 66dp）为基准，统一待办页右侧日期轨道。
- `DAY_SIZE=50` 拆分为 `DAY_WIDTH=50`/`DAY_HEIGHT=60`/`DAY_GAP=6`：7 张日期卡高 50→60（宽不变）、容器 gap 2→6；「返回今天」按钮与今天占位高 50→60、上边距 8→6（改用 DAY_GAP 联动节奏）；月份头维持 50×50 与笔记页头像位对应。轨道节距由 52dp 变为 66dp，与笔记页一致。
- 未触碰：轨道总宽 75、页面结构、分隔线 28×2/my-8、AppCalendar 月历弹层（48dp 格，如需统一另行立项）。无新增功能。
- 验证：修改前后 `npm run typecheck` 均 0 错；`npx eslint --no-cache` 单文件通过；无测试引用该组件。UI 待用户真机验收。

---

## 2026-09-17 03:27:16 | 新增功能：笔记排序同步与分层列表设计文档

- 文件：docs/架构指南/笔记排序同步与分层列表设计.md、CHANGELOG.md。
- 新增阶段二正式设计稿：以「排序=已同步字段的推导函数」为总则，服务端 `notes` 增 `updated_at`/`pinned_at`/`starred_at` 三时间戳列（值变化才盖章、互不牵连、服务端唯一盖章方），客户端镜像存储后按 `(is_pinned, is_starred, 层内时间戳, id)` 总序排序，单 FlatList 四段分层（置顶已标星→置顶未标星→标星→普通）。
- 记录行为语义（编辑不打乱层内次序、置顶/重置顶跳层顶）、多设备到达序 LWW 与 `id` 同刻决胜、存量回填建议（`created_at`）、`pinned_order`/`local_order` 退役计划、实施顺序（服务端先行向后兼容→客户端切键→UI 分层须文字预览）与残余风险（批量合法变序仍依赖 RN 上游修复）。
- 2026-09-16 23:46:17 落地的 reconcile 护栏为本设计的兼容层，文档内互相引用。本次只新增文档，未改代码、依赖与构建配置。
- 验证：`npx tsc --noEmit` 通过（0 错，未触及 TS 文件）；检查 Markdown 结构、相对路径引用、`git diff --check` 空白与冲突标记。

---

## 2026-09-16 23:46:17 | 修复问题：同步对账不再抹除本地排序字段，消除启动约 40 秒闪退

- 文件：src/features/notes/data/note-local.repository.ts、tests/editor/revisions.test.cjs、CHANGELOG.md。
- 问题现象：release 包（versionCode 2）连续三次在启动约 40-48 秒时前台闪退，堆栈为 Fabric `addViewAt: failed to insert view at index 13`，根因 `The specified child already has a parent`。
- 问题根源：`GET /notes` 不下发 `local_order`/`pinned_order`，而 `reconcileServerNotes` 对每条已同步行无条件 UPDATE，把 `local_order` 覆盖成服务端数组下标、`pinned_order` 抹成 NULL、`local_updated_at` 刷成当前时间。服务端回包（约 40 秒）后整表排序改变，FlatList（initialNumToRender=8 + maxToRenderPerBatch=6，第 14 格即 index 13）发生整表 key 搬移，撞上 RN 0.86 Fabric 批量挂载"插入先于移除"的竞态而崩溃；置顶顺序每次同步被抹属同一根源的数据丢失。
- 修复方案：UPDATE 前增加逐字段变化检测（title/content/category_id/created_at/is_pinned/is_starred 及服务端提供的排序值），完全无变化的行整行跳过；有变化时排序字段保序回填（`note.local_order ?? existing.local_order`、`note.pinned_order ?? existing.pinned_order`）。效果：同步回包后无实际变化的数据在本地产生逐字段相同的笔记数组，FlatList key 零移动，竞态无从触发；该语义同时是服务端将来下发排序字段（推导排序方案）后的前向兼容层。
- 选择理由：设备侧 dropbox 三次崩溃签名一致（index 13、存活 40-48s）；结构排查排除日历组件（容器子数不足）与重复 id（client_id 负数隔离 + 唯一约束），唯一与"index 13 插入"结构吻合的是笔记列表批量挂载。修复保序而非改列表参数，拔的是触发器本身。
- 风险评估：仅影响"服务端未提供排序字段"时的回填行为（服务端现状即不提供），语义收紧；不触碰正文/版本/同步状态字段与 INSERT 分支。`local_updated_at` 读取方仅 `getLocalNotes` 排序兜底，已排查无隐藏依赖。
- 验证：修改前 `npx tsc --noEmit` 0 错留底；新增 3 个回归用例（无排序字段回包保留本地值且不刷新时间戳、标志变化仍生效、服务端提供排序值时采纳），`tests/editor/revisions.test.cjs` 23/23 通过；`npm run check` 中 tsc/eslint/theme 通过、全量测试 146/147（唯一失败 `tests/releases/source.test.cjs` 为 tar 执行失败，经 git stash 前后对比确认为存量环境问题，与本次修改无关）。真机验证待用户出包：连续多次冷启动并停留超过 1 分钟，确认不再闪退。

---

## 2026-09-16 23:32:21 | 优化代码：新增面向用户的版本更新说明编写规范

- 文件：docs/构建发布/更新说明编写规范.md、AGENTS.md、CHANGELOG.md。
- 已获用户确认。新增 Agent 编写流程、版本与提交范围核实、用户可见内容筛选、通俗文案规则、正文模板、技术记录改写示例及交付检查清单；在 AGENTS.md 增加读取入口。
- 说明文件按版本号和构建号命名，未预留时使用草稿文件名；补充预留时读取文案、普通文本显示和说明长度限制，不自动执行构建、上传、发布或 Git 写操作。
- 验证：修改前后 npm run typecheck 均通过；npm run check 通过（类型、Lint、主题及 144 项测试，0 失败/跳过）；文档链接、Git 差异、空白和冲突标记检查通过。验证基于 HEAD fe77d5b0c4f4ae44f80dda5c09b5d6868a2e805b 加本次未提交文档。本次未生成具体版本说明、构建安装包或进行真机验收。

---

## 2026-09-16 16:28:01 | 优化代码：构建产物按版本号分目录存放

- 文件：scripts/release/cli.mjs、docs/构建发布/android-releases.md、CHANGELOG.md。
- 已获用户确认（文件夹命名取仅版本号）。build() 的 APK 与 .apk.json 输出目录由 `dist/releases/` 改为 `dist/releases/<版本号>/`，目录递归自动创建，同版本多次构建共处一夹、靠文件名区分；preparePatches() 的差量补丁临时工作目录同步归入版本子目录。
- 已有顶层旧产物不自动迁移，保留原地；后续 inspect/upload/patches 的 `--apk` 参数需指向新子目录路径，文档示例已同步更新。
- 验证：node --check 语法检查、定向 ESLint、git diff --check 通过；未执行真实构建、上传或发布。

---

## 2026-09-16 16:49:35 | 新增功能：待办创建弹窗与列表设计文档

- 文件：docs/待办/待办创建弹窗与列表设计.md、CHANGELOG.md。
- 新增待办创建弹窗、公共正文输入、日期时间、容器颜色、笔记关联和待办列表卡片的完整设计规范；布局尺寸、字体、圆角、间距、颜色层级与状态均引用现有 IRisNote 视觉设计和公共组件规范。
- 明确取消创建、确认创建、遮罩点击与系统返回的保存语义；正文非空时遮罩关闭自动保存，空内容不创建，外部日历或通知失败不得丢失本地待办。
- 记录系统日历按场景申请读写权限、本地优先关联笔记、开始时间单次普通提醒以及动态通知不适用于待办/日历场景的边界。本次只修改文档，未实现页面、组件、数据表、依赖或平台权限。
- 验证：修改前后 `npm run typecheck` 均通过；文档完成后检查 Markdown 结构、相对链接、Git 差异、空白错误及冲突标记。未运行应用、构建、浏览器或真机验收。

---

## 2026-09-16 16:18:30 | 优化代码：待办日期轨道月份标题与返回今天按钮

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 日期轨道与右侧栏顶部间隔调整为 0dp，顶部新增 50dp 中文月份标题（如“八月”），标题下复用 28×2dp 分隔线；跨月周优先显示当前周内所选日期的月份，未选中该周日期时取该周中间日所属月份。月份块作为锚点，点击后使用公共 `AnchoredPopover` 打开 `AppCalendar` 快速跳转，选择日期后自动关闭并切换到对应周。
- 原快速跳转左箭头及公共气泡月历替换为 50×50dp 主题色圆角矩形“返回今天”按钮，仅显示 `Undo2` 图标；点击后回到今天所在周并选中今天，到达今天时隐藏整个按钮并保留同尺寸占位。周一至周日七项及 2dp 日期间隔保持不变。
- 真机发现按钮初版因 `className` 与函数式样式互操作而收缩为图标边界，现将 8dp 外间距移至独立外层，按钮本体沿用日期按钮的纯原生样式路径。验证：定向 Expo ESLint、全量 `npx tsc --noEmit`、`git diff --check` 及日历测试 13/13 通过；ADB 实测非今日状态按钮为 50.1×49.7dp，到达今天后按钮节点消失，月份锚点为 50.1×49.7dp。未代替用户点击设备打开气泡验收。

---

## 2026-09-16 16:00:45 | 修复问题：待办日期轨道固定单周与翻周手势

- 文件：src/features/todos/components/TodoCalendarRail.tsx、CHANGELOG.md。
- 根据真机截图与 ADB 布局导出修复右侧日期轨道。旧实现同时挂载前一周、当前周和下一周，未形成固定高度视口，真机实际连续暴露 2025-06-13 至 2025-06-29，并由 ScrollView 回中逻辑造成翻周方向与落点混乱。
- 日期轨道改为只创建当前周 7 个节点，固定从周一排列到周日；标签由“一/二/…”补全为“周一/周二/…/周日”。日期项保持 50×50dp，相邻纵向间隔 2dp。
- 移除三页 ScrollView 与回中逻辑，改为 Gesture Handler 在手势结束时单次换周：上滑进入下一周，下滑返回上一周；快速跳转的左箭头与公共气泡月历保持不变。
- 验证：连接设备 `3B15AL01DR100000` 的修改前布局导出确认轨道越界；修复后定向 Expo ESLint、全量 `npx tsc --noEmit`、`git diff --check` 及日历测试 13/13 通过。设备当前显示“Cannot connect to Expo CLI”，未将新源码加载到真机，因此修复后的视觉与手势仍待重新连接后验收。

---

## 2026-09-16 14:42:13 | 修复问题 / 优化代码：导航器回调类型与 Agent 构建验收规则

- 文件：AGENTS.md、src/core/navigation/components/SwipeTabsNavigator.tsx、tests/notifications/banner.test.cjs、CHANGELOG.md。
- 已获用户确认。新增类型安全、修改前后检查、合并后复验与发布提交核对等七条规则。
- withLayoutContext 使用原始 SwipeTabsNavigator 函数类型，避免 Expo Router 工厂返回的 any 丢失组件属性，恢复 screenLayout 与 tabBar 的回调参数推断；不改变界面和运行逻辑。
- 修改前基线：npm run typecheck 报 tabs/_layout.tsx 三处 TS7031/TS7006。首次完整检查的类型、Lint、主题检查通过；测试 129 通过、1 失败，原因是已提交的通知测试冲突标记。已合并测试冲突，保留后台/停止状态断言、异步等待和清理逻辑，并显式设置前台状态；清理日志冲突标记、保留双方记录。最终 npm run check 全部通过：类型检查、Lint、主题检查、144 项测试（0 失败/跳过）。导航器修改前后转译的 JavaScript 完全一致；定向 diff --check 通过，src/tests/scripts 与本次文档未检出遗留冲突标记。验证基于 HEAD 4af524d 的本次未提交工作区；未执行 APK 构建或真机验收。

---

## 2026-09-16 04:16:59 | 修复问题：Ninja 长路径及 Build Tools 37 签名解析验证完成

- 文件：scripts/release/workspace.mjs、scripts/release/ninja.mjs、scripts/release/cli.mjs、scripts/android/ninja.init.gradle、scripts/release/lib.mjs、tests/releases/workspace.test.cjs、tests/releases/releases.test.cjs、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- Windows 发布改用项目盘短目录与项目专用 Ninja 1.12.1，通过本次 Gradle init script 指定 CMAKE_MAKE_PROGRAM。Worklets、Reanimated、Expo 各架构缓存已核对指向新工具；保留共享 SDK 与全局环境。
- 构建号 2 的原预留提交 2d45ce0ab302094cb99dfc5480bef8eaf0fe4e57 在 D:/iris-build/r-5zeXpb/source 实测：构建前检查及 129 项测试通过，Gradle BUILD SUCCESSFUL，1071 tasks，24m 50s；四种架构原生编译成功，无 manifest still dirty 循环。
- 用户另行确认兼容 Build Tools 37 输出。旧脚本仅识别 Signer #1，新 apksigner 输出 V2 Signer；已增加严格整行匹配，保持多证书、重复及畸形指纹拒绝。13 项相关回归测试通过，定向 ESLint 与 diff --check 通过，正式 inspect 命令实际通过。测试文件补充 Node Buffer 导入与 __dirname 声明。
- 产物：dist/releases/IRisNote-1.0.0-2.apk 及 .apk.json；包名 com.mouqiandi.irisNote，大小 121781286 bytes，SHA256 7dec125ca8589fed872e6729e8e33ae5efe1a0bbcb7dc82abb36c6f4e34a4981。apksigner 校验成功，证书与本地正式配置一致。
- 原构建 CLI 曾在最后证书解析处退出；经独立严格校验导出产物后，修复后的 CLI inspect 再次验证通过。未为解析修复重复进行完整原生编译。
- 未提交代码、上传、发布或安装到设备；设备运行效果仍待验证。完整构建日志：.expo/release-build-2-short-path.log。

---

## 2026-09-16 03:44:48 | 修复问题：Windows 发布构建 Ninja 重生成循环（验证中）

- 文件：scripts/release/workspace.mjs、scripts/release/ninja.mjs、scripts/release/cli.mjs、scripts/android/ninja.init.gradle、tests/releases/workspace.test.cjs、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- 用户确认修复并验证完整构建。Windows 临时源码改用项目盘 iris-build 短路径，允许 IRIS_BUILD_ROOT 覆盖并校验路径；Linux/macOS 保留系统 Temp。
- 新增 setup-ninja 安装项目专用 Ninja 1.12.1，归档和默认二进制均校验 SHA-256；自建及 doctor 检查版本，支持 IRIS_NINJA_PATH 指向用户工具。通过本次 Gradle init script 在 Android 模块 CMake 参数指定工具，不覆盖共享 SDK、不更改全局配置。
- 初步验证：同一旧构建目录下，Ninja 1.10.2 将存在的 Hermes CMake 文件误判为缺失，1.12.1 dry-run 不再出现该误判；短路径及工具版本测试 2 项通过。构建号 2 已在新短目录启动完整构建，日志 .expo/release-build-2-short-path.log，尚未宣称 APK 构建成功。

---

## 2026-09-16 03:20:57 | 修复问题：发布检查中的编辑器与通知测试失败

- 文件：src/features/sync/note-upload-queue.ts、src/features/sync/upload-task-adapters.ts、src/features/notes/data/note-draft.repository.ts、src/features/notes/services/new-note-draft-session.ts、src/features/notes/services/note-save.service.ts、tests/editor/drafts.test.cjs、tests/editor/revisions.test.cjs、tests/notifications/banner.test.cjs、CHANGELOG.md。
- 按用户修复指令收窄队列依赖导入，避免保存模块经汇总入口加载无关 Expo 原生运行时；测试 SQLite 初始化加入真实上传队列迁移，验证保存入队与后续上传两个阶段。
- 测试暴露并修复实际缺陷：显式草稿的文件清理意图作为 removeExplicitFile 布尔值持久化到队列，执行任务时恢复受草稿会话/序号检查保护的清理操作；文件删除失败保留恢复记录。历史无标记任务保持原行为，不猜测删除文件。
- 手动上传增加正在同步状态检查，保留结果未知时禁止重复创建及跨账户访问约束。
- 通知测试按前台异步发布行为等待结果，并新增后台与停止后不发布横幅的回归测试。未改通知业务逻辑，未移除或跳过失败断言。
- 验证：完整 npm run check 成功，类型检查、Lint、主题检查及 129 项测试全部通过；diff --check 通过。测试使用 Node SQLite 和显式网络/文件替身，未作真机或真实服务验收。
- 未提交、构建、上传或发布；发布需提交修复并重新预留构建号。

---

## 2026-09-16 03:15:56 | 修复问题：独立构建的 CSS 声明及笔记保存返回类型

- 文件：src/types/expo.d.ts、src/features/notes/services/note-save.service.ts、CHANGELOG.md。
- 已获用户确认。新增持久 Expo 类型引用，使干净构建无需自动生成的 expo-env.d.ts 也能识别 CSS 副作用导入；为 saveNewNoteLocalFirst、saveEditedNoteLocalFirst、finishDraftSave 显式声明 Promise<NoteSaveResult>，统一可选 draftCleanupPending 的返回类型。
- 验证：正常 TypeScript 检查及编译器屏蔽 expo-env.d.ts/.expo/types 后的全项目检查均通过；Lint、主题检查、diff --check 通过。保存服务修改前后转译出的 JavaScript 完全一致，未改变运行逻辑。
- 完整 npm run check 停在测试阶段：72 通过、3 失败。drafts.test.cjs、revisions.test.cjs 加载 expo-modules-core/src/index.ts 时触发 ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING；banner.test.cjs:135 读取未定义对象的 lifetime 失败。未修改这些测试或扩大业务修复范围，APK 构建仍被检查门槛阻塞。
- 未提交、预留、构建或发布。应用源码修复需提交并重新预留，原构建号仍绑定旧提交。

---

## 2026-09-16 03:07:33 | 修复问题 / 优化代码：筛选发布源码并修复 Windows 中文路径解包

- 文件：scripts/release/source.mjs、scripts/release/cli.mjs、tests/releases/source.test.cjs、docs/android-releases.md、CHANGELOG.md。
- 用户确认先梳理构建输入。按预留提交的根目录清单排除 docs、releases、助手/编辑器目录、已审查的根文档与日志；保留源码、资源、原生模块、配置、测试、脚本、许可证与未知新增输入，不删除原仓库文件。
- Windows tar 显式使用 hdrcharset=UTF-8；在原失败归档上真实解包成功，中文文件名正确；其他平台参数保持不变。
- 验证：真实当前提交导出后核对 343 个文件与 Git blob 内容（332 个文本文件按已有 core.autocrlf 转换换行），原生模块摘要校验通过；15 项发布相关测试、定向 ESLint 与 diff --check 通过。回归覆盖中文、空格、长文件名、许可证、检查脚本、文档排除与已提交源码隔离。
- 未运行 APK 编译、上传或发布。构建号继续绑定原提交，修复导出入口后可重试原编号；应用代码变更需要重新预留。

---

## 2026-09-16 01:44:34 | 优化代码：补充本地发布配置

- 文件：.env.release.local、CHANGELOG.md。
- 按用户授权填写已确认的公开 API 地址和本机 SDK/JDK 路径，并填写项目现有签名文件路径；保留已有配置值，空差量工具路径改为采用默认查找。
- 验证：配置可解析，SDK/JDK/签名文件路径存在。管理令牌、签名密码/别名与证书指纹尚待补充，签名文件正式用途待用户确认；未构建或发布。日志不包含敏感配置值。

---

## 2026-09-16 01:31:59 | 优化代码：发布工具自动加载本地配置

- 文件：scripts/release/env.mjs、scripts/release/cli.mjs、tests/releases/release-env.test.cjs、.gitignore、docs/release.env.example、docs/android-releases.md、CHANGELOG.md。
- 已获用户确认。所有发布命令自动读取项目根目录 .env.release.local，使用 Node 内置配置加载功能，终端及 CI 已有变量优先；文件不存在时支持纯环境变量，其他读取错误停止命令且不打印配置内容。
- 保持应用 .env.local 独立；确认 .env*.local 忽略规则覆盖发布配置，更新模板复制说明、引号和空值规则。不创建或覆盖真实密钥配置。
- 验证：3 项隔离子进程测试通过，覆盖根路径定位、终端优先及空值、Windows 路径、带 # 的值、可选文件和读取错误；CLI 语法检查、Git 忽略检查及 diff --check 通过。未执行 APK 构建、上传或发布。

# CHANGELOG

## 2026-09-16 15:51:22 | 优化代码：待办页右侧竖向日期轨道与快速跳转

- **变更概述**：待办页将原内容区横向周历移入右侧 75dp 预留栏，改为按周展示的七日竖向日期轨道；日期轨道距栏顶部 30dp，单元格采用与笔记分类图标同级的 50dp 方形基准。今天固定显示主题色，点击其他日期显示淡色选中态；上下翻动切换周，左箭头以公共锚点气泡弹窗打开月历快速跳转。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 移除内容区顶部横向日历，挂载右侧日期轨道。
    - `src/features/todos/components/TodoCalendarRail.tsx` - 新增：竖向周分页、日期状态色和公共气泡月历跳转入口。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 Expo ESLint、`git diff --check` 与 `node --test tests/ui/calendar.test.cjs`（13/13）通过；全量 `npx tsc --noEmit` 仍有 6 个既有错误，位于 `src/app/(tabs)/_layout.tsx`（3）及 `src/features/notes/components/editor/new-note-editor.tsx`（3），本次文件未出现类型错误；未启动浏览器、模拟器或真机。

---

## 2026-09-16 15:37:16 | 优化代码：新增全局 Git 提交命令技能调用规则

- **变更概述**：将“任务完成后强制调用 `git-commit-command` 技能”的持久规则写入全局 Codex 提示词。规则要求技能基于实际 Git 状态区分本次与无关改动、无变更时说明原因，并禁止在用户未明确要求时自动暂存、提交或推送；跨项目全局指令按约定在当前项目日志记账。
- **修改文件列表**
    - `C:\Users\31268\.codex\AGENTS.md` - 全局协作约定新增 Git 提交命令技能调用与 Git 写操作边界。
    - `CHANGELOG.md` - 记录本次全局提示词变更。
- **验证结果**：已完成提示词内容与差异检查；未执行 Git 暂存、提交或推送。

---

## 2026-09-16 15:26:56 | 优化代码：剪贴与待办页面容器互换

- **变更概述**：按确认方案完成剪贴与待办页面的容器职责互换。剪贴页移除右侧工具栏预留和内容圆角，白色内容区撑满可用宽度；待办页恢复原有 AppCalendar，并采用左侧内容区加右侧 75dp 预留栏的横向结构，右侧栏与笔记分类栏的宽度和背景保持一致。既有剪贴、待办页面顺序调整保持不变。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 移除右侧 75dp 栏与圆角内容卡片，改为全宽、无圆角的剪贴内容区。
    - `src/features/todos/screens/TodosScreen.tsx` - 恢复 AppCalendar，改为内容区与右侧 75dp 预留栏的横向布局。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 Expo ESLint 与 `git diff --check` 均通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 14:22:17 | 新增功能：公共日历组件待办跟踪文档

- **变更概述**：应用户要求在 `docs/待办/` 新建日历组件专线跟踪文档（与既有 `待办事项.md` 公共组件线同模式）。内容：① 记录 AppCalendar 周月双形态（路线 B）当前落地进度——规范 v1.1、依赖安装、五个源码文件与 Date ID 工具、待办页 12dp 挂载、13/13 单元测试与静态检查（commit 12679b9，工作区干净）；② 沉淀六项关键裁定史（路线 B 定案、矩形圆角 16dp、单分隔线、周视图交互、挂载间距、范围外事项）防反复；③ 链接规范/公共组件规范/FlashCalendar 调研/节假日数据源调研/TODO 总索引/CHANGELOG 条目六份关联文档；④ 补充剩余清单四组：验收类（真机对账、手势、无障碍、视觉验收）、实现类（AppCalendarList、待办页业务联动、日历弹窗）、路线 B 三项已知取舍处置、节假日数据源两项待决策。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/待办/公共日历组件待办.md` - 新增：公共日历组件待办跟踪文档（首版）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：文档内 6 个相对链接目标逐一核对存在；进度事实摘自规范 v1.1 §9/§10、CHANGELOG 2026-09-16 10:58:50 条目与 git log（12679b9，`git status --short` 干净）；未启动浏览器、模拟器或真机。

---

## 2026-09-16 10:58:50 | 新增功能：日历公共组件 AppCalendar（周月双形态，路线 B）并挂载待办页

- **变更概述**：按已确认计划（路线 B：flash-calendar）实现日历公共组件族并首次挂载。① 新增 `AppCalendar`：周视图（收起态单周条，左右分页翻周、滚动窗口边缘静默重建近似无限翻页、跨月日期正常渲染）与月视图（44dp 标题行 + IconButton compact ghost 导航翻月、min/max 钳制）双形态；下滑展开、上滑收起（垂直位移 >14dp 判定 + 220ms 高度动画），展开/收起按选中值锚定。选中/今日为整格 48×48 矩形圆角（radii.control 16dp 连续圆角，用户裁定取代 v1.0 的 40dp 圆），今日 surfaceSelected 底蓝字，范围中段全宽色带端点仅外侧圆角；唯一分隔线在表头行底（用户裁定，标题行下不画），分隔线到首行日期 0dp（主题容器负 margin 抵消库内 4dp 统一间距）。② 周条与月视图共用 CalendarTheme 映射（模块级常量，引用稳定）与 flash-calendar 日格积木（Calendar.Item.Day/WeekName + buildCalendar 周行元数据）。③ 选值状态机：single 再点不取消；range 起点→终点→早于起点重设→第三击重来，受控/非受控并存（外部值回显保留内部阶段）。④ Date ID 全链路本地时区工具（toDateId/fromDateId 等，杜绝 UTC 偏移）。⑤ 待办页（第二页）挂载：容器上边框下 12dp，周视图默认，受控单选。AppCalendarList 契约保留未实现（无调用方）。已知取舍（用户确认路线 B 时知情）：flash-calendar 无逐格无障碍标签注入点；范围内禁用日显示选中态。
- **修改文件列表**
    - `src/shared/utils/date-id.ts` - 新增：Date ID 本地时区工具（toDateId/fromDateId/addDays/addWeeks/toMonthId/addMonths/startOfWeekId/formatMonthTitle/weekdayLabels 等）。
    - `src/shared/ui/Calendar/calendar-logic.ts` - 新增：纯逻辑（single/range 选值状态机、toActiveDateRanges、锚定与收起/展开目标计算、月份导航钳制、周滚动窗口）。
    - `src/shared/ui/Calendar/flash-calendar-theme.ts` - 新增：视觉规格常量 + CalendarTheme 映射（矩形圆角状态表、表头 gap 归零与 0dp 间隔负 margin、activeDayFiller 补缝色）+ 模块级格式化函数。
    - `src/shared/ui/Calendar/WeekStrip.tsx` - 新增：收起态周条（分页 ScrollView 滚动窗口 + flash-calendar 日格复用 + 星期表头）。
    - `src/shared/ui/Calendar/AppCalendar.tsx` - 新增：主组件（月视图标题行/导航、flash-calendar Calendar 承载、viewMode 受控/非受控、PanResponder 手势、高度动画）。
    - `src/shared/ui/Calendar/index.ts` - 新增：组件族导出。
    - `src/shared/ui/index.ts` - 追加 AppCalendar 及类型导出。
    - `src/features/todos/screens/TodosScreen.tsx` - 挂载 AppCalendar（pt-3 = 距容器上边框 12dp，initialViewMode="week"，受控单选状态）。
    - `tests/ui/calendar.test.cjs` - 新增：13 项 Node 单元测试（时区往返/闰年/跨月/周起点/状态机全语义/钳制/锚定/窗口）。
    - `docs/UI/日历公共组件规范.md` - 升级 v1.1：周视图双形态、矩形圆角状态表、单分隔线裁定、路线 B 定案与取舍、验收清单勾选、§10 实现勘误。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：`npx tsc --noEmit` 新增/修改文件零错误（仓库另有 6 处未触碰文件的既有错误：`_layout.tsx` ×3、`new-note-editor.tsx` ×3）；定向 `npx eslint --no-cache` 全部通过（tests 目录按项目惯例不参与 eslint，与既有测试一致）；`node --test tests/ui/calendar.test.cjs` 13/13 通过；全量 `npm test` 82/84，2 个失败为 `tests/editor/drafts|revisions.test.cjs` 的既有环境问题（Node 24 拒绝对 node_modules/expo-modules-core TS 源码做类型剥离，与本次改动无关）。未启动浏览器、模拟器或真机；真机对账与视觉验收待用户执行。

---

## 2026-09-16 07:56:02 | 优化代码：剪贴板页预留右侧工具栏

- **变更概述**：剪贴板页在内容卡片右侧预留与笔记页分类栏相同的 75dp 工具栏栏位，沿用应用背景与现有卡片的右上角圆角；当前仅保留布局空间，未接入工具操作。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 将页面改为内容区与右侧工具栏栏位的横向布局。
    - `CHANGELOG.md` - 记录本次剪贴板工具栏预留。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

## 2026-09-16 07:52:27 | 优化代码：剪贴板页镜像笔记容器

- **变更概述**：剪贴板摘录页采用与笔记页对应的容器布局：顶部 15dp、应用背景、白色内容卡片、16dp 内容内边距与底部 8dp 间距；卡片使用右上角内容圆角，并按镜像方向保留上、右、下边框。
- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx` - 使用镜像笔记页的剪贴板内容容器承载现有占位内容。
    - `CHANGELOG.md` - 记录本次剪贴板页容器调整。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:47:46 | 新增功能：通知渠道适配文档（Android / iOS / 鸿蒙调研）

- **变更概述**：应用户要求，产出三平台系统通知能力调研与适配文档，按普通/重要/动态三分类对照。关键结论：① Android 渠道自由度最高（任意自建 NotificationChannel，importance 建后锁死、用户可全量覆盖，HIGH 即第三方打扰上限）；iOS 无渠道概念、分级随单条通知（passive/active/timeSensitive/critical，critical 需 Apple 特批、笔记类不适用）；鸿蒙为固定 7 类 SlotType 枚举白名单制（SERVICE_INFORMATION 默认即 LEVEL_HIGH 横幅，LIVE_VIEW 渠道三方不可直接创建，须走 Live View Kit 系统代理 + AGC 场景审核）。② 动态通知：Android 16 Live Updates 政策明令禁止"即将到来的日历事件"，鸿蒙实况窗 11 类模板场景无笔记类且 8 小时上限、需 AGC 申请，iOS Live Activities 需持续变化实时内容——三平台均无本项目合规场景，动态通知暂不立项。③ 项目侧盘点：系统通知零实现（无 expo-notifications 等任何依赖，设置页为 disabled 占位"规划中"），需求散落于 TODO.md L72、后续开发指南 §14、视觉设计规范"系统通知必须独立立项"约束、服务端手册 §19 远期推送；已实现的 src/core/notifications 为应用内横幅，与系统通知分层并行。④ 给出渠道映射草案（提醒=HIGH/timeSensitive/SERVICE_INFORMATION，回执=LOW/passive/CONTENT_INFORMATION）、Expo SDK 57 落点（expo-notifications 渠道 API 与 interruptionLevel 均已支持、Live Activities 不在其内、鸿蒙无 Expo 构建目标）与风险清单（Android 14+ 精确闹钟收紧、鸿蒙授权弹窗仅一次等）。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/UI/通知渠道适配.md` - 新增调研与适配文档（版本 1.0）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：平台事实均以官方文档当日核验（Android developer 文档 Live Updates 硬性要求与政策禁项、Apple HIG 与 WWDC21 时效性通知、华为实况窗文档 8 小时/准入原则/AGC 申请、OpenHarmony API 参考 SlotType/SlotLevel 枚举值与 requestEnableNotification 单次弹窗机制、Expo v57 notifications SDK 文档 API 清单）；项目侧结论来自全库检索（依赖、android 构建配置、src/ 通知引用、docs 需求出处逐条核对）。

---

## 2026-09-16 07:48:32 | 优化代码：待办页仅保留上边框

- **变更概述**：待办主容器增加与笔记页主内容卡片一致的 1dp 上边框；左右及底部边框、阴影和分页虚线保持移除，容器仍全高铺满。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 主容器增加 `border-t border-note-page-border`。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:46:55 | 优化代码：撤销笔记页左边框隐藏

- **变更概述**：按用户指令撤销上一轮笔记主内容卡片左边框隐藏，恢复其上、左、下边框；待办页无边框、无阴影、无分页虚线的当前状态不变。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 恢复主内容卡片左边框。
    - `CHANGELOG.md` - 记录本次撤销。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:45:18 | 修复问题：隐藏笔记页左侧分页边框

- **变更概述**：笔记页主内容卡片移除左边框，避免横向切换时其随场景平移至待办页交接位置形成残留竖线；保留上、下边框、圆角、间距及笔记业务逻辑。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 主内容卡片改为仅上、下边框。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：待执行定向 ESLint 与差异空白检查；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:41:51 | 修复问题：移除待办页分页虚线

- **变更概述**：删除待办页左侧中段虚线分割 View，横向分页切换不再显示任何人为分页线；待办容器继续保持无边框、无阴影与全高铺满。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 删除绝对定位的分页虚线。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:38:12 | 修复问题：移除待办页分页侧向阴影

- **变更概述**：待办主容器移除 `shadow-lg`，使横向切换时顶部和底部不再出现连续的左右投影线；保留白色背景、全高布局及左侧中段浅色虚线。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 删除主容器侧向阴影类。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:35:09 | 修复问题：隐藏笔记页右侧分页边框

- **变更概述**：笔记页主内容卡片移除右边框，避免横向切换至待办页时露出连续分页竖线；保留上、左、下边框、圆角、内容间距与现有笔记业务逻辑。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 四周边框改为仅上、左、下边框。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:32:57 | 修复问题：待办页无边框铺满容器

- **变更概述**：移除待办主卡片上、右、下实线边框以及 8dp 底部外边距，卡片自顶部 15dp 铺至页面底部；保留左侧中段浅色虚线，避免横向分页时出现连续左右边界线。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 主卡片改为无四周实线、无底部留白的 `flex-1` 容器。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 07:21:45 | 修复问题：减弱待办页交接分割线

- **变更概述**：移除待办主卡片左侧贯穿全高的实线边框，避免其覆盖交接虚线造成分页边界过于明显；保留中间 50% 高度的虚线，并改用 `divider` 色与 50% 不透明度。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 左侧边框改为无边框，仅保留中段浅色虚线。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：定向 ESLint 通过，`git diff --check` 通过；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:36:33 | 优化代码：待办页连续卡片容器

- **变更概述**：待办页占位内容改置于与笔记页主内容区同高的白色底层卡片；卡片保留笔记页边框和阴影层级、不使用圆角，并在左侧交接边缘增加仅覆盖容器中间 50% 高度的虚线，使横向切换笔记与待办时页面边界连续可辨。
- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx` - 新增待办主内容卡片、左侧中段虚线分割线与内容内边距。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git diff --check` 通过。定向 ESLint 与 `tsc --noEmit` 均因当前 WSL 1 无法解析 Windows Node.js 安装目录而未启动，未产生代码诊断；未启动浏览器、模拟器或真机。

---

## 2026-09-16 06:25:18 | 新增功能：节假日数据源调研与选型文档

- **变更概述**：应用户要求实测五类节假日数据源（date-holidays / Nager.Date / Calendarific / Abstract Holidays API / 中国专项）并落成调研文档。核心实测结论：全球库均不掌握中国"放假安排"（date-holidays 2026 春节仅 2/16–18 三天、Nager CN 仅 6 条单日，实际春节休 2/15–23 且 2/14、2/28 补班）；chinese-days 的 isWorkday/isInLieu/调休区间实测全对（含 10/10 补班周六判定，附赠农历互转与 24 节气）；chinese-workday npm 包 CJS require 直接报错（打包缺陷）；timor.tech API 被 Cloudflare 人机校验拦截。文档给出「本地双源 + 每年更新」分层选型：中国查询层用 chinese-days、全球覆盖用 date-holidays（推荐构建期生成精简 JSON，10.97 MB 全量不可进 RN bundle）、更新通道挂 holiday-cn + 应用内更新，并附 HolidayProvider 统一接口草案衔接 /日历 命令、AI 日程与 AppCalendar 七态打点；另勘误原对比表（Nager 实测 204 国、date-holidays 206 国、全球库"中国调休✅"均为误标）。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/学习参考/节假日数据源调研与选型.md` - 新增调研文档。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：数据均为当日实测——Nager.Date 公开 API 实调（CN 2026 六条、AvailableCountries 204 国）；holiday-cn 2026.json 拉取核对（国庆 10/1–7 休、9/20 与 10/10 补班真值）；date-holidays / chinese-days / chinese-workday 于临时目录 npm 安装后 Node 实跑（isHoliday/isWorkday/getHolidaysInRange 输出、包结构 exports 与 `require("fs")` 依赖检查）；GitHub API 核对星数/推送时间/协议（date-holidays 1101★、Nager.Date 1410★、chinese-days 1292★、holiday-cn 2.1k★）；Calendarific 免费档 500/月为官网口径（未注册实测），Abstract 免费档为第三方口径并已在文中标注。

---

## 2026-09-16 06:06:55 | 新增功能：安装日历库依赖 flash-calendar 与 flash-list

- **变更概述**：按用户指令为日历公共组件（见 `docs/UI/日历公共组件规范.md`）启动技术路线 B，执行依赖安装。`npx expo install @shopify/flash-list @marceloterreiro/flash-calendar`：flash-list 由 Expo SDK 57 的 bundledNativeModules 自动定版 2.0.2（官方第三方库列表在列，Expo Go 可用），满足 flash-calendar v2.0.0 的 peer 要求 `@shopify/flash-list >= 2.0.0`；flash-calendar 安装 ^2.0.0（node_modules 实际 2.0.0，dist 入口与类型文件完整）。仅依赖变更，未写任何业务代码。
- **修改文件列表**
    - `package.json` / `package-lock.json` - 新增 `@shopify/flash-list@2.0.2`、`@marceloterreiro/flash-calendar@^2.0.0` 两条依赖。
    - `node_modules`（不入库）- 随安装更新。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：`npx expo install` 退出无错误（尾部仅既有 audit/allow-scripts 提示）；package.json 与 node_modules 双侧版本核对一致（flash-list 2.0.2、flash-calendar 2.0.0）；flash-calendar 包 `dist/index.js` + `dist/index.d.ts` 入口存在。SDK 57 文档 `/versions/v57.0.0/sdk/flash-list` 确认 flash-list 属官方支持第三方库。注意：FlashList 含原生代码，若后续在未内置该版本的 Expo Go 上加载失败，需升级 Expo Go 至 SDK 57 版或改用 dev build。

---

## 2026-09-16 06:02:09 | 新增功能：日历公共组件规范文档（AppCalendar / AppCalendarList）

- **变更概述**：应用户要求，按《IRisNote视觉设计规范》《公共组件规范》的 Token 体系与文档体例，编写日历公共组件的目标规范（未实现）。定义 AppCalendar（单月含导航）与 AppCalendarList（多月滚动）两组件：布局总览 ASCII 图含关键间距标注（单元格 48×48dp 水平无缝、行距 4dp、选中圆 40dp、月份行 44dp、表头 32dp、分隔线 1dp）、日期格七态样式表（默认/今天/选中/范围中间/按压/禁用/非本月，全部映射 semanticColors 语义 Token）、Date ID 数据契约（禁手工 toISOString 转换）、single/range 两种模式的受控 props TS 契约与点击语义、无障碍规格、技术实现路线（路线 A 纯自绘零依赖 vs 路线 B 基于 flash-calendar 的 theme 映射表，并警示项目未安装 FlashList 而 flash-calendar v2 硬性要求 ≥2.0.0）、验收清单。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/UI/日历公共组件规范.md` - 新增组件规范文档（版本 1.0）。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：样式数值全部取自既有规范原文（17sp/13sp 字号档、#007AFF 品牌蓝、surfaceSelected #EAF2FF、divider #E0E0E0、pressedOpacity 0.85、borderCurve continuous、IconButton compact 40×40/触控 44 规格）；项目未安装 @shopify/flash-list 的事实经 package.json 核实；`src/shared/ui/` 落位与导出方式经目录核实。

---

## 2026-09-16 05:45:09 | 新增功能：Flash Calendar 调研与自定义方案文档

- **变更概述**：应用户要求调研 React Native 日历库 Flash Calendar（marceloprado/flash-calendar，npm `@marceloterreiro/flash-calendar` v2.0.0，MIT，1505 stars），并将调研结果落成文档。内容含项目概况、核心特点（FlashList 驱动、6kb gzip、仅依赖 mitt、Date ID 时区安全）、组件与核心 API（Calendar / Calendar.List / useDateRange 等）、四个层级的自定义方案（theme prop 三态函数、布局格式 props、组件自组合、行为级定制）、IRisNote 集成注意事项（重点：v2.0.0 peer 依赖要求 @shopify/flash-list >= 2.0.0）、参考链接。纯文档新增，无业务代码改动。
- **修改文件列表**
    - `docs/学习参考/FlashCalendar_调研与自定义方案.md` - 新增调研文档。
    - `CHANGELOG.md` - 记录本次新增。
- **验证结果**：数据来源均为当日实测核对——GitHub API（stars/协议/最近提交时间）、npm registry（dist-tags/peerDependencies）、官方文档站（usage/customization/tips-and-tricks）、源码（`tokens.ts` 色板、`Calendar.tsx` 的 `CalendarTheme` 类型、`CalendarThemeProvider.tsx`）。

---

## 2026-09-16 04:31:56 | 修复问题：重写提交消除行尾符假差异污染

- **变更概述**：经用户确认，将 c3993a3（优化 tab ui，因行尾转换失效夹带约 300 个文件的 CRLF 假差异并已经 PR #94 合入 master）重写为规范化版本：回退到 de3fb17 后新增 `.gitattributes`（`* text=auto`）并 `git add --renormalize`，纯行尾文件与污染前逐字节相同自动剔除，重做提交仅含 58 个真实改动文件 + `.gitattributes`，并保留原提交时间戳。随后强推 kroos 与 master（--force-with-lease）。协作者需 `git fetch` 后 `git reset --hard origin/master` 重新对齐；PR #94 在 GitHub 上仍显示 Merged 但提交已被替换，属预期外观现象。
- **修改文件列表**
    - `.gitattributes` - 新增，声明 `* text=auto` 锁定行尾规范。
    - `CHANGELOG.md` - 记录本次修复。
    - （其余为 c3993a3 原有的 58 个真实改动文件，内容不变，仅存储行尾恢复 LF。）
- **验证结果**：重做提交相对 de3fb17 的 diff 仅含真实改动文件（LICENSE 等纯行尾文件 blob 哈希与 de3fb17 一致）；强推后 origin/kroos 与 origin/master 指向重做提交。

---

## 2026-09-16 03:17:05 | 优化代码：codegraph 本地数据库三文件脱离 git 跟踪

- **变更概述**：经用户确认，对 .codegraph/codegraph.db（约 10MB）、codegraph.db-shm、codegraph.db-wal 执行 `git rm --cached`，暂存区写入删除跟踪记录（D），磁盘文件保留。三者脱离跟踪后由 `.codegraph/.gitignore` 已有的 `*` 规则（忽略目录内除自身外一切）接管，无需修改根 .gitignore。协作者拉取该提交时本地这三个文件会被 git 删除，codegraph 会自动重建，无损失。
- **修改文件列表**
    - `.codegraph/codegraph.db`、`.codegraph/codegraph.db-shm`、`.codegraph/codegraph.db-wal` - 仅移出 git 索引，文件内容未改动。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认三条 D 记录已入暂存区；`ls` 确认文件仍在磁盘（10002432/32768/0 字节）；`git check-ignore -v` 确认 `.codegraph/.gitignore:4:*` 接住三者。未提交。

---

## 2026-09-16 03:13:48 | 优化代码：debug.log 等四个运行时文件脱离 git 跟踪

- **变更概述**：经用户确认，对 debug.log、tmpwebapp-node-modulesprepare.log、.codegraph/daemon.log、.codegraph/daemon.pid 执行 `git rm --cached`，暂存区写入删除跟踪记录（D），磁盘文件保留。该记录将随下一次 commit 提交，之后四个文件成为未跟踪文件并被 `.gitignore` 的 `*.log`/`*.pid` 规则忽略，不再出现在 status 中。注意：协作者拉取该提交时本地这四个文件会被 git 删除（运行时自动再生，无损失）。
- **修改文件列表**
    - `debug.log`、`tmpwebapp-node-modulesprepare.log`、`.codegraph/daemon.log`、`.codegraph/daemon.pid` - 仅移出 git 索引，文件内容未改动。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认四条 D 记录已入暂存区（另有并行会话的 `D src/core/navigation/hooks/useSwipeTab.ts` 非本次产生）；`ls` 确认四个文件仍在磁盘。未提交。

---

## 2026-09-16 03:09:33 | 优化代码：清理暂存区垃圾文件并补全忽略规则

- **变更概述**：推送 kroos 后清理混入暂存区的构建缓存与日志文件，并补充 .gitignore 规则防止再次混入。注意：debug.log、tmpwebapp-node-modulesprepare.log、.codegraph/daemon.log、.codegraph/daemon.pid 是历史已跟踪文件，本次仅移出暂存区，未脱离跟踪（需另行确认后执行 git rm --cached 才能让忽略规则对其生效）。
- **修改文件列表**
    - `.gitignore` - 新增 `.gradle/`（覆盖 modules/* 子项目缓存）、`*.log`、`*.pid` 忽略规则。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`git status` 确认 8 个 `modules/irisnote-updater/android/.gradle/` 缓存文件已回到未跟踪状态并被忽略；4 个已跟踪日志文件回到未暂存修改状态。未做其他文件改动，未提交。

---

## 2026-09-16 02:36:43 | 修复问题：悬浮 Tab 改为先路由再播放点击动画

- **变更概述**：点击非当前 Tab 时立即路由，目标页成为当前页后再由蓝色图标播放 35dp → 17.5dp → 35dp 的两段 200ms 动画，避免路由更新吞掉放大阶段；点击当前 Tab 仍直接播放动画且不重复路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将路由与动画请求解耦；使用共享目标状态在路由生效后触发动画，连续点击只保留最后目标，开始滑动时取消待播放的点击动画。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与限定范围 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认先路由后动画、当前页重复点击、快速连续点击和点击后立即滑动四类行为。

---

## 2026-09-16 00:21:12 | 优化代码：悬浮 Tab 支持连续点击反馈

- **变更概述**：悬浮 Tab 的不同目标连续点击、路由前重复点击同一目标、以及重复点击已选中 Tab 均会播放 35dp → 17.5dp → 35dp 的两段 200ms 动画。前两种仅保留最后一次非当前 Tab 点击的路由；已选中 Tab 只播放蓝色动画，不重复路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将目标、会话号和是否路由合并为原子点击请求，保证快速连点的旧动画/旧路由被取消，并开放已选中 Tab 的无路由点击反馈。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认三种连续点击行为、路由次数及点击后立即滑动取消。

---

## 2026-09-16 00:16:33 | 修复问题：悬浮 Tab 放大动画改由真实缩放链驱动

- **变更概述**：修复点击 Tab 后放大动画仍可能因路由与间接状态反应同帧竞争而丢失的问题。点击目标图标现在由自身的实际缩小动画完成回调直接切蓝并启动 200ms 放大，随后并行派发路由；放大不等待路由结果，也不再依赖父组件的阶段信号或占位计时器。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 将点击缩小、变蓝、放大和路由串成单一 UI 线程动画链；删除 `clickPhase` 与 `clickTransitionProgress`，保留会话号对快速连点和滑动取消的保护。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认 35dp → 17.5dp → 35dp 的两个 200ms 阶段、变蓝与路由，以及快速连点和点击后立即滑动的取消行为。

---

## 2026-09-16 00:08:28 | 修复问题：悬浮 Tab 路由抢占蓝色放大动画

- **变更概述**：第 200ms 切蓝后，先在 UI 线程登记蓝色图标由 50% 放大至 100% 的 200ms 动画，再异步派发路由；不监听、不等待路由完成或成功结果，避免导航更新抢占并丢失放大反馈。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 调整点击完成回调中的动画初始化与路由派发顺序。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需真机确认点击后的完整蓝色放大与页面切换并行。

---

## 2026-09-16 00:04:03 | 修复问题：悬浮 Tab 延迟路由被过期会话错误取消

- **变更概述**：修复非当前悬浮 Tab 点击后，图标完成前 200ms 灰色缩小却未变蓝、未切换页面的问题。点击会话号改为先计算并缓存新值，再写入 UI 共享状态；后续 UI 线程动画完成回调使用同一值校验，因此可继续执行变蓝、路由与蓝色放大。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 统一点击会话号的写入值与延迟动画完成后的校验值，避免 JS/UI 线程时序导致正常点击被当作过期会话。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；仍需在真机确认第 200ms 的变蓝与页面切换、蓝色放大、连续点击及点击后立即横滑取消。

---

## 2026-09-15 23:57:41 | 优化代码：悬浮 Tab 点击改为延迟变蓝的两段缩放

- **变更概述**：点击目标 Tab 后，图标先以灰色在 200ms 内缩小到 50%；第 200ms 同步切换为蓝色并路由，再在 200ms 内放大到 100%。快速连续点击或开始滑动会取消旧会话的变色、放大和路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 用私有点击目标、阶段与会话共享值替换 `pulse`，实现两段缩放、延迟变色及路由取消。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认灰色缩小的完整 200ms、变蓝与路由同帧、蓝色放大，以及快速连续点击和点击后立即横滑的取消行为。

---

## 2026-09-15 23:52:14 | 优化代码：恢复悬浮 Tab 的点击选中动画

- **变更概述**：恢复点击非当前 Tab 时目标蓝色图标的原 `pulse` 反馈（0.5 秒、`ease-out`、透明度 0.5 与缩放 0.6 回到正常）。点击会同步图标颜色并取消尚未完成的滑动延迟路由；横向滑动焦点缩放不触发该动画。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增点击动画版本状态、目标图标 `pulse` 和点击对过期滑动导航的取消。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认连续点击不同 Tab、点击后立即横滑，以及点击当前 Tab 不重复播放的行为。

---

## 2026-09-15 23:47:36 | 优化代码：悬浮 Tab 改为焦点缩放后路由

- **变更概述**：横向滑动进入图标焦点时，图标在 200ms 内缩小到 50%；焦点离开时在 200ms 内还原。重复或反向途经会从当前缩放值平滑切换。成功松手后，最终焦点图标先完成还原，再路由到目标页面；新滑动会取消旧的待执行路由。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 删除途经抖动，改为 UI 线程焦点缩放、最终放大完成后的延迟路由和过期路由取消。
    - `src/shared/theme/motion.ts` - 删除不再使用的 `tabShake`；右侧按钮的循环 `shake` 保持不变。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、反向滑动、松手后 200ms 路由及立即开始下一次滑动的取消行为。

---

## 2026-09-15 23:39:03 | 修复问题：恢复右侧操作按钮的循环抖动

- **变更概述**：恢复右侧 35dp 操作图标原有的 2 秒无限循环抖动及末段摇摆节奏；左侧滑动途经 Tab 保留即时单次抖动，两者使用独立关键帧，互不影响。
- **修改文件列表**
    - `src/core/navigation/components/FloatingActionButton.tsx` - 恢复 `shake` 的 2 秒、无限循环、`ease-in-out` 动画包裹。
    - `src/core/navigation/components/FloatingMenu.tsx` - 左侧途经 Tab 改用专用 `tabShake`，仍按跨过图标中心时单次触发。
    - `src/shared/theme/motion.ts` - 恢复原 `shake` 关键帧，并拆出立即摇摆的 `tabShake`。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：`FloatingMenu.tsx`、`FloatingActionButton.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认右侧完整 2 秒循环，以及左侧慢拖、快速横拖、反向滑动时的单次抖动。

---

## 2026-09-15 23:33:20 | 优化代码：悬浮 Tab 图标放大并按滑动途径抖动

- **变更概述**：左侧悬浮 Tab 移除可视文字标签，图标从 24dp 放大为与右侧操作按钮一致的 35dp。横向滑动变色期间，每个被手指途经的图标立即播放一次抖动；右侧操作按钮不再持续循环抖动。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除文字渲染，保留 50dp 触摸区并补足 Tab 无障碍语义；基于滑动位置跨过图标中心的 UI 线程反应逐项触发单次抖动。
    - `src/core/navigation/components/FloatingActionButton.tsx` - 删除右侧操作图标的无限循环抖动，保留 35dp 图标和原有点击、长按行为。
    - `src/shared/theme/motion.ts` - 将共享抖动关键帧改为从动画开始即摇摆，以匹配滑动途经的即时反馈。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：`FloatingMenu.tsx`、`FloatingActionButton.tsx` 与 `motion.ts` 已通过定向 ESLint（零错误零警告）及 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、反向划过同一图标、松手导航和普通单击 Tab。

---

## 2026-09-15 23:20:30 | 新增功能：悬浮 Tab 滑动预选颜色跟手

- **变更概述**：悬浮 Tab 横向滑动期间，图标灰蓝颜色改为按手指实时横坐标连续交叉淡化；颜色进度不使用固定时长，手指快慢会直接反映到变色速度。拖动期间不切换页面，成功结束时保持最终目标图标为蓝色并沿用单次最终坐标导航；取消或落在左右 8dp 内边距时恢复当前页面图标颜色。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增 UI 线程选择位置共享值、图标灰蓝双层交叉淡化和拖动取消回退；保留最终坐标单次导航。
    - `CHANGELOG.md` - 记录本次新增功能。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认慢拖、快速横拖、两图标中心之间的渐变、松手导航以及取消/边距回退。

---

## 2026-09-15 23:00:58 | 优化代码：悬浮 Tab 改为松手后单次切换

- **变更概述**：悬浮 Tab 横向拖动不再逐个经过图标区即时导航；仅在横向位移超过 1dp 且手势成功结束时，按最终 `x` 坐标识别目标图标并导航一次。结束位置落在菜单左右 8dp 内边距时保持当前页面，取消或失败手势不触发导航。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除拖动过程命中与多次导航，改为 `onEnd` 单次最终坐标判定。
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 移除仅服务于即时定位的临时分页动画状态，恢复页面原有动画设置。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**：两个受影响组件已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认短横拖、长横拖、松手落在不同图标区、边距松手及取消手势的行为。

---

## 2026-09-15 22:55:00 | 优化代码：docs 文档目录按分类重组

- **变更概述**：docs 下 31 篇 md 按内容归类为 7 个子目录（UI、API后端、进度与验证、架构指南、学习参考、构建发布、待办），根目录 `TODO.md` 与 `待办事项.md` 一并移入 `docs/待办/`；同步修复跨分类互链与全部外部路径引用。
- **修改文件列表**
    - `docs/UI/`、`docs/API后端/`、`docs/进度与验证/`、`docs/架构指南/`、`docs/学习参考/`、`docs/构建发布/`、`docs/待办/` - 31 篇 md 与 `release.env.example` 经 git mv 移入对应分类目录。
    - `docs/架构指南/后续开发指南.md` - 3 处互链改指 `../UI/`。
    - `docs/UI/全局横幅通知设计与调用规范.md` - 2 处互链改指 `../架构指南/`。
    - `docs/进度与验证/IRisNote编辑器核心架构与实施计划.md` - 4 处互链改指 `../架构指南/` 与 `../学习参考/`。
    - `docs/UI/IRisNote视觉设计规范.md` - 3 处 `TODO.md` 提及改为 `docs/待办/TODO.md`。
    - `docs/UI/miuix设计参考（HyperOS风格）.md` - 1 处样式规范提及加 `UI/` 前缀（miuix 上游仓库的 `docs/guide/*` 路径不动）。
    - `docs/待办/TODO.md`、`docs/待办/待办事项.md` - 自根目录移入，内部 7 处 docs 路径引用更新为新分类路径。
    - `README.md` - 8 处文档链接更新为新路径。
    - `src/features/notes/components/editor/draft-dialog.styles.ts`、`scripts/ui-dump-parse.mjs` - 仅注释中的规范路径更新。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：全仓 36 处 markdown 相对链接扫描全部可达；残留旧扁平路径仅为 irisapi 服务端仓库的 `docs/releases.md` 与 `项目编辑器进度.md` 历史日志行（按记录不改写历史，保留）；两个被改动代码文件通过定向 ESLint（零错误零警告）。git mv 保留文件历史；未运行 TypeScript/构建（无逻辑改动）。

---

## 2026-09-15 22:52:38 | 修复问题：快速拖动悬浮 Tab 时页面动画滞后

- **变更概述**：修复手指快速横向掠过多个悬浮 Tab 图标时，原生分页器连续播放默认转场而落后于当前命中图标的问题。实际横向移动达到 1dp 后，拖动会话内的页面切换改为无动画即时定位；手势结束后的下一帧恢复原有分页动画，因此图标单击和页面区域的正常横滑不受影响。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 在 UI 线程识别实际横向拖动起止，并仅在拖动会话期间通知分页器切换为即时同步模式。
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 接收悬浮 Tab 拖动状态，临时关闭 `TabView` 页间动画并在下一帧安全恢复，清理未执行的恢复帧。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**：两个受影响组件已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机快速连续划过四个图标、快速反向划动，以及单击图标与页面横滑后确认默认动画恢复。

---

## 2026-09-15 22:44:22 | 新增功能：悬浮底栏拖动即时切换主页面

- **变更概述**：悬浮底栏在手指按下和移动期间按当前位置实时识别笔记、待办、剪贴、用户图标区；进入新图标区即导航到对应主页面，不再等待松手。命中逻辑按实际 `onLayout` 宽度和 8dp 内边距计算，适配不同屏宽，右侧设置按钮不参与此手势。
- **修改文件列表**
    - `src/core/navigation/components/FloatingMenu.tsx` - 新增 UI 线程拖动命中判定、跨区去重和到 JS 导航调度；保留图标点击、无障碍语义、底栏原有视觉与设置按钮。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：`FloatingMenu.tsx` 已通过定向 ESLint（零错误零警告）与 `git diff --check`。未运行 TypeScript、构建、导出或设备交互验收；需在真机确认按住连续划过四个图标、反向划动、笔记卡片横滑和右侧设置点击。

---

## 2026-09-15 21:37:55 | 新增功能：主页面实时横滑切换

- **变更概述**：笔记、待办、剪贴、用户四个主页面改为基于 `react-native-tab-view` 与原生 `react-native-pager-view` 的横向 Pager；页面跟随手势连续移动，完成翻页后浮动菜单的选中状态与当前路由同步。相邻页预加载一页，端点不再循环或过度回弹。
- **修改文件列表**
    - `src/core/navigation/components/SwipeTabsNavigator.tsx` - 新增 Expo Router 适配的 Pager Tabs，保持文件路由、嵌套 Stack、手势事件与页面预加载。
    - `src/app/(tabs)/_layout.tsx` - 使用 Pager Tabs 替代原 Bottom Tabs，保留现有浮动菜单和各 Tab 的模糊目标包装。
    - `src/core/navigation/components/FloatingMenu.tsx` - 移除菜单自身横滑绑定，菜单点击改由 Pager 导航状态处理。
    - `src/core/navigation/hooks/useSwipeTab.ts` - 删除旧 `PanResponder` 松手后切换逻辑。
    - `src/core/navigation/navigation.constants.ts` - 删除仅供旧横滑 Hook 使用的 Tab 顺序和索引常量。
    - `package.json`、`package-lock.json` - 新增 `react-native-tab-view` 与 SDK 57 兼容的 `react-native-pager-view`。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：受影响导航文件已通过定向 ESLint（零错误零警告）和 `git diff --check`。未运行 TypeScript、构建、导出或设备验收；真机仍需核验横滑与笔记卡片横滑手势的优先级。

---

## 2026-09-15 21:26:28 | 优化代码：AGENTS.md 文档版本链接跟进 SDK 57

- **变更概述**：master 合并带来 Expo SDK 57（~57.0.22）升级后，AGENTS.md 顶部强制阅读的版本文档链接仍指向 v56.0.0，已更新为 https://docs.expo.dev/versions/v57.0.0/（链接有效性已在线核验，SDK 57 对应 React Native 0.86）。
- **修改文件列表**
    - `AGENTS.md` - 文档链接 v56.0.0 → v57.0.0，仅此一行。
    - `CHANGELOG.md` - 记录本次修改。
- **验证结果**：纯文档链接修改，不触碰代码；WebFetch 核验目标页面为 Expo SDK v57.0.0 reference。

---

## 2026-09-15 21:22:15 | 优化代码：同步远端 master 到 kroos

- **合并 origin/master（419a68f，PR #91~#93）进入 kroos，合并提交 de3fb17**
    - 带入应用内更新功能（modules/irisnote-updater 原生差量合并模块、发布工具、Gradle 回环修复）、SDK 57 升级（Expo ~57.0.22）、双渠道构建与包名统一等 67 个文件改动。
    - 中止了此前针对过时 master（3397042，PR #90）的半成品合并后重新合并；已核验 3397042 为 origin/master 祖先，中止不丢内容。
    - 唯一冲突 CHANGELOG.md：双方条目全部保留并按时间倒序重排，同时修复自动合并造成的顶部标题丢失与文件中部标题重复。
- **修改文件列表**
    - `CHANGELOG.md` - 冲突解决（双保留 + 倒序 + 标题去重）及本条记录。
- **验证结果**
    - `npm install` 完成（+112 / −439 / ~211 个包，SDK 57 依赖就位；transitive uuid 弃用警告与 unrs-resolver 安装脚本提示，均无碍）。
    - `npx tsc --noEmit`：仅 new-note-editor.tsx 326/368/376 三处既有 draftCleanupPending 错误，与 master 基线完全一致，无新增。
    - `npm test`：71 项 69 过 2 挂，失败为 drafts/revisions 两文件既有 Node 24 类型剥离加载问题（kroos/master 双方均有记录）；kroos 侧 banner 测试修复保留生效，master 新增 releases 差量测试全部通过。
    - `npm run lint` 与 `npm run theme:check` 通过。
    - 未做设备验收。注意：master 已升级 SDK 57，现有 SDK 56 的 Expo Go 将无法加载本项目，需升级 Expo Go 或改用 dev build 流程。

---

## 2026-09-15 16:44:52 | 修复问题：项目构建入口的 Gradle 回环错误

- 文件：scripts/android/gradle-env.mjs、scripts/android/run.mjs、package.json、scripts/release/cli.mjs、tests/releases/gradle-env.test.cjs、docs/android-releases.md、CHANGELOG.md。
- Windows 构建通过子进程 JAVA_TOOL_OPTIONS 指定原项目 .expo 目录作为 Unix 域套接字目录，覆盖 Gradle 启动器、daemon 和编译子进程。默认用户 Temp 的 Unix 域连接失败，项目目录的实际连接与 Selector 创建成功。
- npm run android 和新增 npm run gradle 接入统一入口，自有发布构建使用同一环境；Gradle 命令默认 --no-daemon。保留已有 JVM 参数及父进程环境，Linux/macOS 不注入设置。
- 验证：新修复与发布流程共 14 项测试通过（含真实 JDK Selector）；定向 ESLint、Node 语法检查、git diff --check 通过；Expo run:android --help 参数转发成功；npm run gradle -- help 实际 BUILD SUCCESSFUL，33 tasks，耗时约 1 分钟。
- 原生编译验证：npm run gradle -- :irisnote-updater:compileDebugKotlin 已越过回环和配置阶段，后续等待 react-android-0.86.3-debug.aar（279001319 字节）下载，临时文件停在 62620736 字节数分钟无增长，主动结束本次验证。日志：.expo/gradle-updater-build.log。不能据此声称原生编译或 APK 构建通过。
- 范围：直接 android/gradlew.bat 与 Android Studio 直接同步未接入项目启动入口，仍需单独设置；未修改全局 JDK、TEMP、网络或防火墙，未部署或发布。

---

## 2026-09-15 16:35:58 | 修复问题：Windows Gradle 回环连接（验证中）

- 文件：scripts/android/gradle-env.mjs、scripts/android/run.mjs、package.json、scripts/release/cli.mjs、tests/releases/gradle-env.test.cjs、docs/android-releases.md、CHANGELOG.md。
- 已获用户确认。Windows 构建入口通过进程级 JAVA_TOOL_OPTIONS 指定原项目 .expo 套接字目录，覆盖 Gradle daemon 与编译子进程；Linux/macOS 不注入。自有发布构建使用原项目目录，避免独立 checkout 的用户 Temp 路径。
- 保留已有 JVM 参数，不修改父进程或全局环境；新增 npm run gradle，npm run android 接入统一环境。
- 临时验证已通过 NIO Selector 和 Gradle 握手，持久入口验证进行中。

---

## 2026-09-15 16:08:26 | 新增功能 / 修复问题：按主次补丁版本实行完整与差量更新

- 文件：src/features/updates/release.ts、update-store.ts、UpdateDialog.tsx；scripts/release/cli.mjs、delta.mjs；modules/irisnote-updater/（Expo 模块声明、Kotlin 模块、HPatch.java、四 ABI 原生库、Gradle/ProGuard 配置、SHA-256 清单及上游许可）；tests/releases/releases.test.cjs、delta-roundtrip.mjs；package.json、docs/android-releases.md、docs/release.env.example、CHANGELOG.md。
- 主版本不同使用完整 APK；同主版本的功能/补丁更新要求匹配的差量包。客户端核对真实安装构建、版本、旧 APK 摘要及补丁算法，缺少补丁不静默回退全量。
- Android 合并使用固定 HDiffPatch 5.1.3 官方库。读取已安装 sourceDir，校验旧包/补丁/目标摘要及新包签名、版本、包名；禁止跨缓存路径和拆分 APK 差量。失败清理输出，安装前再次校验。
- 发布工具支持 setup-delta 与 patches；上传完整目标后自动为历史同主版本生成补丁、实际还原验证并上传，恢复操作跳过已完成补丁。工具归档与原生文件摘要固定，构建前同时核对工作区和归档代码里的原生库。
- 界面新增完整/差量类型与实际下载大小，新增“正在合并更新”及无匹配补丁状态。
- 验证：客户端/工具 11 项测试、后端版本规则 4 项测试通过；全量 lint、theme:check、后端 TypeScript 检查通过；Android Hermes 导出通过（4137 modules，dist/delta-update-validation）。Expo 自动链接识别 irisnote-updater；四 ABI ELF LOAD 均为 0x4000 对齐，JNI 导出符号存在。
- 真实差量工具验收：独立签名的合成测试 APK 各 1057116 字节，补丁 2240 字节；还原后完整 SHA-256 与目标一致，并通过 apksigner 与 aapt 校验。错误旧摘要和损坏补丁被拒绝。记录：.expo/delta-tests/signed-apk-bXPcAZ/result.json。该体积不代表正式 IRisNote 更新效果。
- 未通过环境验收：Gradle 原生模块编译在进入编译前报 Unable to establish loopback connection / Could not receive a message from the daemon；仅对本次进程尝试 Unix-domain/IPv4 参数，无全局环境变更，仍失败。adb 无设备。原有三处 draftCleanupPending 类型错误仍存在。
- 尚未完成原生模块编译、真机合并及覆盖安装、真实数据库发布验证。未运行迁移、未部署、未提交 EAS 构建或发布版本。

---

## 2026-09-15 15:56:10 | 新增功能：差量更新（实施中，用户已确认）

- 新增 HDiffPatch 5.1.3 原生合并模块及固定摘要库、差量生成/实际还原校验、版本规则和补丁接口。
- 主版本变化使用完整包；同主版本必须匹配差量包，不静默退回完整下载。
- 代码实施中，尚未运行数据库迁移或实际发布。

---

## 2026-09-15 15:27:24 | 新增功能 / 修复问题：双渠道构建、包名统一与 App 内更新

- 文件：app.json、app.config.ts、eas.json、package.json、package-lock.json、.gitignore、README.md、docs/android-releases.md、docs/release.env.example、plugins/with-release-signing.js、scripts/release/cli.mjs、scripts/release/lib.mjs、src/features/updates/release.ts、update-store.ts、UpdateDialog.tsx、src/features/settings/screens/SettingsScreen.tsx、src/core/providers/AppProviders.tsx、tests/releases/releases.test.cjs、CHANGELOG.md。
- 本地生成工程：android/app/build.gradle、android/app/src/main/AndroidManifest.xml、res/values/strings.xml、java/com/mouqiandi/irisNote/MainActivity.kt 和 MainApplication.kt；旧 NextNote 两个入口迁移到新包目录。android 仍按项目约定忽略，新 checkout 通过 app.config 和插件重新生成。
- 新包名统一为 com.mouqiandi.irisNote，显示名 IRisNote，scheme 为 irisnote。旧包名属于另一应用，不自动迁移数据。
- EAS 保留；版本来源改为 local，由发布工具注入服务分配的构建号。保留 EAS AAB production 构建；APK 自有构建在独立 Git 提交目录执行。
- 发布命令支持 doctor/reserve/build/inspect/upload/status/publish/withdraw，构建、上传草稿和发布分离。校验真实包名、版本、单一签名证书与 SHA-256。正式 Gradle 构建禁止回退到调试签名。
- App 新增六小时自动检查和手动检查、更新说明、下载进度/取消/重试、分块 SHA-256 校验、安装前复核、系统安装和安装权限入口。进程被杀后的后台下载不在当前保证范围。
- 依赖新增 expo-application ~57.0.3、@noble/hashes ^2.0.1。修复构建工具在 Windows 下的批处理引号及 npm.cmd 绝对路径解析。
- 验证：新增客户端/工具 8 项测试全部通过；全量 lint、theme:check 通过；Android Hermes 导出通过（4136 modules，dist/releases-validation）；Expo 配置注入实测包名正确，示例版本 1.2.3 / 构建号 44。doctor 与 npm.cmd 实际调用通过。
- 项目既有阻塞：类型检查仍有 new-note-editor.tsx 三处 draftCleanupPending 错误；全量测试执行时 61 通过、3 失败（drafts/revisions 原生模块加载和 banner lifetime），之后新增的第 8 项工具测试亦通过。未修改这些既有问题，构建前置检查会阻断正式打包。
- 未验收：正式 APK/AAB 构建、EAS 凭据、真实 PostgreSQL 发布事务、HTTPS 下载及设备覆盖升级；adb 无已连接设备。未部署、未分配实际构建号、未上传或发布。

---

## 2026-09-15 15:16:05 | 新增功能 / 修复问题：双渠道构建与应用更新（实施中）

- 文件：app.json、app.config.ts、eas.json、package.json、package-lock.json、plugins/with-release-signing.js、scripts/release/、src/features/updates/、SettingsScreen.tsx、AppProviders.tsx、android/app/build.gradle、AndroidManifest.xml、Kotlin 入口包目录。
- 统一新包名，新增 App 内版本检查、下载、SHA-256 校验和安装入口；接入集中编号与 EAS/自有构建工具。正式发布需独立执行。
- 当前阶段：代码实施中，尚未验证、部署或发布。

---

## 2026-09-15 12:02:25 | 优化代码 / 修复问题

- **SDK 57 最新补丁升级（用户已确认）**
    - package.json：Expo 更新为 ~57.0.22，按官方 bundledNativeModules 对齐现有 Expo 与 React Native 依赖；移除项目配置、脚本和测试均未引用的 expo-module-scripts@56.0.3，避免引入旧测试预设和重复 React。
    - package-lock.json：更新依赖锁定；移除 file-entry-cache 错误指向 emoji-regex 的记录，由 npm 重新解析官方元数据。
    - CHANGELOG.md：记录升级范围和验证结果。
- **验证结果**
    - Expo Doctor 21/21 通过；安装版本与 SDK 57.0.22 bundledNativeModules 配套要求无不匹配；package.json 与锁文件根依赖一致。
    - npm 安装成功；file-entry-cache 正确包名、官方下载地址、integrity 和 create API 验证通过；React 仅保留 19.2.3 一份。
    - Lint 与 theme:check 通过；Android Hermes Bundle 导出通过（4118 modules），输出 dist/sdk57-android。
    - 类型检查剩余 new-note-editor.tsx 第 326、368、376 行 draftCleanupPending 类型错误，均在升级前已存在；已声明但缺失的 expo-network、expo-intent-launcher 安装后相关错误消除。
    - 单测 54 通过、3 失败：drafts/revisions 两个测试在安装 Expo 网络模块后直接加载原生模块，触发 Node ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING；banner 连接测试仍因 lifetime 访问失败。未修改业务源码或测试。
    - Web 导出通过：5305 modules，服务端 3690 modules，17 个静态路由，CSS 与 SQLite worker 已打包，输出 dist/sdk57-web；原生 APK 构建与设备验收未执行。
    - 在线 expo install --check 首次遇到 TLS 连接中断，离线配套检查通过；后续在线 Expo Doctor 完整通过。
- **原生工程边界**：本地 android 仍含旧包名 com.mouqiandi.NextNote，本轮未重生成原生目录。

---

## 2026-09-15 09:44:32 | 修复问题

- **修复发布检查阻塞（用户已确认）**
    - scripts/sync-theme-css.mjs：比较时兼容 CRLF/LF，写入时保留原换行符。
    - src/core/navigation/hooks/useLongPressNavigation.ts：共享值改用 get/set，保留既有导航与动画参数。
    - src/features/auth/providers/AuthProvider.tsx：分离存储读取与状态提交，初始化异步回调增加失效保护；移除未使用类型。
    - src/features/notes/categories/category-icons.ts、components/CategoryButton.tsx：通过静态 CategoryIcon 入口渲染已有图标，保留尺寸、配色及回退。
    - src/features/notes/categories/index.ts、src/features/notes/index.ts：显式导出 API，避免重复导出类型。
    - src/features/settings/screens/SettingsScreen.tsx：移除未使用且无挂载副作用的头像 Hook。
    - CHANGELOG.md：记录修改与验证结果。
- **依赖恢复**：已从 npm 官方获取 file-entry-cache@8.0.0，核对完整性摘要并恢复本机对应目录；create API 和普通 Lint 缓存启动通过。原异常目录保存在系统临时目录 irisnote-file-entry-cache-repair 下。
- **锁文件待确认**：package-lock.json 中 file-entry-cache 指向 emoji-regex；该记录及依赖元数据仍需补充授权修正，当前未改动锁文件，下次安装可能复发。
- **验证结果**
    - 本轮 8 个修改文件定向 ESLint 通过；全量 Lint 的原 17 个错误、5 个警告消除。
    - theme:check 通过；临时副本验证 LF/CRLF 比较、写入格式保留、真实差异检出与修复均通过，未改动 global.css。
    - 模拟运行验证长按完成/提前释放仅导航一次、同路由不跳转、缩放恢复、图标映射及 Folder 回退、认证异步初始化/刷新/失效初始化保护通过；不等同于设备验收。
    - 当前仓库含本轮未修改的同步队列代码：全量 Lint 剩 2 个缺失依赖错误（expo-network、expo-intent-launcher）；类型检查另有 sync-queue 路由类型、draftCleanupPending 返回类型错误。
    - 全量单测通过 54、失败 3：两个测试文件因 expo-network 缺失无法加载，通知连接测试失败。未调整这些源码或测试。
    - 尚未重新完成 Android Bundle 导出或设备验收，未提交云端构建。

---

## 2026-09-15 09:23:24 | 修复问题

- **发布基础收口：统一名称并补齐检查与 Android 构建入口**
    - app.json - 图片与相机权限文案中的 NextNote 改为 IRisNote。
    - package.json、package-lock.json - 内部 npm 包名统一为 irisnote，不修改 Android 包名、EAS 项目身份或依赖版本。
    - package.json - 新增 typecheck、test、check、eas、build、build:apk、build:aab；test 使用 Node 24+ 执行 tests/**/*.test.cjs，不运行浏览器脚本；构建前执行统一检查。
    - eas.json - 固定 EAS CLI 24.4.0，preview APK 启用远端版本号自动递增；production 保留现有自动递增策略。
    - CHANGELOG.md - 记录已确认的第一阶段变更与验收边界。
- **命令说明**
    - npm run check：类型、Lint、主题一致性及现有单元测试。
    - npm run build 或 npm run build:apk：检查通过后提交 EAS preview APK 云端构建，需要网络与 EAS 账号权限。
    - npm run build:aab：检查通过后提交 EAS production Android 云端构建。
- **验证结果**
    - TypeScript、110 项现有单元测试、Expo public 配置解析、图标资源存在性、包名与锁文件一致性、变更差异检查通过。
    - Android Hermes Bundle 导出成功（4059 modules），输出 dist/phase1-android；此结果不等同于签名 APK 构建或设备验收。
    - npm run check 未通过：现有 Lint 缓存加载失败（fileEntryCache.create is not a function）；本机 node_modules/file-entry-cache/package.json 实际标识为 emoji-regex，依赖目录内容异常。
    - 单独执行 theme:check 失败；只读比较确认主题内容在 CRLF 标准化后完全一致，现有校验脚本因换行符差异误报。未改动主题 CSS 或同步脚本。
    - 关闭缓存诊断（expo lint --no-cache）完成，报告现有 17 个错误、5 个警告：useLongPressNavigation.ts 的共享值赋值、AuthProvider.tsx 的 Effect、CategoryButton.tsx 的动态图标组件、notes/categories 与 notes 的 index.ts 重复导出，以及未使用变量。此次未改动这些业务文件或屏蔽规则。
    - 配置核验参考：https://docs.expo.dev/versions/v56.0.0/ 、https://docs.expo.dev/versions/v56.0.0/sdk/imagepicker/ 、https://docs.expo.dev/build-reference/apk/ 、https://docs.expo.dev/build-reference/app-versions/ 。
    - 未提交 EAS 云端构建，未验收签名 APK、安装或覆盖升级；构建入口会在检查失败时阻止提交。

---

## 2026-09-15 01:42:51 | 新增功能

- **悬浮操作按钮随标签切换图标变形**
    - 使用持续挂载的 MorphIcon 和 lucide 图标数据，在铅笔、勾选框、剪贴板和齿轮之间播放 snappy 变形。
    - 保留外层每轮 2 秒的无限 shake，变形期间及结束后持续摇晃；变形遵循系统减少动态效果设置。
    - 保持 66dp 按钮、35dp 图标、配色、点击防抖导航和长按手势及动画。
- **修改文件列表**
    - src/core/navigation/components/FloatingActionButton.tsx - 添加图标数据映射并接入 MorphIcon。
    - CHANGELOG.md - 记录本次已确认变更。
- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint 和差异检查通过；尚未进行设备视觉验收。

---

## 2026-09-15 01:53:36 | 修复问题

- **修复连接聚合测试对异步横幅发布的过时假设**
    - 服务器连接协调器自同步队列提交（454da44）起，故障横幅发布改为异步 `publishFault`（先取暂存任务摘要），并新增后台（inactive）不发布的守卫；原测试在事件发出后的同一 tick 内同步断言横幅已存在，且以 `setActive(false)` 运行协调器，与现行设计不符导致测试失败。
    - 测试改为 async，在断言前用 `setImmediate` 冲刷微任务队列等待 `publishFault` 完成；`setActive(false)` 改为 `setActive(true)` 并注释说明前台语义；用例验证逻辑本身（失败聚合、恢复解析、陈旧事件不误报）未改动。
    - 功能代码零修改；已核实横幅收回/恢复真实运行路径无缺陷，本次为纯测试适配。
- **修改文件列表**
    - `tests/notifications/banner.test.cjs` - 适配异步发布与前台激活假设。
    - `CHANGELOG.md` - 记录本次测试修复。
- **验证结果**
    - `node --test tests/notifications/banner.test.cjs` 14/14 通过；全量套件 55 过 2 挂，剩余失败为 drafts/revisions 两文件在 Node 24 下因 node_modules 内裸 `.ts` 类型剥离限制无法加载，与代码无关（kroos 原版同样失败）。
    - `npx eslint --no-cache --no-warn-ignored tests/notifications/banner.test.cjs` 报告 1 个既有 `no-undef __dirname`（第 7 行原有代码，非本次引入），未处理以避免扩大确认范围。
    - 未运行 tsc（未触碰 `.ts`/`.tsx` 源码）、构建、导出或设备验收。

---

## 2026-09-15 00:00:50 | 新增功能

- **同步队列支持自适应列表与保留历史的任务删除**
    - 暂存任务列表卡改为按内容自动增高；移除强制撑满页面的 `flexGrow: 1`，内容超过剩余视口时才在 16dp 圆角容器内滚动。
    - 每行新增公共 `IconButton compact` 删除入口；正在上传及没有上一 Revision 的笔记任务禁用，并显示不能回滚的原因。
    - 删除笔记任务前显示“确认回滚？”二次确认弹窗；执行期间显示“回滚中…”，锁定重复提交、返回和遮罩关闭，失败原因保留在弹窗内。
    - 队列删除与笔记回滚合并到同一个 SQLite 事务；从父 Revision 内容创建新的 `origin=restore` 当前版本，被取消的版本继续保留在版本历史中。
    - 上传协调器改用 `status=queued` 条件认领任务，消除页面删除与自动上传之间的竞争窗口；已被认领的任务不会并发回滚。
    - 未尝试且已有服务端副本的笔记回滚后恢复已同步状态；无服务端副本保留待同步；已尝试上传则标为云端状态未知，要求用户核对后再同步。
- **修改文件列表**
    - `src/core/sync/upload-queue.repository.ts`、`src/core/sync/upload-queue-coordinator.ts` - 新增原子取消入口及条件任务认领。
    - `src/features/notes/data/note-local.repository.ts` - 新增回滚可用性检查与保留版本历史的事务内回滚。
    - `src/features/sync/upload-task-cancellation.ts`、`src/features/sync/index.ts` - 编排任务取消、笔记缓存更新及分类视图刷新。
    - `src/features/sync/components/sync-task-delete-dialog.tsx` - 新增删除/回滚二次确认弹窗。
    - `src/features/sync/screens/SyncQueueScreen.tsx` - 接入自适应列表、删除组件、禁用原因和确认流程。
    - `docs/自动上传队列开发约定.md`、`docs/IRisNote视觉设计规范.md`、`docs/项目架构与文件索引.md` - 记录删除事务、Revision 语义、UI 尺寸和模块职责。
    - `CHANGELOG.md` - 记录本次功能。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 已获授权的只读 ADB 布局导出当时未停留在同步队列页，因此未把其他页面的控件数据冒充为本页实测；未点击或改变设备状态。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器或设备交互验收；列表真实高度、禁用态、回滚结果和弹窗交互仍由用户主动验收。

---

## 2026-09-14 23:36:52 | 优化代码

- **进入同步队列页后自动收回服务器未连接横幅**
    - 同步队列页获得焦点后立即收回 `server-connection` 全局横幅，并在页面聚焦期间阻止服务器连接协调器和上传队列协调器重新发布同一横幅。
    - 页面失焦后解除展示抑制；服务器故障或设备离线仍存在时重新显示横幅，已恢复时不产生旧通知。
    - 收回只影响服务器未连接横幅，不伪造“服务器已恢复”，也不隐藏上传进度、上传暂停或任务阻断横幅。
- **修改文件列表**
    - `src/core/notifications/notification.store.ts` - 增加仅供受控展示生命周期使用的强制收回能力，普通关键通知仍不能由用户关闭。
    - `src/core/notifications/server-connection-banner-visibility.ts` - 新增引用计数式页面聚焦抑制与状态订阅。
    - `src/core/notifications/server-connection-coordinator.ts`、`src/core/sync/upload-queue-coordinator.ts` - 发布前检查抑制状态，并在解除抑制后按真实故障状态恢复横幅。
    - `src/core/notifications/index.ts`、`src/features/sync/screens/SyncQueueScreen.tsx` - 导出并接入页面焦点生命周期。
    - `docs/自动上传队列开发约定.md`、`docs/IRisNote视觉设计规范.md`、`docs/全局横幅通知设计与调用规范.md`、`docs/项目架构与文件索引.md` - 记录展示边界、页面行为和模块职责。
    - `CHANGELOG.md` - 记录本次优化。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器、ADB 或设备验收；横幅收回、页面停留期间不重现及离页恢复仍由用户主动验收。

---

## 2026-09-14 22:57:40 | 新增功能

- **新增服务器恢复自动上传队列**
    - 新增按账号隔离的 SQLite 持久上传任务表；笔记和分类在本地保存后先入队，由全局协调器监听前台 Wi-Fi／移动数据变化、探测服务器并串行执行。
    - 可恢复故障最多自动重试 10 次，并以稳定横幅原位更新任务序号和尝试次数；达到上限后暂停，等待一次离线到在线变化再恢复。401／403、业务校验、未知创建结果及缺少适配器会安全阻断并改用“查看暂存”提醒，避免无效请求、重复创建或错误引导到网络设置。
    - 按 UTF-8 JSON 请求体估算所需上传量，并记录可观测的上传字节；估算值明确不包含 HTTP/TLS、响应和网络协议开销。
    - 服务器未连接且存在任务时，全局横幅显示任务数、预计上传量及“查看暂存”；连续失败横幅提供系统“网络设置”动作。暂存列表不在设置页增加入口。
    - 新增同步队列页面，展示网络类型、任务状态、预计流量、尝试次数和最近错误；设置同步预留标准入队函数及执行适配器注册口，当前未虚构设置后端服务。
- **修改文件列表**
    - `src/core/database/migrations/0005-create-upload-queue.ts`、`src/core/database/migrations/index.ts` - 新增结构版本 5 上传队列表及迁移登记。
    - `src/core/sync/*` - 新增队列契约、持久仓库、事件、运行时状态、网络监听协调器、流量估算及系统网络设置跳转。
    - `src/features/sync/*` - 新增笔记／分类／设置入队适配层、任务执行器及暂存列表页面。
    - `src/core/notifications/notification-provider.tsx`、`src/core/notifications/server-connection-coordinator.ts` - 启动上传协调器，并让服务器故障横幅按队列状态切换为“查看暂存”。
    - `src/features/notes/services/note-save.service.ts`、`src/features/notes/services/note-exit-sync-coordinator.ts`、`src/features/notes/components/editor/new-note-editor.tsx`、`src/features/notes/screens/NotesScreen.tsx` - 笔记保存、退出和手动同步改为先写持久队列。
    - `src/features/notes/categories/components/CategoryBar.tsx`、`src/features/notes/categories/hooks/useCategory*.ts` - 分类创建、更新和删除接入持久队列并叠加待处理本地视图。
    - `src/app/pages/user/sync-queue.tsx`、`src/app/_layout.tsx` - 注册暂存列表路由。
    - `package.json`、`package-lock.json` - 增加 Expo SDK 56 匹配的 `expo-network` 与 `expo-intent-launcher`。
    - `docs/自动上传队列开发约定.md`、`docs/项目架构与文件索引.md`、`docs/IRisNote视觉设计规范.md`、`docs/全局横幅通知设计与调用规范.md` - 记录状态机、接入契约、UI 尺寸、风险和当前限制。
    - `CHANGELOG.md` - 记录本次功能变更。
- **验证结果**
    - 目标代码 Expo ESLint 与 `git diff --check` 通过。
    - 按约定未运行测试、TypeScript 构建检查、构建、导出、浏览器或设备验收；数据库迁移、网络切换、系统设置跳转和横幅层级仍由用户主动验收。

---

## 2026-09-14 21:22:54 | 修复问题

- **笔记列表改为本地数据优先，云端 401 不再中断展示**
    - 首页笔记列表完成本地 SQLite 读取后立即应用数据；云端同步请求与本地读取使用独立错误边界。
    - 云端请求返回 401 或其他失败时保留本地笔记列表，并以“云端笔记同步失败，继续使用本地数据”记录警告；仅本地读取失败才报加载失败。
- **修改文件列表**
    - `src/features/notes/screens/NotesScreen.tsx` - 分离本地加载与云端同步的错误处理。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 目标文件 Expo ESLint 与 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收。

---

## 2026-09-14 20:40:11 | 修复问题

- **修复编辑器工具栏“收起键盘”按钮无动作**
    - 键盘显示时，公共编辑器工具栏第一区改为调用 `Keyboard.dismiss()`；键盘隐藏时仍调用既有“编辑正文”回调。
    - 无障碍标签随状态切换为“收起键盘”或“编辑正文”，视觉样式、尺寸和预留按钮均未调整。
- **修改文件列表**
    - `src/core/editor/components/editor-bottom-toolbar.tsx` - 绑定收起键盘动作并更新状态化无障碍文案。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 目标文件 Expo ESLint 与 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；真机收起键盘与重新进入编辑的交互仍由用户验收。

---

## 2026-09-14 19:56:29 | 优化代码

- **InlineHint 支持按需点击并接入云同步状态行**
    - `InlineHint` 保持未传事件时的静态单行提示行为；传入 `onPress` 后才渲染可点击容器，支持禁用、无障碍标签、状态和触控热区。
    - 新增 `standard` 尺寸（20dp 图标、4dp 间距）用于云同步；默认 `compact` 草稿说明不变。可点击态按压时显示 85% 不透明度，禁用时不触发事件。
    - 笔记操作的云同步行改用公共 `InlineHint`，保留原有上传、防重复、同步中锁定、无账号关闭、失败红色与上下各 12dp 触控热区；业务上传逻辑未迁入公共组件。
    - 更新组件接口、视觉规范、审计基线、架构索引和待办；新建笔记离开确认的富文本丢弃提示记为后续候选，避免丢失局部加粗语义。
- **修改文件列表**
    - `src/shared/ui/InlineHint/InlineHint.tsx`、`src/shared/ui/InlineHint/index.ts`、`src/shared/ui/index.ts` - 扩展可选点击接口、尺寸与导出。
    - `src/features/notes/components/viewer/note-operation-info.tsx` - 云同步状态行接入公共组件。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`待办事项.md` - 同步契约、状态和迁移记录。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、目标文件 Expo ESLint、`npm run design:audit` 与 `git diff --check` 通过。
    - 审计为 252 个源码文件、19,659 行；主题目录外固定颜色 14、裸字号 17、裸圆角 15，均未因本批增加。
    - 未运行测试、构建、导出、浏览器或设备验收；云同步点击、上传时锁定、错误文案单行截断与按压反馈仍由用户主动验收。

---

## 2026-09-14 19:47:57 | 优化代码

- **补充 Codex 会话的 ChatGPT 模型建议规则**
    - 在项目根目录 `AGENTS.md` 新增 Codex 专用模型建议章节，要求涉及编码、修复、重构、UI 或持久指令变更时强制考虑 ChatGPT 模型及思考强度。
    - 明确即使宿主未展示完整模型列表，也必须给出具体推荐并说明实际切换能力以当前界面为准；同时保留 ZCode 专用调度规则的适用边界。
- **修改文件列表**
    - `AGENTS.md` - 新增 Codex / ChatGPT 模型建议与 ZCode 规则边界。
    - `CHANGELOG.md` - 记录本次持久文档变更。
- **验证结果**
    - 已检查新增章节位置、Markdown 结构与规则内容；未涉及代码、测试、构建、导出或设备验收。

---

## 2026-09-14 19:34:01 | 新增功能 / 优化代码

- **新增公共单行补充说明 InlineHint**
    - 新增 `InlineHint` 公共组件，固定为 14dp 左侧图标、6dp 间距、13sp 单行尾部省略文本；组件不提供点击、按压、禁用、加载或业务状态接口。
    - 新增 `neutral` 与 `important` 主题配方：普通说明图标和文本使用 `textSecondary` 灰蓝，重要提示使用 `destructive` 红色；两者均为 transparent 背景，不含边框或圆角。
    - 删除草稿弹窗的私有 `DraftLocalNotice`，草稿管理弹窗与新建笔记离开确认直接接入公共 `InlineHint`；本机草稿说明保留灰蓝样式，删除草稿不可恢复提示改为重要红色样式，调用方继续负责 12dp 外部间距。
    - 同步公共组件接口、视觉规范、待办、审计基线与架构索引，明确 `InlineHint` 与后续可操作 `InlineMessage` 的职责边界。
- **修改文件列表**
    - `src/shared/ui/InlineHint/InlineHint.tsx`、`src/shared/ui/InlineHint/index.ts`、`src/shared/ui/index.ts` - 新增并导出公共补充说明组件。
    - `src/shared/theme/component-recipes.ts`、`src/shared/theme/theme.types.ts` - 新增 `inlineHint` 的普通与重要语义配方。
    - `src/features/notes/components/editor/draft-dialog.tsx`、`src/features/notes/components/draft-manager-dialog.tsx`、`src/features/notes/components/editor/new-note-editor.tsx` - 移除私有草稿提示并迁移为公共组件。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`待办事项.md` - 更新组件契约、尺寸、颜色、迁移状态与审计快照。
    - `CHANGELOG.md` - 记录本次公共组件新增。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、目标文件 Expo ESLint、`npm run design:audit`、`git diff --check` 通过。
    - 审计为 252 个源码文件、19,616 行；主题目录外固定颜色 14、裸字号 17、裸圆角 15，均未因本批增加。
    - `npm run theme:check` 仍提示当前 `global.css` 与默认主题预设不同步；本批未修改主题生成源，也未执行会写入生成文件的 `npm run theme:sync`。
    - 未运行测试、构建、导出、浏览器或设备验收；单行截断、灰蓝/红色呈现与弹窗布局由用户主动验收。

---

## 2026-09-14 22:24:15 | 新增功能

- **悬浮导航背景模糊及 15dp 顶部渐变**
    - 新增 expo-blur 与渐变蒙版依赖，按当前标签页选择 Android BlurTargetView，采样实际页面内容。
    - 模糊覆盖屏幕底部全宽 101dp，顶部 15dp 通过透明度蒙版平滑显现；按钮高 66dp、底部 20dp、左右 16dp 和控件间隔 15dp 保持不变。
    - 模糊与按钮共用 300ms 位移动画，隐藏距离覆盖渐变区域和阴影；背景不拦截触摸。
- **修改文件列表**
    - package.json、package-lock.json - 添加原生模糊和蒙版依赖。
    - src/app/(tabs)/_layout.tsx - 按场景提供背景采样目标。
    - src/core/navigation/components/FloatingMenu.tsx - 背景模糊、渐变蒙版及整组隐藏。
    - CHANGELOG.md - 记录本次已确认功能和验收结果。
- **验证结果**
    - TypeScript、目标文件 ESLint、差异检查通过；Android x86_64 开发客户端构建成功并安装至 Pixel_9_Pro_XL 模拟器。
    - 截图确认底部真实模糊、15dp 顶部透明度渐变、按钮清晰；持续滚动时整组移出底边，停止后恢复，切换用户/笔记后的采样正常。
    - 从两按钮间隙滑动可滚动底下的列表；13 秒切页及滑动观测窗口内 JavaScript 警告/错误为 0。
    - 本机 Java 回环连接异常使用仅当前构建进程的 jdk.net.unixdomain.tmpdir 参数规避。原 Metro 未识别新增 expo-blur，验收使用独立的 8082 Metro；未停止或重启原 8081 服务。
    - 本次完成 Android 模拟器验收，未进行 iOS 实机验收。

---

## 2026-09-14 21:22:35 | 修复问题

- **修复悬浮导航在组件渲染期间读取 Reanimated 共享值的警告**
    - 将 FloatingMenu 的共享值访问统一为 get()/set()，保持访问位于 Effect、事件及动画回调内，避免 React Compiler 将 hiddenOffsetY.value 提取为渲染阶段的缓存依赖。
    - 保留当前布局、配色、300ms 动画和导航交互。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 替换共享值属性读写方式。
    - CHANGELOG.md - 记录本次已确认修复。
- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint、git diff --check 通过。
    - 检查模拟器实际加载的编译结果：缓存依赖只比较 hiddenOffsetY 和 translateY 对象，渲染阶段不再读取 hiddenOffsetY.value。
    - Android 模拟器连续切换用户/笔记并滚动列表，14 秒观测窗口内 Reanimated 警告为 0；截图确认滚动期间导航隐藏、停止后恢复。

---

## 2026-09-14 20:00:45 | 优化代码

- **悬浮导航向下隐藏、对称外边距及左右滑动切页**
    - 整组左右外边距均为 16dp，白色 Tab 栏弹性填满剩余宽度，四项等宽分配；两侧控件高 66dp，白栏内边距 8dp、项目高 50dp，主按钮间隔从 15dp 增至 24dp。
    - 隐藏方向改为向屏幕底部移动，位移按实际高度加底部偏移 50dp 与阴影余量 16dp 计算，保留现有触发时机和 600ms 动画。
    - 切页手势仅绑定白色 Tab 栏：左滑下一页、右滑上一页，按笔记/待办/剪贴/用户的可见顺序循环；横向主导且位移超过 30dp 才切页，上下滑动不切页。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 布局尺寸、纵向隐藏动画及手势绑定范围。
    - src/core/navigation/hooks/useSwipeTab.ts - 左右滑动判定与可见顺序切页。
    - CHANGELOG.md - 记录本次已确认变更。
- **验证结果**
    - TypeScript、两文件 ESLint 通过；移除手势 hook 原有渲染阶段 ref 写入，直接使用当前路由。
    - 模拟器验证：左滑从笔记进入待办、右滑返回笔记，上滑白栏未切页；列表滑动期间整组隐藏，停止后恢复。
    - 已截图核对加长白栏与对称外边距的整体效果；控件树仍因无法进入空闲状态而读取失败，精确 dp 未完成原生树实测。尺寸使用明确数值类名，避免 rem 换算偏差。

---

## 2026-09-14 19:41:26 | 优化代码

- **悬浮 Tab 栏横排并与主操作按钮等高**
    - 白色 Tab 栏移至蓝色主操作按钮左侧，四个入口横排；白栏高 66dp、每项 50×50dp、四周内边距 8dp，与 66×66dp 主按钮间隔 15dp。
    - 整组保留右边距 16dp、底部偏移 50dp；沿用颜色、按压反馈、Tab 路由、上下滑动切换与主按钮操作。
    - 隐藏动画按实际布局宽度加 32dp（右边距与阴影余量）计算位移，避免横排后仅隐藏右侧部分。
- **修改文件列表**
    - src/core/navigation/components/FloatingMenu.tsx - 横向布局、等高尺寸及自适应隐藏位移。
    - CHANGELOG.md - 记录本次已确认的 UI 变更。

- **验证结果**
    - TypeScript（npx tsc --noEmit）、目标文件 ESLint、目标文件 git diff --check 均通过。
    - 模拟器刷新后开发客户端出现 Unable to load script；重新连接现有 Metro 后仍报告局域网地址 unexpected end of stream，未完成新布局截图、dp 实测及交互验收。
    - 现有开发服务未停止或重启，未修改环境配置。

---

## 2026-09-14 14:47:43 | 修复问题

- **恢复 Android Studio 启动前置与 Android SDK 工具链完整性**
    - 移除指向不存在 `studio.vmoptions` 文件的用户级 `STUDIO_VM_OPTIONS` 环境变量，恢复 Android Studio 使用安装目录内置 VM 配置的前置条件。
    - 清理用户 `PATH` 中已不存在的旧 SDK `adb.exe` 路径，保留有效的 `D:\AndroidSDK` 配置。
    - 从 Google Android 官方源安装 Command-line Tools 22.0 到 `D:\AndroidSDK\cmdline-tools\latest`，官方 SHA-256 校验通过；将其 `bin` 目录加入用户 `PATH`。
    - 将仅含安装占位文件的 Build Tools 35.0.0 残缺目录移至 `D:\AndroidSDK\.repair-backup-20260914-144157`，通过本机代理重新安装官方 `build-tools;35.0.0`。
- **修改文件列表**
    - `CHANGELOG.md` - 记录本次 Android Studio / Android SDK 本机环境修复。
    - `D:\AndroidSDK\cmdline-tools\latest\**` - 新增 Android SDK 命令行工具。
    - `D:\AndroidSDK\build-tools\35.0.0\**` - 重新安装完整的 Build Tools 35.0.0。
    - 用户环境变量 - 移除失效 `STUDIO_VM_OPTIONS` 和旧 SDK PATH 项，新增 Command-line Tools `bin` PATH 项。
- **验证结果**
    - `sdkmanager --version` 返回 `22.0`，`sdkmanager.bat` 与 `avdmanager.bat` 均存在。
    - Build Tools 35.0.0 的 `aapt.exe`、`aapt2.exe`、`d8.bat`、`zipalign.exe`、`apksigner.bat`、`source.properties` 与 `package.xml` 全部存在，`Pkg.Revision=35.0.0`。
    - Android Studio 已绕过第一层失效 VM 配置，但内置 JBR 继续报 `sun.nio.fs` 模块访问错误；安装目录 VM 参数修复尚未实施，待用户单独确认。

---

## 2026-09-14 19:16:38 | 优化代码

- **笔记查看与编辑器返回入口接入公共 BackButton**
    - `NoteViewerHeader` 与 `PlainTextEditor` 的私有 `Pressable + ArrowLeft` 实现改为公共 `BackButton`；保持 40×40dp 视觉尺寸、透明 ghost 背景、24dp 图标，并由公共组件提供布局外 2dp hitSlop。
    - 两处原有 `onBack` / `onCancel` 回调原样保留；未调整键盘收起、草稿落盘、同步、页面退出或保存按钮逻辑。
    - 同步阶段 2 待办、视觉规范、审计基线和架构索引，记录阅读与编辑器返回入口已迁移。
- **修改文件列表**
    - `src/features/notes/components/viewer/NoteViewerHeader.tsx` - 改用公共 `BackButton`。
    - `src/core/editor/components/plain-text-editor.tsx` - 改用公共 `BackButton`，保留编辑器取消回调。
    - `待办事项.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md` - 更新迁移状态与尺寸契约。
    - `CHANGELOG.md` - 记录本次迁移。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、两个改动文件的 Expo ESLint、`npm run design:audit` 与 `git diff --check` 通过。
    - `npm run theme:check` 未通过：当前 `global.css` 与默认主题预设不同步；本批未改主题文件，未执行会写入生成文件的 `npm run theme:sync`。
    - 未运行测试、构建、导出、浏览器或设备验收；返回后键盘收起、草稿保存和页面退出时序仍由用户主动验收。

---

## 2026-09-14 19:16:06 | 修复问题

- **修复验证码公共按钮在登录与注册页丢失胶囊外观的问题**
    - `AppButton` 将调用方 `className` 移至外层容器；验证码按钮的 `w-[120px]` 现在只决定占用宽度，不再与内部 `Pressable` 的主题样式合并冲突。
    - 内部按钮显式拉伸至容器宽度，继续负责 48dp 高度、16dp 圆角、主题背景、横向内容、加载与禁用态；验证码发送、倒计时及禁用逻辑不变。
    - 该修复同时适用于其他向 `AppButton` 传入布局类名的调用方；`AuthButton` 仍是无行为变更的兼容封装。
- **修改文件列表**
    - `src/shared/ui/AppButton/AppButton.tsx` - 分离外层布局与内部胶囊视觉样式。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 已完成源码与差异复核；依照当前授权边界，未运行测试、构建或设备/浏览器验收。
    - 请在设备上确认登录与注册页的「发送验证码」为 120×48dp 浅蓝胶囊，并检查默认、禁用、发送中与倒计时状态。

---

## 2026-09-14 19:11:49 | 修复问题

- **修复公共状态胶囊按钮在分类操作弹窗中竖向渲染的问题**
    - `StatusToggle` 将调用方布局类名从内部可点击节点移至外层容器；`className="flex-1"` 现在仅负责两个状态按钮的等宽分配，不再参与内部样式合并。
    - 内部 `Pressable` 显式拉伸至外层宽度，并保持图标与文字横向排列、48dp 高度、16dp 圆角、8dp 图文间距、主题背景与按压态。
    - 笔记操作与分类操作继续复用同一公共组件；置顶/标星的业务回调、文案、选中态和禁用态均未改动。
- **修改文件列表**
    - `src/shared/ui/StatusToggle/StatusToggle.tsx` - 分离外层宽度布局与内部胶囊视觉布局。
    - `CHANGELOG.md` - 记录本次修复。
- **验证结果**
    - 已完成源码与差异复核；依照当前授权边界，未运行测试、构建或设备/浏览器验收。
    - 请在设备上确认图标与文字横向排列、两个按钮等宽，以及默认/选中状态外观。

---

## 2026-09-14 18:36:03 | 优化代码

- **置顶/标星状态按钮抽取为公共组件 `StatusToggle`**
    - 将笔记操作弹窗内的局部组件 `StatusAction`（置顶/标星胶囊按钮）与分类操作弹窗内的内联实现，统一抽取为全局公共组件 `StatusToggle`（`src/shared/ui/StatusToggle/`），两处调用点改为复用同一实现，消除样式分叉。
    - 组件规格：高 48dp、图标 20 + 间距 8dp + 文字 17 号常规（`AppText variant="control"`）、圆角 16dp（`radii.control`，continuous）、水平内边距 16dp；配色复用 `componentRecipes.iconButton` 三态（默认 surfaceControl/#F0F0F0、选中 surfaceSelected/#EAF2FF + brandPrimary/#007AFF、禁用 secondaryDisabled/#F7F7F7 + textDisabled/#B2B2B2），按压透明度走 motion 预设；a11y `role=button` + `state={selected, disabled}`；宽度不写死，由调用方传 `className="flex-1"`。
    - 笔记操作弹窗：删除局部 `StatusAction`，视觉除圆角 14→16dp（legacy token 向语义 token 对齐）外像素级不变，文案保持静态「置顶/标星」。
    - 分类操作弹窗：内联 map 替换为两个 `StatusToggle`，动态文案「已置顶/未置顶」「已标星/未标星」按用户决策保留（文案 A 方案）；图标 24→20、图标与文字间距 4→8dp，与笔记弹窗参数收敛一致。
- **修改文件列表**
    - `src/shared/ui/StatusToggle/StatusToggle.tsx` - 新建公共组件。
    - `src/shared/ui/StatusToggle/index.ts` - 新建导出文件。
    - `src/shared/ui/index.ts` - 新增 `StatusToggle` 导出。
    - `src/features/notes/components/viewer/NoteContextMenu.tsx` - 删除局部 `StatusAction`（36 行），调用点改用 `StatusToggle`。
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 内联按钮实现（14 行）替换为 `StatusToggle`，移除未再使用的 `radii` 导入。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；5 个改动文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 7 个 node 测试文件（editor×4 / notifications / profile / reading）全部通过。
    - 两弹窗的按钮三态视觉与交互由用户在设备上验收。

---

## 2026-09-14 04:30:43 | 新增功能

- **「真机布局实测验收」固化为规范强制步骤**
    - 将已验证的 uiautomator dump → px/dp 对账流程写入四份规范文档顶部（§0）：截图判读、提出修改要求、验证改动三个场景必须先真机实测再下结论；无 adb 环境跳过实测，但不得编造数值。
    - 判读规则随文档固化：px 须除以「密度/160」换算 dp；文本 bounds 非触摸热区；原生树经 RN 扁平化看不到组件名与 padding 来源，定位原因须回源码；clickable 计数天然多于 RN 触摸组件数。
- **修改文件列表**
    - `scripts/ui-dump-parse.mjs` - 新增一键实测脚本：自动读密度（Override 优先）→ uiautomator dump → 解析输出每个元素的 class/文本/无障碍描述与 px、dp 边界，`--serial` 指定多设备目标机。
    - `docs/IRisNote视觉设计规范.md` - 顶部新增 §0，版本 1.11 → 1.12。
    - `docs/公共组件规范.md` - 顶部新增 §0，版本 1.4 → 1.5。
    - `docs/公共组件审计基线.md` - 顶部新增 §0（作为 `design:audit` 静态扫描的真机复核手段）。
    - `docs/样式开发规范.md` - 顶部新增 §0。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - 脚本真机实跑通过（PLQ110，476dpi，1dp=2.975px），输出格式与预期一致；`npx eslint --no-cache --no-warn-ignored scripts/ui-dump-parse.mjs` 通过（0 警告）。
    - 文档为纯 Markdown 变更，不涉及代码逻辑；§0 正文与落稿范围（含《样式开发规范》、无 adb 跳过条款）均经用户确认。

---

## 2026-09-14 04:27:39 | 优化代码

- **登录/注册页"发送验证码"按钮迁移为公共 AppButton**
    - 登录页与注册页的"发送验证码"按钮调用点由 `AuthButton`（薄封装）改为直接使用公共 `AppButton`（`variant="tonal"` 显式声明），与组件库统一迁移方向一致。
    - 属性同步：`busy` → `loading`（AppButton 原生命名）；`className="w-[120px]"`、label 三态（发送中…/倒计时/发送验证码）、disabled 逻辑（邮箱无效/倒计时中/提交中）全部保持不变，布局与视觉零变化（120×48dp、surfaceControl 底、16dp 连续圆角）。
    - `AuthButton` 组件本身保留：登录主按钮、注册主按钮、WelcomeScreen 仍在使用，迁移去留待后续决策。
- **修改文件列表**
    - `src/features/auth/screens/LoginScreen.tsx` - "发送验证码"改用 `AppButton`，新增 import。
    - `src/features/auth/screens/RegisterScreen.tsx` - 同款同步迁移，新增 import。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建；按钮三态（默认/禁用/发送中）视觉与交互由用户在设备上验收（需重新构建后查看，旧构建显示为纯文字样式）。

---

## 2026-09-14 04:00:30 | 优化代码

- **分类弹窗名称输入框升级为公共 InputSave**
    - 分类操作弹窗（重命名）与新建分类弹窗的名称输入框由公共 `Input` 迁移到公共 `InputSave`（52dp 输入框 + 52×52dp tonal 保存按钮，Save 图标 20dp），与笔记详情页 `NoteRename` 的保存输入约定统一。
    - 分类操作弹窗：保留自动聚焦、10 字限制、失焦/键盘提交保存；新增保存按钮点击保存（`onSave`），三路保存共用 `handleRename`。
    - 新增一次性提交锁 `renameLockRef`：Android 上点保存按钮会先触发输入框 blur 再触发 press，锁可防止重命名被重复调用；锁在每次进入编辑态时复位。
    - 新建分类弹窗：保存按钮与键盘"完成"均触发 `handleSubmit`（沿用空名称拦截）；底部"确定"按钮及其禁用态保持不变；未使用 `disabled` 属性（`InputSave.disabled` 会连同输入框一起禁用，空名称时会锁死输入），空名称由 `handleSubmit` 拦截。
    - 编辑态标题行高度 48dp → 52dp（进入编辑瞬间微增高，与 `NoteRename` 一致）。
- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 重命名输入改用 `InputSave`，新增提交锁。
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 名称输入改用 `InputSave`，接 `onSave`/`onSubmitEditing`。
    - `CHANGELOG.md` - 记录本次变更。
- **验证结果**
    - `npx tsc --noEmit` 通过（exit 0）；两文件 `npx eslint --no-cache --no-warn-ignored` 通过（0 警告）。
    - 未运行测试/构建/设备验收；保存按钮视觉与交互由用户验收。

---

## 2026-09-14 03:25:46 | 优化代码

- **分类新建与重命名输入框接入公共 Input**
    - 将分类操作弹窗的重命名输入框和新建分类弹窗的名称输入框从私有 `TextInput` 样式迁移到公共 `Input`。
    - 两处字段统一使用 48dp 高度、`radii.field = 16dp`、1dp 常驻边框、主题表面色、17sp 文字和聚焦主色边框；页面不再重复声明输入框身份颜色、圆角和字号。
    - 保留分类名称 10 字限制、输入值、自动聚焦、失焦保存、键盘提交、空名称拦截和分类接口逻辑不变。
    - 同步公共组件待办、设计审计迁移状态和架构索引。
- **修改文件列表**
    - `src/features/notes/categories/components/CreateCategoryModal.tsx` - 新建分类名称字段改用公共 `Input`。
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 分类重命名字段改用公共 `Input`。
    - `待办事项.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md` - 更新分类输入迁移状态和审计快照。
    - `CHANGELOG.md` - 记录本次分类输入框迁移。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、两个分类组件与公共 Input 的目标 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 设计审计中直接包含 `TextInput` 的文件由阶段 0 的 11 个降至 9 个；主题目录外固定颜色 14、裸字号 19，均未增加。
    - 未运行测试、构建、导出、浏览器或设备验收；输入框自动聚焦、键盘和视觉效果由用户主动验收。

---

## 2026-09-14 03:04:36 | 新增功能 / 优化代码

- **推进公共组件阶段 2 并完成认证域首批接入**
    - 新增 `AppText`、`AppButton`、`IconButton`、`BackButton`、`Input` 五个公共基础组件，并统一从 `@/shared/ui` 导出；颜色读取语义 Token/组件配方，圆角读取用途 Token，页面只保留布局扩展入口。
    - `AppButton` 实现 primary/secondary/tonal/danger/text、44/48dp 尺寸、加载锁定、显式禁用配色和 16dp 圆角；危险禁用态保持浅红背景 `#F8D7D2` 与红色内容 `#E94634`。
    - `IconButton` 实现 ghost/tonal/selected、40/48dp 尺寸、紧凑触控补偿、加载/选中/禁用无障碍状态；`BackButton` 统一 24dp ArrowLeft，并保留纯图标和带文字模式。
    - `Input` 实现单行 48dp、多行最小 96dp、16dp 圆角、常驻 1dp 边框，以及聚焦/错误/禁用/只读、前后内容、清空、原生 ref、键盘和自动填充属性透传。
    - 认证域的按钮、字段、密码显隐和返回入口已接入公共组件；`AuthButton`、`AuthField` 保留为业务薄适配，认证校验、接口、系统返回与键盘逻辑不变。旧 `Button`、`TextField` 继续作为迁移兼容入口。
    - 依据 Expo SDK 56 文档评估 `@expo/ui` Universal API；普通输入为保持现有受控字符串和原生 TextInput 契约使用 React Native 原语封装，后续 Picker/Switch/BottomSheet 仍优先评估 `@expo/ui`。
    - 同步待办、公共组件规范、审计基线、架构索引；记录用户已完成此前浮动工具栏 16dp 圆角验收。
- **修改文件列表**
    - `src/shared/ui/AppText/*`、`AppButton/*`、`IconButton/*`、`BackButton/*`、`Input/*`、`src/shared/ui/index.ts` - 新增阶段 2 基础组件、类型与公共出口。
    - `src/features/auth/components/AuthButton.tsx`、`AuthField.tsx`、`AuthScreenLayout.tsx` - 将认证视觉接入公共组件，保留业务适配和返回流程。
    - `待办事项.md`、`docs/公共组件规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md` - 更新接口、技术选型、迁移状态、审计快照和用户验收记录。
    - `CHANGELOG.md` - 记录本次阶段 2 变更。
- **验证结果**
    - `npx tsc --noEmit --pretty false`、新增组件及认证适配文件的 Expo ESLint、`npm run theme:check`、`npm run design:audit` 通过。
    - 审计快照为 242 个源码文件、18,490 行；主题目录外固定颜色 14、裸字号 19，均未因本批增加。
    - `npx prettier --write` 因项目当前命令解析到 `jest-snapshot-prettier` 并报 `getPlugin() requires astFormat to be set`，未改写源码；已以目标 ESLint 和手工格式复核替代，未新增格式化依赖或修改锁文件。
    - 未运行测试、构建、导出、浏览器或设备验收；阶段 2 新组件的视觉与交互仍由用户主动验收。

---

## 2026-09-14 02:25:12 | 优化代码

- **浮动编辑器工具栏圆角调整为 16dp**
    - 将无键盘浮动工具栏从复用旧 `radius.hyperControl = 14dp` 改为独立语义 Token `radii.editorToolbar = 16dp`，避免继续与按钮圆角耦合。
    - 保持浮动工具栏 225×48dp、底部 40dp 间距、白色背景、阴影、滚动显隐和点击逻辑不变；键盘期 43.2dp 通栏仍为 0dp 圆角并紧贴输入法。
    - 同步默认主题预设、生成后的 CSS Token、公共组件规范、视觉规范、审计基线、架构索引、编辑器进度和公共化待办。
- **修改文件列表**
    - `src/core/editor/components/editor-bottom-toolbar.tsx` - 接入独立 16dp 工具栏圆角 Token。
    - `src/shared/theme/presets/default-light.json`、`src/shared/theme/theme.types.ts`、`global.css` - 新增并同步 `editorToolbar` 圆角。
    - `docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/公共组件审计基线.md`、`docs/项目架构与文件索引.md`、`docs/项目编辑器进度.md`、`待办事项.md` - 更新当前规格、状态与实施记录。
    - `CHANGELOG.md` - 记录本次圆角调整。
- **验证结果**
    - `npx tsc --noEmit`、目标文件 Expo ESLint、`npm run theme:check` 和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；视觉效果由用户主动验收。

---

## 2026-09-14 02:20:22 | 优化代码

- **完成公共组件阶段 0 审计与阶段 1 主题基座首批实施**
    - 新增默认浅色主题预设，将原始色板、语义颜色、组件状态配方、圆角、间距、字号和动效值集中到单一来源；保留旧 `colors`、`radius` 导出作为渐进迁移兼容层。
    - 新增 NativeWind CSS Token 同步与一致性检查脚本，以及可重复执行的设计系统审计脚本；记录 232 个源码文件、18,009 行源码和主要漂移位置的审计基线。
    - 按已确认规范将现有 HyperOS 按钮、有底状态控件、图标选择单元和阅读进度气泡接入 16dp 语义圆角；编辑器浮动工具栏继续使用兼容 14dp，避免旧 `hyperControl` 复用造成连带变化。
    - 危险按钮禁用背景与内容分别由 `destructiveDisabled = #F8D7D2`、`onDestructiveDisabled = #E94634` 统一提供，组件配方不再硬编码状态颜色。
    - 同步公共组件规范、视觉规范、样式开发规范和公共化待办状态；当前尚未开始 AppButton、Input、AppDialog 等组件本体及业务调用方迁移。
- **修改文件列表**
    - `src/shared/theme/presets/default-light.json` - 新增默认主题唯一原始值来源及 CSS 映射表。
    - `src/shared/theme/palette.ts`、`semantic-colors.ts`、`component-recipes.ts`、`theme-preset.ts`、`theme-typography.ts`、`theme.types.ts` - 新增主题解析、类型和组件配方。
    - `src/shared/theme/colors.ts`、`radius.ts`、`spacing.ts`、`typography.ts`、`index.ts` - 接入主题预设并保留旧调用方兼容导出。
    - `global.css`、`package.json`、`scripts/sync-theme-css.mjs`、`scripts/audit-design-system.mjs` - 增加 CSS 托管区块、同步命令和审计命令。
    - `src/features/notes/categories/components/CategoryActionModal.tsx`、`CategoryIconPicker.tsx`、`src/shared/ui/ProgressBubble/ProgressBubble.tsx` - 接入 16dp 语义圆角。
    - `docs/公共组件审计基线.md`、`docs/公共组件规范.md`、`docs/IRisNote视觉设计规范.md`、`docs/样式开发规范.md`、`待办事项.md` - 记录审计基线、主题来源、圆角规范与推进状态。
- **验证结果**
    - `npx tsc --noEmit` 通过。
    - 受影响 TypeScript、TSX 与脚本的 Expo ESLint 检查通过。
    - `npm run theme:check`、`npm run design:audit`、脚本语法检查和 `git diff --check` 通过。
    - 未运行测试、构建、导出、浏览器或设备验收；交互与视觉验收仍由用户主动发起。

---

## 2026-09-14 02:01:38 | 优化代码

- **建立公共组件公共化实施待办**
    - 汇总聊天中确认的按钮、返回入口、输入框、图标选择器、弹窗、状态与列表组件需求，并结合当前项目重复实现和主题 Token 漂移情况形成实施基线。
    - 将公共化工作拆分为主题基座、基础组件、组合组件、状态组件、调用方迁移、治理验收六个阶段；每项补充现状来源、实施步骤、依赖关系、迁移范围、排除项和完成标准。
    - 按已确认目标记录普通按钮、有底图标按钮、图标选择单元和阅读进度气泡统一为 16dp 圆角；输入框新增独立 16dp 字段圆角，并要求先拆分旧 `hyperControl` 语义以避免连带修改。
    - 固化危险按钮禁用背景 `#F8D7D2`、文字与图标 `#E94634`，并补充可替换主题、Web/原生映射、一致性检查和用户验收边界。
- **修改文件列表**
    - `待办事项.md` - 新增公共组件公共化的分阶段详细实施方案。
    - `CHANGELOG.md` - 记录本次文档规划变更。

---

## 2026-09-14 01:14:41 | 优化代码

- **建立可替换主题的公共组件规范**
    - 新增公共组件目标规范，明确按钮、图标按钮、返回按钮、输入框、表单字段、图标选择器和弹窗的形状、尺寸、颜色映射、状态优先级、无障碍及 TypeScript 接口。
    - 建立 ThemePreset、基础色板、语义颜色和组件配方三层契约；规定后期手动修改主题时集中替换主题预设，页面不得逐项覆盖组件身份色。
    - 明确当前源码尚未完成公共组件迁移，保留 `global.css` 与 `src/shared/theme` 双向同步边界，并记录后续单一主题源及一致性检查目标。
    - 按用户确认，将危险按钮禁用态固定为浅红背景 `#F8D7D2`、红色文字与图标 `#E94634`。
- **修改文件列表**
    - `docs/公共组件规范.md` - 新增公共组件、主题、状态、接口和迁移规范。
    - `docs/IRisNote视觉设计规范.md` - 升级至 1.9，接入公共组件规范并修正危险按钮禁用字色。
    - `docs/样式开发规范.md` - 增加可替换主题及调用方样式约束。
    - `CHANGELOG.md` - 记录本次规范变更。

## 2026-09-14 04:16:49 | 优化代码

- **移除根布局底部安全区留白**
    - 根 `SafeAreaView` 仅保留顶部及左右安全区，不再应用底部安全区 inset，使页面内容延伸至 Android 系统手势区域后方。
    - 保留 Android 系统导航手势横条本身，不修改系统导航栏可见性、业务逻辑或页面内部间距。
- **验证结果**
    - 目标文件 ESLint、全量 TypeScript 和本次文件差异空白检查通过。
    - `Pixel_9_Pro_X` 已触发热刷新，但现有 Expo/Metro `8082` 进程对状态页和入口请求均超时，模拟器持续显示 `Refreshing...`；本轮未重启开发服务，运行时视觉验收尚未完成。
- **修改文件列表**
    - `src/app/_layout.tsx`
    - `CHANGELOG.md`

---

## 2026-09-14 03:51:06 | 优化代码

- **用户页改为移动端横纵全屏布局**
    - 移除 560dp 最大宽度、屏幕宽度检测、380dp 紧凑账户样式、760dp 悬浮导航避让和底部 150dp 预留；用户页不再为了规避 Tab 栏而压缩内容。
    - 滚动内容与内部布局均使用 `flexGrow: 1` 占满手机可用高度；账户与概览位于顶部、继续阅读位于中部、我的内容位于底部，三区使用弹性间距铺满一屏，内容超高时自然滚动。
    - 内容区使用全宽布局和四周 16dp 内边距；头像固定 64×64dp、昵称固定 20sp，不再针对 320dp 超小视口压缩组件。
- **将用户页验收标准切换为移动端**
    - 基准视觉尺寸调整为 390×844 与 412×915，只验收 Android/iOS 移动端的安全区、全屏宽高、滚动、触控和状态表现。
    - Web 宽屏、桌面居中和 320×568 不再作为用户页设计与视觉验收条件；当前阶段明确将 Tab 栏遮挡排除在用户页变更范围外。
    - TypeScript、相关 ESLint、差异空白检查和 110 项 Node 测试通过；Android 与 iOS Hermes Bundle 均成功导出。
    - 本轮未执行 Web 宽屏验收，也未连接 Android/iOS 真机；移动端视觉效果、安全区和头像权限仍由真机验收确认。
- **修改文件列表**
    - `src/features/profile/screens/ProfileScreen.tsx`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `design-qa.md`
    - `README.md`
    - `CHANGELOG.md`

---

## 2026-09-14 03:32:18 | 新增功能 / 优化代码

- **将用户页重构为无顶栏的个人工作台**
    - 移除蓝色资料头图、顶部标题栏、静态深色模式/隐私/反馈菜单和重复退出入口，页面从安全区下方 16dp 直接进入账户卡片。
    - 新增笔记、分类、标星三项真实概览；本地未同步笔记优先覆盖同一服务端笔记，服务端独有项只用于补足，避免重复计数。
    - 新增“继续阅读”卡片，从当前账号的结构化阅读记录中选择仍未读完的最新笔记；无记录时展示可进入笔记页的明确空状态。
    - 新增全部笔记、星标笔记和草稿箱三个真实快捷入口；笔记页支持 `view=starred` 筛选及 `drafts=1` 打开草稿箱，并在关闭草稿箱后清除一次性参数。
    - 用户 Tab 的悬浮主按钮由闪电图标改为设置齿轮，并补充可访问名称；窄于 760dp 时为右侧悬浮导航预留独立轨道，避免 320dp 屏幕遮挡内容。
    - 账户与概览加载、头像上传、未登录、长文本截断和数据暂不可用均有明确状态；未新增后端接口或依赖。
- **验证结果**
    - Expo SDK 56 版本化文档已核对；TypeScript、相关 ESLint、差异空白检查和 Expo Web 生产导出通过，仍输出 16 个静态路由。
    - 110 项 Node 测试全部通过，新增概览合并、继续阅读选择及分账号阅读记录枚举覆盖。
    - 可见 Chrome 命名会话完成宽屏、390×844、320×568 验收，并验证设置、星标筛选和草稿箱真实入口；合成账户与模拟数字仅用于视觉验收，完成后已从源码移除。
    - 浏览器控制接口不提供字面量 `--headed --persistent` 参数，实际使用可见且持续复用的 Chrome 命名会话，并在结束前恢复默认视口。
- **修改文件列表**
    - `src/features/profile/screens/ProfileScreen.tsx`
    - `src/features/profile/hooks/useProfileOverview.ts`
    - `src/features/profile/profile-overview.ts`
    - `src/features/notes/screens/NotesScreen.tsx`
    - `src/features/notes/reading/reading-progress-store.ts`
    - `src/core/navigation/navigation.constants.ts`
    - `src/core/navigation/navigation.types.ts`
    - `src/core/navigation/components/FloatingActionButton.tsx`
    - `tests/profile/profile-overview.test.cjs`
    - `tests/reading/reading.test.cjs`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `README.md`
    - `CHANGELOG.md`

---

## 2026-09-14 02:58:10 | 优化代码

- **设置首页验证收口**
    - 107 项 Node 测试全部通过；设置页面及组件 ESLint、差异空白检查通过。
    - Expo Web 生产导出成功，输出包含 `/pages/user/settings` 在内的 16 个静态路由。
    - 可见浏览器完成宽屏、390×844 和 320×568 验收；确认账户卡、四格概览、分组设置、禁用态和底部滚动布局，浏览器无 error/warning 日志。
    - 用于合成账户的本地预览路由已删除，未调用真实登录、头像上传、退出登录或同步接口。
    - 全量 TypeScript 仍被实施前已有的 `(tabs)/_layout.tsx` 与 `AuthScreenLayout.tsx` 两处 `/auth/welcome` typed-route 错误阻断，本次设置文件未新增类型错误。
    - 浏览器工具不提供 `--headed --persistent` 参数，实际使用可见的 Codex 应用内浏览器并恢复默认视口。
- **修改文件列表**
    - `CHANGELOG.md`
    - `design-qa.md`

---

## 2026-09-14 02:54:47 | 新增功能

- **新增 IRisNote 设置首页 UI**
    - 将静态占位页重构为账户卡片、四格状态概览和三组设置卡片，使用项目既有 `#007AFF` 主色、浅色背景与 HyperOS 圆角层级。
    - 复用认证与头像能力，支持头像入口、登录信息、加入时间、版本号、返回与退出登录；加载和未登录直达均有明确状态。
    - 主题、编辑阅读、通知、全局同步、数据与隐私、帮助反馈等未接入能力统一显示为「规划中」禁用态，不提供虚假跳转。
    - 完全移除参考图中的会员、购买、套餐、容量和轮播语义；未新增依赖、设置持久化或后端接口。
    - 390×844、320×568 与宽屏浏览器结构检查通过，窄屏可以滚动到底部；浏览器没有 error/warning 日志。
- **修改文件列表**
    - `src/features/settings/screens/SettingsScreen.tsx`
    - `src/features/settings/components/SettingsOverviewItem.tsx`
    - `src/features/settings/components/SettingsRow.tsx`
    - `docs/IRisNote视觉设计规范.md`
    - `docs/项目架构与文件索引.md`
    - `README.md`
    - `TODO.md`
    - `design-qa.md`
    - `CHANGELOG.md`
- **验证进度**：设置相关 ESLint 与 Expo Web 导出通过；全量 TypeScript 仍被本次修改前已有的两处 `/auth/welcome` typed-route 错误阻断，未越权修改认证文件。

---

## 2026-09-14 02:44:25 | 优化代码

- **确认设置首页参考布局与真实能力边界**
    - 采用账户信息、四格状态概览和分组设置卡片的纵向结构，沿用 IRisNote `#007AFF` 品牌主色与浅色 HyperOS Token。
    - 明确排除会员中心、购买入口、容量套餐、容量进度条和轮播圆点。
    - 规定尚未接入的主题、编辑阅读、通知、同步、数据及隐私能力显示为「规划中」禁用态，避免虚假交互。
    - 固化页面、卡片、设置行、顶栏、头像、退出入口及窄屏滚动的尺寸和间距。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md`
    - `CHANGELOG.md`

---

## 2026-09-12 11:28:07 | 优化代码

- **欢迎与认证参考布局验证完成**
    - TypeScript、相关页面及路由 ESLint、差异空白检查通过；Web 生产导出成功，包含欢迎页在内的 16 个路由。
    - 浏览器确认欢迎页品牌居中和底部双按钮、登录/注册居中标题、返回入口及字段排版。
    - 320×568 注册表单与 320×360 欢迎页可以滚动访问底部；1280×800 注册页宽屏居中正常。
    - 验证欢迎页进入登录、登录与注册互相替换、表单返回欢迎页、直接打开注册后返回欢迎页，以及未登录从根路径进入欢迎页。
    - 已恢复浏览器视口并停留欢迎页。浏览器工具不提供 --headed --persistent 参数，采用可见的现有浏览器会话。
    - Android 系统返回、iOS 手势/键盘、真实认证及退出登录后的完整联调未进行，仍待真机与账户验收。
- **修改文件列表**
    - `CHANGELOG.md` - 记录检查结果与验证边界。

---

## 2026-09-12 11:23:50 | 新增功能 / 优化代码

- **按参考图布局重构欢迎与认证页面**
    - 新增欢迎页：复用 IRisNote 图标，品牌区居中，注册/登录双按钮置底，短屏可滚动。
    - 登录注册新增 44dp 返回入口、居中标题与说明，表单边距改为 16dp，字段及主按钮间距改为 28dp。
    - 未登录 Tabs 入口转向欢迎页；表单切换替换路由，返回欢迎页时支持无历史栈回退；Android 返回键同步处理。
    - 沿用现有认证字段、接口、配色与错误反馈，未调整工作区中已有的横幅组件改动。
- **修改文件列表**
    - `src/features/auth/screens/WelcomeScreen.tsx`
    - `src/app/auth/welcome.tsx`
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/app/_layout.tsx`
    - `src/app/(tabs)/_layout.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：实施完成，静态检查与浏览器验证进行中。

---

## 2026-09-12 11:23:08 | 优化代码

- **确认参考图布局适配规格**
    - 新增欢迎页居中品牌区及底部双按钮规范；登录注册改为左上返回、居中标题、16dp 页边距和 28dp 字段间距。
    - 保留 IRisNote 内容、配色和认证字段，记录欢迎入口与返回规则。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md`
    - `CHANGELOG.md`

---

## 2026-09-12 09:43:04 | 优化代码

- **登录注册重构验证收口**
    - `npx tsc --noEmit`、认证组件及页面 ESLint、`git diff --check` 均通过。
    - `npx expo export --platform web --output-dir .expo/auth-web-export` 成功导出 15 个路由。
    - 浏览器验证通过：初始禁用、邮箱失焦错误及修正、密码显隐、注册密码最短长度与一致性、修正后按钮启用、登录注册切换。
    - 320×568 窄屏注册表单可滚动访问底部；1280×800 宽屏实测字段宽 440dp、左右居中。已恢复原视口并清空测试表单。
    - 浏览器工具不提供 `--headed --persistent` 参数，实际复用并显示现有浏览器。
    - 未发送真实验证码、未提交真实认证；接口成功/失败反馈、加载时序及 Android/iOS 键盘交互仍需联调与真机验收。
    - 格式化通过直接调用项目 Prettier API 完成；现有 npx prettier 入口指向 jest-snapshot-prettier，未改动工具链。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `CHANGELOG.md`

---

## 2026-09-12 09:39:37 | 优化代码

- **登录注册页面统一为 HyperOS 风格**
    - 新增认证共用页面、字段和按钮组件，统一 440dp 内容宽度、48dp 控件、字体、圆角、间距及密码显隐触控区。
    - 表单增加滚动、键盘避让、聚焦/失焦错误、明确的加载与禁用状态。
    - 字段及接口错误就地展示，发送成功使用横幅，认证成功保存刷新会话后直接跳转用户页。
    - 保留认证接口与字段，使用 Ref 锁防止重复请求；注册页面直接打开时提供登录路由回退。
- **修改文件列表**
    - `src/features/auth/components/AuthScreenLayout.tsx`
    - `src/features/auth/components/AuthField.tsx`
    - `src/features/auth/components/AuthButton.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `CHANGELOG.md`
- **验证进度**：TypeScript 检查通过，相关 ESLint 与浏览器验证继续执行。

---

## 2026-09-12 09:37:01 | 优化代码

- **确认登录注册 HyperOS 视觉规格**
    - 记录已确认的页面布局、dp 间距、字段顺序、按钮层级及反馈方案，作为后续实现依据。
- **修改文件列表**
    - `docs/IRisNote视觉设计规范.md` - 新增登录注册页面规格。
    - `CHANGELOG.md` - 记录已确认规格。

---

## 2026-07-26 02:05:47 | 新增功能

- **初始化 CodeGraph 项目索引**
    - 为 IRisNote 建立本地代码知识图谱，首次索引覆盖 129 个文件，生成 948 个节点和 1,687 条关系边。
    - 使用 CodeGraph 验证应用入口调用链，成功解析 `RootLayout → AppProviders → AuthProvider` 及相关影响范围。
    - 保留 CodeGraph 自动生成的目录级忽略规则，使数据库、日志和运行时文件仅保存在本机，不进入版本控制。

- **修改文件列表**
    - `.codegraph/.gitignore` - 新增 CodeGraph 生成文件忽略规则。
    - `.codegraph/codegraph.db` - 新增本地代码图谱数据库（已忽略，不提交）。
    - `CHANGELOG.md` - 记录 CodeGraph 初始化与验证结果。

---

## 2026-07-19 01:18:27 | 优化代码

- **使用 Tailwind Variants 重构状态样式，保持现有视觉与交互不变**
    - 接入 `tailwind-variants` 默认构建并补齐 `tailwind-merge`，统一解决调用方样式覆盖冲突。
    - 将 Button、Card、ModalPanel、Screen、TextField 的手写变体映射迁移为类型安全的 `tv()` 定义；Button 的原生 `disabled` 属性同步驱动禁用外观，TextField 通过 `invalid` 驱动错误边框。
    - 将浮动菜单、分类操作、分类按钮、图标选择器、新建分类和笔记上下文菜单中的条件类名迁移为 boolean variants 或 slots。
    - 保留原有颜色、尺寸、间距、圆角、透明度、状态条件和业务行为，不调整设计 Token 或页面视觉。
    - 为 VS Code 配置 `tv()` 内的 Tailwind CSS IntelliSense，并更新样式开发规范。

- **修改文件列表**
    - `package.json`
    - `package-lock.json`
    - `.vscode/settings.json`
    - `src/shared/ui/Button/Button.tsx`
    - `src/shared/ui/Card/Card.tsx`
    - `src/shared/ui/ModalPanel/ModalPanel.tsx`
    - `src/shared/ui/Screen/Screen.tsx`
    - `src/shared/ui/TextField/TextField.tsx`
    - `src/core/navigation/components/FloatingMenu.tsx`
    - `src/features/auth/screens/LoginScreen.tsx`
    - `src/features/auth/screens/RegisterScreen.tsx`
    - `src/features/notes/categories/components/CategoryActionModal.tsx`
    - `src/features/notes/categories/components/CategoryButton.tsx`
    - `src/features/notes/categories/components/CategoryIconPicker.tsx`
    - `src/features/notes/categories/components/CreateCategoryModal.tsx`
    - `src/features/notes/components/viewer/NoteContextMenu.tsx`
    - `docs/样式开发规范.md`
    - `CHANGELOG.md`

---

## 2026-07-12 13:35:31 | 优化文档

- **重写项目介绍并建立当前源码开发文档体系**
    - 重写 `README.md`，仅保留项目介绍、真实功能状态、技术栈、环境变量、安装启动和文档入口。
    - 新增项目架构与文件索引，逐项记录路由、Core、Shared、Feature、根配置和资源文件职责。
    - 新增业务模块与运行逻辑，说明认证、笔记、分类、头像和主导航的数据流、事件流及状态边界。
    - 新增后续开发指南，提供“修改目标到文件”的查询表，以及新增页面、Feature、API、组件、Hook 和状态方案的示例。
    - 更新样式开发规范，使目录、导入示例和 NativeWind/Theme Token 分工与当前源码一致。

- **修改文件列表**
    - `README.md`
    - `docs/项目架构与文件索引.md`
    - `docs/业务模块与运行逻辑.md`
    - `docs/后续开发指南.md`
    - `docs/样式开发规范.md`

---

## 2026-07-12 13:07:25 | 优化代码

- **阶段八：收敛分类操作弹窗的重复实现**
    - `CategoryActionModal` 复用共享 `CategoryIconPicker`，删除内部重复的图标分组与图标行渲染逻辑。
    - 抽出 `CategoryDeleteConfirmModal`，保留既有拖动确认、取消、二次确认和删除回调行为。
    - 使用分类常量判断“全部”虚拟分类，避免在操作弹窗中维护重复字面值。

- **修改文件列表**
    - `src/features/notes/categories/components/CategoryActionModal.tsx` - 收敛图标选择并保留分类操作编排。
    - `src/features/notes/categories/components/CategoryDeleteConfirmModal.tsx` - 新增删除二次确认弹窗。

---

## 2026-07-12 12:02:45 | 优化代码

- **阶段七：清理迁移后的遗留入口**
    - 删除全项目无调用方的 `useSwipeSelect` Hook。
    - 清理 Notes、Categories、HTTP API 和 data 迁移后不再承载文件的旧目录。
    - 不改变应用功能、路由或状态行为。

- **修改文件列表**
    - `src/hooks/useSwipeSelect.ts` - 删除无引用的通用滑动选择 Hook。
    - `src/api`、`src/data`、`src/components/Note`、`src/components/FloatingBarComponents`、`src/hooks/notes`、`src/hooks/FloatingBar` - 删除完成迁移后的空目录。

---

## 2026-07-12 11:57:53 | 优化代码

- **阶段六：迁移 Excerpt Feature 的页面入口**
    - 将剪贴板摘录列表和新建摘录的占位页面迁入 `src/features/excerpts/screens`。
    - 保留 `/(tabs)/excerpt` 和 `/pages/excerpt/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 移除原摘录占位页面中没有业务用途的 Reanimated 状态。

- **修改文件列表**
    - `src/features/excerpts/screens/ExcerptsScreen.tsx`、`src/features/excerpts/screens/CreateExcerptScreen.tsx`、`src/features/excerpts/index.ts` - 新增 Excerpt Feature 页面和入口。
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/pages/excerpt/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:47:14 | 优化代码

- **阶段五：迁移 Todo Feature 的页面入口**
    - 将待办列表和新建待办的占位页面迁入 `src/features/todos/screens`。
    - 保留 `/(tabs)/todo` 和 `/pages/todo/create` 路由；原路由文件改为仅转发 Screen 的薄包装。
    - 未新增尚无真实业务需求的 API、状态管理、Hooks 或类型文件。

- **修改文件列表**
    - `src/features/todos/screens/TodosScreen.tsx`、`src/features/todos/screens/CreateTodoScreen.tsx`、`src/features/todos/index.ts` - 新增 Todo Feature 页面和入口。
    - `src/app/(tabs)/todo/index.tsx`、`src/app/pages/todo/create.tsx` - 改为路由薄包装。

---

## 2026-07-12 11:39:53 | 修复问题

- **修复 FloatingBar 遗留文件导致的 TypeScript 解析失败**
    - 删除重新出现在 `src/components/FloatingBarComponents/FloatingBar.tsx` 的废弃实现；该文件第 125 行 JSX 属性已损坏，且项目内不存在对旧路径的引用。
    - 正式实现继续使用 `src/features/notes/categories/components/CategoryBar.tsx`，避免同时维护两份 FloatingBar。

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 删除无引用且语法损坏的旧实现。

---

## 2026-07-12 10:57:57 | 优化代码

- **阶段四：迁移 Notes 与 Notes Categories Feature**
    - 将笔记、分类 API、缓存、事件通知、选择状态、排序逻辑、页面与业务组件迁入 `src/features/notes`，路由文件改为仅转发 Screen 的薄包装。
    - 将笔记缓存与事件订阅拆分为独立模块；保留既有本地缓存、分类删除后的增量移除、置顶/标星乐观更新和失败回滚逻辑。
    - 将分类图标解析与图标分组收口到分类 Feature，并新增共享图标选择器供新建分类使用。
    - 保留 `/pages/note/[id]`、`/pages/note/create` 与 `/(tabs)/note` 路径及既有交互行为；不引入 Zustand。

- **修改文件列表**
    - `src/features/notes/api/*`、`notes.cache.ts`、`notes.events.ts`、`notes.selectors.ts`、`hooks/*`、`components/*`、`screens/*` - 迁入并拆分笔记业务实现。
    - `src/features/notes/categories/api/*`、`categories.constants.ts`、`categories.events.ts`、`category-icons.ts`、`category-selection.ts`、`components/*`、`hooks/*` - 迁入并拆分分类业务实现。
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为路由薄包装。
    - `src/api/notes.ts`、`src/api/categories.ts`、`src/data/notes.ts`、`src/data/categories.ts`、旧 Note/FloatingBar/Category 组件及 Hooks - 删除完成迁移后的旧入口。

---

## 2026-07-12 10:36:09 | 优化代码

- **阶段三：迁移认证、个人资料与设置 Feature**
    - 将认证 API、认证 Context、认证 Provider、认证 Hooks 和登录/注册 Screen 迁入 `src/features/auth`，原有认证路由改为仅转发 Screen 的薄包装
    - 将个人资料页面和头像 Hook 迁入 `src/features/profile`，并将用户资料请求、头像上传、图片采集和头像 URL/数据 URI 工具拆分为独立模块
    - 将设置占位页面迁入 `src/features/settings`，原有设置路由改为薄包装
    - 将用户资料响应归入 Auth 类型，将头像 URL 标准化归入 shared 工具，避免 Auth 与 Profile 形成双向依赖
    - 保留 `/auth/login`、`/auth/register`、`/(tabs)/user` 和 `/pages/user/settings` 路径，以及登录、注册、头像上传、会话恢复和退出登录的既有行为

- **修改文件列表**
    - `src/features/auth/api/auth.api.ts`、`src/features/auth/api/session.api.ts` - 迁入认证与会话 API
    - `src/features/auth/auth.context.ts`、`providers/AuthProvider.tsx`、`hooks/useAuth.ts`、`hooks/useEmailValidation.ts` - 迁入认证状态与 Hooks
    - `src/features/auth/screens/LoginScreen.tsx`、`RegisterScreen.tsx`、`index.ts` - 迁入认证页面与公开入口
    - `src/features/profile/api/profile.api.ts`、`services/avatar-picker.service.ts`、`utils/avatar.ts`、`hooks/useAvatar.ts`、`screens/ProfileScreen.tsx` - 迁入个人资料与头像能力
    - `src/features/settings/screens/SettingsScreen.tsx`、`src/features/settings/index.ts` - 迁入设置页面
    - `src/shared/utils/avatar.ts` - 新增跨 Feature 的头像 URL 标准化工具
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx`、`src/app/(tabs)/user/index.tsx`、`src/app/pages/user/settings.tsx` - 改为路由薄包装
    - `src/core/providers/AppProviders.tsx`、`src/app/(tabs)/_layout.tsx`、`src/components/FloatingBarComponents/FloatingBar.tsx` - 改为使用新的认证与个人资料入口
    - `src/api/auth.ts`、`src/api/user.ts`、`src/hooks/useAuth.tsx`、`src/hooks/useAvatar.ts`、`src/hooks/useEmailValidation.ts` - 删除已迁移的旧入口

## 2026-07-12 02:16:59 | 优化代码

- **阶段二：迁移共享能力与应用导航基础设施**
    - 将 HTTP client、错误规范化、主题令牌、动效令牌和基础 UI 组件迁入 `src/shared`，统一跨 Feature 的依赖入口
    - 新增共享 storage key，收口认证 token、用户信息和设备标识的存储键，保持现有存储值和会话行为不变
    - 新增 `AppProviders`，以等值方式统一认证 Provider 与手势根容器的应用级装配
    - 将浮动菜单、浮动操作按钮、Android 返回退出处理和导航 Hooks 迁入 `src/core/navigation`
    - 合并原本分散在菜单、手势和操作按钮中的 Tab 顺序、路径识别与主操作配置，保留当前单数路由和现有 URL
    - 删除完成迁移后的旧 HTTP、主题、UI、导航配置与导航 Hook 源文件；未改动 Notes、Categories、Auth 和 Profile 的业务实现

- **修改文件列表**
    - `src/shared/http/client.ts`、`src/shared/http/errors.ts` - 迁入 HTTP 请求与错误处理能力
    - `src/shared/storage/storage.keys.ts` - 新增共享 AsyncStorage 键定义
    - `src/shared/theme/*` - 迁入颜色、间距、圆角、排版和动效令牌
    - `src/shared/ui/*` - 迁入 Button、Card、ModalPanel、Screen 和 TextField 基础组件及统一导出
    - `src/shared/hooks/useDebouncedAction.ts` - 迁入通用操作防抖 Hook
    - `src/core/providers/AppProviders.tsx` - 新增应用级 Provider 组合
    - `src/core/navigation/*` - 新增导航配置、可见性状态、浮动导航组件、返回处理组件和导航 Hooks
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 改为使用 AppProviders、核心导航组件和共享主题
    - `src/app/**`、`src/components/**`、`src/hooks/**`、`src/api/**` - 更新为使用新的 shared/core 导入路径与 storage key
    - `src/api/client.ts`、`src/api/errors.ts`、`src/theme/*`、`src/components/ui/*`、`src/data/actions.ts`、`src/data/floatingMenuVisibility.ts`、相关旧导航组件与 Hooks - 删除已迁移源文件

## 2026-07-12 01:57:17 | 优化代码

- **阶段一：统一领域类型并修正依赖方向**
    - 新增共享 `User` 类型，以及认证、笔记、笔记分类与个人资料的领域类型模块，消除同一数据模型在 API、缓存、页面和组件中的重复声明
    - 将笔记缓存、笔记列表、详情查看器、滑动项和置顶/收藏 Hook 统一改为依赖 `Note` 类型，移除 Hook 对 UI 组件类型的反向依赖
    - 将分类 API、分类组件与分类操作 Hook 统一改为依赖分类领域类型，移除 API 对 `data` 层类型的反向依赖
    - 将认证 Context 和个人资料 API 统一改为依赖共享 `User` 类型，并将个人资料响应、头像上传和采集类型归入 Profile 模块
    - 保持现有路由、API 请求地址、缓存/事件机制和交互行为不变；Zustand 状态迁移留待后续独立阶段处理

- **修改文件列表**
    - `src/shared/types/user.ts` - 新增认证与个人资料共用的用户模型
    - `src/features/auth/auth.types.ts` - 新增认证 DTO 与认证上下文类型
    - `src/features/notes/notes.types.ts` - 新增笔记及创建、更新载荷类型
    - `src/features/notes/categories/categories.types.ts` - 新增分类及创建、更新载荷类型
    - `src/features/profile/profile.types.ts` - 新增个人资料与头像相关响应类型
    - `src/api/auth.ts`、`src/api/categories.ts`、`src/api/notes.ts`、`src/api/user.ts` - 改为使用并转出领域类型
    - `src/data/categories.ts`、`src/data/notes.ts` - 移除重复模型声明并引用统一类型
    - `src/hooks/useAuth.tsx` - 改为使用认证状态与共享用户类型
    - `src/app/(tabs)/note/index.tsx`、`src/app/pages/note/create.tsx`、`src/app/pages/note/[id].tsx` - 改为从 Notes 领域类型模块导入类型
    - `src/components/Note/NoteViewer.tsx`、`src/components/Note/SwipeableNoteItem.tsx` - 移除重复笔记类型声明
    - `src/components/FloatingBarComponents/FloatingBar.tsx`、`src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx`、`src/hooks/FloatingBar/*` - 改为从分类领域类型模块导入类型
    - `src/hooks/notes/useNotePin.ts`、`src/hooks/notes/useNoteStar.ts` - 移除对 UI 组件类型的依赖

## 2026-07-11 20:46:07 | 优化代码

- **重构 NativeWind 样式管理结构（保持现有视觉与布局）**
    - 在 `global.css` 中使用 NativeWind v5/Tailwind CSS v4 `@theme` 建立语义化颜色和圆角令牌，所有令牌沿用原始视觉值
    - 新增 `src/theme` TypeScript 令牌层，集中管理图标、SVG、动画和原生对象样式使用的颜色、间距、圆角与字号
    - 新增 `src/components/ui` 基础组件层，集中管理按钮、输入框、卡片、弹窗面板和页面容器的重复样式结构
    - 将页面和业务组件中散落的十六进制、RGB、RGBA 颜色迁移到主题令牌，并将 6 处 `StyleSheet.create` 等值迁移为 NativeWind 类名
    - 保留所有现有颜色值、组件尺寸、间距、圆角、阴影、排列、动画和交互逻辑，不进行视觉风格调整
    - 新增项目样式开发规范，并为旧 NativeWind 手册补充当前 v5/Tailwind CSS v4 配置提示

- **修改文件列表**
    - `global.css` - 新增 NativeWind 语义化颜色和圆角令牌
    - `src/theme/colors.ts` - 新增原生颜色令牌
    - `src/theme/spacing.ts` - 新增对象样式间距令牌
    - `src/theme/radius.ts` - 新增圆角令牌
    - `src/theme/typography.ts` - 新增字号与字重令牌
    - `src/theme/index.ts` - 新增主题统一导出
    - `src/components/ui/Button.tsx` - 新增按钮基础组件及背景变体
    - `src/components/ui/TextField.tsx` - 新增表单输入框基础组件
    - `src/components/ui/Card.tsx` - 新增卡片基础组件
    - `src/components/ui/ModalPanel.tsx` - 新增弹窗面板基础组件
    - `src/components/ui/Screen.tsx` - 新增页面根容器组件
    - `src/components/ui/index.ts` - 新增基础组件统一导出
    - `src/app/_layout.tsx`、`src/app/(tabs)/_layout.tsx` - 使用主题颜色令牌
    - `src/app/(tabs)/excerpt/index.tsx`、`src/app/(tabs)/todo/index.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/(tabs)/note/index.tsx`、`src/app/(tabs)/user/index.tsx` - 使用语义类名、主题令牌和基础组件
    - `src/app/auth/login.tsx`、`src/app/auth/register.tsx` - 复用按钮与输入框基础组件
    - `src/app/pages/excerpt/create.tsx`、`src/app/pages/todo/create.tsx`、`src/app/pages/user/settings.tsx` - 等值迁移为 NativeWind 页面样式
    - `src/app/pages/note/create.tsx` - 将静态 `StyleSheet` 等值迁移为 NativeWind 类名
    - `src/components/ActionButton.tsx`、`src/components/AddCategoryButton.tsx` - 使用语义类名与主题颜色
    - `src/components/addNoteClass.tsx`、`src/components/CategoryActionModel.tsx` - 复用按钮、弹窗面板和主题令牌
    - `src/components/FloatingMenu.tsx` - 使用浮动菜单语义令牌
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 使用主题颜色与圆角令牌
    - `src/components/FloatingBarComponents/FloatingBarCategoryButton.tsx` - 使用主题颜色与语义圆角
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 使用分隔线语义颜色
    - `src/components/Note/Card/NoteCard.tsx`、`src/components/Note/Card/NoteSwipeActions.tsx` - 使用笔记卡片语义令牌
    - `src/components/Note/SwipeableNoteItem.tsx` - 使用卡片语义圆角
    - `src/components/Note/Viewer/NoteDetailStateView.tsx` - 复用按钮与主色令牌
    - `src/components/Note/Viewer/NoteViewerHeader.tsx`、`src/components/Note/Viewer/NoteViewerMeta.tsx` - 使用主题颜色令牌
    - `src/components/PinBadge.tsx`、`src/components/StarBadge.tsx` - 使用 SVG 主题颜色令牌
    - `src/hooks/FloatingBar/CategoryIndicator.tsx` - 使用状态与阴影颜色令牌
    - `docs/样式开发规范.md` - 新增项目样式维护与新增页面指南
    - `docs/NativeWind-Tailwind-完整手册.md` - 补充项目当前配置入口提示
    - `CHANGELOG.md` - 记录本次样式结构重构

---

## 2026-07-10 19:04:02 | 修复问题

- **修复笔记详情分类名称一直显示为全部**
    - 移除 `NoteViewerMeta` 中对全局当前选中分类名称的依赖，避免详情页把侧边栏选中状态误当作笔记所属分类
    - 根据当前笔记的 `categoryId` 获取分类列表并匹配真实分类名称，未找到或获取失败时显示“未知分类”
    - 将原本写在组件外部的 `useState` 和 `useEffect` 移入组件内部，修复 React Hook 使用位置错误

- **修改文件列表**
    - `src/components/Note/Viewer/NoteViewerMeta.tsx` - 按笔记分类 ID 解析分类名称并修复 Hook 位置
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-10 18:14:59 | 优化代码

- **按 API 文档更新前端接口调用**
    - 新增认证、验证码、笔记、分类和错误解析的统一 API 封装，减少页面与 Hook 中散落的请求路径
    - `client` 请求拦截器改为读取 `EXPO_PUBLIC_BASE_URL`，并为验证码、注册、登录链路自动携带稳定的 `X-Device-Id`
    - 登录和注册页改为使用认证接口封装，并统一展示限流等待时间、验证码剩余尝试次数等后端错误信息
    - 笔记列表、笔记创建/删除、分类列表/创建/更新/删除、笔记置顶/标星等调用点改为使用统一接口函数
    - 保留前端现有的笔记分类、置顶和标星行为，其中 `PUT /notes/:id` 属于现有功能兼容封装

- **修改文件列表**
    - `src/api/client.ts` - 支持环境变量 API 地址与验证码链路设备标识
    - `src/api/auth.ts` - 新增认证与验证码接口封装
    - `src/api/categories.ts` - 新增分类接口封装
    - `src/api/errors.ts` - 新增 API 错误信息解析工具
    - `src/api/notes.ts` - 新增笔记接口封装
    - `src/app/auth/login.tsx` - 接入认证封装与统一错误提示
    - `src/app/auth/register.tsx` - 接入认证封装与统一错误提示
    - `src/app/(tabs)/note/index.tsx` - 接入笔记和分类封装
    - `src/app/pages/note/create.tsx` - 接入创建笔记封装
    - `src/app/pages/note/[id].tsx` - 接入获取笔记封装与统一错误提示
    - `src/components/FloatingBarComponents/FloatingBar.tsx` - 接入获取分类封装
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 接入删除分类和删除笔记封装
    - `src/hooks/FloatingBar/useCategoryPin.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryStar.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryRename.ts` - 接入更新分类封装
    - `src/hooks/FloatingBar/useCategoryChangeIcon.ts` - 接入更新分类封装
    - `src/hooks/notes/useNotePin.ts` - 接入更新笔记封装和统一错误提示
    - `src/hooks/notes/useNoteStar.ts` - 接入更新笔记封装和统一错误提示
    - `CHANGELOG.md` - 记录本次接口更新变更

---

## 2026-07-08 19:05:28 | 修复问题

- **修复笔记页语法结构损坏导致编译失败**
    - 清理 `note/index.tsx` 中残留的重复和不完整代码块，恢复完整的 `fetchNotes` 请求逻辑
    - 移除页面内重复的置顶和标星内联实现，重新使用已抽离的 `useNotePin` 与 `useNoteStar`
    - 保留笔记列表刷新、分类变更订阅、删除笔记、缓存同步和返回顶部动画等原有行为

- **修改文件列表**
    - `src/app/(tabs)/note/index.tsx` - 修复损坏的组件结构并恢复 hook 调用
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-08 01:11:19 | 优化代码

- **抽离笔记置顶与标星 Hook**
    - 新增 `useNotePin`，封装笔记置顶的乐观更新、置顶顺序维护、后端同步和失败回滚逻辑
    - 新增 `useNoteStar`，封装笔记标星的乐观更新、后端同步和失败回滚逻辑
    - `note/index.tsx` 改为调用独立 Hook，减少页面组件中的业务逻辑长度
    - 保留原有缓存同步、打开操作栏关闭、错误提示和排序行为

- **修改文件列表**
    - `src/hooks/notes/useNotePin.ts` - 新增笔记置顶 Hook
    - `src/hooks/notes/useNoteStar.ts` - 新增笔记标星 Hook
    - `src/app/(tabs)/note/index.tsx` - 接入独立 Hook，移除内联置顶/标星回调
    - `CHANGELOG.md` - 记录本次优化代码变更

---

## 2026-07-05 11:56:48 | 修复问题

- **修复删除分类后全部列表残留未知分类笔记**
    - 新增按分类移除本地笔记缓存的事件通知，避免删除分类后全量刷新全部笔记
    - 分类下笔记和分类本身在服务端删除成功后，再通知笔记页本地移除对应分类下的笔记
    - 笔记页订阅分类笔记移除事件，仅过滤当前本地 `notes` 状态中匹配分类的笔记
    - 保持用户手动刷新时从服务端重新校准数据的能力，避免本地删除失败后误隐藏服务端数据

- **修改文件列表**
    - `src/data/notes.ts` - 新增按分类移除笔记的本地事件机制
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 分类删除成功后广播本地笔记移除事件
    - `src/app/(tabs)/note/index.tsx` - 订阅分类笔记移除事件并增量更新笔记列表
    - `CHANGELOG.md` - 记录本次问题修复变更

---

## 2026-07-05 04:09:50 | 优化代码

- **优化 FloatingBar 分割线样式**
    - 将 `FloatingBarDivider` 从 1px 普通灰色长线调整为 2px 短胶囊分割线
    - 缩短宽度并增加上下间距，让分类分组更轻、更清晰
    - 使用更柔和的冷灰色与透明度，降低侧边栏视觉噪音

- **修改文件列表**
    - `src/components/FloatingBarComponents/FloatingBarDivider.tsx` - 调整 FloatingBar 分割线样式
    - `CHANGELOG.md` - 记录本次样式优化变更

---

## 2026-07-04 16:46:35 | 优化代码

- **优化删除分类时的笔记删除请求压力**
    - 将分类下笔记的逐条删除从无限并发 `Promise.all` 调整为小批量限流执行
    - 每批最多删除 3 条笔记，批次之间间隔 100ms，降低服务器瞬时请求峰值
    - 保留后续替换为服务端批量删除接口的代码标记
    - 分类下笔记删除完成后，再继续删除分类本身，保持原有删除顺序

- **修改文件列表**
    - `src/hooks/FloatingBar/useCategoryDelete.ts` - 增加分类笔记删除限流逻辑
    - `CHANGELOG.md` - 记录本次优化变更

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

## 2026-09-20 10:26:11 | 修复问题：解决本地 Git 合并冲突

- 文件：CHANGELOG.md、app.json、src/features/todos/screens/TodosScreen.tsx。
- 合并 `kroos_todo` 与进入工作区的 0.2.4 配置及文档变更：保留待办整周列表、日历和本地提醒实现；合并应用图标、启动页、EAS 项目配置与 Expo 本地通知插件；合并双方历史日志并移除三个真实冲突文件中的 Git 冲突标记。
- 验证：`git ls-files -u` 无输出，暂存区 `git diff --cached --check` 通过；`npm run check` 的类型检查、Lint、主题检查通过，Node 并发测试运行器出现一次异步反序列化异常后，串行全量测试 282/282 通过；`npx expo config --type public --json` 通过。
- 未执行 Git 提交、推送、构建或设备验收。

---
