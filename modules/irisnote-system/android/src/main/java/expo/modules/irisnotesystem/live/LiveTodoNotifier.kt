package expo.modules.irisnotesystem.live

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build

/**
 * 待办动态卡片通知构建与差量应用（JS 前台驱动、闹钟节拍、前台服务共用）。
 *
 * 文案口径与 JS 侧 todo-live-update.service.ts 严格一致：
 * - 有结束时间：「已进行 X / Y 分钟」，X/Y 均为四舍五入分钟数；
 * - 无结束时间：不定进度，文案直接使用时间线的 textStarted。
 *
 * chronometer（方案 C）：锚定 endAt 倒计时 / startAt 正向计时，由系统
 * 每秒自动刷新时间戳区域，应用零唤醒；在 ProgressStyle/提升式岛上的
 * 实际渲染以真机验收为准（36.0 与 36.1 框架差异，最坏退化为不显示计时）。
 */
object LiveTodoNotifier {
  /** 与 JS Math.round((now-start)/60000) 一致的分钟取整。 */
  private fun roundMinutes(deltaMs: Long): Long = (deltaMs + 30_000) / 60_000

  fun minuteText(card: LiveTodoTimelineCard, nowMs: Long): String {
    val endAt = card.endAt ?: return card.textStarted ?: "进行中"
    val total = maxOf(1L, roundMinutes(endAt - card.startAt))
    val elapsed = roundMinutes(nowMs - card.startAt).coerceIn(0L, total)
    return "已进行 $elapsed / $total 分钟"
  }

  /**
   * 按时间线快照构建通知。smoothSeconds=true（前台服务秒级模式）时
   * 进度条按秒平滑插值；否则按分钟粒度（与前台 JS 驱动口径一致）。
   */
  fun buildNotification(
    context: Context,
    card: LiveTodoTimelineCard,
    nowMs: Long,
    smoothSeconds: Boolean,
  ): Notification {
    val endAt = card.endAt
    var progress = 0
    var max = 0
    if (endAt != null) {
      val spanMs = (endAt - card.startAt).coerceAtLeast(1)
      if (smoothSeconds) {
        progress = (((nowMs - card.startAt).coerceAtLeast(0)) / 1000).toInt()
        max = (spanMs / 1000).toInt()
      } else {
        val total = maxOf(1L, roundMinutes(endAt - card.startAt))
        progress = roundMinutes(nowMs - card.startAt).coerceIn(0L, total).toInt()
        max = total.toInt()
      }
    }
    val chronoAt = (endAt ?: card.startAt).takeIf { it > 0 }
    return buildExplicitNotification(
      context = context,
      channelId = card.channelId,
      title = card.title,
      text = minuteText(card, nowMs),
      progress = progress,
      max = max,
      indeterminate = endAt == null,
      ongoing = true,
      promoted = card.promoted,
      chronoAt = chronoAt,
      chronoCountdown = endAt != null,
    )
  }

  /**
   * 显式参数构建（Module.postProgressNotification 与设置页演示链路使用）：
   * progress/max 由调用方给定（演示为秒值、前台 JS 为分钟值）。
   * Android 16（API 36）ProgressStyle 属基础 SDK 符号，低版本由调用方门禁。
   */
  fun buildExplicitNotification(
    context: Context,
    channelId: String,
    title: String,
    text: String?,
    progress: Int,
    max: Int,
    indeterminate: Boolean,
    ongoing: Boolean,
    promoted: Boolean,
    chronoAt: Long?,
    chronoCountdown: Boolean,
  ): Notification {
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
      .setContentIntent(appLaunchPendingIntent(context))
    if (!text.isNullOrBlank()) builder.setContentText(text)

    // 方案 C：系统级秒跳动计时（倒计时锚定 chronoAt）。
    if (chronoAt != null && chronoAt > 0) {
      builder.setWhen(chronoAt)
      builder.setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && chronoCountdown) {
        builder.setChronometerCountDown(true)
      }
    }

    if (promoted) builder.requestPromotedOngoingCompat()
    return builder.build()
  }

  /**
   * 把时间线快照差量应用到 NotificationManager：
   * - 进行中窗口内的卡 post/原位更新（未来卡到点由节拍补发）；
   * - 已过结束时刻或不在快照中的本渠道卡撤除；
   * - 返回是否仍存在活跃或未来卡（决定闹钟是否续排）。
   */
  fun applyDesired(
    context: Context,
    cards: List<LiveTodoTimelineCard>,
    nowMs: Long,
    smoothSeconds: Boolean = false,
  ): Boolean {
    val manager =
      context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channelIds = cards.map { it.channelId }.toSet()
    val desiredIds = mutableSetOf<Int>()
    var hasUpcoming = false
    for (card in cards) {
      if (card.isFutureAt(nowMs)) {
        hasUpcoming = true
        continue
      }
      if (!card.isActiveAt(nowMs)) continue
      desiredIds.add(card.id)
      manager.notify(card.id, buildNotification(context, card, nowMs, smoothSeconds))
    }
    // 撤除已结束/已消失的卡片：仅遍历本应用、且渠道属于本快照的通知。
    for (statusBar in manager.activeNotifications) {
      val channelId = statusBar.notification?.channelId ?: continue
      if (statusBar.id !in desiredIds && channelId in channelIds) {
        manager.cancel(statusBar.id)
      }
    }
    return desiredIds.isNotEmpty() || hasUpcoming
  }

  private fun appLaunchPendingIntent(context: Context): PendingIntent {
    val intent = requireNotNull(
      context.packageManager.getLaunchIntentForPackage(context.packageName),
    ) { "无法创建通知点击意图" }
    return PendingIntent.getActivity(
      context,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /**
   * setRequestPromotedOngoing(true) 属 API 36.1（QPR）框架符号，本工程
   * compileSdk 36.0 无该符号——反射按方法名请求提升式展示；方法不存在
   * （36.0 设备/旧框架）时静默返回原 builder，退化为普通进度卡片。
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
}
