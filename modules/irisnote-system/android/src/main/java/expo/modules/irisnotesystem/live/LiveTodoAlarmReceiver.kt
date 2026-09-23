package expo.modules.irisnotesystem.live

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 方案 A 的分钟节拍接收器：闹钟到点唤醒（进程死亡也会被拉起），
 * 从 SharedPreferences 恢复时间线快照，按墙钟差量刷新通知后续排下一事件。
 * 全部卡片结束后自动停摆（清快照、撤通知、取消闹钟）。
 */
class LiveTodoAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val appContext = context.applicationContext
    val store = LiveTodoTimelineStore(appContext)
    val cards = store.load()
    if (cards.isEmpty()) return
    val nowMs = System.currentTimeMillis()
    val hasUpcoming = LiveTodoNotifier.applyDesired(appContext, cards, nowMs)
    if (hasUpcoming) {
      LiveTodoScheduler.armNext(appContext)
    } else {
      store.clear()
      LiveTodoScheduler.reclaim(appContext)
    }
  }
}
