# Android APK 差量合并

Expo 本地模块，Android 原生实现；Expo Go / Web 不提供此模块。
固定使用 HDiffPatch **v5.1.3** 官方 Android SDK 中 `libs/` 的四种 ABI 库和 HPatch.java。
官方下载： https://github.com/sisong/HDiffPatch/releases/tag/v5.1.3

归档 `hdiffpatch_v5.1.3_sdk_android_hpatchz.zip` 的 SHA-256：
`d7b98bcd3efb05436e08bcf525136c81e7dc6713bc58260770a2793818167fb7`。
导入前已核对官方 GitHub Release digest；上游许可见 HDiffPatch-LICENSE。
arm64-v8a ELF LOAD 对齐为 0x4000（16 KiB）。

合并在原生异步函数中执行，使用 4 MiB I/O 缓存；不改动已安装 APK。
读取本机 sourceDir；拆分 APK 安装不允许套用单 APK 补丁。
校验旧包、补丁、输出摘要与目标包名/版本/签名，错误删除输出，不自动回退全量下载。
