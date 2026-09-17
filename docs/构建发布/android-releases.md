# Android 双渠道发布

## 范围

包名为 `com.mouqiandi.irisNote`。EAS 和自有 Gradle 构建共用版本服务分配的
versionCode，并以同一正式证书签名。旧 `com.mouqiandi.NextNote` 属于不同应用，
不会覆盖升级或自动迁移其本地笔记。不要通过卸载旧应用来解决签名不匹配。

APK 更新由自有 `/api/releases` 接口提供；本功能不是 EAS Update 热更新。
主版本变化（如 1.9.3 → 2.0.1）下载完整 APK；同主版本内的功能更新和修复更新
（如 1.2.0 → 1.3.0 / 1.2.1）仅下载差量包，然后在手机上合并为新版 APK。
缺少匹配补丁、旧包摘要不符、合并失败时明确报错，不自动回退为完整包下载。
首次安装或为不具备差量能力的旧安装版接入本功能，需要先分发完整基础版本；
已有旧用户应通过一次主版本更新进入该基础版本。单 APK 的差量不适用于商店拆分 APK。
自动检查间隔为六小时，手动检查立即执行。下载依赖应用进程存活；失败可重试，
不保证后台常驻或被杀进程后的断点续传。客户端分块计算 SHA-256，校验成功才打开
系统安装界面。差量模式会额外校验旧包、补丁、合并输出及新包签名/包名/版本。
安装需要用户确认，授权入口位于下载完成后的弹窗中。

## 首次准备

1. 在 irisapi 按 `docs/releases.md` 手动应用 002、003 两个迁移及配置，备份数据库后操作。
2. 核对已有正式 APK 包名、最高构建号和签名证书，初始化序列高于所有已分发构建。
3. 在自有机器配置 Node.js（满足当前 Expo SDK 要求）、JDK、Android SDK、build-tools、
   Git、tar。Windows 使用 Gradle，不调用 Windows 不支持的 EAS local build。
4. 将 `docs/构建发布/release.env.example` 复制为项目根目录的 `.env.release.local` 并填写参数；
   发布工具会自动读取此文件，终端或 CI 中已有的环境变量优先（包括空值）。
   文件不存在时仍可只使用终端环境变量；文件读取失败会停止命令。
   删除不用的空配置项，含 `#` 或空格的值加引号，Windows 路径建议用单引号。
   `.env.release.local` 已被 Git 忽略，不要提交密钥或密码；发布工具不读取应用的 `.env.local`。
   EAS 云端凭据需预先配置同一正式签名，发布工具不会自动导出或替换签名密钥。
5. 提交应用源码及工具；构建会从指定 Git 提交导出到独立临时目录。
   工作区的未提交源码、忽略的 `.env.local` 和旧 `android/` 不会进入构建。
   如需自定义 API 地址，在构建进程设置两个 `EXPO_PUBLIC_*` 参数。

## 构建源码范围与中文路径

发布入口按预留记录的 Git 提交读取根目录清单，再导出构建源码：

- 保留 `src/`、`assets/`、`modules/`、`plugins/`、`scripts/`、`tests/`、依赖锁文件及 Expo、EAS、Metro、TypeScript、ESLint、样式配置；测试和主题检查仍是构建前必跑步骤。
- 排除根目录的 `docs/`、`releases/`、`.claude/`、`.codegraph/`、`.vscode/`，以及 `AGENTS.md`、`CLAUDE.md`、`CHANGELOG.md`、`README.md`、`TODO.md`、`design-qa.md`、`待办事项.md`、`debug.log`、`tmpwebapp-node-modulesprepare.log`。
- 发布说明在 `reserve` 阶段已读取并保存到服务端，构建不再依赖 `releases/` 中的说明文件。排除仅影响临时源码归档，不删除仓库文件。
- 未列入排除清单的新目录/文件默认保留，避免遗漏新构建输入；模块内部文档、许可证与根目录 `LICENSE` 保留。
- Windows 自带 bsdtar 解包时显式使用 `--options hdrcharset=UTF-8`，支持中文资源、空格和长文件名；Linux/macOS 保持原解包参数。工具不修改系统编码或 Git 换行配置。

筛选实现位于 `scripts/release/source.mjs`。仅调整导出工具后可以重试原预留构建号；构建仍使用该编号原先绑定的提交。如需要发布后来修改的应用源码，应提交后重新预留构建号。

## Windows Gradle 回环连接修复

### Windows Ninja 长路径兼容

Windows 发布构建使用项目所在盘的短目录（例如 `D:\iris-build\r-xxxxxx\source`），不再使用用户 Temp 下的长目录。可在 `.env.release.local` 设置 `IRIS_BUILD_ROOT`，必须是本地绝对路径、英文无空格且不超过 40 字符。目录自动创建，每次构建使用独立子目录。

首次准备项目专用 Ninja：

```powershell
npm run release -- setup-ninja
```

工具下载官方 Ninja 1.12.1 并校验归档及可执行文件 SHA-256，保存在 `.expo/ninja-1.12.1/`。也可通过 `IRIS_NINJA_PATH` 指定已有的 Ninja 1.12.0 或更新版本。`doctor` 和 Windows 自建发布会在耗时构建前检查工具。

发布入口通过本次 Gradle 的 `--init-script`，在各 Android 模块的 CMake 参数中指定 `CMAKE_MAKE_PROGRAM`。不覆盖 Android SDK 中的 ninja.exe，不更改全局 PATH/TEMP 或用户 Gradle 配置；Linux/macOS 保留原工具链。已有旧临时构建目录保留，新构建从短目录重新生成 CMake 缓存。

### Java 回环连接

本机用户 Temp 目录中的 Java Unix 域套接字连接会失败，表现为
`Unable to establish loopback connection` / `Invalid argument: connect`。
项目命令在 Windows 下通过子进程 `JAVA_TOOL_OPTIONS` 将 `jdk.net.unixdomain.tmpdir`
设为原始项目 `.expo` 目录，确保启动器、Gradle daemon 和编译子进程在启动时获得设置。
不改变全局 TEMP、JAVA\_HOME、网络或防火墙配置；Linux/macOS 不注入此参数。

```powershell
npm run android
npm run gradle -- help
npm run gradle -- :irisnote-updater:compileDebugKotlin
```

自有发布构建也会自动使用同一环境，即使代码被导出到用户 Temp 下的独立构建目录。
直接调用 `android/gradlew.bat` 或从 Android Studio 启动的同步不经过项目入口，
不会自动获得修复参数。新 Gradle 命令默认使用 `--no-daemon`，避免复用旧环境的 daemon。
需要自定义时可在当前终端设置 `IRIS_GRADLE_SOCKET_DIR`，指向已验证可用、可写的短路径。
路径加上 socket 文件名超过 100 字节时会明确报错，不回退到已知故障目录。
本修复针对回环问题；后续依赖下载或编译错误须按其实际原因分别处理。

## 发布命令

### COS 双端自动上传

自建 `build` / `build:apk` 成功后自动执行：服务器上传 → 服务器实际文件回读并校验
SHA-256 → COS 上传及 CDN 回读校验 → 差量生成和上传。两端完整 APK 相同，完成后仍是
草稿，人工核对后执行 `publish`。已有 APK 或 EAS 下载产物执行一次 `upload` 即可。

默认桶 `irisnote-1334342309`、地域 `ap-guangzhou`、CDN 基础地址
`https://download.tech-mou.top`，目录前缀为空。COS 对象名严格为
`IRisNote-<version>-<buildCode>.apk`。配置键见 `release.env.example`；必须在
`.env.release.local` 或当前终端设置 `IRIS_COS_SECRET_ID`、`IRIS_COS_SECRET_KEY`，
临时凭据还需 `IRIS_COS_SECURITY_TOKEN`。凭据不进入构建子进程或 EAS。
本机上传配置不会自动修改线上 `RELEASE_CDN_BASE_URL`，后端应配置相同 CDN 基础地址。

凭据需要目标桶的 `cos:GetBucketVersioning` 及对应对象的 `cos:HeadObject`、
`cos:GetObject`、`cos:PutObject` 权限。工具先检查版本控制，允许未开启或 Enabled；
Suspended/未知状态停止，不修改桶权限或版本控制。上传采用流式 PUT 并携带禁止覆盖请求头。
未开启版本控制时由 COS 原子禁止覆盖；Enabled 时此请求头不生效，脚本先查询同名对象，
存在则只校验、不上传，不存在才创建新版本，并核对 PUT 返回的 ETag/版本 ID 是否仍为当前对象。
校验后再次 HEAD 检查对象未变。Enabled 下保留历史版本，但这些检查不提供跨机器原子互斥，
不能阻止其他上传者在检查和 PUT 之间写入；发现版本变化会报错，不自动删除或回滚历史版本。
同一个构建号应只由一个发布进程处理。

COS 默认域名会拒绝 APK GET（DownloadForbidden），因此回读使用配置的 CDN 自定义域名，
不向 CDN 发送 COS 密钥/签名。CDN 必须返回 200、正确 Content-Length 和与 COS HEAD 一致的
ETag，并通过完整流式 SHA-256 校验；携带 If-Match、Accept-Encoding: identity 和 Cache-Control:
no-cache，禁止重定向。旧缓存、404、大小/ETag/摘要错误均报错，保留文件供重试，不自动覆盖或
刷新 CDN。请求头不保证所有 CDN 都绕过缓存；失败时需核对 CDN 缓存和回源配置。
校验会读取服务器和 CDN 完整文件，会产生额外下载流量；不以元数据或 ETag 代替 SHA-256。

任一步失败时保留本地 APK 和已成功上传的文件，报告失败阶段并返回非零退出码。
重新执行相同 `upload --build <编号> --apk <路径>`：服务器为匹配草稿时回读校验并跳过
上传，然后补齐 COS 与差量包。上传请求成功但响应丢失也可以这样恢复。
只接受预留/草稿状态，不改写已发布或撤回版本；失败不自动删除远端文件，也不自动发布。
COS/CDN 若允许公开读取，未发布对象也可能通过已知链接访问。

官网首装及跨主版本完整更新由现有后端选择地址：CDN HEAD 返回 200 且大小匹配时
返回 CDN，否则文件缺失、异常或 5 秒超时回退服务器，结果缓存 30 秒。
桶中存在对象不等于 CDN 可访问；非法 CDN 地址配置仍报错。下载开始后不自动切换线路。
同主版本差量补丁仍走服务器，服务器完整 APK 必须保留。该改动无需修改后端代码。

以下命令在 IRisNote 根目录执行。`28` 是示例，必须换成 reserve 返回的实际编号。

```powershell
npm run release -- setup-delta
npm run release -- doctor
npm run release -- reserve --source self --version 1.1.0 --notes D:\releases\notes-1.1.0.txt
npm run release -- build --build 28
npm run release -- inspect --build 28 --apk .\dist\releases\1.1.0\IRisNote-1.1.0-28.apk
# build 已自动上传；仅已有 APK、EAS 产物或失败重试时执行下一条
npm run release -- upload --build 28 --apk .\dist\releases\1.1.0\IRisNote-1.1.0-28.apk
npm run release -- status --build 28
```

人工核对版本、说明、安装包及测试结果后再执行：

```powershell
npm run release -- publish --build 28
```

上传 APK 后，工具会为同主版本的历史已发布构建（含已撤回版本）自动生成补丁。
每个补丁都在本机实际合并并比较完整 SHA-256；上传时服务器也会合并并复核。
每个补丁上传成功后，工具会删除临时下载的基础 APK，仅在该版本目录下保留
`<构建>-from-<基础构建>-*` 目录（含 update.hdiff 及其元数据）作为本机补丁记录。
补丁生成/上传中断后，运行以下命令恢复，已成功上传的补丁会跳过：

```powershell
npm run release -- patches --build 28 --apk .\dist\releases\1.1.0\IRisNote-1.1.0-28.apk
```

发布前再次检查补丁覆盖范围；如果期间有其他版本先发布，需补齐新增基础包的补丁。
新版完整 APK 仍需上传并保留：供首次安装、跨主版本更新及后续补丁生成使用。
它不会作为同主版本更新的自动备用下载。

差量工具固定为 HDiffPatch 5.1.3，下载归档有 SHA-256 锁定。支持 Windows x64/ARM64、
Linux x64/ARM64 和 macOS；也可配置 IRIS\_HDIFFZ\_PATH / IRIS\_HPATCHZ\_PATH 指向对应版本。
Windows x64 工具及 Android 库已在当前开发环境核对；其他宿主平台需在目标机器验证。
差量包大小取决于实际二进制变化，不保证固定节省比例。

EAS APK：预留时使用 `--source eas`，其余流程相同。云构建结束后从对应 EAS 构建页面
下载 APK，再运行 inspect / upload。工具校验真实包名、版本、签名及摘要。
EAS 仍固定使用项目声明的 CLI 版本。不要绕过工具直接递增远程版本。

EAS AAB：预留 `--source eas` 后执行 `npm run build:aab -- --build 28`。
AAB 使用 production profile，供商店提交，不可通过 APK 更新接口分发。

`npm run build:apk -- --build 28` 是 build 的快捷入口，支持已预留的两种 APK 渠道。
构建前必跑 `npm run check`，已有测试或类型错误也会阻断，不允许默认跳过。
Windows 的参数路径不能包含命令解释器元字符；使用普通绝对路径。

## 状态与失败处理

- reserved：构建号已经占用；失败后可重试同一份不可变代码，编号不回收。
- draft：安装包上传完成但不可被用户查询或下载；不能覆盖上传。
- published：可以查询和下载；较旧的构建不能晚到后替换最新版本。
- withdrawn：执行 `npm run release -- withdraw --build 28` 停止推荐该版本。
  客户端不执行降级，已经安装问题版本的用户需要更高构建号的修复版。

自有构建输出按版本号保存到 `dist/releases/<版本号>/`（例如 `dist/releases/1.1.0/`），
旁边 JSON 记录提交、包信息和摘要；差量补丁的临时工作目录也在同一版本子目录下。
独立临时目录路径会打印出来并保留供诊断；清理前确认构建完成及产物已保存。
构建成功、双端上传完成和发布是三个不同结果。自建构建串联上传，上传失败不代表 APK 构建失败；
应使用日志给出的 upload 命令重试，不必重新打包。

## 验收

`npm run test:delta-real` 会在 `.expo/delta-tests/` 创建两个独立签名的测试 APK，
用真实 hdiffz/hpatchz 执行差量生成和还原，再用 apksigner/aapt 核对结果；
测试使用合成资源，不能代替 IRisNote 正式包的性能或设备验收。

需要分别验证 EAS 和自有签名构建、HTTPS 版本接口、取消/失败/摘要不匹配，以及
真实 Android 设备覆盖升级并保留数据。类型检查、单元测试、Hermes 导出均不能替代此验收。
