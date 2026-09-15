package expo.modules.irisnoteupdater

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.StatFs
import com.github.sisong.HPatch
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class IrisNoteUpdaterModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext) { "应用尚未就绪" }
  private fun digest(file: File): String {
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(256 * 1024)
      while (true) { val count = input.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) }
    }
    return hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
  }
  private fun cacheFile(uri: String): File {
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "更新文件必须位于应用缓存中" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    require(file.path.startsWith(context().cacheDir.canonicalPath + File.separator)) { "更新路径越界" }
    return file
  }
  @Suppress("DEPRECATION")
  private fun packageInfo(): PackageInfo = context().packageManager.getPackageInfo(context().packageName,
    if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
  @Suppress("DEPRECATION")
  private fun buildCode(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  @Suppress("DEPRECATION")
  private fun certificates(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 255) }
    }?.toSet() ?: emptySet()
  }
  @Suppress("DEPRECATION")
  private fun verifyTarget(file: File, options: Map<String, String>) {
    require(file.isFile && file.length() == options.getValue("targetSize").toLong()) { "新版安装包大小不匹配" }
    require(digest(file) == options.getValue("targetSha256")) { "新版安装包摘要不匹配" }
    val info = requireNotNull(context().packageManager.getPackageArchiveInfo(file.path,
      if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)) { "无法解析安装包" }
    val installed = packageInfo()
    require(info.packageName == context().packageName) { "新版包名不匹配" }
    require(info.versionName == options.getValue("targetVersion") && buildCode(info) == options.getValue("targetBuildCode").toLong()) { "新版版本信息不匹配" }
    require(buildCode(info) > buildCode(installed)) { "禁止安装旧版本" }
    val signer = certificates(info)
    require(signer.isNotEmpty() && signer == certificates(installed)) { "新版签名与已安装应用不同" }
  }
  override fun definition() = ModuleDefinition {
    Name("IrisNoteUpdater")
    AsyncFunction("getInstalledApk") {
      val info = packageInfo()
      val source = File(context().applicationInfo.sourceDir)
      val supported = context().applicationInfo.splitSourceDirs.isNullOrEmpty()
      mapOf("version" to (info.versionName ?: ""), "buildCode" to buildCode(info),
        "sha256" to if (supported) digest(source) else "", "deltaSupported" to supported)
    }
    AsyncFunction("verifyApk") { options: Map<String, String> ->
      verifyTarget(cacheFile(options.getValue("outputUri")), options)
    }
    AsyncFunction("applyPatch") { options: Map<String, String> ->
      require(context().applicationInfo.splitSourceDirs.isNullOrEmpty()) { "当前为拆分安装包，无法应用此差量包" }
      val old = File(context().applicationInfo.sourceDir)
      val patch = cacheFile(options.getValue("patchUri"))
      val output = cacheFile(options.getValue("outputUri"))
      require(patch != output && output.extension == "apk") { "无效合并目标" }
      require(digest(old) == options.getValue("baseSha256")) { "本机旧版本与差量包不匹配" }
      require(patch.isFile && digest(patch) == options.getValue("patchSha256")) { "差量包校验失败" }
      val size = options.getValue("targetSize").toLong()
      require(size in 1..1073741824L) { "无效目标大小" }
      require(StatFs(context().cacheDir.path).availableBytes > size + 16 * 1024 * 1024) { "剩余空间不足，无法合并更新" }
      if (output.exists()) require(output.delete()) { "无法清理旧合并文件" }
      try {
        require(HPatch.patch(old.path, patch.path, output.path, 4L * 1024 * 1024, 1, true) == 0) { "差量包合并失败" }
        verifyTarget(output, options)
        Uri.fromFile(output).toString()
      } catch (error: Throwable) { output.delete(); throw error }
    }
  }
}
