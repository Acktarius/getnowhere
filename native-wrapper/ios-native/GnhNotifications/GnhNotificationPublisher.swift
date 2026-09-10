import Foundation
import UIKit
import UserNotifications

/// Notification-center seam so publish logic is unit-testable.
protocol GnhNotificationCenterAdapter {
  func authorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void)
  func requestAuthorization(
    options: UNAuthorizationOptions,
    completion: @escaping (Bool) -> Void
  )
  func add(request: UNNotificationRequest, completion: @escaping (Error?) -> Void)
  func setBadgeCount(_ count: Int)
  func removeAllPendingAndDelivered()
}

final class SystemNotificationCenterAdapter: GnhNotificationCenterAdapter {
  private let center = UNUserNotificationCenter.current()

  func authorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void) {
    center.getNotificationSettings { settings in
      completion(settings.authorizationStatus)
    }
  }

  func requestAuthorization(
    options: UNAuthorizationOptions,
    completion: @escaping (Bool) -> Void
  ) {
    center.requestAuthorization(options: options) { granted, _ in
      completion(granted)
    }
  }

  func add(request: UNNotificationRequest, completion: @escaping (Error?) -> Void) {
    center.add(request, withCompletionHandler: completion)
  }

  func setBadgeCount(_ count: Int) {
    if #available(iOS 16.0, *) {
      center.setBadgeCount(count)
    }
    // Dual-write: some iOS builds leave the icon badge sticky if only one API
    // is used; applicationIconBadgeNumber remains the reliable fallback.
    DispatchQueue.main.async {
      UIApplication.shared.applicationIconBadgeNumber = count
    }
  }

  func removeAllPendingAndDelivered() {
    center.removeAllPendingNotificationRequests()
    center.removeAllDeliveredNotifications()
  }
}

/// Persisted opaque-eventId ledger — stores only event ids, never content.
final class GnhDeliveredEventLedger {
  static let defaultsKey = "gnhNotificationsDeliveredEventIds"
  static let maxEntries = 512
  private let defaults: UserDefaults
  private let queue = DispatchQueue(label: "gnh.notifications.ledger")

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
  }

  /// Returns false when the eventId was already delivered (replay).
  func markDelivered(_ eventId: String) -> Bool {
    queue.sync {
      var ids = defaults.stringArray(forKey: Self.defaultsKey) ?? []
      if ids.contains(eventId) { return false }
      ids.append(eventId)
      if ids.count > Self.maxEntries {
        ids.removeFirst(ids.count - Self.maxEntries)
      }
      defaults.set(ids, forKey: Self.defaultsKey)
      return true
    }
  }

  func isDelivered(_ eventId: String) -> Bool {
    queue.sync {
      (defaults.stringArray(forKey: Self.defaultsKey) ?? []).contains(eventId)
    }
  }

  func clear() {
    queue.sync { defaults.removeObject(forKey: Self.defaultsKey) }
  }
}

struct GnhPublishEventInput {
  let eventId: String
  let title: String
  let body: String
  let badgeCount: Int
  let notificationsEnabled: Bool
  let bannersEnabled: Bool
  let appInForeground: Bool
}

enum GnhPublishOutcome: String {
  case posted = "POSTED"
  case badgeOnly = "BADGE_ONLY"
  case duplicate = "DUPLICATE"
  case disabled = "DISABLED"
  case foregroundSuppressed = "FOREGROUND_SUPPRESSED"
  case noPermission = "NO_PERMISSION"
}

/// Local-notification publisher for background L1/L1′ sync events.
/// @see docs/features/local-background-notifications.md
final class GnhNotificationPublisher {
  static let eventIdUserInfoKey = "gnhNotificationEventId"

  private let center: GnhNotificationCenterAdapter
  private let ledger: GnhDeliveredEventLedger

  init(
    center: GnhNotificationCenterAdapter = SystemNotificationCenterAdapter(),
    ledger: GnhDeliveredEventLedger = GnhDeliveredEventLedger()
  ) {
    self.center = center
    self.ledger = ledger
  }

  func publishEvent(
    _ input: GnhPublishEventInput,
    completion: @escaping (GnhPublishOutcome) -> Void
  ) {
    guard input.notificationsEnabled else {
      completion(.disabled)
      return
    }
    // Do not burn the eventId: a later background publish must still post.
    guard !input.appInForeground else {
      completion(.foregroundSuppressed)
      return
    }
    if ledger.isDelivered(input.eventId) {
      completion(.duplicate)
      return
    }
    guard input.bannersEnabled else {
      _ = ledger.markDelivered(input.eventId)
      center.setBadgeCount(input.badgeCount)
      completion(.badgeOnly)
      return
    }
    center.authorizationStatus { [weak self] status in
      guard let self else { return }
      guard status == .authorized || status == .provisional else {
        completion(.noPermission)
        return
      }
      guard self.ledger.markDelivered(input.eventId) else {
        completion(.duplicate)
        return
      }
      self.center.setBadgeCount(input.badgeCount)
      let content = UNMutableNotificationContent()
      content.title = input.title
      content.body = input.body
      content.badge = NSNumber(value: input.badgeCount)
      // Opaque routing id only — no plaintext or protocol metadata in userInfo.
      content.userInfo = [Self.eventIdUserInfoKey: input.eventId]
      let request = UNNotificationRequest(
        identifier: "gnh-\(input.eventId)",
        content: content,
        trigger: nil
      )
      self.center.add(request: request) { error in
        completion(error == nil ? .posted : .noPermission)
      }
    }
  }

  func setBadgeCount(_ count: Int) {
    center.setBadgeCount(count)
  }

  /// Clears the icon badge and removes this feature's delivered/pending items
  /// (Android `clearBadge` cancels notifications the same way).
  func clearBadge() {
    center.setBadgeCount(0)
    center.removeAllPendingAndDelivered()
  }

  func cancelAllFeatureNotifications() {
    center.removeAllPendingAndDelivered()
  }

  /// Request only options the enabled product behavior needs.
  func requestPermissions(
    badge: Bool,
    alert: Bool,
    completion: @escaping (Bool, UNAuthorizationStatus) -> Void
  ) {
    center.authorizationStatus { [weak self] status in
      guard let self else { return }
      if status == .denied {
        // Never re-prompt after denial; Privacy screen routes to OS settings.
        completion(false, .denied)
        return
      }
      var options: UNAuthorizationOptions = []
      if badge { options.insert(.badge) }
      if alert {
        options.insert(.alert)
        options.insert(.sound)
      }
      if options.isEmpty {
        completion(status == .authorized || status == .provisional, status)
        return
      }
      self.center.requestAuthorization(options: options) { granted in
        self.center.authorizationStatus { newStatus in
          completion(granted, newStatus)
        }
      }
    }
  }
}
