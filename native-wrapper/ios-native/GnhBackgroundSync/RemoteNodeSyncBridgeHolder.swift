import Foundation

/** Holds the WebView inject hook registered from the Expo shell. */
final class RemoteNodeSyncBridgeHolder {
    static let shared = RemoteNodeSyncBridgeHolder()

    private let lock = NSLock()
    private var injectScript: ((String) -> Void)?
    private var pending: [String: (RemoteNodeSyncOutcome) -> Void] = [:]

    private init() {}

    func setScriptInjector(_ injector: ((String) -> Void)?) {
        lock.lock()
        injectScript = injector
        lock.unlock()
    }

    func resolveRequest(requestId: String, outcome: RemoteNodeSyncOutcome) {
        completeIfNeeded(requestId: requestId, outcome: outcome)
    }

    func requestBackgroundSync(timeout: TimeInterval, completion: @escaping (RemoteNodeSyncOutcome) -> Void) {
        lock.lock()
        let injector = injectScript
        lock.unlock()
        guard let injector else {
            completion(.noOp)
            return
        }
        let requestId = "bg-sync-\(UUID().uuidString)"
        lock.lock()
        pending[requestId] = completion
        lock.unlock()
        DispatchQueue.main.async {
            injector(self.buildInjectScript(requestId: requestId))
        }
        // Do not schedule this on a serial queue we later sync — TestFlight SIGTRAP.
        DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.completeIfNeeded(requestId: requestId, outcome: .retryable)
        }
    }

    /** Remove the waiter under the lock; invoke after release so resolve/timeout cannot deadlock. */
    private func completeIfNeeded(requestId: String, outcome: RemoteNodeSyncOutcome) {
        lock.lock()
        let callback = pending.removeValue(forKey: requestId)
        lock.unlock()
        callback?(outcome)
    }

    private func buildInjectScript(requestId: String) -> String {
        let req = requestId.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        let noOpPayload =
            "{\"channel\":\"gnh-background-sync\",\"direction\":\"response\",\"requestId\":\"\(requestId)\",\"outcome\":\"no_op\"}"
        let retryPayload =
            "{\"channel\":\"gnh-background-sync\",\"direction\":\"response\",\"requestId\":\"\(requestId)\",\"outcome\":\"retryable\"}"
        return """
        (function(){try{if(window.gnhMobile&&window.gnhMobile._runBackgroundRemoteSync){window.gnhMobile._runBackgroundRemoteSync('\(req)');}else if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage('\(noOpPayload)');}}catch(e){if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage('\(retryPayload)');}}})();
        true;
        """
    }
}
