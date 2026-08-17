package im.getnowhere.app.backgroundsync

import androidx.work.ListenableWorker.Result

/** Maps remote-node sync outcomes to WorkManager results. */
object RemoteNodeSyncResultMapper {
    fun toWorkResult(outcome: RemoteNodeSyncOutcome): Result =
        when (outcome) {
            RemoteNodeSyncOutcome.COMPLETED,
            RemoteNodeSyncOutcome.NO_OP,
            RemoteNodeSyncOutcome.SKIPPED_IN_PROGRESS,
            -> Result.success()

            RemoteNodeSyncOutcome.RETRYABLE -> Result.retry()
            RemoteNodeSyncOutcome.FAILURE -> Result.failure()
        }
}
