# Design — Mobile app access and data unlock

## Context

See `proposal.md` and `docs/features/app-access-and-data-unlock.md`. Brainstorm:
`.forge/sessions/20260813T033842Z-app-access-and-data-unlock-8d6b02/brainstorm/`.

Today: Vite UI in Expo WebView; `window.gnhMobile` for P2P + file save;
`MockLocalSecurityAdapter` for app passcode; single `biometricEnabled` placeholder;
`autoLockTimeoutSec` UI unwired. Reference implementations:
`~/conceal-wallet-cordova` (BiometricUnlock.java) and
`~/conceal-next-wallet` (biometric-store, webauthn-crypto, platform-unlock).

**Operator decision:** native-only decrypt (Perplexity review) — intermediate
32-byte secrets never cross postMessage; iOS Swift in scope alongside Android Kotlin.

## Goals / Non-Goals

**Goals:**

- Two independent gates: app access (UI) vs data unlock (wallet mount)
- Native crypto on Android + iOS; enrollment metadata in native secure storage
- Hardened bridge: session generation, single in-flight prompt, locked-state reject
- Mobile-only code paths (`window.gnhMobile` gate); web/Electron untouched

**Non-Goals:**

- Web/Electron biometrics or auto-lock
- Cordova Model A (secret returned to JS at enroll)
- Exit / LEAVE ROOM / revoke changes
- WebAuthn PRF

## Decisions

### D1 — Native-only decrypt (not Cordova Model A)

**Choice:** Native modules own Keystore/Keychain keys and AES-GCM wrap of wallet
password. Bridge API:

| Call | Direction | Payload |
|------|-----------|---------|
| `biometric.isAvailable` | → native | `{ purpose: 'app' \| 'data' }` |
| `biometric.enrollDataUnlock` | → native | `{ walletId, password }` (after JS vault verify) |
| `biometric.unlockDataUnlock` | → native | `{ walletId, credentialId }` |
| `biometric.removeCredential` | → native | `{ credentialId }` |
| `biometric.enrollAppAccess` | → native | `{ passcode }` (after JS set/change) |
| `biometric.unlockAppAccess` | → native | — |
| `securePrefs.get/set/remove` | ↔ native | JSON blobs (enrollment envelope metadata) |

**Returns:** `credentialId` on enroll; `unlockDataUnlock` returns `{ password }`
only after biometric success (wallet password needed by existing JS runtime —
never the intermediate Keystore secret).

**Alternatives:** Port Cordova Model A verbatim (rejected — Perplexity blocker);
move entire wallet open native (rejected — scope).

**Reference:** Lift crypto/prompt flow from `BiometricUnlock.java`; restructure
call surface only.

### D2 — Android Kotlin (as needed)

**Choice:** Single `GnhBiometricModule.kt` + small `GnhSecurePrefs.kt`, invoked
from `App.tsx` WebView message handler (same pattern as `saveTextFile`).

- `BIOMETRIC_STRONG`, per-operation `BiometricPrompt` + `CryptoObject`
- `EncryptedSharedPreferences` for ciphertext blobs and enrollment index
- `KeyPermanentlyInvalidatedException` → delete alias + envelope; fail closed
- `FLAG_SECURE` on host activity while wallet/chat visible

**Alternatives:** Full Expo native module package (deferred — inline Kotlin first).

### D3 — iOS Swift (parallel)

**Choice:** `GnhBiometricModule.swift` using Keychain + `SecAccessControl`
(biometric / device passcode) + `LocalAuthentication`. Same JS contract as Android.
Requires iOS target in `native-wrapper` (Expo prebuild); `App.tsx` currently
Android-only — extend to load WebView on iOS when assets present.

**Feasibility:** Standard Keychain access-control pattern; no custom crypto.
If iOS WebView shell is not yet shippable, Swift module still lands with unit
tests; UI gate shows deterministic `unsupported` until iOS shell is enabled.

### D4 — Bridge hardening

**Choice:** Extend mobile-bridge-hardening rules:

- Monotonic `lockGeneration` on app-access lock; reject stale biometric callbacks
- Request/response `requestId` correlation; one in-flight biometric prompt
- Reject sensitive bridge calls while app-access locked
- Navigation remains `file:///android_asset/ui/` (and iOS equivalent)

### D5 — App access lock semantics

**Choice:** Lock is more than blur:

- `authStore.lock()` + overlay
- Gate wallet/chat store selectors and composer actions while locked
- Suppress outbound bridge commands except unlock/lifecycle
- Wallet runtime stays mounted; no `runtime.lock()`

**Alternatives:** WebView reload on lock (rejected — breaks in-memory chat state).

### D6 — Settings split

**Choice:** Replace `biometricEnabled` with `appAccessBiometricEnabled` and
`dataUnlockBiometricEnabled`. Migrate legacy true → `dataUnlockBiometricEnabled`.

### D7 — Sleep poll (mobile only)

**Choice:** Add `privacy.backgroundSleepSec` (default 600). Mobile branch in
`useWalletLiveSync` via `gnhMobile.onLifecycle`: stop poll when background idle
exceeds threshold; resume after foreground + app access pass. Web path unchanged.

### D8 — JS ports

**Choice:** Port `webauthn-crypto.ts` and `biometric-store.ts` from
conceal-next-wallet with:

- Storage adapter → native `securePrefs` on mobile
- `platform-unlock.ts` → native bridge (drop Cordova/WebAuthn paths for this change)
- Keys prefixed `gnh-biometric-enrollment`

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Wallet password crosses bridge once on unlock | Short-lived response; session generation binding; bundled-origin WebView only |
| App lock without unmount leaves RAM exposure | Gate UI + stores + bridge; FLAG_SECURE; document rooted-device limits |
| iOS shell lag behind Android | Swift module + tests land together; feature flag until iOS WebView ships |
| Lifted Cordova threading bugs | Treat Cordova as reference; RN thread confinement review |
| Sleep window misses revoke | Document in settings copy; matches feature doc acceptance |

## Migration Plan

- No user data migration from placeholders (nothing enrolled yet)
- Legacy `biometricEnabled` → `dataUnlockBiometricEnabled` on settings read
- Ship Android EAS first; iOS when shell + module green on device

## Open Questions

- Exact iOS WebView asset URI and prebuild timeline (does not block Android ship)
- Whether `FLAG_SECURE` applies during onboarding only or entire unlocked session
