package im.getnowhere.app.backgroundsync

import java.util.concurrent.atomic.AtomicBoolean

/** Process-level guard so background work does not compete with an active sync. */
object RemoteNodeSyncGuard {
    private val inProgress = AtomicBoolean(false)

    fun tryAcquire(): Boolean = inProgress.compareAndSet(false, true)

    fun release() {
        inProgress.set(false)
    }

    fun isInProgress(): Boolean = inProgress.get()
}
