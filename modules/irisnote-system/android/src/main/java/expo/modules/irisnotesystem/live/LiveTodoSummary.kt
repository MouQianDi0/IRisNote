package expo.modules.irisnotesystem.live

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

  /** smoothSeconds 保留以兼容既有调用方；聚合卡已改为静态计数文案，不再使用。 */
  fun scene(card: LiveTodoTimelineCard, nowMs: Long, @Suppress("UNUSED_PARAMETER") smoothSeconds: Boolean = false): Scene? {
    val items = card.summaryItems ?: return null
    if (card.endAt != null && nowMs >= card.endAt) return null
    val pending = items.filter { !it.completed }
    val timed = pending.filter { it.startAt != null && (it.endAt == null || it.endAt > nowMs) }
    val order = compareBy<LiveTodoSummaryItem> { it.startAt }.thenBy { it.title }
    val activeItems = timed.filter { (it.startAt ?: Long.MAX_VALUE) <= nowMs }.sortedWith(order)
    val nearItems = timed.filter { (it.startAt ?: 0) > nowMs && (it.startAt ?: Long.MAX_VALUE) - nowMs <= NEAR_MS }
      .sortedWith(order)
    // 与 JS desiredTodoSummary 同口径：标题「进行中 N[·临近 N]」，副标题分段统计。
    val title = if (nearItems.isNotEmpty()) "进行中 ${activeItems.size}·临近 ${nearItems.size}"
    else "进行中 ${activeItems.size}"
    val pendingCount = pending.size
    val completedCount = items.size - pendingCount
    val starredCount = pending.count { it.priority == "high" }
    val text = listOf(
      "今日 ${items.size} 条待办",
      "${starredCount}条重要",
      "${pendingCount}条待完成",
      "${activeItems.size}条进行中",
      "${completedCount}条已完成",
    ).joinToString(" | ")
    val active = activeItems.firstOrNull()
    if (active != null) return Scene("active", title, text, "ic_live_todo_active")
    if (nearItems.isNotEmpty()) return Scene("near", title, text, "ic_live_todo_near")
    if (pending.any { it.startAt == null || (it.startAt > nowMs && (it.endAt == null || it.endAt > nowMs)) })
      return Scene("today", title, text, "ic_live_todo_today")
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
    // 聚合卡已为静态计数文案，无需分钟级兜底节拍。
    return events.filter { it > nowMs }.minOrNull()
  }
}
