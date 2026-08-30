# App access and data unlock

**Status:** In progress (mobile). Native Kotlin/Swift security modules, bridge
channels, data-unlock biometrics, and app-access lock wiring are implemented in
`native-wrapper/` + Vite UI. Web/Electron unchanged. **Native-only decrypt:**
Keystore/Keychain holds wallet password ciphertext; JS stores enrollment metadata
only via `securePrefs`.

Get NowHere separates **who may use the app shell** from **who may use wallet + chat
data**. Do not confuse this with chat protocol layers (L1 SmartMessage, L2 Noise, L1′
relay) — those names are reserved for transport/crypto in `docs/security/`.

**Host scope:** smartphone (Expo / `native-wrapper/`). Electron and browser dev are
out of scope for biometrics; web-dev may keep numeric passcode only until native
modules land.

## Terms

| Term | Meaning |
|---|---|
| **App access** | Gate on the UI after background, idle, or screen off. Blurs sensitive UI while the app is not in foreground. Does **not** unmount wallet/chat data. |
| **Data lock** | Wallet runtime unmounted — signing keys cleared from RAM. Chat (L1 / L1′ / L2) cannot run without mounted data. |
| **Data unlock** | Open the stored wallet (wallet encryption password or biometric shortcut). Mounts wallet **and** chat together. |

Wallet and chat share one lifecycle: there is no chat capability while data is locked.
See `docs/features/lite-wallet.md` and `docs/security/p2pchatprotocol.md`.

## Two independent settings

| Setting | User label | When it applies |
|---|---|---|
| App access biometrics | Unlock app with biometrics | Resume, idle auto-lock, screen off |
| Data unlock biometrics | Unlock data with biometrics | Whenever data was locked and user must open wallet |

Either toggle may be ON without the other (e.g. data biometric ON, app biometric OFF).

Each toggle has its own busy and error state in `SecuritySettingsScreen`. An enrollment
attempt on one toggle does not disable the other, and errors display below the
relevant toggle only.

Passcode remains the fallback for app access (“Use passcode instead”). Wallet
encryption password remains the fallback for data unlock when biometrics fail or are
disabled.

## App access

### Triggers

- App returns to foreground (resume)
- Idle longer than **Auto-lock** (`autoLockTimeoutSec` in Settings — UI exists; wiring
  is part of this work)
- Device screen off

### Normal background (not Exit, not killed)

- Show **blur** overlay (`blurInAppSwitcher` setting — reuse/extend for mobile).
- **Do not** data-lock. User resumes where they left off after app access succeeds.
- Wallet sync and L1 background poll continue per **Background poll** / **Sleep**
  below.

### Explicit Exit and app killed

- **Unchanged** — nav **Exit** runs `walletSessionExit` (soft-leave swarm, data lock,
  `/welcome`). App killed clears in-memory state; next launch treats data as locked.
- This document does **not** change Exit, LEAVE ROOM, or revoke queue behavior.

## Data lock and data unlock

### Data lock (unmount)

Occurs when:

- User confirms **Exit** (existing flow)
- OS kills the app (process death)
- Any existing path that calls `walletService.lockWallet()` / runtime `lock()`

### Data unlock (mount)

Required whenever the user must use wallet or chat after data lock:

- Cold start after Exit or kill
- Open stored wallet from welcome / landing
- Manual wallet lock toggle (if exposed)

**Model:** conceal-next-wallet **passkey / biometric shortcut** (Model A) — not
vault re-encryption under biometrics.

1. User proves wallet encryption password (verified against vault).
2. Platform generates or retrieves a biometric-gated secret (see **Native secure
   storage**).
3. Secret AES-GCM-encrypts the wallet password; enrollment metadata stored in secure
   storage (not WebView `localStorage` on device).
4. On data unlock, biometric assertion releases the secret → decrypt password →
   `openStoredWallet` / runtime unlock → chat hydrates with wallet.

Password always remains valid. Clearing enrollment on password change, wallet delete,
and panic wipe matches conceal-next-wallet rules.

### Delete wallet and stale biometric flags

**Delete wallet** (`deleteWalletData`) clears biometric enrollments **and** sets
`appAccessBiometricEnabled` and `dataUnlockBiometricEnabled` to false. Other settings
(theme, auto-lock, sleep, etc.) are kept. Full app reset still wipes `gnh.settings`.

**Cold-start self-heal:** if either biometric flag is on but the matching enrollment is
missing, reconcile clears that flag and skips App Lock so a stale toggle cannot force a
biometric gate with nothing enrolled.

Reference implementation: `conceal-next-wallet` (`lib/auth/platform-unlock.ts`,
`lib/auth/biometric-store.ts`, `lib/cordova/biometric-unlock.ts`).

## Native secure storage (smartphone)

On mobile, **data unlock enrollment MUST NOT live in WebView `localStorage`.**

| Platform | Store | Biometric gate |
|---|---|---|
| **Android** | Android Keystore + `BiometricPrompt` (`BIOMETRIC_STRONG`) | Per-use crypto authorization; handle `KeyPermanentlyInvalidatedException` when biometrics change |
| **iOS** | Keychain with SecAccessControl (biometric / device passcode) | Secret unavailable until LA succeeds — not a boolean UI check |

Implementation path:

- Expo native module (or thin config plugin) exposing enroll / unlock / remove with the
  same JS contract as `cordova-plugin-biometric-unlock` (32-byte secret,
  `credentialId`, base64url payloads).
- App access enrollment (if any app-level secret is persisted) uses the same native
  stores — never duplicate wallet password in prefs.

Web-dev / browser: passcode-only app access; data unlock stays password-based until
WebAuthn PRF is explicitly scoped (optional later — not required for first mobile
ship).

## Background poll and Sleep

While data is **mounted** and the app is backgrounded (app access locked or blur only):

| Mode | L1 / wallet poll cadence |
|---|---|
| **Foreground** | Existing `useWalletLiveSync` (≈2.5s catching up, ≈20s near tip) |
| **Background** | **30s** fixed interval (align with `docs/features/chat-relay.md`) |
| **Sleep** | After configurable idle-in-background duration (default **10 minutes**), stop background poll until user returns and passes app access |

**Sleep** is a new Settings value. While asleep, inbound L1 traffic (including peer
revoke) may not be processed until reopen — user accepts that window.

Sleep does **not** data-lock; it only reduces background work.

## Unlock flow (summary)

```text
Launch / resume
    │
    ├─ Data locked? (Exit, kill, never opened)
    │       ├─ App access required? → biometric / passcode
    │       └─ Data unlock required? → biometric shortcut OR wallet password
    │
    └─ Data mounted, app was backgrounded
            └─ App access only → biometric / passcode → resume UI (no re-open wallet)
```

App access success does not imply data unlock. Data unlock always mounts wallet and
chat together.

## Coding constraints

- Do not import `hyperswarm` in UI. Biometrics live in `native-wrapper/` bridge +
  thin adapters callable from `src/`.
- Do not change LEAVE ROOM, `leaveRoom`, Exit sequence, or revoke outbox in this
  feature.
- Do not use “layer 1 / layer 2” in app-access docs or UI copy — protocol L1/L2/L1′
  only.
- Update `docs/builds/expo-eas-android-build.md` follow-up when implementation
  ships.

## Related code (today)

| Area | Location |
|---|---|
| App passcode gate | `src/state/authStore.ts`, `src/screens/UnlockScreen.tsx`, `src/services/mobile/MobileLocalSecurityService.ts` |
| App access lock | `src/lib/mobile/AppAccessController.ts`, `src/hooks/useMobileAppAccess.ts` |
| Settings | `src/screens/settings/SecuritySettingsScreen.tsx` — `appAccessBiometricEnabled`, `dataUnlockBiometricEnabled`, `backgroundSleepSec` |
| Data unlock | `src/lib/auth/platform-unlock.ts`, `src/lib/mobile/gnh-biometric-unlock.ts` |
| Native bridge | `native-wrapper/docs/gnh-mobile-security-bridge.md`, `GnhBiometricModule` (Kotlin + Swift) |
| Data lock on Exit | `src/services/storage/walletSessionExit.ts` |
| Wallet runtime lock | `src/services/conceal/sync/runtime.ts` (`lock`, `disconnect`) |
| Background poll / sleep | `src/hooks/useWalletLiveSync.ts` |
| Onboarding biometric step | `src/screens/onboarding/CreateWalletScreen.tsx` |

## iOS background restart — biometric flags must survive

**Symptom (iOS only):** after leaving the app in background long enough for iOS to
terminate the WKWebView process (memory pressure), returning to the app shows both
biometric toggles set to OFF, forcing the user to re-authenticate with their password
and re-configure biometrics.

**Root cause:** `GnhSecurePrefs` previously stored Keychain items with
`kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`. When iOS terminates the WKWebView
and the native shell restarts it while the device screen is locked, the Keychain items
are inaccessible (`errSecInteractionNotAllowed`). `reconcileBiometricSettingsWithEnrollments`
ran, got null for both credential lookups, and treated "unreadable" as "missing" —
incorrectly clearing both flags.

**Why Android is unaffected:** `GnhSecurePrefs.kt` uses `EncryptedSharedPreferences`
backed by an AES-256-GCM master key from the Android Keystore. This key does not
require an active unlock session for reads — only "after first boot unlock" — so the
metadata is always readable after the device has been used once since reboot.

**Fix (two layers):**

1. **Native iOS — `GnhSecurePrefs.swift`**:
   - Changed accessibility from `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`
     to `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. Items are now readable
     whenever the device has been unlocked at least once since boot — even when the
     screen locks again.
   - Added `migrateKnownKeys()` (called from `GnhSecurityModule.init()`) to upgrade
     existing items via `SecItemUpdate` the first time the app runs with new code
     while the device is unlocked. Only the two stable metadata keys are migrated
     (`gnh.appAccessCredentialId`, `gnh-biometric-enrollment`).
   - Added `getDetailed()` that distinguishes `errSecItemNotFound` (key absent, not
     an error) from other Keychain errors (unavailable), allowing the module to
     `reject` the promise on genuine errors rather than resolving with nil.

2. **JS — `reconcileBiometricSettingsWithEnrollments`**:
   - The `catch` for `gnhSecurePrefsGet` and `hasBiometricEnrollmentStrict` now
     returns early from the whole function instead of falling through to clear the
     flag. A storage read error means "cannot confirm status" — never "enrollment
     missing".
   - `hasBiometricEnrollmentStrict` (new export from `biometric-store.ts`) reads
     the enrollment raw string directly via the storage adapter, propagating errors
     rather than swallowing them.

**Device verification checklist

Manual checks before store ship (Android first; iOS when WebView shell enabled):

- [ ] Create wallet → set passcode → optional data-unlock biometric enroll
- [ ] Cold start → open wallet with password or biometric
- [ ] Background app → app-access lock on return → passcode or app biometric
- [ ] Security settings: enable/disable app-access and data-unlock biometrics independently
- [ ] Change wallet password → data-unlock enrollment cleared
- [ ] Change app passcode → app-access biometric cleared
- [ ] Delete wallet / reset app → native credentials cleared
- [ ] Biometric enrollment invalidated after OS biometric change (re-enroll prompt)
- [ ] Both biometric toggles remain ON after app is backgrounded long enough for iOS to reclaim the WKWebView (simulate: background app, lock screen, wait 5+ minutes, foreground — toggles must still be ON)
- [ ] Background sleep: wallet poll pauses after `backgroundSleepSec`, resumes after unlock

Run automated bridge/unit tests: `npm test -- tests/mobile/ tests/auth/ tests/native-wrapper/`

## Non-goals

- Electron / desktop biometrics
- Re-encrypting wallet vault under biometrics only (device-bound vault mode)
- Splitting chat keys from wallet keys
- Changing Exit, LEAVE ROOM, or chat protocol

## Implementation checklist

- [x] Wire `autoLockTimeoutSec` → app access lock + blur (`AppAccessController`, `useMobileAppAccess`)
- [x] Native secure storage module (Android Keystore + iOS Swift Keychain)
- [x] Data-unlock enroll/unlock/remove (native-only decrypt)
- [x] Separate settings: app access biometrics vs data unlock biometrics (independent busy/error state, visual divider)
- [x] iOS Keychain accessibility fix — biometric flags survive long background / WKWebView restart
- [x] **Sleep** setting + background poll cutoff (`backgroundSleepSec`)
- [ ] Physical-device tests (enroll, unlock, biometric change invalidation, fallback passwords)
