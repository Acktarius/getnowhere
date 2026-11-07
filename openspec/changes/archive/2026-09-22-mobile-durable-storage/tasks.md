## 1. Mobile adapter (JS)

- [x] 1.1 Add failing tests for key routing (`"wallet"` vs `gnh.app:`), adapter key index `gnh.app:__keys:v1`, prefs round-trip, and web adapter unchanged
- [x] 1.2 Add failing tests that wallet write/remove await native success before Map/success, failed write does not mark present, and wipe/reset uses the index without touching biometric/session keys
- [x] 1.3 Add failing tests for tri-state wallet presence: `absent` only after successful `exists == false`; AEAD/I/O/bridge → `unreadable`; boolean `hasStoredWallet` true only for `present`
- [x] 1.4 Implement `mobileNativeStorageAdapter` plus namespace/index helpers until 1.1–1.3 pass (mocked native backends)

## 2. Boot order and fail-closed hydrate

- [x] 2.1 Add a failing smoke test that adapter install runs before `hasStoredWallet` / settings reads, and missing bridge is fatal (no localStorage fallback)
- [x] 2.2 Change `main.tsx` to await `installMobileNativeStorageAdapter()` before dynamically importing `App`; expose `isMobileNativeStorageReady()`; add a controlled fatal/unreadable path until 2.1 passes

## 3. Android encrypted wallet file

- [x] 3.1 Add failing JVM tests for envelope parse, fresh nonce per write, AAD `getnowhere:wallet-file:v1`, tamper/auth-fail (no partial plaintext, file left intact), and atomic same-directory replace
- [x] 3.2 Implement Keystore AES-256-GCM file layer (`AES/GCM/NoPadding`, alias `gnh-wallet-file-v1`, no user-auth, no `EncryptedFile`) with single-writer mutex until 3.1 passes
- [x] 3.3 Wire RN `GnhSecurity` wallet-file read/write/remove/exists; `exists` is boolean only on success; `read` never returns null for a failed AEAD of an existing file
- [x] 3.4 Exclude `files/gnh/` and `gnh_secure_prefs` from Android Auto Backup and device transfer (`allowBackup=false` plus extraction/backup rules); mark the iOS wallet file excluded from backup; verify a missing Keystore key with a leftover file is `unreadable`

## 4. Bridge and host injection

- [x] 4.1 Add `gnhMobile.walletFile` types, injection, and WebView router tests; never log wallet bytes, keys, or nonces
- [x] 4.2 Implement iOS wallet-file methods to the same JS contract if the layer stays small; otherwise leave the contract plus `TODO(ios-wallet-file)` and verify Android does not persist plaintext

## 5. Wipe and wallet workflows

- [x] 5.1 Make create/import/update/delete wallet paths await durable `"wallet"` completion; verify delete/reset tests clear the file, same-dir temps, and index and cannot race a late write; wipe docs/comments say logical delete only
- [x] 5.2 Keep `appDataLifecycle` on `getStorage()`; confirm biometric wipe still uses the existing biometric lifecycle only

## 6. Docs

- [x] 6.1 Add `docs/storage/mobile-durable-storage.md` (why localStorage fails, split, boot, tri-state, backup exclusion, logical wipe, no migration) and index it from `docs/README.md`, `docs/security/encryption.md`, and `docs/architecture/web-vs-wrapper.md`

## 7. Product loop

- [x] 7.1 Author `e2e.json` steps that run the adapter, boot-order, wipe, and envelope tests plus `npm run types`; `forge e2e run` green
