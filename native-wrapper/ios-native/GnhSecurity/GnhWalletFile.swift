import CryptoKit
import Foundation
import Security

/** App-private AES-GCM wallet file. @see docs/storage/mobile-durable-storage.md */
final class GnhWalletFile {
  private let lock = NSLock()
  private let directory: URL
  private let dest: URL
  private let tmp: URL

  init(directory: URL? = nil) {
    let base = directory ?? GnhWalletFile.defaultDirectory()
    self.directory = base
    self.dest = base.appendingPathComponent("wallet.v1.enc")
    self.tmp = base.appendingPathComponent("wallet.v1.enc.tmp")
  }

  enum ExistsResult { case ok(Bool); case err(String) }
  enum ReadResult { case ok(String); case missing; case err(String) }

  func exists() -> ExistsResult {
    lock.lock()
    defer { lock.unlock() }
    cleanupStaleTempIfSafe()
    return .ok(FileManager.default.fileExists(atPath: dest.path))
  }

  func read() -> ReadResult {
    lock.lock()
    defer { lock.unlock() }
    cleanupStaleTempIfSafe()
    guard FileManager.default.fileExists(atPath: dest.path) else { return .missing }
    do {
      let data = try Data(contentsOf: dest)
      let plain = try decrypt(data)
      guard let text = String(data: plain, encoding: .utf8) else { return .err("invalid-envelope") }
      return .ok(text)
    } catch let error as WalletFileError {
      return .err(error.reason)
    } catch {
      return .err("io-error")
    }
  }

  func write(_ plaintext: String) throws {
    lock.lock()
    defer { lock.unlock() }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try excludeFromBackup(directory)
    let envelope = try encrypt(Data(plaintext.utf8))
    try envelope.write(to: tmp, options: .atomic)
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
    try FileManager.default.moveItem(at: tmp, to: dest)
    try excludeFromBackup(dest)
  }

  func remove() throws {
    lock.lock()
    defer { lock.unlock() }
    if FileManager.default.fileExists(atPath: tmp.path) {
      try FileManager.default.removeItem(at: tmp)
    }
    if FileManager.default.fileExists(atPath: dest.path) {
      try FileManager.default.removeItem(at: dest)
    }
  }

  private func cleanupStaleTempIfSafe() {
    guard FileManager.default.fileExists(atPath: tmp.path),
          FileManager.default.fileExists(atPath: dest.path),
          let data = try? Data(contentsOf: dest),
          (try? decrypt(data)) != nil else { return }
    try? FileManager.default.removeItem(at: tmp)
  }

  private static func defaultDirectory() -> URL {
    let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return appSupport.appendingPathComponent("gnh", isDirectory: true)
  }

  private func excludeFromBackup(_ url: URL) throws {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var mutable = url
    try mutable.setResourceValues(values)
  }

  private struct WalletFileError: Error { let reason: String }

  private static let aad = Data("getnowhere:wallet-file:v1".utf8)
  private static let magic = Data([0x47, 0x4E, 0x48, 0x57])

  private func encrypt(_ plaintext: Data) throws -> Data {
    let key = try Self.getOrCreateKey()
    let nonce = AES.GCM.Nonce()
    let sealed = try AES.GCM.seal(plaintext, using: key, nonce: nonce, authenticating: Self.aad)
    let nonceBytes = Data(nonce)
    let combined = sealed.ciphertext + sealed.tag
    var out = Data()
    out.append(Self.magic)
    out.append(0x01)
    out.append(12)
    out.append(nonceBytes)
    out.append(combined)
    return out
  }

  private func decrypt(_ envelope: Data) throws -> Data {
    guard envelope.count >= 6 + 12 + 16 else { throw WalletFileError(reason: "invalid-envelope") }
    guard envelope.prefix(4) == Self.magic, envelope[4] == 0x01, envelope[5] == 12 else {
      throw WalletFileError(reason: "invalid-envelope")
    }
    let nonce = envelope.subdata(in: 6..<18)
    let rest = envelope.subdata(in: 18..<envelope.count)
    guard rest.count >= 16 else { throw WalletFileError(reason: "invalid-envelope") }
    let tag = rest.suffix(16)
    let ciphertext = rest.dropLast(16)
    do {
      let box = try AES.GCM.SealedBox(
        nonce: AES.GCM.Nonce(data: nonce),
        ciphertext: ciphertext,
        tag: tag,
      )
      return try AES.GCM.open(box, using: Self.getOrCreateKey(), authenticating: Self.aad)
    } catch {
      throw WalletFileError(reason: "auth-failed")
    }
  }

  private static let keychainService = "im.getnowhere.app.gnh.wallet-file"
  private static let keychainAccount = "gnh-wallet-file-v1"

  private static func getOrCreateKey() throws -> SymmetricKey {
    if let existing = loadKey() { return existing }
    let key = SymmetricKey(size: .bits256)
    saveKey(key)
    return key
  }

  private static func loadKey() -> SymmetricKey? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let data = item as? Data else { return nil }
    return SymmetricKey(data: data)
  }

  private static func saveKey(_ key: SymmetricKey) {
    let data = key.withUnsafeBytes { Data($0) }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    SecItemDelete(query as CFDictionary)
    SecItemAdd(query as CFDictionary, nil)
  }
}
