package expo.modules.irisnotesystem

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
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

  /** ProgressStyle 属于 Android 16（API 36）；低版本设备在 JS 层已禁用，此处兜底拒绝。 */
  private fun requireProgressNotificationSupport() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA) {
      throw IllegalStateException("动态通知需要 Android 16 及以上系统")
    }
  }

  private fun notificationManager() =
    context().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  private fun appLaunchPendingIntent(): PendingIntent {
    val context = context()
    val intent = requireNotNull(
      context.packageManager.getLaunchIntentForPackage(context.packageName)
    ) { "无法创建通知点击意图" }
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /**
   * Android 16 ProgressStyle 进度式通知：同一通知 ID 原位更新（setOnlyAlertOnce 防重复打扰）。
   * 刻意不调用 setRequestPromotedOngoing、不依赖 POST_PROMOTED_NOTIFICATIONS——
   * 提升式 Live Updates 对"普通提醒/即将到来的日历事件"属政策禁区。
   * API 36.0 基础 SDK 无嵌套 Progress 类（36.1 重构）：进度用 setProgress(0-100 百分比)
   * 与 setProgressIndeterminate 表达，不依赖 segments。
   */
  private fun buildProgressNotification(
    channelId: String,
    title: String,
    text: String?,
    progress: Int,
    max: Int,
    indeterminate: Boolean,
    ongoing: Boolean,
  ): Notification {
    val context = context()
    val style = Notification.ProgressStyle()
    if (indeterminate) {
      style.setProgressIndeterminate(true)
    } else {
      val percent =
        if (max <= 0) 0
        else ((progress.toLong() * 100) / max).toInt().coerceIn(0, 100)
      style.setProgress(percent)
    }
    val smallIcon =
      context.applicationInfo.icon.takeIf { it != 0 }
        ?: android.R.drawable.sym_def_app_icon
    val builder = Notification.Builder(context, channelId)
      .setSmallIcon(smallIcon)
      .setContentTitle(title)
      .setStyle(style)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setOnlyAlertOnce(true)
      .setAutoCancel(false)
      .setOngoing(ongoing)
      .setContentIntent(appLaunchPendingIntent())
    if (!text.isNullOrBlank()) builder.setContentText(text)
    return builder.build()
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

    AsyncFunction(
      "postProgressNotification",
    ) { id: Int, channelId: String, title: String, text: String?,
        progress: Int, max: Int, indeterminate: Boolean, ongoing: Boolean ->
      requireProgressNotificationSupport()
      val notification = buildProgressNotification(
        channelId,
        title,
        text,
        progress,
        max,
        indeterminate,
        ongoing,
      )
      notificationManager().notify(id, notification)
    }

    AsyncFunction("cancelProgressNotification") { id: Int ->
      notificationManager().cancel(id)
    }
  }
}
