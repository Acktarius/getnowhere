import Foundation

/** Holds the WebView inject hook registered from the Expo shell. */
final class RemoteNodeSyncBridgeHolder {
    static let shared = RemoteNodeSyncBridgeHolder()

    private let queue = DispatchQueue(label: "im.getnowhere.remote-node-sync-bridge")
    private var injectScript: ((String) -> Void)?
    private var pending: [String: (RemoteNodeSyncOutcome) -> Void] = [:]

    private init() {}

    func setScriptInjector(_ injector: ((String) -> Void)?) {
        queue.sync { injectScript = injector }
    }

    func resolveRequest(requestId: String, outcome: RemoteNodeSyncOutcome) {
        queue.sync {
            pending.removeValue(forKey: requestId)?(outcome)
        }
    }

    func requestBackgroundSync(timeout: TimeInterval, completion: @escaping (RemoteNodeSyncOutcome) -> Void) {
        let injector: ((String) -> Void)?
        queue.sync { injector = injectScript }
        guard let injector else {
            completion(.noOp)
            return
        }
        let requestId = "bg-sync-\(UUID().uuidString)"
        var finished = false
        let finish: (RemoteNodeSyncOutcome) -> Void = { outcome in
            self.queue.sync {
                guard !finished else { return }
                finished = true
                self.pending.removeValue(forKey: requestId)
            }
            completion(outcome)
        }
        queue.sync { pending[requestId] = finish }
        DispatchQueue.main.async {
            injector(self.buildInjectScript(requestId: requestId))
        }
        queue.asyncAfter(deadline: .now() + timeout) {
            finish(.retryable)
        }
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
