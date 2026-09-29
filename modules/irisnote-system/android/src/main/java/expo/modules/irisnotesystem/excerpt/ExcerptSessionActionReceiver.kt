package expo.modules.irisnotesystem.excerpt

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ExcerptSessionActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val sessionId = intent.getStringExtra(ExcerptSessionNotifications.SESSION_EXTRA) ?: return
    when (intent.action) {
      ExcerptSessionNotifications.STOP -> ExcerptSessionNotifications.stop(context, sessionId)
      ExcerptSessionNotifications.DISMISS -> ExcerptSessionNotifications.dismiss(context, sessionId)
    }
  }
}
