import UserNotifications
import XCTest

/// Fake adapter capturing publish decisions without touching the real center.
final class FakeNotificationCenterAdapter: GnhNotificationCenterAdapter {
  var status: UNAuthorizationStatus = .authorized
  var addedRequests: [UNNotificationRequest] = []
  var badgeCounts: [Int] = []
  var removedAll = false
  var authorizationRequests: [UNAuthorizationOptions] = []
  var grantAuthorization = true

  func authorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void) {
    completion(status)
  }

  func requestAuthorization(
    options: UNAuthorizationOptions,
    completion: @escaping (Bool) -> Void
  ) {
    authorizationRequests.append(options)
    completion(grantAuthorization)
  }

  func add(request: UNNotificationRequest, completion: @escaping (Error?) -> Void) {
    addedRequests.append(request)
    completion(nil)
  }

  func setBadgeCount(_ count: Int) {
    badgeCounts.append(count)
  }

  func removeAllPendingAndDelivered() {
    removedAll = true
  }
}

final class GnhNotificationPublisherTests: XCTestCase {
  private var fake: FakeNotificationCenterAdapter!
  private var ledger: GnhDeliveredEventLedger!
  private var publisher: GnhNotificationPublisher!

  override func setUp() {
    super.setUp()
    fake = FakeNotificationCenterAdapter()
    let defaults = UserDefaults(suiteName: "gnh-notif-tests")!
    defaults.removePersistentDomain(forName: "gnh-notif-tests")
    ledger = GnhDeliveredEventLedger(defaults: defaults)
    publisher = GnhNotificationPublisher(center: fake, ledger: ledger)
  }

  private func input(
    eventId: String = "evt-1",
    notificationsEnabled: Bool = true,
    bannersEnabled: Bool = true,
    appInForeground: Bool = false,
    badgeCount: Int = 1
  ) -> GnhPublishEventInput {
    GnhPublishEventInput(
      eventId: eventId,
      title: "Alice",
      body: "Alice: hello",
      badgeCount: badgeCount,
      notificationsEnabled: notificationsEnabled,
      bannersEnabled: bannersEnabled,
      appInForeground: appInForeground
    )
  }

  private func publish(_ input: GnhPublishEventInput) -> GnhPublishOutcome {
    var result: GnhPublishOutcome?
    let exp = expectation(description: "publish")
    publisher.publishEvent(input) { outcome in
      result = outcome
      exp.fulfill()
    }
    wait(for: [exp], timeout: 1)
    return result!
  }

  func testBackgroundBannerPosted() {
    XCTAssertEqual(publish(input()), .posted)
    XCTAssertEqual(fake.addedRequests.count, 1)
    let content = fake.addedRequests[0].content
    XCTAssertEqual(content.title, "Alice")
    XCTAssertEqual(content.badge, 1)
    // userInfo carries only the opaque event id.
    XCTAssertEqual(content.userInfo.count, 1)
    XCTAssertEqual(
      content.userInfo[GnhNotificationPublisher.eventIdUserInfoKey] as? String,
      "evt-1"
    )
  }

  func testDuplicateEventNotReposted() {
    XCTAssertEqual(publish(input()), .posted)
    XCTAssertEqual(publish(input()), .duplicate)
    XCTAssertEqual(fake.addedRequests.count, 1)
  }

  func testBannersDisabledUpdatesBadgeOnly() {
    XCTAssertEqual(publish(input(bannersEnabled: false, badgeCount: 3)), .badgeOnly)
    XCTAssertTrue(fake.addedRequests.isEmpty)
    XCTAssertEqual(fake.badgeCounts.last, 3)
  }

  func testNotificationsDisabledIsNoOp() {
    XCTAssertEqual(publish(input(notificationsEnabled: false)), .disabled)
    XCTAssertTrue(fake.addedRequests.isEmpty)
    XCTAssertTrue(fake.badgeCounts.isEmpty)
    XCTAssertFalse(ledger.isDelivered("evt-1"))
  }

  func testForegroundSuppressesBannerWithoutBurningLedger() {
    XCTAssertEqual(publish(input(appInForeground: true)), .foregroundSuppressed)
    XCTAssertTrue(fake.addedRequests.isEmpty)
    XCTAssertFalse(ledger.isDelivered("evt-1"))
    XCTAssertEqual(publish(input()), .posted)
    XCTAssertEqual(fake.addedRequests.count, 1)
  }

  func testDeniedAuthorizationBlocksBanner() {
    fake.status = .denied
    XCTAssertEqual(publish(input()), .noPermission)
    XCTAssertTrue(fake.addedRequests.isEmpty)
  }

  func testRequestPermissionsAfterDenialDoesNotReprompt() {
    fake.status = .denied
    let exp = expectation(description: "request")
    publisher.requestPermissions(badge: true, alert: true) { granted, status in
      XCTAssertFalse(granted)
      XCTAssertEqual(status, .denied)
      exp.fulfill()
    }
    wait(for: [exp], timeout: 1)
    XCTAssertTrue(fake.authorizationRequests.isEmpty)
  }

  func testBadgeOnlyPermissionRequestOmitsAlert() {
    fake.status = .notDetermined
    let exp = expectation(description: "request")
    publisher.requestPermissions(badge: true, alert: false) { _, _ in
      exp.fulfill()
    }
    wait(for: [exp], timeout: 1)
    XCTAssertEqual(fake.authorizationRequests.count, 1)
    XCTAssertTrue(fake.authorizationRequests[0].contains(.badge))
    XCTAssertFalse(fake.authorizationRequests[0].contains(.alert))
  }

  func testClearBadgeZerosCountAndRemovesDelivered() {
    XCTAssertEqual(publish(input(badgeCount: 2)), .posted)
    publisher.clearBadge()
    XCTAssertEqual(fake.badgeCounts.last, 0)
    XCTAssertTrue(fake.removedAll)
  }
}
