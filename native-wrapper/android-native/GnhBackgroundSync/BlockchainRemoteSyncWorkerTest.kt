package im.getnowhere.app.backgroundsync

import androidx.work.ListenableWorker
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BlockchainRemoteSyncWorkerTest {

    @Test
    fun invokesSyncServiceAndMapsCompletedToSuccess() = runBlocking {
        var called = false
        val service =
            RemoteNodeSyncService { timeoutMs ->
                called = true
                assertEquals(RemoteNodeBackgroundSyncConfig.DEFAULT_TIMEOUT_MS, timeoutMs)
                RemoteNodeSyncOutcome.COMPLETED
            }
        val result = executeRemoteNodeBackgroundSync(service)
        assertTrue(called)
        assertEquals(ListenableWorker.Result.success(), result)
    }
}
