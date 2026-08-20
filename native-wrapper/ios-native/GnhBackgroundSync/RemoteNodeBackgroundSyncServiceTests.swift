import XCTest

final class RemoteNodeBackgroundSyncServiceTests: XCTestCase {
    override func tearDown() {
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
}
