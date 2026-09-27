package expo.modules.irisnotesystem.live

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * 方案 A 的节拍引擎：单一 AlarmManager 闹钟链驱动原生侧差量刷新。
 *
 * - schedule：JS 退后台移交时间线（覆盖写入），立即排下一事件；
 * - reclaim：JS 回前台收回接管权——取消闹钟并清空快照，但不撤通知
 *   （随后 JS 差量刷新会按同 ID 原位覆盖对账，避免闪烁）；
 * - 闹钟用 setAndAllowWhileIdle（非精确，Doze 下允许系统合并延迟）：
 *   息屏时岛不可见，粗化无感；亮屏后下一分钟事件即追平。
 * - force-stop 时系统清空本应用闹钟，冷启动 clearStaleLiveUpdates 兜底。
 */
object LiveTodoScheduler {
  private const val REQUEST_CODE = 4711

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun pendingIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      Intent(context, LiveTodoAlarmReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

  /** 计算距 nowMs 的下一个节拍时刻：活跃卡的下一分钟取整变化点、未开始卡的 startAt、活跃卡/未来卡的 endAt 的最小值。 */
  private fun nextEventAt(cards: List<LiveTodoTimelineCard>, nowMs: Long): Long? {
    var next: Long? = null
    fun consider(candidate: Long) {
      if (candidate > nowMs && (next == null || candidate < next!!)) next = candidate
    }
    for (card in cards) {
      if (card.summaryItems != null) {
        LiveTodoSummary.nextEventAt(card, nowMs)?.let { consider(it) }
        continue
      }
      if (card.isFutureAt(nowMs)) {
        consider(card.startAt)
        card.endAt?.let { consider(it) }
        continue
      }
      if (card.isActiveAt(nowMs)) {
        // round 口径下分钟数在 (k + 0.5) * 60_000 处变化。
        val delta = nowMs - card.startAt
        consider(card.startAt + ((delta + 30_000) / 60_000 + 1) * 60_000 - 30_000)
        card.endAt?.let { consider(it) }
      }
    }
    return next
  }

  fun schedule(context: Context, cards: List<LiveTodoTimelineCard>) {
    val appContext = context.applicationContext
    val store = LiveTodoTimelineStore(appContext)
    if (cards.isEmpty()) {
      store.clear()
      alarmManager(appContext).cancel(pendingIntent(appContext))
      return
    }
    store.save(cards)
    LiveTodoNotifier.applyDesired(appContext, cards, System.currentTimeMillis())
    armNext(appContext)
  }

  /**
   * 方案 B 数据供给：仅持久化时间线快照，不排闹钟——JS 在前台启动
   * 前台服务前调用（前台排闹钟会与 JS 30 秒驱动形成双写冲突），
   * FGS 每秒从快照重算；JS run() 每轮刷新使编辑/完成 1 秒内反映。
   * 退后台的完整移交（快照 + 闹钟兜底）仍走 schedule。
   */
  fun persist(context: Context, cards: List<LiveTodoTimelineCard>) {
    val appContext = context.applicationContext
    val store = LiveTodoTimelineStore(appContext)
    if (cards.isEmpty()) {
      store.clear()
    } else {
      store.save(cards)
    }
  }

  /** 按快照排下一事件闹钟；快照为空或全部结束则取消闹钟并清空快照。 */
  fun armNext(context: Context) {
    val appContext = context.applicationContext
    val store = LiveTodoTimelineStore(appContext)
    val cards = store.load()
    if (cards.isEmpty()) {
      alarmManager(appContext).cancel(pendingIntent(appContext))
      return
    }
    val nowMs = System.currentTimeMillis()
    val next = nextEventAt(cards, nowMs)
    if (next == null) {
      // 全部结束：不再续排（Receiver 的差量逻辑已撤除过期卡）。
      store.clear()
      alarmManager(appContext).cancel(pendingIntent(appContext))
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager(appContext).setAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        next,
        pendingIntent(appContext),
      )
    } else {
      alarmManager(appContext).setExact(AlarmManager.RTC_WAKEUP, next, pendingIntent(appContext))
    }
  }

  /** JS 回前台收回接管权：取消闹钟、清快照；不动已展示的通知。 */
  fun reclaim(context: Context) {
    val appContext = context.applicationContext
    LiveTodoTimelineStore(appContext).clear()
    alarmManager(appContext).cancel(pendingIntent(appContext))
  }
}
