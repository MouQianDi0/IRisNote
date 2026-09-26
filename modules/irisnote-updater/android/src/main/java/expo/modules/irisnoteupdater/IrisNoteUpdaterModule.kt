package expo.modules.irisnoteupdater

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.os.SystemClock
import android.util.Log
import com.github.sisong.HPatch
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.cancel
import kotlinx.coroutines.ensureActive

class IrisNoteUpdaterModule : Module() {
  // A dedicated serial worker keeps large APK reads off both JS and Expo's shared module queue.
  private val dispatcher = Executors.newSingleThreadExecutor { task ->
    Thread({ android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND); task.run() }, "irisnote-updater")
  }.asCoroutineDispatcher()
  private val worker = CoroutineScope(SupervisorJob() + dispatcher)
  private fun context() = requireNotNull(appContext.reactContext) { "应用尚未就绪" }
  private fun progress(requestId: String, stage: String, processed: Long, total: Long, started: Long) {
    worker.ensureActive()
    sendEvent("onProgress", mapOf("requestId" to requestId, "stage" to stage,
      "processed" to processed, "total" to total, "elapsedMs" to SystemClock.elapsedRealtime() - started))
  }
  private fun <T> timed(requestId: String, stage: String, timings: MutableMap<String, Long>, body: (Long) -> T): T {
    val started = SystemClock.elapsedRealtime()
    progress(requestId, stage, 0, 0, started)
    try { return body(started) } finally {
      val elapsed = SystemClock.elapsedRealtime() - started
      timings[stage] = elapsed
      Log.i("IrisNoteUpdater", "$requestId $stage ${elapsed}ms")
    }
  }
  private fun digest(file: File, report: ((Long, Long) -> Unit)? = null): String {
    val hash = MessageDigest.getInstance("SHA-256")
    val total = file.length()
    var processed = 0L
    var lastReport = SystemClock.elapsedRealtime()
    report?.invoke(0, total)
    file.inputStream().use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        worker.ensureActive()
        val count = input.read(buffer)
        if (count < 0) break
        hash.update(buffer, 0, count)
        processed += count
        val now = SystemClock.elapsedRealtime()
        if (now - lastReport >= 150) { report?.invoke(processed, total); lastReport = now }
      }
    }
    report?.invoke(processed, total)
    return hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
  }
  private fun verifyDigest(file: File, expected: String, requestId: String, stage: String, timings: MutableMap<String, Long>) {
    timed(requestId, stage, timings) { started ->
      require(digest(file) { processed, total -> progress(requestId, stage, processed, total, started) } == expected) {
        "安装文件校验失败（$stage），请重新下载"
      }
    }
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
  private fun verifyTarget(file: File, options: Map<String, String>, timings: MutableMap<String, Long>) {
    val size = options.getValue("targetSize").toLong()
    require(size in 1..1073741824L && file.isFile && file.length() == size) { "新版安装包大小不匹配" }
    val stage = options.getValue("verificationStage")
    require(stage == "target" || stage == "install") { "无效校验阶段" }
    val requestId = options.getValue("requestId")
    verifyDigest(file, options.getValue("targetSha256"), requestId, stage, timings)
    timed(requestId, "${stage}Metadata", timings) { _ ->
    val info = requireNotNull(context().packageManager.getPackageArchiveInfo(file.path,
      if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)) { "无法解析安装包" }
    val installed = packageInfo()
    require(info.packageName == context().packageName) { "新版包名不匹配" }
    require(info.versionName == options.getValue("targetVersion") && buildCode(info) == options.getValue("targetBuildCode").toLong()) { "新版版本信息不匹配" }
    require(buildCode(info) > buildCode(installed)) { "禁止安装旧版本" }
    val signer = certificates(info)
    require(signer.isNotEmpty() && signer == certificates(installed)) { "新版签名与已安装应用不同" }
    }
  }
  override fun definition() = ModuleDefinition {
    Name("IrisNoteUpdater")
    Events("onProgress")
    OnDestroy { worker.cancel(); dispatcher.close() }
    AsyncFunction("canInstallPackages") {
      Build.VERSION.SDK_INT < 26 || context().packageManager.canRequestPackageInstalls()
    }
    AsyncFunction("getInstalledApk") {
      val info = packageInfo()
      val source = File(context().applicationInfo.sourceDir)
      val supported = context().applicationInfo.splitSourceDirs.isNullOrEmpty()
      mapOf("version" to (info.versionName ?: ""), "buildCode" to buildCode(info),
        "sha256" to if (supported) digest(source) else "", "deltaSupported" to supported)
    }.runOnQueue(worker)
    AsyncFunction("verifyApk") { options: Map<String, String> ->
      val timings = mutableMapOf<String, Long>()
      verifyTarget(cacheFile(options.getValue("outputUri")), options, timings)
      mapOf("timingsMs" to timings)
    }.runOnQueue(worker)
    AsyncFunction("applyPatch") { options: Map<String, String> ->
      require(context().applicationInfo.splitSourceDirs.isNullOrEmpty()) { "当前为拆分安装包，无法应用此差量包" }
      val old = File(context().applicationInfo.sourceDir)
      val patch = cacheFile(options.getValue("patchUri"))
      val output = cacheFile(options.getValue("outputUri"))
      require(patch != output && output.extension == "apk") { "无效合并目标" }
      val requestId = options.getValue("requestId")
      val timings = mutableMapOf<String, Long>()
      require(patch.isFile && patch.length() == options.getValue("patchSize").toLong()) { "差量包大小不匹配" }
      verifyDigest(old, options.getValue("baseSha256"), requestId, "base", timings)
      verifyDigest(patch, options.getValue("patchSha256"), requestId, "patch", timings)
      val size = options.getValue("targetSize").toLong()
      require(size in 1..1073741824L) { "无效目标大小" }
      require(StatFs(context().cacheDir.path).availableBytes > size + 16 * 1024 * 1024) { "剩余空间不足，无法合并更新" }
      if (output.exists()) require(output.delete()) { "无法清理旧合并文件" }
      try {
        timed(requestId, "merge", timings) { _ ->
          require(HPatch.patch(old.path, patch.path, output.path, 4L * 1024 * 1024, 1, true) == 0) { "差量包合并失败" }
        }
        verifyTarget(output, options, timings)
        mapOf("outputUri" to Uri.fromFile(output).toString(), "timingsMs" to timings)
      } catch (error: Throwable) { output.delete(); throw error }
    }.runOnQueue(worker)
  }
}
