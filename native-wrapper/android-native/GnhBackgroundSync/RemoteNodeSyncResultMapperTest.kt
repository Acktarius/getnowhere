package im.getnowhere.app.backgroundsync

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteNodeSyncResultMapperTest {

    @Test
    fun mapsOutcomesToWorkResults() {
        assertEquals(
            androidx.work.ListenableWorker.Result.success(),
            RemoteNodeSyncResultMapper.toWorkResult(RemoteNodeSyncOutcome.COMPLETED),
        )
        assertEquals(
            androidx.work.ListenableWorker.Result.retry(),
            RemoteNodeSyncResultMapper.toWorkResult(RemoteNodeSyncOutcome.RETRYABLE),
        )
        assertEquals(
            androidx.work.ListenableWorker.Result.failure(),
            RemoteNodeSyncResultMapper.toWorkResult(RemoteNodeSyncOutcome.FAILURE),
        )
    }
}
