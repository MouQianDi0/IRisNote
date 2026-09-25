package expo.modules.irisnotesystem.live

import java.util.Locale

/** 聚合卡原生重算：后台无需 JS，场景切换由同一闹钟链驱动。 */
object LiveTodoSummary {
  private const val NEAR_MS = 60 * 60_000L
  private const val END_HOLD_MS = 10 * 60_000L

  data class Scene(
    val name: String,
    val title: String,
    val text: String,
    val iconResourceName: String,
    val chronoAt: Long? = null,
    val secondsEligible: Boolean = false,
  )

  fun scene(card: LiveTodoTimelineCard, nowMs: Long, smoothSeconds: Boolean = false): Scene? {
    val items = card.summaryItems ?: return null
    if (card.endAt != null && nowMs >= card.endAt) return null
    val pending = items.filter { !it.completed }
    val count = pending.size
    val starred = pending.count { it.starred }
    val timed = pending.filter { it.startAt != null && (it.endAt == null || it.endAt > nowMs) }
    val order = compareBy<LiveTodoSummaryItem> { it.startAt }.thenBy { it.title }
    val active = timed.filter { (it.startAt ?: Long.MAX_VALUE) <= nowMs }.sortedWith(order).firstOrNull()
    val near = timed.filter { (it.startAt ?: 0) > nowMs && (it.startAt ?: Long.MAX_VALUE) - nowMs <= NEAR_MS }
      .sortedWith(order).firstOrNull()
    if (active != null) {
      val remaining = active.endAt?.let { (it - nowMs).coerceAtLeast(0) }
      val duration = if (remaining == null) "" else if (remaining <= NEAR_MS && smoothSeconds) {
        String.format(Locale.ROOT, "%02d:%02d", remaining / 60_000, remaining % 60_000 / 1000)
      } else {
        val minutes = (remaining + 59_999) / 60_000
        String.format(Locale.ROOT, "%02d:%02d", minutes / 60, minutes % 60)
      }
      return Scene(
        "active", "待办 $count·进行中 ${timed.count { (it.startAt ?: Long.MAX_VALUE) <= nowMs }}",
        active.title + if (duration.isEmpty()) "" else " · 剩余 $duration",
        "ic_live_todo_active", active.endAt,
        remaining != null && remaining <= NEAR_MS,
      )
    }
    if (near != null) return Scene(
      "near", "待办 $count·临近 ${timed.count { (it.startAt ?: 0) > nowMs && (it.startAt ?: Long.MAX_VALUE) - nowMs <= NEAR_MS }}",
      near.title, "ic_live_todo_near",
    )
    if (pending.any { it.startAt == null || (it.startAt > nowMs && (it.endAt == null || it.endAt > nowMs)) })
      return Scene("today", "待办 $count·重要 $starred", "今日有 $count 条待办，$starred 条重要", "ic_live_todo_today")
    if (!card.summarySeenActivity || items.isEmpty()) return null
    val terminalAt = items.maxOfOrNull { if (it.completed && it.completedAt != null) it.completedAt else it.endAt ?: Long.MIN_VALUE }
      ?: return null
    if (nowMs < terminalAt || nowMs >= terminalAt + END_HOLD_MS) return null
    return Scene("ended", "待办结束", "${items.count { it.completed }}·已完成", "ic_live_todo_ended")
  }

  fun nextEventAt(card: LiveTodoTimelineCard, nowMs: Long): Long? {
    val items = card.summaryItems ?: return null
    val events = mutableListOf<Long>()
    card.endAt?.let { events.add(it) }
    for (item in items) {
      item.startAt?.let { events.add(it - NEAR_MS); events.add(it) }
      item.endAt?.let { events.add(it); events.add(it + END_HOLD_MS) }
      item.completedAt?.let { events.add(it + END_HOLD_MS) }
    }
    // 进行中剩余分钟文案的兜底节拍。
    if (scene(card, nowMs)?.name == "active") events.add((nowMs / 60_000 + 1) * 60_000)
    return events.filter { it > nowMs }.minOrNull()
  }
}
