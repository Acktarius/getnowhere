# Design: mobile-app-access-cleanup

## AppAccessController

- `setAppAccessLockEnabled(on)` — when off, no idle/background locks.
- Background/screenOff: record timestamp; lock on foreground only if elapsed ≥ `autoLockTimeoutSec`.
- Cold start: lock immediately when app bio enabled.

## Gates

- `App.tsx`: show `AppLockScreen` when mobile + app bio on + locked.
- Welcome Open wallet: password only (1+0) or password + biometric (1+1).

## Removed

- `LocalSecurityService`, `MobileLocalSecurityService`, passcode onboarding steps, `backgroundSleepSec`.
