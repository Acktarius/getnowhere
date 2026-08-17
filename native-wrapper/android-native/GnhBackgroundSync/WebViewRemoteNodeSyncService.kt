package im.getnowhere.app.backgroundsync

import kotlinx.coroutines.withTimeoutOrNull

/** Default production sync service — delegates to the WebView JS bridge. */
class WebViewRemoteNodeSyncService(
    private val bridge: RemoteNodeSyncBridgeHolder = RemoteNodeSyncBridgeHolder,
    private val guard: RemoteNodeSyncGuard = RemoteNodeSyncGuard,
) : RemoteNodeSyncService {

    override suspend fun syncFromRemoteNode(timeoutMs: Long): RemoteNodeSyncOutcome {
        if (!guard.tryAcquire()) {
            return RemoteNodeSyncOutcome.SKIPPED_IN_PROGRESS
        }
        try {
            val outcome =
                withTimeoutOrNull(timeoutMs) {
                    bridge.requestBackgroundSync(timeoutMs)
                } ?: RemoteNodeSyncOutcome.RETRYABLE
            return outcome
        } finally {
            guard.release()
        }
    }
}
