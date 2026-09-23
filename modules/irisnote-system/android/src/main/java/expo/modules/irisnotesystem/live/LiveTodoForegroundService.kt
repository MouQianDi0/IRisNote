package expo.modules.irisnotesystem.live

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.ServiceCompat

/**
 * 方案 B：前台服务秒级刷新（用户开关启用）。
 *
 * - 数据流：JS 在前台启动本服务前先经 updateLiveTodoCards 持久化时间线
 *   快照（不排闹钟），run() 每轮刷新——编辑/完成 1 秒内反映到卡片；
 * - 每秒从时间线快照重算并原位更新通知（进度条秒级平滑插值）；
 * - FGS 通知即进度卡片本身（取快照中最小 ID 的活跃卡），不额外新增常驻通知；
 * - 无进行中卡（空快照或全部未开始）安全停机：先占位 startForeground 再
 *   移除停止，避免 startForegroundService 未配套 startForeground 的系统崩溃；
 * - 全部卡片结束后自动 stopSelf；方案 A 的闹钟节拍始终并存兜底——
 *   FGS 被系统回收时自动降级为分钟级刷新，通知不中断；
 * - Android 12+ 禁止后台启动前台服务：本服务仅由 JS 在前台（有活跃卡片
 *   且开关开启）启动，退后台时保持运行不重启。
 */
class LiveTodoForegroundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val store by lazy { LiveTodoTimelineStore(this) }
  private var started = false

  private val tick = object : Runnable {
    override fun run() {
      val cards = store.load()
      if (cards.isEmpty()) {
        stopSelf()
        return
      }
      val nowMs = System.currentTimeMillis()
      val hasUpcoming = LiveTodoNotifier.applyDesired(
        this@LiveTodoForegroundService,
        cards,
        nowMs,
        smoothSeconds = true,
      )
      if (hasUpcoming) {
        handler.postDelayed(this, TICK_INTERVAL_MS)
      } else {
        store.clear()
        stopSelf()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (started) return START_STICKY
    val cards = store.load()
    if (cards.isEmpty()) {
      stopForegroundSafely()
      return START_NOT_STICKY
    }
    val nowMs = System.currentTimeMillis()
    // 仅以进行中卡为锚点：无活跃卡（全部未开始）不再提前展示未来卡，
    // 到点补发交给闹钟节拍 / JS 驱动，此处安全停机。
    val anchor = cards.filter { it.isActiveAt(nowMs) }.minByOrNull { it.id }
    if (anchor == null) {
      stopForegroundSafely()
      return START_NOT_STICKY
    }
    val notification = LiveTodoNotifier.buildNotification(this, anchor, nowMs, true)
    startForegroundWithType(anchor.id, notification)
    started = true
    handler.post(tick)
    return START_STICKY
  }

  /**
   * 安全停机：startForegroundService 之后必须在超时前调用 startForeground
   * （即使立即停止），否则触发 ForegroundServiceDidNotStartInTimeException。
   * 先以占位通知进入前台再移除并停止；占位 ID 避开演示通知 7001。
   */
  private fun stopForegroundSafely() {
    try {
      ensureLiveTodoChannel()
      val placeholder = LiveTodoNotifier.buildExplicitNotification(
        context = this,
        channelId = LIVE_TODO_CHANNEL_ID,
        title = "IRisNote",
        text = null,
        progress = 0,
        max = 0,
        indeterminate = true,
        ongoing = false,
        promoted = false,
        chronoAt = null,
        chronoCountdown = false,
      )
      startForegroundWithType(PLACEHOLDER_NOTIFICATION_ID, placeholder)
    } catch (_: Throwable) {
      // 渠道缺失等极端场景占位失败：仍需停止服务（尽力而为）。
    } finally {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  /** 渠道正常由 JS 侧创建；此处兜底防御占位通知投递到不存在的渠道。 */
  private fun ensureLiveTodoChannel() {
    val manager =
      getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(LIVE_TODO_CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(
          LIVE_TODO_CHANNEL_ID,
          "待办进行中",
          NotificationManager.IMPORTANCE_LOW,
        )
      )
    }
  }

  override fun onDestroy() {
    handler.removeCallbacks(tick)
    started = false
    // 撤除 FGS 通知；其余卡片由接管方（JS 差量刷新或闹钟节拍）对账。
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  private fun startForegroundWithType(id: Int, notification: android.app.Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceCompat.startForeground(
        this,
        id,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      )
    } else {
      startForeground(id, notification)
    }
  }

  companion object {
    private const val TICK_INTERVAL_MS = 1_000L

    /** 与 JS 侧 LIVE_TODO_CHANNEL 一致（system-notification.types.ts）。 */
    private const val LIVE_TODO_CHANNEL_ID = "irisnote.live-todo.v1"

    /** 安全停机占位通知 ID（保留段，紧邻演示 7001；仅在停机瞬间存在后即移除）。 */
    private const val PLACEHOLDER_NOTIFICATION_ID = 7003

    fun start(context: Context) {
      context.startForegroundService(Intent(context, LiveTodoForegroundService::class.java))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, LiveTodoForegroundService::class.java))
    }
  }
}
