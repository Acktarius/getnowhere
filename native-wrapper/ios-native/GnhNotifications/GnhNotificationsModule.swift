import Foundation
import React
import UserNotifications

/** RN bridge for GnhNotifications — payloads are JSON strings from the WebView bridge. */
@objc(GnhNotifications)
class GnhNotificationsModule: RCTEventEmitter {
  private let publisher = GnhNotificationPublisher()
  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["gnhNotificationTap"]
  }

  override func startObserving() {
    hasListeners = true
    GnhNotificationCenterDelegate.shared.install()
    GnhNotificationCenterDelegate.shared.onNotificationTap = { [weak self] eventId in
      guard let self, self.hasListeners else { return }
      self.sendEvent(withName: "gnhNotificationTap", body: eventId)
    }
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc func applyPrivacySettings(
    _ settingsJson: String,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    guard let settings = parseJson(settingsJson) else {
      resolver(false)
      return
    }
    let notificationsEnabled = settings["notificationsEnabled"] as? Bool ?? false
    if !notificationsEnabled {
      publisher.cancelAllFeatureNotifications()
    }
    resolver(true)
  }

  @objc func publishEvent(
    _ payloadJson: String,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    guard let payload = parseJson(payloadJson),
          let eventId = payload["eventId"] as? String else {
      resolver(GnhPublishOutcome.disabled.rawValue)
      return
    }
    let input = GnhPublishEventInput(
      eventId: eventId,
      title: payload["title"] as? String ?? "Get NowHere",
      body: payload["body"] as? String ?? "New message",
      badgeCount: payload["badgeCount"] as? Int ?? 0,
      notificationsEnabled: payload["notificationsEnabled"] as? Bool ?? false,
      bannersEnabled: payload["bannersEnabled"] as? Bool ?? false,
      appInForeground: payload["appInForeground"] as? Bool ?? true
    )
    publisher.publishEvent(input) { outcome in
      resolver(outcome.rawValue)
    }
  }

  @objc func setBadgeCount(
    _ count: NSNumber,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    publisher.setBadgeCount(count.intValue)
    resolver(true)
  }

  @objc func clearBadge(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    publisher.clearBadge()
    resolver(true)
  }

  @objc func getPermissionStatus(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let status: String
      switch settings.authorizationStatus {
      case .authorized: status = "authorized"
      case .provisional: status = "provisional"
      case .denied: status = "denied"
      case .notDetermined: status = "notDetermined"
      default: status = "unknown"
      }
      let result: [String: Any] = [
        "status": status,
        "alert": settings.alertSetting == .enabled,
        "badge": settings.badgeSetting == .enabled,
      ]
      resolver(self.jsonString(result))
    }
  }

  /** Must run from a foreground user gesture (Settings toggle flow). */
  @objc func requestPermissions(
    _ badge: Bool,
    alert: Bool,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    publisher.requestPermissions(badge: badge, alert: alert) { granted, status in
      let statusName: String
      switch status {
      case .authorized: statusName = "authorized"
      case .provisional: statusName = "provisional"
      case .denied: statusName = "denied"
      case .notDetermined: statusName = "notDetermined"
      default: statusName = "unknown"
      }
      resolver(self.jsonString(["granted": granted, "status": statusName]))
    }
  }

  private func parseJson(_ raw: String) -> [String: Any]? {
    guard let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  private func jsonString(_ dict: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let str = String(data: data, encoding: .utf8) else {
      return "{}"
    }
    return str
  }
}
