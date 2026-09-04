import XCTest

final class RemoteNodeBackgroundSyncServiceTests: XCTestCase {
    override func tearDown() {
        RemoteNodeSyncBridgeHolder.shared.setScriptInjector(nil)
        RemoteNodeSyncGuard.shared.release()
        super.tearDown()
    }

    func testSkipsWhenSyncAlreadyInProgress() {
        XCTAssertTrue(RemoteNodeSyncGuard.shared.tryAcquire())
        let exp = expectation(description: "skip")
        RemoteNodeBackgroundSyncService.shared.syncFromRemoteNode(timeout: 1) { outcome in
            XCTAssertEqual(outcome, .skippedInProgress)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2)
        RemoteNodeSyncGuard.shared.release()
    }

    func testNoOpWhenBridgeAbsent() {
        RemoteNodeSyncBridgeHolder.shared.setScriptInjector(nil)
        let exp = expectation(description: "noop")
        RemoteNodeBackgroundSyncService.shared.syncFromRemoteNode(timeout: 1) { outcome in
            XCTAssertEqual(outcome, .noOp)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2)
    }

    func testTimeoutCompletesWithoutDeadlock() {
        let holder = RemoteNodeSyncBridgeHolder.shared
        holder.setScriptInjector { _ in }
        let exp = expectation(description: "timeout")
        var outcomes: [RemoteNodeSyncOutcome] = []
        holder.requestBackgroundSync(timeout: 0.05) { outcome in
            outcomes.append(outcome)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2)
        XCTAssertEqual(outcomes, [.retryable])
    }

    func testResolveWinsAndTimeoutDoesNotDoubleComplete() {
        let holder = RemoteNodeSyncBridgeHolder.shared
        holder.setScriptInjector { script in
            guard let id = requestIdFromInjectScript(script) else {
                XCTFail("inject script missing request id")
                return
            }
            holder.resolveRequest(requestId: id, outcome: .completed)
        }
        let exp = expectation(description: "resolved")
        var outcomes: [RemoteNodeSyncOutcome] = []
        holder.requestBackgroundSync(timeout: 0.3) { outcome in
            outcomes.append(outcome)
            exp.fulfill()
        }
        wait(for: [exp], timeout: 2)
        XCTAssertEqual(outcomes, [.completed])
        let noSecond = expectation(description: "no second completion")
        noSecond.isInverted = true
        wait(for: [noSecond], timeout: 0.4)
        XCTAssertEqual(outcomes.count, 1)
    }
}

private func requestIdFromInjectScript(_ script: String) -> String? {
    let marker = "_runBackgroundRemoteSync('"
    guard let start = script.range(of: marker) else { return nil }
    let rest = script[start.upperBound...]
    guard let end = rest.firstIndex(of: "'") else { return nil }
    return String(rest[..<end])
}
