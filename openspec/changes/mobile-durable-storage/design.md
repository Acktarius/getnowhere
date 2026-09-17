## Context

See proposal.md for motivation. `StorageAdapter` is synchronous and defaults
to `webStorageAdapter`. Mobile never calls `setActiveStorageAdapter`.
`gnh-secure-prefs` already stores biometrics and session keep-alive.
`settingsStore` and `isOnboarded()` read storage at module load, so adapter
install cannot wait for a React effect. minSdk is 29.

## Goals / Non-Goals

**Goals:**

- One JS adapter; `"wallet"` → encrypted file; other keys → `gnh.app:` prefs
- Boot hydrate before `App` import; fail closed; tri-state wallet presence
- Wallet workflows await durable native I/O; prefs may serial-flush
- Android Keystore AES-GCM envelope; no new `androidx.security.crypto`
- Deterministic wipe via adapter key index + serialized wallet mutex

**Non-Goals:**

- Async `StorageAdapter` rewrite
- Encrypted SQLite, backup/key-recovery, or a general crypto framework
- Encrypting prefs / rooms / chat in this change
- localStorage migration
- Implicit per-op biometric on the file key
- Replacing existing EncryptedSharedPreferences for small KV

## Decisions

### 1. Hydrated sync facade, not an async adapter rewrite

Keep `getItem`/`setItem` sync for reads. Boot awaits native hydrate into a
Map, then dynamically imports `App`.

**Alternative:** make `StorageAdapter` async — rejected (blast radius).

### 2. Wallet writes await; prefs may write-behind

All native ops share one serialized queue. `"wallet"` create/import/update/
delete awaits the native call; the Map updates only on success. Non-wallet
keys may update the Map and enqueue a serial flush with retained failures.

**Alternative:** enqueue wallet writes too — rejected (process kill after
UI success loses the wallet).

### 3. Split backends

| Logical key | Backend |
|---|---|
| `"wallet"` | `filesDir/gnh/wallet.v1.enc` (Android) / Application Support (iOS) |
| other adapter keys | `gnh-secure-prefs` as `gnh.app:${key}` |
| biometric / session | existing unprefixed secure prefs |

### 4. Adapter-owned key index, not Keychain enumeration

Index key `gnh.app:__keys:v1` updated in the same serialized op as set/remove.
Reset: read index → delete listed keys → delete index → remove wallet file.

**Alternative:** `getAll()` / Keychain listing — rejected as the primary
contract (iOS access-control and over-wipe risk).

### 5. Android Keystore AES-GCM, not EncryptedFile

minSdk 29: require AES-256 GCM. Alias `gnh-wallet-file-v1`, non-exportable,
no user-auth. Envelope:

```
GNHW | 0x01 | 12 | 12-byte nonce | ciphertext||tag
```

AAD `getnowhere:wallet-file:v1`. Atomic write: encrypt in memory → temp in
the **same** directory → flush → rename → best-effort dir fsync. Single-writer
mutex on read/write/remove.

**Alternative:** `EncryptedFile` — rejected (deprecated). Plaintext file —
rejected (at-rest exposure).

### 6. Tri-state wallet presence

```ts
type WalletStorageState =
  | { status: "present" }
  | { status: "absent" }
  | {
      status: "unreadable";
      reason:
        | "bridge-unavailable"
        | "io-error"
        | "invalid-envelope"
        | "auth-failed"
        | "key-unavailable";
    };
```

`exists == false` after success → `absent`. AEAD/I/O/bridge failure →
`unreadable`. Boolean `hasStoredWallet()` is true only for `present`.
Startup shows a recovery screen for `unreadable` (no raw traces).

### 7. iOS parity with an Android-first floor

Same JS/bridge/envelope. Implement iOS file crypto if it stays small
(Keychain key + Application Support + file protection). If it balloons,
keep the contract and `TODO(ios-wallet-file)`. Android MUST NOT ship
plaintext.

### 8. Bridge surface

- Prefs: existing get/set/remove; index is a normal pref value
- `gnhMobile.walletFile`: `read` / `write` / `remove` / `exists`
  - `read` never returns `null` for a file that exists but failed AEAD
  - `exists` is boolean only when the check itself succeeded

### 9. Exclude wallet material from OS backup

Cloud backup/key-recovery stays out of scope. Android Auto Backup and
device-to-device transfer can still copy `filesDir` and
EncryptedSharedPreferences unless excluded. Restored ciphertext without the
original Keystore key would show as `unreadable`.

**Decision:** fail closed.

- Android: disable Auto Backup for the app (`allowBackup=false`) **and**
  ship `dataExtractionRules` / `fullBackupContent` that exclude
  `files/gnh/` and the `gnh_secure_prefs` store so a later plugin cannot
  re-enable transfer of those paths by accident.
- iOS: set `NSURLIsExcludedFromBackupKey` on the wallet file (and the
  `gnh/` directory).
- Missing Keystore key + leftover file → `unreadable` (`key-unavailable`).

**Alternative:** allow backup of ciphertext only — rejected (restore
without key is a false recovery path).

### 10. Wipe is logical, not forensic

Delete/reset removes: canonical `wallet.v1.enc`, same-directory temps, and
adapter-owned `gnh.app:` keys (plus the Keystore alias on reset). Wallet-file
presence after a successful `exists` check is the source of truth; prefs
are metadata.

Wipe does **not** claim to erase: OS snapshots, already-uploaded backups,
WebView leftovers, crash logs, or in-memory plaintext from the current
process. Docs and UI must not say “secure erase” or “unrecoverable from
the device.”

**Alternative:** full-disk / crypto-shred marketing — rejected (untrue).

## Risks / Trade-offs

- [Prefs flush lost on kill] → Accept for non-wallet KV; surface failures;
  bounded flush on background. Wallet never uses write-behind.
- [Unreadable wallet blocks Welcome] → Intentional; preserves the file.
- [iOS file crypto slips] → Android floor is encrypted; iOS TODO if oversized.
- [Existing EncryptedSharedPreferences stays deprecated] → Out of scope;
  do not expand it.
- [Device process-death not in Vite e2e] → Unit/integration prove adapter
  contracts; operator Android smoke remains the durability proof.
- [OS backup copies ciphertext] → Exclude file + secure-prefs; treat
  restore-without-key as `unreadable`.
- [Wipe over-promise] → Document logical delete only.

## Migration Plan

No migration. First mobile install of this change starts from an empty
native store. Rollback is “do not ship the native adapter”; leftover
`gnh.app:` keys and `wallet.v1.enc` are unused by older builds.

## Open Questions

None that change specs or task breakdown. iOS file-layer size is checked
during implement: ship it if small, otherwise leave the JS contract and a
platform TODO.
