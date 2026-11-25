package im.getnowhere.app.ntfywake

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.atomic.AtomicBoolean

/** Registers `onStart` / `onStop` once. Seeds from the current activity if it is already started. */
internal object ActivityVisibilityTracker {
    private val visibility = ActivityVisibility()
    private val installed = AtomicBoolean(false)

    fun isBackgrounded(): Boolean = visibility.isBackgrounded()

    fun install(context: ReactApplicationContext) {
        if (!installed.compareAndSet(false, true)) return
        val owner = context.currentActivity as? LifecycleOwner
        if (owner != null && owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            visibility.onStarted()
        }
        val app = context.applicationContext as Application
        app.registerActivityLifecycleCallbacks(
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityStarted(activity: Activity) {
                    visibility.onStarted()
                }

                override fun onActivityStopped(activity: Activity) {
                    visibility.onStopped()
                }

                override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

                override fun onActivityResumed(activity: Activity) {}

                override fun onActivityPaused(activity: Activity) {}

                override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

                override fun onActivityDestroyed(activity: Activity) {}
            },
        )
    }
}
