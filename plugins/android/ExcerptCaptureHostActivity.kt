package expo.modules.irisnotesystem.excerpt

import com.facebook.react.ReactActivityDelegate
import expo.modules.ReactActivityDelegateWrapper

/** Generated into the app by with-excerpt-capture; Expo depends on irisnote-system,
 * so the Expo delegate wrapper must live in the app to avoid a Gradle dependency cycle. */
class ExcerptCaptureHostActivity : ExcerptCaptureActivity() {
  override fun createReactActivityDelegate(): ReactActivityDelegate =
    ReactActivityDelegateWrapper(this, super.createReactActivityDelegate())
}
