package im.getnowhere.app.backgroundsync

/** Shared constants for best-effort remote-node background refresh. */
object RemoteNodeBackgroundSyncConfig {
    const val UNIQUE_WORK_NAME = "remote-node-background-sync"
    const val UNIQUE_SOON_WORK_NAME = "remote-node-background-sync-soon"
    const val REPEAT_INTERVAL_MINUTES = 15L
    /** One-shot cadence while the app is backgrounded (WebView timers are paused). */
    const val SOON_INTERVAL_SECONDS = 30L
    const val DEFAULT_TIMEOUT_MS = 20_000L
}
