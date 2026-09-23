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
   * promoted=true 时请求 Live Updates 提升式展示（状态栏胶囊/锁屏常驻/抽屉置顶），
   * 仅用于"用户主动发起、正在进行"的任务（倒计时演示、待办进行中卡片）；
   * 普通提醒/日历事件类继续走非提升通道（政策禁区，见 docs/UI/通知渠道适配.md §2.4）。
   * API 36.0 基础 SDK 无嵌套 Progress 类与 setRequestPromotedOngoing 符号（均为 36.1/QPR
   * 引入）：进度用 setProgress(0-100 百分比) 与 setProgressIndeterminate 表达；
   * 提升式经 requestPromotedOngoingCompat 反射请求，36.0 设备静默退化为普通进度卡片。
   */
  private fun buildProgressNotification(
    channelId: String,
    title: String,
    text: String?,
    progress: Int,
    max: Int,
    indeterminate: Boolean,
    ongoing: Boolean,
    promoted: Boolean,
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
      // 提升式硬性要求 setOngoing(true)（通知渠道适配 §2.4），promoted 时强制进行中。
      .setOngoing(ongoing || promoted)
      .setContentIntent(appLaunchPendingIntent())
    if (!text.isNullOrBlank()) builder.setContentText(text)
    if (promoted) builder.requestPromotedOngoingCompat()
    return builder.build()
  }

  /**
   * setRequestPromotedOngoing(true) 属 API 36.1（QPR）框架符号，本工程 compileSdk 36.0
   * 无该符号——反射按方法名请求提升式展示；方法不存在（36.0 设备/旧框架）时静默返回
   * 原 builder，通知退化为普通进度卡片。用户在系统设置关闭"实时更新"时系统自行忽略
   * 提升请求（canPostPromotedNotifications 总开关），无需应用侧预判。
   */
  private fun Notification.Builder.requestPromotedOngoingCompat(): Notification.Builder {
    return try {
      val method = Notification.Builder::class.java.getMethod(
        "setRequestPromotedOngoing",
        Boolean::class.javaPrimitiveType,
      )
      method.invoke(this, true) as Notification.Builder
    } catch (_: Throwable) {
      this
    }
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

    /**
     * 入参为单对象（Map）：Expo Modules 的 AsyncFunction Lambda 最多 8 个具名参数，
     * 动态通知字段已超限（9 个），统一走 Map 收敛签名，后续加字段不再动原生签名。
     */
    AsyncFunction("postProgressNotification") { input: Map<String, Any?> ->
      requireProgressNotificationSupport()
      fun requireInt(key: String): Int {
        val value = input[key] as? Number ?: throw IllegalArgumentException("缺少 $key")
        return value.toInt()
      }
      val notification = buildProgressNotification(
        channelId = input["channelId"] as? String
          ?: throw IllegalArgumentException("缺少 channelId"),
        title = input["title"] as? String
          ?: throw IllegalArgumentException("缺少 title"),
        text = input["text"] as? String,
        progress = requireInt("progress"),
        max = requireInt("max"),
        indeterminate = input["indeterminate"] == true,
        ongoing = input["ongoing"] == true,
        promoted = input["promoted"] == true,
      )
      notificationManager().notify(requireInt("id"), notification)
    }

    AsyncFunction("cancelProgressNotification") { id: Int ->
      notificationManager().cancel(id)
    }

    /**
     * 按渠道清理本应用当前展示的全部通知：冷启动 reconcile 被杀残留的动态卡片
     * （进程死亡时 JS 无机会撤卡，ongoing 卡片用户不可滑除）。
     * activeNotifications 自 API 23 可用，无需版本门槛；仅遍历本应用通知。
     */
    AsyncFunction("cancelProgressNotificationsByChannel") { channelId: String ->
      val manager = notificationManager()
      for (statusBar in manager.activeNotifications) {
        if (statusBar.notification?.channelId == channelId) {
          manager.cancel(statusBar.id)
        }
      }
    }
  }
}
