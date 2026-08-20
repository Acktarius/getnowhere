import Foundation

/** Shared constants for best-effort remote-node background refresh. */
enum RemoteNodeBackgroundSyncConfig {
    static let taskIdentifier = "org.getnowhere.remote-node-refresh"
    static let intervalSeconds: TimeInterval = 15 * 60
    static let defaultTimeoutSeconds: TimeInterval = 20
}

enum RemoteNodeSyncOutcome: String {
    case completed
    case skippedInProgress = "skipped_in_progress"
    case noOp = "no_op"
    case retryable
    case failure

    init(outcomeString: String?) {
        switch outcomeString?.lowercased() {
        case "completed", "no_change":
            self = .completed
        case "skipped_in_progress":
            self = .skippedInProgress
        case "no_op":
            self = .noOp
        case "retryable":
            self = .retryable
        default:
            self = .failure
        }
    }
}
