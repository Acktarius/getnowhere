import Foundation
import UserNotifications

/**
 * UNUserNotificationCenter delegate: suppress banners while the app is active
 * (the UI renders events directly) and forward taps as opaque event ids.
 */
final class GnhNotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = GnhNotificationCenterDelegate()

  /// Set by GnhNotificationsModule to emit tap events into JS.
  var onNotificationTap: ((String) -> Void)?

  func install() {
    UNUserNotificationCenter.current().delegate = self
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler:
      @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    // Active foreground app: badge only; in-app UI shows the event itself.
    completionHandler([.badge])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    if let eventId =
      userInfo[GnhNotificationPublisher.eventIdUserInfoKey] as? String {
      onNotificationTap?(eventId)
    }
    completionHandler()
  }
}
