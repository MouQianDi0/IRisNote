package expo.modules.irisnotesystem.live

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.irisnotesystem.IrisNoteSystemModule

/**
 * 逐条动态卡动作接收器（取消通知/+30分钟/完成）：按钮 PendingIntent 指向
 * 本接收器，进程死亡也会被系统拉起。职责顺序：
 * ① 原生即时反馈——改 LiveTodoTimelineStore 快照（取消/完成移除逐条卡、
 *    完成另将聚合 item 置 completed；+30分钟只把逐条卡与聚合 item 的
 *    endAt 后移，startAt 不动）并撤下该卡，聚合卡经 applyDesired 原生重算
 *    计数自愈；
 * ② 写操作标记（LiveTodoActionStore）——JS 不在场时操作不丢失；
 * ③ 通知 JS（模块存活时经 sendEvent，由消费例程落库/记抑制/清标记）。
 * 快照缺该卡（前台 JS 驱动、尚未移交）时 ① 可跳过，②③ 照常。
 */
class LiveTodoActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.getStringExtra(EXTRA_ACTION) ?: return
    val clientId = intent.getStringExtra(EXTRA_CLIENT_ID) ?: return
    val ownerKey = intent.getStringExtra(EXTRA_OWNER_KEY)
    val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
    val appContext = context.applicationContext
    val nowMs = System.currentTimeMillis()
    val manager =
      appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val store = LiveTodoTimelineStore(appContext)
    val changed = when (action) {
      ACTION_CANCEL -> applyCancel(store, clientId)
      ACTION_SNOOZE -> applySnooze(store, clientId)
      ACTION_COMPLETE -> applyComplete(store, clientId, nowMs)
      else -> false
    }
    // 无论快照是否命中都撤卡：前台 JS 驱动的卡片不在快照里，同样要即时消失。
    if (notificationId > 0) manager.cancel(notificationId)
    if (changed) {
      LiveTodoNotifier.applyDesired(appContext, store.load(), System.currentTimeMillis())
      LiveTodoScheduler.armNext(appContext)
    }
    LiveTodoActionStore.append(appContext, action, ownerKey, clientId, nowMs)
    IrisNoteSystemModule.emitCardAction(action, ownerKey, clientId)
  }

  /** 取消通知：仅移除该待办的逐条卡；聚合卡是状态统计，不随可见性变化。 */
  private fun applyCancel(store: LiveTodoTimelineStore, clientId: String): Boolean {
    val cards = store.load()
    var changed = false
    val updated = cards.mapNotNull { card ->
      if (card.summaryItems == null && card.clientId == clientId) {
        changed = true
        null
      } else {
        card
      }
    }
    if (changed) store.save(updated)
    return changed
  }

  /**
   * +30分钟：仅把结束时间后移 30 分钟，开始时间不动——逐条卡与聚合 item
   * 的 endAt +30min（无结束时间不产生变更，JS 侧同口径废弃标记）。
   * 卡片进度由节拍/JS 按新结束重算；JS 消费例程随后把同一偏移写进待办
   * 数据并同步服务端，双端收敛。
   */
  private fun applySnooze(store: LiveTodoTimelineStore, clientId: String): Boolean {
    val shift = SNOOZE_MS
    val cards = store.load()
    var changed = false
    val updated = cards.map { card ->
      when {
        card.summaryItems == null && card.clientId == clientId -> {
          if (card.endAt == null) {
            card
          } else {
            changed = true
            card.copy(endAt = card.endAt + shift)
          }
        }
        card.summaryItems != null -> {
          var touched = false
          val items = card.summaryItems.orEmpty().map { item ->
            if (item.clientId == clientId && !item.completed && item.endAt != null) {
              touched = true
              item.copy(endAt = item.endAt + shift)
            } else {
              item
            }
          }
          if (touched) {
            changed = true
            card.copy(summaryItems = items)
          } else {
            card
          }
        }
        else -> card
      }
    }
    if (changed) store.save(updated)
    return changed
  }

  /** 完成：移除逐条卡；聚合 item 置 completed（completedAt=now），计数原生自愈。 */
  private fun applyComplete(store: LiveTodoTimelineStore, clientId: String, nowMs: Long): Boolean {
    val cards = store.load()
    var changed = false
    val updated = cards.mapNotNull { card ->
      when {
        card.summaryItems == null && card.clientId == clientId -> {
          changed = true
          null
        }
        card.summaryItems != null -> {
          var touched = false
          val items = card.summaryItems.orEmpty().map { item ->
            if (item.clientId == clientId && !item.completed) {
              touched = true
              item.copy(completed = true, completedAt = nowMs)
            } else {
              item
            }
          }
          if (touched) {
            changed = true
            card.copy(summaryItems = items)
          } else {
            card
          }
        }
        else -> card
      }
    }
    if (changed) store.save(updated)
    return changed
  }

  companion object {
    const val ACTION_PREFIX = "expo.modules.irisnotesystem.live.CARD_ACTION."
    const val ACTION_CANCEL = "cancel"
    const val ACTION_SNOOZE = "snooze"
    const val ACTION_COMPLETE = "complete"
    const val EXTRA_ACTION = "action"
    const val EXTRA_OWNER_KEY = "ownerKey"
    const val EXTRA_CLIENT_ID = "clientId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    /** +30分钟的真实时间偏移（仅结束时间）。 */
    const val SNOOZE_MS = 30 * 60_000L
  }
}
