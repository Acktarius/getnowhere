import Foundation
import Security

/**
 * Keychain-backed secure string storage (enrollment metadata).
 * Uses kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly so items remain readable
 * after the device has been unlocked once — even when the screen locks again.
 * This prevents reconcileBiometricSettingsWithEnrollments from incorrectly
 * clearing flags when the WKWebView restarts while the device screen is off.
 * @see docs/features/app-access-and-data-unlock.md
 */
final class GnhSecurePrefs {
  private let service = "im.getnowhere.app.gnh.secureprefs"

  /** Lookup a stored value. Returns nil when the key is absent (not an error). */
  func get(key: String) -> String? {
    let (value, _) = getDetailed(key: key)
    return value
  }

  /**
   * Lookup a stored value with error distinction.
   * Returns (nil, nil) when the key is absent.
   * Returns (nil, "unavailable") when the Keychain is locked or inaccessible.
   */
  func getDetailed(key: String) -> (value: String?, error: String?) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess {
      guard let data = item as? Data, let str = String(data: data, encoding: .utf8) else {
        return (nil, nil)
      }
      return (str, nil)
    }
    if status == errSecItemNotFound {
      return (nil, nil)
    }
    return (nil, "unavailable")
  }

  func set(key: String, value: String) {
    remove(key: key)
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    SecItemAdd(query as CFDictionary, nil)
  }

  func remove(key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
  }

  /**
   * Upgrade existing items from kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly
   * to kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly. Call at app startup
   * while the device is unlocked. Safe to call multiple times (no-op if already migrated).
   */
  func migrateKnownKeys() {
    let knownKeys = ["gnh.appAccessCredentialId", "gnh-biometric-enrollment"]
    let newAttributes: [String: Any] = [
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    for key in knownKeys {
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: key,
      ]
      SecItemUpdate(query as CFDictionary, newAttributes as CFDictionary)
    }
  }
}
