package expo.modules.irisnotesystem

import android.app.AlarmManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class IrisNoteSystemModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext) { "应用尚未就绪" }

  private fun cacheFile(sourceUri: String): File {
    val parsed = Uri.parse(sourceUri)
    require(parsed.scheme == "file") { "诊断日志必须位于应用缓存中" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    val cache = context().cacheDir.canonicalFile
    require(file.path.startsWith(cache.path + File.separator) && file.isFile) {
      "诊断日志缓存路径无效"
    }
    return file
  }

  private fun safeFileName(fileName: String): String {
    require(fileName.matches(Regex("irisnote-diagnostics-[A-Za-z0-9-]+\\.jsonl"))) {
      "诊断日志文件名无效"
    }
    return fileName
  }

  private fun saveWithMediaStore(source: File, fileName: String): Map<String, String> {
    val resolver = context().contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, fileName)
      put(MediaStore.Downloads.MIME_TYPE, "application/x-ndjson")
      put(
        MediaStore.Downloads.RELATIVE_PATH,
        "${Environment.DIRECTORY_DOWNLOADS}/irisnoteLog",
      )
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val uri = requireNotNull(
      resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values),
    ) { "无法在下载目录创建诊断日志" }
    try {
      source.inputStream().use { input ->
        requireNotNull(resolver.openOutputStream(uri, "w")) {
          "无法写入下载目录"
        }.use { output -> input.copyTo(output) }
      }
      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return mapOf(
        "contentUri" to uri.toString(),
        "displayPath" to "Download/irisnoteLog/$fileName",
      )
    } catch (cause: Throwable) {
      resolver.delete(uri, null, null)
      throw cause
    }
  }

  @Suppress("DEPRECATION")
  private fun saveLegacy(source: File, fileName: String): Map<String, String> {
    require(Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED) {
      "公共下载目录当前不可用"
    }
    val directory = File(
      Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
      "irisnoteLog",
    )
    require(directory.exists() || directory.mkdirs()) { "无法创建 irisnoteLog 目录" }
    val target = File(directory, fileName).canonicalFile
    require(target.parentFile == directory.canonicalFile) { "诊断日志目标路径无效" }
    source.copyTo(target, overwrite = false)
    return mapOf(
      "contentUri" to Uri.fromFile(target).toString(),
      "displayPath" to "Download/irisnoteLog/$fileName",
    )
  }

  override fun definition() = ModuleDefinition {
    Name("IrisNoteSystem")

    AsyncFunction("getExactAlarmAccess") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        "not-required"
      } else {
        val alarmManager = context().getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (alarmManager.canScheduleExactAlarms()) "granted" else "denied"
      }
    }

    AsyncFunction("saveDiagnosticLog") { sourceUri: String, fileName: String ->
      val source = cacheFile(sourceUri)
      val safeName = safeFileName(fileName)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveWithMediaStore(source, safeName)
      } else {
        saveLegacy(source, safeName)
      }
    }
  }
}
