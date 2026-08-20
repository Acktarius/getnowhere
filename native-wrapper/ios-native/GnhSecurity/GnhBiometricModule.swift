import Foundation
import LocalAuthentication
import Security

/** Native-only biometric gate — encrypts secrets in Keychain; no export to JS. */
final class GnhBiometricModule {
  static let purposeApp = "app"
  static let purposeData = "data"

  private let prefs = GnhSecurePrefs()
  private var inFlight = false
  private let keyService = "im.getnowhere.app.gnh.biometric"

  func isAvailable(purpose: String) -> Bool {
    guard purpose == Self.purposeApp || purpose == Self.purposeData else { return false }
    let ctx = LAContext()
    var error: NSError?
    return ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
  }

  func enrollDataUnlock(walletId: String, password: String, completion: @escaping ([String: Any]) -> Void) {
    guard beginPrompt() else { completion(["error": "busy"]); return }
    guard isAvailable(purpose: Self.purposeData) else { endPrompt(); completion(["error": "unsupported"]); return }
    let credentialId = randomCredentialId(prefix: "data-")
    storeProtected(credentialId: credentialId, plaintext: password) { [weak self] ok in
      guard let self else { return }
      if ok {
        self.prefs.set(key: self.metaKey(credentialId), value: walletId)
        self.endPrompt()
        completion(["credentialId": credentialId])
      } else {
        self.removeCredential(credentialId: credentialId)
        self.endPrompt()
        completion(["error": "cancelled"])
      }
    }
  }

  func unlockDataUnlock(walletId: String, credentialId: String, completion: @escaping ([String: Any]) -> Void) {
    guard beginPrompt() else { completion(["error": "busy"]); return }
    guard prefs.get(key: metaKey(credentialId)) == walletId else {
      endPrompt(); completion(["error": "failed"]); return
    }
    loadProtected(credentialId: credentialId) { [weak self] plaintext in
      self?.endPrompt()
      if let plaintext { completion(["password": plaintext]) }
      else { completion(["error": "cancelled"]) }
    }
  }

  func enrollAppAccess(passcode: String, completion: @escaping ([String: Any]) -> Void) {
    guard beginPrompt() else { completion(["error": "busy"]); return }
    guard isAvailable(purpose: Self.purposeApp) else { endPrompt(); completion(["error": "unsupported"]); return }
    let credentialId = randomCredentialId(prefix: "app-")
    storeProtected(credentialId: credentialId, plaintext: passcode) { [weak self] ok in
      guard let self else { return }
      if ok {
        self.prefs.set(key: "gnh.appAccessCredentialId", value: credentialId)
        self.endPrompt()
        completion(["credentialId": credentialId])
      } else {
        self.removeCredential(credentialId: credentialId)
        self.endPrompt()
        completion(["error": "cancelled"])
      }
    }
  }

  func unlockAppAccess(completion: @escaping ([String: Any]) -> Void) {
    guard beginPrompt() else { completion(["error": "busy"]); return }
    guard let credentialId = prefs.get(key: "gnh.appAccessCredentialId") else {
      endPrompt(); completion(["error": "failed"]); return
    }
    loadProtected(credentialId: credentialId) { [weak self] _ in
      self?.endPrompt()
      completion(["ok": true])
    }
  }

  func removeCredential(credentialId: String) {
    deleteKeychainItem(account: credentialId)
    prefs.remove(key: metaKey(credentialId))
    if prefs.get(key: "gnh.appAccessCredentialId") == credentialId {
      prefs.remove(key: "gnh.appAccessCredentialId")
    }
  }

  private func beginPrompt() -> Bool {
    if inFlight { return false }
    inFlight = true
    return true
  }

  private func endPrompt() { inFlight = false }

  private func storeProtected(credentialId: String, plaintext: String, completion: @escaping (Bool) -> Void) {
    let ctx = LAContext()
    ctx.localizedReason = "Confirm biometrics"
    var error: NSError?
    guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
      completion(false); return
    }
    ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Enable biometric unlock") { ok, _ in
      guard ok else { completion(false); return }
      let data = Data(plaintext.utf8)
      self.deleteKeychainItem(account: credentialId)
      var query = self.keychainQuery(account: credentialId)
      query[kSecValueData as String] = data
      let status = SecItemAdd(query as CFDictionary, nil)
      completion(status == errSecSuccess)
    }
  }

  private func loadProtected(credentialId: String, completion: @escaping (String?) -> Void) {
    let ctx = LAContext()
    var query = keychainQuery(account: credentialId)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    query[kSecUseAuthenticationContext as String] = ctx
    ctx.localizedReason = "Unlock with biometrics"
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    if status == errSecSuccess, let data = item as? Data, let text = String(data: data, encoding: .utf8) {
      completion(text)
    } else {
      completion(nil)
    }
  }

  private func keychainQuery(account: String) -> [String: Any] {
    var access: SecAccessControl?
    var error: Unmanaged<CFError>?
    access = SecAccessControlCreateWithFlags(
      nil,
      kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
      .biometryCurrentSet,
      &error,
    )
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keyService,
      kSecAttrAccount as String: account,
    ]
    if let access { query[kSecAttrAccessControl as String] = access }
    return query
  }

  private func deleteKeychainItem(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keyService,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }

  private func metaKey(_ credentialId: String) -> String { "meta_\(credentialId)" }

  private func randomCredentialId(prefix: String) -> String {
    prefix + UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(16)
  }
}
