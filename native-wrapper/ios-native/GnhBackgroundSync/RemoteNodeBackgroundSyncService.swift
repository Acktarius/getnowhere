import Foundation

/** Default production sync service — delegates to the WebView JS bridge. */
final class RemoteNodeBackgroundSyncService {
    static let shared = RemoteNodeBackgroundSyncService()

    private let bridge = RemoteNodeSyncBridgeHolder.shared
    private let guardLock = RemoteNodeSyncGuard.shared

    private init() {}

    func syncFromRemoteNode(
        timeout: TimeInterval = RemoteNodeBackgroundSyncConfig.defaultTimeoutSeconds,
        completion: @escaping (RemoteNodeSyncOutcome) -> Void,
    ) {
        guard guardLock.tryAcquire() else {
            completion(.skippedInProgress)
            return
        }
        bridge.requestBackgroundSync(timeout: timeout) { [weak self] outcome in
            self?.guardLock.release()
            completion(outcome)
        }
    }

    func syncFromRemoteNode(
        timeout: TimeInterval = RemoteNodeBackgroundSyncConfig.defaultTimeoutSeconds,
    ) async -> RemoteNodeSyncOutcome {
        await withCheckedContinuation { continuation in
            syncFromRemoteNode(timeout: timeout) { outcome in
                continuation.resume(returning: outcome)
            }
        }
    }
}
