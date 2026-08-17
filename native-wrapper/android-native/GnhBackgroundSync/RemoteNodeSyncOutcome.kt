package im.getnowhere.app.backgroundsync

/** Result of a single remote-node sync attempt (no sensitive payload). */
enum class RemoteNodeSyncOutcome {
    COMPLETED,
    SKIPPED_IN_PROGRESS,
    NO_OP,
    RETRYABLE,
    FAILURE,
}
