package im.getnowhere.app.backgroundsync

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WebViewRemoteNodeSyncServiceTest {

    @Test
    fun skipsWhenGuardHeld() = runBlocking {
        RemoteNodeSyncGuard.tryAcquire()
        try {
            val outcome = WebViewRemoteNodeSyncService().syncFromRemoteNode(500)
            assertEquals(RemoteNodeSyncOutcome.SKIPPED_IN_PROGRESS, outcome)
        } finally {
            RemoteNodeSyncGuard.release()
        }
    }
}
