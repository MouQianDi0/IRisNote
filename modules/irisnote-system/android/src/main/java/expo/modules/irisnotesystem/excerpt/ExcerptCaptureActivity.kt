package expo.modules.irisnotesystem.excerpt

import android.content.ClipboardManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference
import java.util.UUID

/** 通知直接打开的独立任务；只有这个窗口取得焦点后才能读取剪贴板。 */
open class ExcerptCaptureActivity : ReactActivity() {
  val sessionId: String get() = intent.getStringExtra(ExcerptSessionNotifications.SESSION_EXTRA) ?: ""
  /** 通知入口来源（卡主体/卡按钮），仅用于诊断计数。 */
  val captureEntry: String
    get() = intent.getStringExtra(ExcerptSessionNotifications.ENTRY_EXTRA) ?: "card_body"
  val captureId: String = UUID.randomUUID().toString()
  private val handler = Handler(Looper.getMainLooper())
  private val expire = Runnable { finishAndRemoveTask() }
  private val bootstrapTimeout = Runnable {
    Toast.makeText(this, "快速摘录加载失败，请回到 IRisNote 重试", Toast.LENGTH_SHORT).show()
    finishAndRemoveTask()
  }

  companion object {
    private var current = WeakReference<ExcerptCaptureActivity>(null)

    fun state(captureId: String?): Map<String, Any>? {
      val activity = current.get() ?: return null
      if (activity.isFinishing || activity.isDestroyed ||
        !ExcerptSessionNotifications.captureAllowed(activity, activity.sessionId)) return null
      if (captureId != null) {
        if (activity.captureId != captureId) return null
        // 主应用检测器的只读查询不能解除捕获 Surface 的启动超时。
        activity.handler.removeCallbacks(activity.bootstrapTimeout)
      }
      return mapOf("sessionId" to activity.sessionId, "captureId" to activity.captureId,
        "focused" to activity.hasWindowFocus())
    }

    private fun active(captureId: String, focused: Boolean): ExcerptCaptureActivity {
      val activity = requireNotNull(current.get()) { "捕获窗口已关闭" }
      check(!activity.isFinishing && !activity.isDestroyed && activity.captureId == captureId &&
        ExcerptSessionNotifications.captureAllowed(activity, activity.sessionId)) { "快速摘录会话已失效" }
      check(!focused || activity.hasWindowFocus()) { "捕获窗口尚未取得焦点" }
      return activity
    }

    fun hasText(captureId: String): Boolean {
      val clipboard = active(captureId, true).getSystemService(ClipboardManager::class.java)
      return clipboard.primaryClipDescription?.hasMimeType("text/*") == true
    }

    fun readText(captureId: String): String {
      val clipboard = active(captureId, true).getSystemService(ClipboardManager::class.java)
      val clip = clipboard.primaryClip ?: return ""
      if (clip.itemCount == 0) return ""
      // 域上限 20000 字（excerpt-validation）→ 至多 40000 个 UTF-16 单元，+2 余量防代理对截断误判；
      // 不解引用 URI，不把大剪贴板内容无限量送入 JS；正文只经过当前内存调用。
      return clip.getItemAt(0).text?.take(40_002)?.toString() ?: ""
    }

    fun close(captureId: String, saved: Boolean) {
      val activity = current.get() ?: return
      if (activity.captureId != captureId || activity.isFinishing) return
      if (saved) Toast.makeText(activity, "已保存为摘录", Toast.LENGTH_SHORT).show()
      activity.finishAndRemoveTask()
    }

    fun invalidate(sessionId: String) {
      Handler(Looper.getMainLooper()).post {
        val activity = current.get()
        if (activity?.sessionId == sessionId) close(activity.captureId, false)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    current = WeakReference(this)
    super.onCreate(null)
    window.decorView.setBackgroundColor(Color.TRANSPARENT)
    val remaining = ExcerptSessionNotifications.captureRemaining(this, sessionId)
    if (remaining <= 0) finishAndRemoveTask()
    else {
      handler.postDelayed(expire, remaining)
      handler.postDelayed(bootstrapTimeout, 15_000)
    }
  }

  override fun getMainComponentName() = "IRisNoteExcerptCapture"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      object : DefaultReactActivityDelegate(this, mainComponentName, true) {
        override fun getLaunchOptions() = Bundle().apply {
          putString("sessionId", sessionId)
          putString("captureId", captureId)
          putString("captureEntry", captureEntry)
        }
      }

  override fun invokeDefaultOnBackPressed() { finishAndRemoveTask() }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    finishAndRemoveTask()
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    if (current.get() === this) current.clear()
    super.onDestroy()
  }
}
