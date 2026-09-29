package expo.modules.irisnotesystem.excerpt

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.irisnotesystem.R
import expo.modules.irisnotesystem.live.LiveTodoNotifier

/** 只持久化随机会话 ID、到期时间与入口版本；不接触剪贴板正文、账号或数据库。 */
object ExcerptSessionNotifications {
  const val ID = 7003
  const val CHANNEL = "irisnote.excerpt-session.v1"
  const val STOP = "irisnote.excerpt-session.STOP"
  const val DISMISS = "irisnote.excerpt-session.DISMISS"
  const val SESSION_EXTRA = "sessionId"
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
    // 已存在则保留系统展示状态，不重复请求用户已降级的提升式通知。
    // 升级前仍在展示的 A 档卡保留原入口至本会话结束；新会话才使用 B 档。
    if (prefs.getString("active", null) == sessionId &&
      manager.activeNotifications.any { it.id == ID && it.notification.channelId == CHANNEL }) return
    check(prefs.edit().putString("active", sessionId).putLong("endsAt", endsAt)
      .putInt("entryVersion", 2).commit()) { "无法登记摘录会话" }
    // Activity PendingIntent 直接启动焦点窗口，不经过广播/服务通知 trampoline。
    val launch = Intent().setClassName(context,
      "expo.modules.irisnotesystem.excerpt.ExcerptCaptureHostActivity")
      .setData(Uri.parse("irisnote://excerpt-session/capture/$sessionId"))
      .putExtra(SESSION_EXTRA, sessionId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    val contentIntent = PendingIntent.getActivity(context, ID, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
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
      .addAction(Notification.Action.Builder(R.drawable.ic_excerpt_session, "停止", stopPendingIntent).build())
      .build()
    manager.notify(ID, notification)
  }

  @Synchronized
  fun captureRemaining(context: Context, sessionId: String): Long {
    val prefs = preferences(context)
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
