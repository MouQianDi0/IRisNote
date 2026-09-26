# Android APK 差量合并

Expo 本地模块，Android 原生实现；Expo Go / Web 不提供此模块。
固定使用 HDiffPatch **v5.1.3** 官方 Android SDK 中 `libs/` 的四种 ABI 库和 HPatch.java。
官方下载： https://github.com/sisong/HDiffPatch/releases/tag/v5.1.3

归档 `hdiffpatch_v5.1.3_sdk_android_hpatchz.zip` 的 SHA-256：
`d7b98bcd3efb05436e08bcf525136c81e7dc6713bc58260770a2793818167fb7`。
导入前已核对官方 GitHub Release digest；上游许可见 HDiffPatch-LICENSE。
arm64-v8a ELF LOAD 对齐为 0x4000（16 KiB）。

合并与 SHA-256 校验在专用串行原生工作线程中执行，不占用 JavaScript 或 Expo 共享模块队列。合并使用 4 MiB I/O 缓存，哈希流式读取使用 1 MiB 缓冲；不改动已安装 APK。
读取本机 sourceDir；拆分 APK 安装不允许套用单 APK 补丁。
校验旧包、补丁、输出摘要与目标包名/版本/签名，错误删除输出，不自动回退全量下载。

## 校验与安装流程

- 差量准备：旧包摘要 1 次、补丁大小及摘要 1 次、合并后完整目标 APK 大小及摘要 1 次，再检查包名、版本递增及签名；准备成功后不重复调用 verifyApk。
- 全量准备：完整目标 APK 大小、摘要和身份检查 1 次。
- 获得安装权限、准备拉起安装器时：完整目标 APK 再校验 1 次。正常一次更新共扫描目标 APK 两次；安装取消后重新安装、校验期间切到其他应用后再回来，均重新做安装前验证，不跨等待时段复用验证结果。
- 点击“下载并安装”后自动衔接安装。先调用 canInstallPackages；未授权则等待当前草稿落盘，打开本应用的未知来源安装设置。返回后再次查询授权，拒绝则保留 APK 等待手动重试，不循环跳转。
- 校验成功后等待当前草稿写入再打开安装器。草稿保存失败、文件不匹配或权限被撤销时不安装。

## 后台与进度

关闭弹窗只隐藏 UI，更新任务和进度保存在应用级状态中，仍可编辑笔记。重新打开更新窗口显示当前任务，不再发起新任务。安装器和权限页仅在 IRisNote 处于前台时拉起；切到其他应用期间完成的任务等回到前台再衔接。

这是应用进程存活期间的后台线程，不是 Android 常驻服务或持久任务。锁屏、系统回收进程后不保证继续执行；进程重启后需要重新检查更新。原生 API 改动要安装包含该模块的新版 APK 才生效，旧 APK 首次升级仍使用旧流程。

onProgress 事件包含 requestId、stage、processed、total、elapsedMs。读取进度约 150ms 节流；合并和包信息核对阶段只显示活动指示与时间，不伪造百分比。返回 timingsMs 并通过 Logcat 的 IrisNoteUpdater 标签记录 base、patch、merge、target、targetMetadata、install、installMetadata 各阶段耗时。

校验累计 10～15 秒是目标，不是固定超时或所有手机的保证。真机验收使用真实发布包，单独统计上述校验阶段，下载、差量合并、用户授权等待和系统安装耗时分别记录；测试应用内继续编辑、授权拒绝及返回、安装取消、后台转前台、损坏包拒绝及草稿落盘。JavaScript 流程测试不能代替原生 SHA-256、签名校验或真机性能验收。
