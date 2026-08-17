import Foundation

/** Process-level guard so background work does not compete with an active sync. */
final class RemoteNodeSyncGuard {
    static let shared = RemoteNodeSyncGuard()
    private let lock = NSLock()
    private var inProgress = false

    private init() {}

    func tryAcquire() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if inProgress { return false }
        inProgress = true
        return true
    }

    func release() {
        lock.lock()
        inProgress = false
        lock.unlock()
    }

    var isInProgress: Bool {
        lock.lock()
        defer { lock.unlock() }
        return inProgress
    }
}
