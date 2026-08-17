package im.getnowhere.app.backgroundsync

/** Shared constants for best-effort remote-node background refresh. */
object RemoteNodeBackgroundSyncConfig {
    const val UNIQUE_WORK_NAME = "remote-node-background-sync"
    const val REPEAT_INTERVAL_MINUTES = 15L
    const val DEFAULT_TIMEOUT_MS = 20_000L
}
