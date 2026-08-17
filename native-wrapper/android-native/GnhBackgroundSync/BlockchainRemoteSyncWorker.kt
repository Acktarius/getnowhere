package im.getnowhere.app.backgroundsync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.withTimeoutOrNull

/** WorkManager hook: best-effort remote-node sync when the OS grants background time. */
class BlockchainRemoteSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): ListenableWorker.Result =
        executeRemoteNodeBackgroundSync(WebViewRemoteNodeSyncService())
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
