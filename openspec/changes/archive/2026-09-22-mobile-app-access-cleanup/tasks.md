# Tasks

## 1. Remove passcode + background sleep

- [x] 1.1 Delete LocalSecurityService stack and passcode onboarding steps
- [x] 1.2 Remove backgroundSleepSec from settings and useWalletLiveSync

## 2. AppAccessController + gate

- [x] 2.1 Timed background lock; gated by appAccessBiometricEnabled
- [x] 2.2 AppLockScreen + App.tsx gate + blocking blur

## 3. Settings + Welcome

- [x] 3.1 SecuritySettings cleanup (no wallet link; direct app bio enroll)
- [x] 3.2 Welcome cold-start routing (app lock before welcome when bio on)

## 4. Tests

- [x] 4.1 Update mobile app-access tests; run npm test tests/mobile/

## 5. Follow-up hardening (optional, pre-existing gap)

- [ ] 5.1 Defense-in-depth on manual wallet lock: clear history from UI state when keys
  are dropped — must clear `snapshot.transactions` in ConcealWalletService, not just
  zustand. Gap existed before this change.
