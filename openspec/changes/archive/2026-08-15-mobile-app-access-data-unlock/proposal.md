# Mobile app access and data unlock

## Why

Get NowHere on smartphone needs two independent security gates: **app access**
(blur/lock the UI without unmounting wallet data) and **data unlock** (open the
wallet with password or biometric shortcut). Settings placeholders exist; no
native biometrics, auto-lock wiring, or secure enrollment storage are implemented.
Mobile EAS builds cannot ship without platform-backed unlock on Android and iOS.

## What Changes

- **Native-only biometric crypto** on Android (Kotlin) and iOS (Swift): Keystore /
  Keychain hold keys; **no raw unlock secrets cross the WebView bridge**.
- Extend `window.gnhMobile` with biometric + lifecycle + secure-prefs channels
  (hardened origin/session rules per mobile-bridge-hardening patterns).
- **Data unlock**: enroll after wallet-password verify; biometric unlock returns
  wallet password only after successful native prompt (not intermediate secrets).
- **App access**: native lifecycle events, auto-lock idle timer, blur overlay,
  app passcode in native secure storage; lock gates wallet/chat reads without
  runtime `lock()`.
- Split `biometricEnabled` into `appAccessBiometricEnabled` and
  `dataUnlockBiometricEnabled`.
- **Sleep** setting stops background wallet poll after idle-in-background timeout.
- Update feature and Android build docs when shipped.

## Capabilities

### New Capabilities

- `mobile-app-access`: App-level lock/blur on resume, idle, screen-off; native
  app passcode storage; optional app-access biometrics; mobile-only lifecycle bridge.
- `mobile-data-unlock`: Native enroll/unlock/remove for wallet password shortcut;
  enrollment metadata in native secure storage; clear on password change / delete /
  invalidation; Android + iOS.

### Modified Capabilities

- `app-data-lifecycle`: Wallet delete and panic wipe MUST clear native biometric
  enrollments and app-access credentials on mobile hosts.

## Impact

- `native-wrapper/` — Kotlin biometric module, Swift Keychain module, bridge router,
  `App.tsx` lifecycle + `FLAG_SECURE`
- `native-wrapper/src/injectMobileBridge.ts` — new gnhMobile APIs
- `src/lib/auth/` — port/adapt conceal-next-wallet crypto + store (native storage adapter)
- `src/lib/mobile/` — gnhMobile biometric client
- `src/state/authStore.ts`, `src/state/settingsStore.ts`, `UnlockScreen`, Security settings
- `src/hooks/useWalletLiveSync.ts` — mobile sleep branch only
- `tests/native-wrapper/`, `tests/auth/`, `tests/mobile/`
- `docs/features/app-access-and-data-unlock.md`, `docs/builds/expo-eas-android-build.md`

## Non-goals

- Web-dev and Electron passcode / auto-lock / biometrics (unchanged mocks)
- WebAuthn PRF path
- Re-encrypting wallet vault under biometrics only
- Changes to Exit, LEAVE ROOM, or revoke outbox
- Splitting chat keys from wallet keys
