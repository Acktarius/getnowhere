internal import BackgroundTasks
import Foundation
import UIKit

/** Registers and submits BGAppRefreshTask requests (~15 min earliest begin). */
final class RemoteNodeBackgroundRefreshScheduler {
    static let shared = RemoteNodeBackgroundRefreshScheduler()

    private var backgroundObserver: NSObjectProtocol?

    private init() {}

    func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: RemoteNodeBackgroundSyncConfig.taskIdentifier,
            using: nil,
        ) { task in
            self.handleAppRefresh(task: task as! BGAppRefreshTask)
        }
        // ExpoAppDelegate does not expose applicationDidEnterBackground for override.
        if backgroundObserver == nil {
            backgroundObserver = NotificationCenter.default.addObserver(
                forName: UIApplication.didEnterBackgroundNotification,
                object: nil,
                queue: .main,
            ) { [weak self] _ in
                self?.scheduleNextRefresh()
            }
        }
    }

    func scheduleNextRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: RemoteNodeBackgroundSyncConfig.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: RemoteNodeBackgroundSyncConfig.intervalSeconds)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch let error as BGTaskScheduler.Error where error.code == .tooManyPendingTaskRequests {
            // Duplicate submit — safe to ignore for best-effort scheduling.
        } catch {
            // Best-effort only; foreground launch will catch up.
        }
    }

    func cancelPendingRefresh() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: RemoteNodeBackgroundSyncConfig.taskIdentifier)
    }

    private func handleAppRefresh(task: BGAppRefreshTask) {
        scheduleNextRefresh()
        var finished = false
        let complete: (Bool) -> Void = { success in
            guard !finished else { return }
            finished = true
            task.setTaskCompleted(success: success)
        }
        task.expirationHandler = {
            complete(true)
        }
        let timeout = RemoteNodeBackgroundSyncConfig.defaultTimeoutSeconds
        RemoteNodeBackgroundSyncService.shared.syncFromRemoteNode(timeout: timeout) { outcome in
            switch outcome {
            case .completed, .noOp, .skippedInProgress:
                complete(true)
            case .retryable:
                complete(true)
            case .failure:
                complete(false)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout + 1) {
            complete(true)
        }
    }
}
