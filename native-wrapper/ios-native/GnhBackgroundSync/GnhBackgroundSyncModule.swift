import Foundation
import React

@objc(GnhBackgroundSync)
class GnhBackgroundSyncModule: RCTEventEmitter {
    private var hasListeners = false

    override static func requiresMainQueueSetup() -> Bool { true }

    override func supportedEvents() -> [String]! {
        ["gnhBackgroundSyncInject"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    @objc func registerWebViewInjector() {
        RemoteNodeSyncBridgeHolder.shared.setScriptInjector { [weak self] script in
            guard let self, self.hasListeners else { return }
            self.sendEvent(withName: "gnhBackgroundSyncInject", body: script)
        }
    }

    @objc func clearWebViewInjector() {
        RemoteNodeSyncBridgeHolder.shared.setScriptInjector(nil)
    }

    @objc func resolveBackgroundSync(_ requestId: String, outcome: String) {
        RemoteNodeSyncBridgeHolder.shared.resolveRequest(
            requestId: requestId,
            outcome: RemoteNodeSyncOutcome(outcomeString: outcome),
        )
    }
}
