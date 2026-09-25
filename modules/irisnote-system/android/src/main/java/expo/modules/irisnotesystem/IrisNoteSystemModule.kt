package expo.modules.irisnotesystem

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.irisnotesystem.live.LiveTodoForegroundService
import expo.modules.irisnotesystem.live.LiveTodoNotifier
import expo.modules.irisnotesystem.live.LiveTodoScheduler
import expo.modules.irisnotesystem.live.LiveTodoTimelineCard
import expo.modules.irisnotesystem.live.LiveTodoSummaryItem
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

  /** 时间线快照入参解析（scheduleLiveTodoCards / updateLiveTodoCards 共用）。 */
  private fun parseLiveTodoCards(input: List<Map<String, Any?>>): List<LiveTodoTimelineCard> =
    input.map { card ->
      val id = (card["id"] as? Number)?.toInt()
        ?: throw IllegalArgumentException("缺少 id")
      LiveTodoTimelineCard(
        id = id,
        channelId = card["channelId"] as? String
          ?: throw IllegalArgumentException("缺少 channelId"),
        title = card["title"] as? String
          ?: throw IllegalArgumentException("缺少 title"),
        textStarted = card["textStarted"] as? String,
        startAt = (card["startAt"] as? Number)?.toLong()
          ?: throw IllegalArgumentException("缺少 startAt"),
        endAt = (card["endAt"] as? Number)?.toLong(),
        promoted = card["promoted"] == true,
        summaryItems = (card["summaryItems"] as? List<*>)?.map { raw ->
          val item = raw as? Map<*, *> ?: throw IllegalArgumentException("无效 summaryItems")
          LiveTodoSummaryItem(
            title = item["title"] as? String ?: "",
            startAt = (item["startAt"] as? Number)?.toLong(),
            endAt = (item["endAt"] as? Number)?.toLong(),
            completed = item["completed"] == true,
            starred = item["starred"] == true,
            completedAt = (item["completedAt"] as? Number)?.toLong(),
          )
        },
        summarySeenActivity = card["summarySeenActivity"] == true,
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

    /**
     * 入参为单对象（Map）：Expo Modules 的 AsyncFunction Lambda 最多 8 个具名参数，
     * 动态通知字段已超限（9 个），统一走 Map 收敛签名，后续加字段不再动原生签名。
     * 构建/差量逻辑收敛在 live.LiveTodoNotifier（闹钟节拍与前台服务共用）；
     * chronoAt/chronoCountdown 为方案 C：系统 chronometer 秒级计时锚点。
     */
    AsyncFunction("postProgressNotification") { input: Map<String, Any?> ->
      requireProgressNotificationSupport()
      fun requireInt(key: String): Int {
        val value = input[key] as? Number ?: throw IllegalArgumentException("缺少 $key")
        return value.toInt()
      }
      val notification = LiveTodoNotifier.buildExplicitNotification(
        context = context(),
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
        chronoAt = (input["chronoAt"] as? Number)?.toLong(),
        chronoCountdown = input["chronoCountdown"] == true,
        iconResourceName = input["iconResourceName"] as? String,
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

    /**
     * 方案 A：退后台移交时间线快照（含今日稍后开始的待办）。原生闹钟节拍
     * 按墙钟差量刷新，进程被杀后从 SharedPreferences 恢复续算；卡片全部
     * 结束自动停摆。空数组等价于取消原生接管。
     */
    AsyncFunction("scheduleLiveTodoCards") { input: List<Map<String, Any?>> ->
      requireProgressNotificationSupport()
      LiveTodoScheduler.schedule(context(), parseLiveTodoCards(input))
    }

    /**
     * 方案 B 数据供给：仅持久化时间线快照（不排闹钟）——JS 在前台启动
     * 前台服务前调用，FGS 每秒从快照重算；JS run() 每轮刷新使编辑/完成
     * 及时反映。退后台的完整移交仍走 scheduleLiveTodoCards。
     */
    AsyncFunction("updateLiveTodoCards") { input: List<Map<String, Any?>> ->
      requireProgressNotificationSupport()
      LiveTodoScheduler.persist(context(), parseLiveTodoCards(input))
    }

    /**
     * 回前台收回接管权：取消闹钟并清空快照，不动已展示的通知（JS 差量
     * 刷新按同 ID 原位覆盖对账）。
     */
    AsyncFunction("cancelScheduledLiveTodoCards") {
      requireProgressNotificationSupport()
      LiveTodoScheduler.reclaim(context())
    }

    /**
     * 方案 B：启动前台服务秒级刷新（仅限应用前台调用；Android 12+ 禁止
     * 后台启动前台服务，后台启动异常由 JS 捕获降级为方案 A 分钟级）。
     */
    AsyncFunction("startLiveTodoForegroundService") {
      requireProgressNotificationSupport()
      LiveTodoForegroundService.start(context())
    }

    /** 停止前台服务：FGS 通知撤除，其余卡片由接管方对账。 */
    AsyncFunction("stopLiveTodoForegroundService") {
      requireProgressNotificationSupport()
      LiveTodoForegroundService.stop(context())
    }
  }
}
