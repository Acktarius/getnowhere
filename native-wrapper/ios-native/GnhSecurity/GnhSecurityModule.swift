import Foundation
import React

@objc(GnhSecurity)
class GnhSecurityModule: NSObject {
  private let prefs = GnhSecurePrefs()
  private let biometric = GnhBiometricModule()

  @objc static func requiresMainQueueSetup() -> Bool { true }

  override init() {
    super.init()
    // Migrate any existing items to AfterFirstUnlock accessibility at startup
    // (device is always unlocked when the user opens the app).
    prefs.migrateKnownKeys()
  }

  @objc func securePrefsGet(_ key: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    let (value, error) = prefs.getDetailed(key: key)
    if let error = error {
      rejecter("ERR_KEYCHAIN_UNAVAILABLE", error, nil)
    } else {
      resolver(value)
    }
  }

  @objc func securePrefsSet(_ key: String, value: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    prefs.set(key: key, value: value)
    resolver(true)
  }

  @objc func securePrefsRemove(_ key: String, resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    prefs.remove(key: key)
    resolver(true)
  }

  @objc func handleBiometricCommand(_ payloadJson: String, resolver: @escaping RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    guard let data = payloadJson.data(using: .utf8),
          let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = payload["action"] as? String else {
      resolver(jsonString(["error": "failed"]))
      return
    }
    switch action {
    case "isAvailable":
      let purpose = payload["purpose"] as? String ?? GnhBiometricModule.purposeData
      resolver(jsonString(["available": biometric.isAvailable(purpose: purpose)]))
    case "enrollDataUnlock":
      guard let walletId = payload["walletId"] as? String, let password = payload["password"] as? String else {
        resolver(jsonString(["error": "failed"])); return
      }
      biometric.enrollDataUnlock(walletId: walletId, password: password) { result in
        resolver(self.jsonString(result))
      }
    case "unlockDataUnlock":
      guard let walletId = payload["walletId"] as? String, let credentialId = payload["credentialId"] as? String else {
        resolver(jsonString(["error": "failed"])); return
      }
      biometric.unlockDataUnlock(walletId: walletId, credentialId: credentialId) { result in
        resolver(self.jsonString(result))
      }
    case "enrollAppAccess":
      guard let passcode = payload["passcode"] as? String else {
        resolver(jsonString(["error": "failed"])); return
      }
      biometric.enrollAppAccess(passcode: passcode) { result in
        resolver(self.jsonString(result))
      }
    case "unlockAppAccess":
      biometric.unlockAppAccess { result in
        resolver(self.jsonString(result))
      }
    case "removeCredential":
      guard let credentialId = payload["credentialId"] as? String else {
        resolver(jsonString(["error": "failed"])); return
      }
      biometric.removeCredential(credentialId: credentialId)
      resolver(jsonString(["ok": true]))
    default:
      resolver(jsonString(["error": "failed"]))
    }
  }

  private func jsonString(_ dict: [String: Any]) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let str = String(data: data, encoding: .utf8) else { return "{\"error\":\"failed\"}" }
    return str
  }
}
