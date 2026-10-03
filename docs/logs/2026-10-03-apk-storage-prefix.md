# APK 发布目录切换为 IRisNote_apk

- 记录时间：2026-10-03 04:16:09（Asia/Shanghai）。
- 授权：用户确认上传目录、下载配置、测试与日志方案；用户提供 ubuntu@1.14.177.177 和 PM2，已只读确认生产进程 irisapi-prod、目录 /home/ubuntu/irisapi、配置 .env.local。
- 基点：364a5eacc4f31ba0a90a10a9e4cc00304a67e1d1；本次代码、模板、测试和发布文档修改前均与该提交一致。已运行 git diff -- scripts/release/cos.mjs release.env.example tests/releases/cos.test.cjs docs/构建发布/android-releases.md 实测工作区差异，未创建提交，故不虚构结果提交或双提交范围。
- 既有工作区含登录恢复等无关改动及 CHANGELOG 历史追加，全部保留。

## 改动清单（按层）

- src/features → src/core → src/shared → modules/：无文件修改。检查了 updates/release.ts、update-store.ts 和原生更新模块 README；客户端沿用服务端 delivery.downloadUrl。
- scripts/release/cos.mjs：默认 prefix 从空字符串改为 IRisNote_apk，默认 CDN 基础地址加入同名目录；对象命名、校验、重试与禁止覆盖机制继续复用。
- tests/releases/cos.test.cjs：模拟 COS HEAD/PUT、CDN GET 及真实 SDK 的本地 HTTP 测试均核对新目录；新增斜杠归一化、部分迁移拒绝、显式旧根目录兼容及 verifyExisting 成功用例。
- docs/构建发布/android-releases.md：同步路径配置、后端切换要求、环境变量优先级、历史包与回退行为。
- docs/logs/2026-10-03-apk-storage-prefix.md：新增 58 行，记录基点、分层改动、原行为、调用链及验证。
- release.env.example：更新可入库的路径模板。
- .env.release.local：仅更新 IRIS_COS_PREFIX、IRIS_COS_CDN_BASE_URL 两个本机私有配置，未改动凭据，不入库、不记录密钥。
- CHANGELOG.md：顶部追加本次记录，保留原有全部历史。

## 与原代码对比及改动原因

1. 原来缺省上传对象为 IRisNote-<version>-<buildCode>.apk；现在为 IRisNote_apk/IRisNote-<version>-<buildCode>.apk。原因是用户要求将各版本完整 APK 统一存放在新目录。
2. 原来默认 CDN 地址为 https://download.tech-mou.top；现在为 https://download.tech-mou.top/IRisNote_apk。两处同步才能保证上传对象与回读地址一致，避免上传后校验根目录旧对象。
3. 默认值变化单独说明：未配置 prefix 时改用 IRisNote_apk；显式空 prefix 仍代表根目录，须显式配套根目录 CDN。保留显式配置能力，不自动修改操作者传入的路径；部分迁移配置报错停止。
4. 原测试针对根目录；现在检查带目录对象，并在真实 SDK 本地测试中对错误路径返回 404，防止仅改测试字符串却未验证实际请求路径。
5. .env.release.local 原 prefix 为空且 CDN 为根地址，现与默认值一致；文档说明终端/CI 变量优先，防止仅更新源码而继续沿用旧配置。

## 完整调用链路与失败处理

发布 CLI build/upload → uploadRelease → cosConfig（终端/CI 优先于 .env.release.local）→ uploadBoth → COS 配置及版本控制预检 → 服务器 APK PUT / 草稿核对 → 服务器 SHA-256 回读 → COS HEAD/PUT IRisNote_apk/文件名 → CDN GET 新目录地址并校验大小、ETag、SHA-256 → COS HEAD 核对并发变化 → 差量准备 → 保持草稿，另行 publish。

官网或 App 检查更新 → 后端 releaseApkUrl 根据 RELEASE_CDN_BASE_URL 与版本/构建号拼接 URL → resolveReleaseApkUrl HEAD 预检（200 且大小匹配，5 秒超时，缓存 30 秒）→ 返回 CDN 或服务器完整包 URL → App parseRelease 验证 → update-store FS.createDownloadResumable(delivery.downloadUrl) → 原生摘要/身份校验及既有安装流程。

上传端与后端通过配置镜像同一目录；本次复用上传端 cosConfig/cosObjectKey 唯一入口，下载端仍以后端返回地址为准，不在 App 硬编码目录。独立后端 D:/Note project/irisapi/src/services/releases.ts 已只读核查，现有代码支持前缀，无需更改算法。

上传只允许预留/草稿；失败保留本地 APK 和已经上传的文件，可用同构建号重试，匹配对象仅校验、不覆盖；不自动发布或删除远端文件。更新下载失败继续沿用现有错误提示与重试流程。服务器完整 APK 与差量补丁保持原分发职责。

本次不修改 Store、SQLite 或笔记/待办内容，也不改变账号与用户云存储授权。版本发布使用现有发布令牌及 COS 凭据，APK 查询/下载沿用独立更新链路。保留旧根目录对象，历史 APK 未迁移，新目录缺失时后端按原规则回退服务器。

## 验证情况

- 修改前 npm run typecheck：通过，无既有类型错误。
- node --test tests/releases/cos.test.cjs tests/releases/upload.test.cjs：22 项全部通过。
- 加载本机私有配置后仅输出 prefix/cdn/示例对象键：确认 IRisNote_apk 及新目录 URL 生效，无凭据输出。
- git diff --check：通过；本次修改文件冲突标记扫描无匹配。
- npm run check：退出码 0，TypeScript、Lint、theme:check 和 731 项测试通过；Lint 有 1 条既有警告（未修改的 PermissionSettingsScreen.tsx:171，liveUpdateCapable 未使用），无错误。
- 未执行：真实云上传、历史对象迁移、构建、真机更新、Git 提交/推送。真实 CDN 回读和线上配置切换已完成，详见下节。

## 线上切换与回读结果

- 完成核验时间：2026-10-03 04:21:17（Asia/Shanghai）。
- 连接：用户提供 ubuntu@1.14.177.177 / PM2；只读定位目录 /home/ubuntu/irisapi，生产 irisapi-prod（端口 3000，ENV_FILE=.env.local），测试 irisapi-test（端口 3001，ENV_FILE=.env.dev）。服务器源码 HEAD 为 71c09a44fb91c49af5f427e2cb07f5648fb4f1a2；读取 dist/index.js 和 dist/services/releases.js 确认启动读取配置文件且已支持 CDN 子目录，未重新构建或更换代码，未将源码 HEAD 等同于已证实的 dist 构建提交。
- 切换前最新发布记录为 0.8.0 / build 24；新目录 CDN HEAD 返回 200，Content-Length=127870930；旧根目录该对象返回 404。新目录对象已存在，本次未上传或迁移。
- 完整流式 GET 新目录 APK：127870930 字节，SHA-256=afb6a306144db905a433f9a80b086df9a2d12627e2d99ea23bccdba4cdba7a22，与发布 API 记录一致；通过后才切换生产配置。
- 远端只修改 /home/ubuntu/irisapi/.env.local 中 RELEASE_CDN_BASE_URL，从 https://download.tech-mou.top 改为 https://download.tech-mou.top/IRisNote_apk；修改前确认旧值且只有一条配置，dotenv 解析前后确认所有其他键值一致。原文件备份到 /home/ubuntu/irisapi/.env.local.bak-apk-prefix-2026-10-02T20-20-09-567Z，权限 0600，不记录密钥。
- 执行 pm2 reload irisapi-prod 成功；生产新 PID 226900，online；测试 PID 3417026 保持不变且 online。进程从原 ENV_FILE 读取持久配置，无需更改 PM2 进程列表或注入新环境变量。
- 重新请求 GET https://tech-mou.top/api/releases/latest?version=0.1.0&buildCode=6&updatePolicy=3&deltaWindowPolicy=4：200，目标 0.8.0 / build 24，delivery.mode=full，delivery.downloadUrl=https://download.tech-mou.top/IRisNote_apk/IRisNote-0.8.0-24.apk，大小与摘要一致，证明实际生产进程已使用新配置。
- 官网 installer API 返回 downloadsEnabled=false，保留原有关闭设置，未开启下载。早期诊断以不存在的 0.0.0/build 1 携带策略请求时返回 400（无效已发布版本距离）；换成真实已发布版本 0.1.0/build 6 后返回 200，此诊断输入错误不是路径迁移缺陷。
- 回滚方式：仅将 .env.local 的 RELEASE_CDN_BASE_URL 恢复为原值并 reload irisapi-prod；备份保留供核对，不覆盖后续其他配置变更。旧根目录 0.8.0 对象当前不存在，回滚后按既有后端逻辑回退服务器；不声称所有历史 CDN 对象可用。
