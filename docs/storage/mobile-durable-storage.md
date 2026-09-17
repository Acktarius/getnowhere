# Mobile durable storage

WebView `localStorage` is not durable on some Android devices after process
death or WebView recreation. Mobile therefore installs a native
`StorageAdapter` before the UI hydrates. Web and desktop keep using
`webStorageAdapter`. There is no migration from WebView storage.

## Split

| Data | Backend |
|---|---|
| `"wallet"` blob | App-private encrypted file (`filesDir/gnh/wallet.v1.enc`) |
| App KV (`gnh.settings`, onboarding, catalogs) | `gnh-secure-prefs` as `gnh.app:${key}` plus index `gnh.app:__keys:v1` |
| Biometric / session keep-alive | Existing unprefixed secure prefs |

Wallet create/import/update/delete awaits native file I/O via
`persistWallet` / `removeWallet`. Ordinary prefs may flush after the Map
updates.

## Boot

`main.tsx` awaits `installMobileNativeStorageAdapter()` before importing
`App`. Missing bridge is a fatal screen. A file that exists but fails AEAD
or Keystore is `unreadable`, not Welcome.

## Wipe

Delete wallet / reset is **logical** app-level delete (canonical file, temps,
adapter index). It is not forensic erase and does not remove OS snapshots or
backups that already left the device. Biometric keys stay on their own
lifecycle.

## Backup

Android Auto Backup and device transfer are disabled for the app, with
exclude rules for `gnh/` and `gnh_secure_prefs`. iOS marks the wallet file
excluded from iCloud backup. User **Download wallet .json** is unchanged.

## Envelope

`GNHW` + version `0x01` + nonce length `12` + 12-byte nonce + AES-GCM
ciphertext‖tag. AAD `getnowhere:wallet-file:v1`. Android Keystore AES-256,
no `EncryptedFile`. Encrypt uses the Keystore-generated IV
(`randomizedEncryptionRequired`); a caller-provided nonce is rejected.

Android builds copy `native-wrapper/android-native/GnhSecurity/` into the
generated `android/` tree on every Gradle `preBuild`. There is no WebView
`localStorage` migration and no on-disk envelope upgrade path in v1.

## Logging

Success writes are silent. Failures may log `GnhWalletFile` with `reason` or
`ExceptionClass: message`, and JS may warn `[GnhWalletFile] write <ErrorName> <chars>`.
Never log wallet JSON, seed, or spend keys. `GnhSecurityModule` has no `Log.`
calls. Conceal SDK lines such as password *length* or SecureStore size warnings
are a different store, not this file.

## Verify (Android)

After a clean install, import `.json` and confirm logcat has no `GnhWalletFile`
error. Kill and reopen: wallet still present (`sessionAlive: true` on
foreground is consistent with a live session, not proof by itself — the wallet
must still open). iOS native write exists; it has not been device-proven in
this change.

```bash
adb logcat -c && adb logcat -s GnhWalletFile:E ReactNativeJS:I AndroidRuntime:E
```
