package expo.modules.irisnotesystem.live

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * 待办动态卡片的时间线快照：JS 退后台时移交原生，原生凭墙钟即可重算
 * 进度与文案，无需 JS/数据库参与。startAt/endAt 均为 epoch 毫秒；
 * endAt 为 null 表示不定进度（无结束时间），文案直接使用 textStarted。
 */
data class LiveTodoTimelineCard(
  val id: Int,
  val channelId: String,
  val title: String,
  val textStarted: String?,
  val startAt: Long,
  val endAt: Long?,
  val promoted: Boolean,
) {
  /** 是否处于进行中窗口（已到开始且未过结束；恰好结束不算）。 */
  fun isActiveAt(nowMs: Long): Boolean =
    nowMs >= startAt && (endAt == null || nowMs < endAt)

  /** 是否尚未到开始时刻（退后台后到点开始，由原生节拍补发卡片）。 */
  fun isFutureAt(nowMs: Long): Boolean = nowMs < startAt
}

/**
 * 时间线持久化（SharedPreferences + JSON）：进程被系统回收后，
 * AlarmManager 仍会在下一事件时刻唤醒本应用，Receiver 从这里恢复快照续算。
 * force-stop 时系统清空本应用闹钟与通知，冷启动 clearStaleLiveUpdates 兜底。
 */
class LiveTodoTimelineStore(context: Context) {
  private val prefs =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(): List<LiveTodoTimelineCard> {
    val raw = prefs.getString(KEY_TIMELINE, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index ->
        val obj = array.optJSONObject(index) ?: return@mapNotNull null
        val endAt = if (obj.isNull(FIELD_END_AT)) null else obj.optLong(FIELD_END_AT)
        LiveTodoTimelineCard(
          id = obj.optInt(FIELD_ID),
          channelId = obj.optString(FIELD_CHANNEL_ID),
          title = obj.optString(FIELD_TITLE),
          textStarted = if (obj.isNull(FIELD_TEXT_STARTED)) null else obj.optString(FIELD_TEXT_STARTED),
          startAt = obj.optLong(FIELD_START_AT),
          endAt = endAt,
          promoted = obj.optBoolean(FIELD_PROMOTED, true),
        )
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  fun save(cards: List<LiveTodoTimelineCard>) {
    val array = JSONArray()
    for (card in cards) {
      val obj = JSONObject()
        .put(FIELD_ID, card.id)
        .put(FIELD_CHANNEL_ID, card.channelId)
        .put(FIELD_TITLE, card.title)
        .put(FIELD_START_AT, card.startAt)
        .put(FIELD_PROMOTED, card.promoted)
      if (card.endAt == null) {
        obj.put(FIELD_END_AT, JSONObject.NULL)
      } else {
        obj.put(FIELD_END_AT, card.endAt)
      }
      if (card.textStarted == null) {
        obj.put(FIELD_TEXT_STARTED, JSONObject.NULL)
      } else {
        obj.put(FIELD_TEXT_STARTED, card.textStarted)
      }
      array.put(obj)
    }
    prefs.edit().putString(KEY_TIMELINE, array.toString()).apply()
  }

  fun clear() {
    prefs.edit().remove(KEY_TIMELINE).apply()
  }

  companion object {
    private const val PREFS_NAME = "irisnote_live_todo"
    private const val KEY_TIMELINE = "timeline"
    private const val FIELD_ID = "id"
    private const val FIELD_CHANNEL_ID = "channelId"
    private const val FIELD_TITLE = "title"
    private const val FIELD_TEXT_STARTED = "textStarted"
    private const val FIELD_START_AT = "startAt"
    private const val FIELD_END_AT = "endAt"
    private const val FIELD_PROMOTED = "promoted"
  }
}
