# Tasks — Mobile app access and data unlock

## 0. Bridge contract + state machine

- [x] 0.1 Document gnhMobile biometric/securePrefs/lifecycle message schemas and lock-generation rules in `native-wrapper/` (reference mobile-bridge-hardening)
- [x] 0.2 Add `AppAccessController` (mobile-only): lock generation, idle timer, lifecycle subscription, locked-state gate helper

## 1. Android native (Kotlin)

- [x] 1.1 Lift `BiometricUnlock` crypto/prompt logic into `GnhBiometricModule.kt` (native-only decrypt — no secret export)
- [x] 1.2 Add `GnhSecurePrefs.kt` (EncryptedSharedPreferences get/set/remove)
- [x] 1.3 Wire WebView message handler in `App.tsx`; apply `FLAG_SECURE` while sensitive UI visible
- [x] 1.4 Unit/instrumentation tests for enroll/unlock/remove/invalidation (Android)

## 2. iOS native (Swift)

- [x] 2.1 Add `GnhBiometricModule.swift` (Keychain SecAccessControl + LocalAuthentication; same JS contract)
- [x] 2.2 Add `GnhSecurePrefs.swift`; wire WebView handler when iOS shell enabled
- [x] 2.3 XCTest or bridge-level tests for enroll/unlock/remove/unsupported paths

## 3. gnhMobile bridge (JS injection)

- [x] 3.1 Extend `injectMobileBridge.ts`: biometric, securePrefs, lifecycle channels + requestId callbacks
- [x] 3.2 Add `src/lib/mobile/gnh-biometric-unlock.ts` client (promisify postMessage)
- [x] 3.3 Extend `tests/native-wrapper/inject-mobile-bridge.test.ts` for new channels

## 4. Data unlock core (JS)

- [x] 4.1 Port `webauthn-crypto.ts` and `biometric-store.ts` with native securePrefs adapter
- [x] 4.2 Add `platform-unlock.ts` (gnhMobile native path only for this change)
- [x] 4.3 Unit tests: store migration, native client mocks, encrypt/decrypt round-trip

## 5. Data unlock UI + settings

- [x] 5.1 Split settings: `appAccessBiometricEnabled`, `dataUnlockBiometricEnabled`; migrate legacy toggle
- [x] 5.2 Wire Welcome/cold-start data unlock (password + biometric button)
- [x] 5.3 Wire `CreateWalletScreen` biometric step + Security settings enroll/remove
- [x] 5.4 Clear enrollment hooks: password change, wallet delete, reset (mobile native cleanup)

## 6. App access

- [x] 6.1 Add `MobileLocalSecurityService` (native passcode; mobile-only)
- [x] 6.2 Native lifecycle → bridge in Expo shell; wire auto-lock + blur overlay
- [x] 6.3 `UnlockScreen` variants (app-access vs data-unlock); gate wallet/chat while locked
- [x] 6.4 App-access biometric enroll/unlock (separate credential namespace)

## 7. Sleep + background poll (mobile only)

- [x] 7.1 Add `privacy.backgroundSleepSec` to settings (default 600)
- [x] 7.2 Mobile branch in `useWalletLiveSync`: sleep stops poll; resume after app access
- [x] 7.3 Hook test for sleep timer + lifecycle integration

## 8. Docs + verify

- [x] 8.1 Update `docs/features/app-access-and-data-unlock.md` status + native-only decrypt note
- [x] 8.2 Update `docs/builds/expo-eas-android-build.md` follow-up; note iOS Swift module
- [x] 8.3 Device manual checklist (Android + iOS when shell ready); `forge e2e run`
