package im.getnowhere.app.ntfywake

import java.util.concurrent.atomic.AtomicInteger

/**
 * Started-activity count. Backgrounded means `onStop` has run and `onStart` has not.
 * Home and a finished swipe-up both end in `onStop`.
 */
internal class ActivityVisibility {
    private val started = AtomicInteger(0)

    fun onStarted() {
        started.incrementAndGet()
    }

    fun onStopped() {
        started.updateAndGet { current -> if (current > 0) current - 1 else 0 }
    }

    fun isBackgrounded(): Boolean = started.get() == 0
}
