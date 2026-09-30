package expo.modules.irisnotesystem.excerpt

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.irisnotesystem.R
import expo.modules.irisnotesystem.live.LiveTodoNotifier

/** 只持久化随机会话 ID、到期时间与入口版本；不接触剪贴板正文、账号或数据库。 */
object ExcerptSessionNotifications {
  // 保留段：7001 演示通知、7002 待办聚合卡、7003 前台服务停机占位
  // （LiveTodoForegroundService.PLACEHOLDER_NOTIFICATION_ID，仅停机瞬间存在）。
  // 曾用 7003 与停机占位双占，占位会把本卡顶掉并连带移除，故迁移到 7004。
  const val ID = 7004
  /** 迁移前旧版本的通知 ID；发新卡时顺手清理残留，系统 setTimeoutAfter 也兜底撤卡。 */
  private const val LEGACY_ID = 7003
  const val CHANNEL = "irisnote.excerpt-session.v1"
  const val STOP = "irisnote.excerpt-session.STOP"
  const val DISMISS = "irisnote.excerpt-session.DISMISS"
  const val SESSION_EXTRA = "sessionId"
  const val ENTRY_EXTRA = "captureEntry"
  const val ENTRY_CARD_BUTTON = "card_button"
  private const val CAPTURE_REQUEST_CODE = ID + 1
  private const val CAPTURE_HOST_CLASS =
    "expo.modules.irisnotesystem.excerpt.ExcerptCaptureHostActivity"

  /** 宿主 Activity 由 config plugin 在 prebuild 时生成到 app 源集（不入库）；
   *  漏跑 prebuild 的旧工程编译照常通过，但运行时缺类，显式 Intent 点开会崩。
   *  宿主声明写在模块 Manifest、无条件合并进每个包，getActivityInfo 只能证明
   *  "声明过"，必须再加载类本身：声明在而 dex 缺类（未重新 prebuild）时同样降级。 */
  private fun captureHostResolvable(context: Context): Boolean = try {
    context.packageManager.getActivityInfo(ComponentName(context, CAPTURE_HOST_CLASS), 0)
    // 用宿主 APK 的 ClassLoader 实际加载一次；initialize=false 不触发静态初始化。
    Class.forName(CAPTURE_HOST_CLASS, false, context.classLoader)
    true
  } catch (_: Exception) {
    false
  }
  private fun preferences(context: Context) =
    context.getSharedPreferences("irisnote.excerpt-session", Context.MODE_PRIVATE)

  @Synchronized
  fun post(context: Context, sessionId: String, endsAt: Long, title: String, text: String?) {
    require(sessionId.isNotBlank()) { "缺少摘录会话身份" }
    val remaining = endsAt - System.currentTimeMillis()
    require(remaining > 0 && remaining <= 120 * 60_000L) { "摘录会话已到期或时长无效" }
    val prefs = preferences(context)
    check(prefs.getString("stopped", null) != sessionId) { "摘录会话已停止" }
    check(prefs.getString("dismissed", null) != sessionId) { "摘录通知已被用户关闭" }
    val manager = context.getSystemService(NotificationManager::class.java)
    // 清理迁移前旧 ID（7003）的残留卡；若恰逢前台停机占位短暂存在，取消是幂等的，不影响服务停机。
    manager.cancel(LEGACY_ID)
    // 已存在则保留系统展示状态，不重复请求用户已降级的提升式通知。
    // 升级前仍在展示的 A 档卡保留原入口至本会话结束；新会话才使用 B 档。
    if (prefs.getString("active", null) == sessionId &&
      manager.activeNotifications.any { it.id == ID && it.notification.channelId == CHANNEL }) return
    check(prefs.edit().putString("active", sessionId).putLong("endsAt", endsAt)
      .putInt("entryVersion", 2).commit()) { "无法登记摘录会话" }
    // Activity PendingIntent 直接启动焦点窗口，不经过广播/服务通知 trampoline。
    val launch = Intent().setClassName(context, CAPTURE_HOST_CLASS)
      .setData(Uri.parse("irisnote://excerpt-session/capture/$sessionId"))
      .putExtra(SESSION_EXTRA, sessionId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    // 宿主缺失时主体降级为主应用入口（等同 A 档深链可用性），不提供捕获按钮，避免点开即崩。
    val captureReady = captureHostResolvable(context)
    val contentIntent: PendingIntent = if (captureReady) {
      PendingIntent.getActivity(context, ID, launch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    } else {
      val mainLaunch = requireNotNull(
        context.packageManager.getLaunchIntentForPackage(context.packageName),
      ) { "主应用启动入口缺失" }
      PendingIntent.getActivity(context, ID, mainLaunch,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    // 通知按钮与卡主体进入同一捕获窗口；独立请求码防止 PendingIntent 合并，
    // entry 仅用于诊断入口计数，不接触剪贴板正文、账号或会话状态。
    val savePendingIntent: PendingIntent? = if (captureReady) {
      val saveIntent = Intent(launch).putExtra(ENTRY_EXTRA, ENTRY_CARD_BUTTON)
      PendingIntent.getActivity(context, CAPTURE_REQUEST_CODE, saveIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    } else {
      null
    }
    val stopIntent = Intent(context, ExcerptSessionActionReceiver::class.java)
      .setAction(STOP).setData(Uri.parse("irisnote://excerpt-session/stop/$sessionId"))
      .putExtra(SESSION_EXTRA, sessionId)
    val stopPendingIntent = PendingIntent.getBroadcast(context, ID, stopIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val dismissIntent = Intent(context, ExcerptSessionActionReceiver::class.java)
      .setAction(DISMISS).setData(Uri.parse("irisnote://excerpt-session/dismiss/$sessionId"))
      .putExtra(SESSION_EXTRA, sessionId)
    val dismissPendingIntent = PendingIntent.getBroadcast(context, ID, dismissIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val base = LiveTodoNotifier.buildExplicitNotification(
      context, CHANNEL, title, text, 0, 0, true, true, true,
      endsAt, true, "ic_excerpt_session", true,
    )
    val notification = Notification.Builder.recoverBuilder(context, base)
      .setCategory(Notification.CATEGORY_STOPWATCH)
      .setContentIntent(contentIntent)
      .setDeleteIntent(dismissPendingIntent)
      .setTimeoutAfter(remaining)
      .apply {
        if (savePendingIntent != null) {
          addAction(Notification.Action.Builder(R.drawable.ic_excerpt_session, "摘录剪贴板", savePendingIntent).build())
        }
        addAction(Notification.Action.Builder(R.drawable.ic_excerpt_session, "停止", stopPendingIntent).build())
      }
      .build()
    manager.notify(ID, notification)
  }

  @Synchronized
  fun captureRemaining(context: Context, sessionId: String): Long {
    val prefs = preferences(context)
    // entryVersion==2 与 B 档捕获宿主入口绑定；120 分钟上限必须与 JS 侧
    // EXCERPT_SESSION_DURATIONS 最大档（120）一致，调大档位须同步此处，否则捕获窗口会静默失效。
    if (sessionId.isBlank() || prefs.getInt("entryVersion", 0) != 2 || prefs.getString("active", null) != sessionId ||
      prefs.getString("stopped", null) == sessionId || prefs.getString("dismissed", null) == sessionId) return 0
    val remaining = prefs.getLong("endsAt", 0) - System.currentTimeMillis()
    return if (remaining in 1..120 * 60_000L) remaining else 0
  }

  fun captureAllowed(context: Context, sessionId: String) = captureRemaining(context, sessionId) > 0

  @Synchronized
  fun stop(context: Context, sessionId: String) {
    val prefs = preferences(context)
    if (prefs.getString("active", null) != sessionId) return
    finish(context, sessionId)
  }

  /** 尊重系统允许的主动划除：会话继续，但同一会话不重发通知。 */
  @Synchronized
  fun dismiss(context: Context, sessionId: String) {
    val prefs = preferences(context)
    if (prefs.getString("active", null) != sessionId) return
    check(prefs.edit().putString("dismissed", sessionId).remove("active").commit()) {
      "无法登记摘录通知关闭状态"
    }
    ExcerptCaptureActivity.invalidate(sessionId)
  }

  /** JS 主动停止也先写终止标记；SQLite 清理中断后不可恢复已停止会话。 */
  @Synchronized
  fun finish(context: Context, sessionId: String) {
    val prefs = preferences(context)
    // commit 在同步广播生命周期内完成；进程死亡也可在下次前台对账。
    check(prefs.edit().putString("stopped", sessionId).remove("active").commit()) {
      "无法保存摘录停止标记"
    }
    context.getSystemService(NotificationManager::class.java).cancel(ID)
    ExcerptCaptureActivity.invalidate(sessionId)
  }

  @Synchronized
  fun cancel(context: Context) {
    val sessionId = preferences(context).getString("active", null)
    context.getSystemService(NotificationManager::class.java).cancel(ID)
    check(preferences(context).edit().remove("active").commit()) { "无法清理摘录会话" }
    if (sessionId != null) ExcerptCaptureActivity.invalidate(sessionId)
  }

  @Synchronized
  fun stopped(context: Context): String? = preferences(context).getString("stopped", null)

  @Synchronized
  fun acknowledge(context: Context, sessionId: String) {
    val prefs = preferences(context)
    if (prefs.getString("stopped", null) == sessionId) {
      check(prefs.edit().remove("stopped").commit()) { "无法清理摘录停止标记" }
    }
  }
}
