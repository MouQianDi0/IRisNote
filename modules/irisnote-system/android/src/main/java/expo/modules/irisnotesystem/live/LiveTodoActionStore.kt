package expo.modules.irisnotesystem.live

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * 动态卡动作标记（SharedPreferences + JSON）：LiveTodoActionReceiver 在原生
 * 即时反馈（撤卡/改快照）后写入，JS 侧消费例程读走并落库（完成/延迟）或
 * 记录抑制（取消），成功后才按 id 清除——进程死亡时 JS 不在场，标记留存
 * 保证操作最终一致，不静默丢失。同一 (action, ownerKey, clientId) 重复点击
 * 覆盖旧标记，天然去重。
 */
object LiveTodoActionStore {
  private const val PREFS_NAME = "irisnote_live_todo_actions"
  private const val KEY_ACTIONS = "actions"

  data class Entry(
    val id: String,
    val action: String,
    val ownerKey: String,
    val clientId: String,
    val at: Long,
  )

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun load(context: Context): List<Entry> {
    val raw = prefs(context).getString(KEY_ACTIONS, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).mapNotNull { index ->
        val obj = array.optJSONObject(index) ?: return@mapNotNull null
        val id = obj.optString("id")
        val action = obj.optString("action")
        val clientId = obj.optString("clientId")
        if (id.isEmpty() || action.isEmpty() || clientId.isEmpty()) return@mapNotNull null
        Entry(
          id = id,
          action = action,
          ownerKey = obj.optString("ownerKey"),
          clientId = clientId,
          at = obj.optLong("at"),
        )
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  fun append(context: Context, action: String, ownerKey: String?, clientId: String, at: Long) {
    val prefs = prefs(context)
    val entries = load(context).toMutableList()
    entries.removeAll {
      it.action == action && it.ownerKey == (ownerKey ?: "") && it.clientId == clientId
    }
    entries.add(
      Entry(
        id = UUID.randomUUID().toString(),
        action = action,
        ownerKey = ownerKey ?: "",
        clientId = clientId,
        at = at,
      ),
    )
    save(prefs, entries)
  }

  fun removeAll(context: Context, ids: Set<String>) {
    if (ids.isEmpty()) return
    val prefs = prefs(context)
    val entries = load(context).filterNot { it.id in ids }
    save(prefs, entries)
  }

  private fun save(prefs: SharedPreferences, entries: List<Entry>) {
    val array = JSONArray()
    for (entry in entries) {
      array.put(
        JSONObject()
          .put("id", entry.id)
          .put("action", entry.action)
          .put("ownerKey", entry.ownerKey)
          .put("clientId", entry.clientId)
          .put("at", entry.at),
      )
    }
    prefs.edit().putString(KEY_ACTIONS, array.toString()).apply()
  }
}
