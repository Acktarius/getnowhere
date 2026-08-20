package im.getnowhere.app.backgroundsync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull

/** WorkManager hook: best-effort remote-node sync when the OS grants background time. */
class BlockchainRemoteSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): ListenableWorker.Result {
        // Delayed queued work is batched by Doze (~15 min). Stay running and
        // poll while backgrounded so L1′ notifications are not that late.
        var result = ListenableWorker.Result.success()
        var first = true
        while (RemoteNodeBackgroundSyncScheduler.shouldChainSoon()) {
            if (!first) {
                delay(RemoteNodeBackgroundSyncConfig.SOON_INTERVAL_SECONDS * 1000L)
                if (!RemoteNodeBackgroundSyncScheduler.shouldChainSoon()) break
            }
            first = false
            result = executeRemoteNodeBackgroundSync(WebViewRemoteNodeSyncService())
        }
        return result
    }
}

internal suspend fun executeRemoteNodeBackgroundSync(
    syncService: RemoteNodeSyncService,
): ListenableWorker.Result {
    val timeoutMs = RemoteNodeBackgroundSyncConfig.DEFAULT_TIMEOUT_MS
    val outcome =
        withTimeoutOrNull(timeoutMs + 2_000L) {
            syncService.syncFromRemoteNode(timeoutMs)
        } ?: RemoteNodeSyncOutcome.RETRYABLE
    return RemoteNodeSyncResultMapper.toWorkResult(outcome)
}
