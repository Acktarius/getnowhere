## Why

On old Android, process death or WebView recreation wipes WebView
`localStorage`. Mobile never installs a native `StorageAdapter`, so the
encrypted wallet blob and app preferences vanish and Welcome resets. Native
secure prefs already hold biometrics and session keep-alive, but not the
durable wallet or general app KV. The project is still in testing, so losing
current WebView test data is acceptable; shipping a plaintext app-private
wallet file would fix durability while leaving the most trusted secret
unencrypted at rest.

## What Changes

- Install a mobile-only native `StorageAdapter` at boot, before React or
  stores hydrate, via `setActiveStorageAdapter(...)`.
- Persist ordinary app KV (`gnh.settings`, onboarding, contacts/rooms
  catalogs, and other `getStorage()` keys) in existing `gnh-secure-prefs`
  under `gnh.app:`, with an adapter-owned key index for wipe.
- Persist the `"wallet"` blob in an app-private encrypted file (Keystore
  AES-GCM on Android; same JS contract on iOS). Wallet create/import/update/
  delete awaits durable native completion before reporting success.
- Distinguish wallet `present` / `absent` / `unreadable`. Do not treat
  decrypt or I/O failure as “no wallet.”
- Delete wallet / reset app must clear the encrypted wallet file, temps,
  and adapter-owned prefs (not biometric or session keys). Wipe is logical
  app-level delete, not forensic erase.
- Exclude the wallet file and adapter secure-prefs from Android Auto Backup
  / device transfer and from iOS iCloud backup. Restore-without-key is
  `unreadable`, not a recovery path.
- Web and desktop stay on `webStorageAdapter`. No localStorage fallback, no
  dual-write, no migration from WebView storage.

## Capabilities

### New Capabilities

- `mobile-durable-storage`: mobile-only native persistence for the wallet
  file and app KV, boot order, tri-state wallet presence, Keystore AES-GCM
  envelope, fail-closed hydration, and adapter-owned wipe index.

### Modified Capabilities

- `app-data-lifecycle`: Delete wallet and Reset app data MUST clear mobile
  durable wallet file and adapter-owned `gnh.app:` keys through
  `getStorage()`, awaiting native completion, without wiping biometric or
  session keep-alive keys via the adapter index.

## Impact

- `src/main.tsx` async bootstrap; `src/services/storage/` adapter + lifecycle
- `hasStoredWallet()` / wallet create-import-delete await paths
- Native `GnhSecurity` + `gnh-wallet-file` bridge; Android Keystore file
  layer (minSdk 29, AES-256 GCM). No new `androidx.security.crypto`.
- `docs/storage/mobile-durable-storage.md` and pointers from encryption /
  web-vs-wrapper docs
- Tests: routing, persist/replace, await-before-success, AEAD fail-closed,
  wipe, boot-before-wallet-check, web adapter unchanged
- Web/desktop and Conceal wallet blob format unchanged
