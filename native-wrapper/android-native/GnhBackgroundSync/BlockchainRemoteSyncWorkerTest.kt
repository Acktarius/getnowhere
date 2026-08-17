package im.getnowhere.app.backgroundsync

import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.workDataOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class BlockchainRemoteSyncWorkerTest {

    @Test
    fun invokesSyncServiceAndMapsCompletedToSuccess() {
        var called = false
        val service =
            RemoteNodeSyncService { timeoutMs ->
                called = true
                assertEquals(RemoteNodeBackgroundSyncConfig.DEFAULT_TIMEOUT_MS, timeoutMs)
                RemoteNodeSyncOutcome.COMPLETED
            }
        val context = RuntimeEnvironment.getApplication()
        val worker =
            TestListenableWorkerBuilder<BlockchainRemoteSyncWorker>(context)
                .setWorkerFactory(
                    object : androidx.work.WorkerFactory() {
                        override fun createWorker(
                            appContext: android.content.Context,
                            workerClassName: String,
                            workerParameters: androidx.work.WorkerParameters,
                        ): ListenableWorker? =
                            if (workerClassName == BlockchainRemoteSyncWorker::class.java.name) {
                                BlockchainRemoteSyncWorker(appContext, workerParameters, service)
                            } else {
                                null
                            }
                    },
                )
                .build()
        val result = runBlocking { worker.doWork() }
        assertTrue(called)
        assertEquals(ListenableWorker.Result.success(), result)
    }
}
