package im.getnowhere.app.backgroundsync

/** Invokes the app's existing remote-node sync path (WebView bridge in production). */
fun interface RemoteNodeSyncService {
    suspend fun syncFromRemoteNode(timeoutMs: Long): RemoteNodeSyncOutcome
}
