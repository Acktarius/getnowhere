# mobile-app-access Delta

## REMOVED Requirements

### Requirement: App passcode stored in native secure storage on mobile

## MODIFIED Requirements

### Requirement: App access triggers on mobile lifecycle

On mobile hosts with `appAccessBiometricEnabled`, app access lock SHALL trigger on:
idle exceeding `autoLockTimeoutSec` while foreground, and foreground return after background duration ≥ `autoLockTimeoutSec`. It SHALL NOT lock immediately on background when disabled.

#### Scenario: App bio off — no lock on background

- **GIVEN** `appAccessBiometricEnabled` is false
- **WHEN** the app backgrounds and returns
- **THEN** no app lock screen is shown

#### Scenario: Timed background lock

- **GIVEN** `appAccessBiometricEnabled` is true and auto-lock is 60s
- **WHEN** the app was backgrounded for 120s and returns
- **THEN** App lock screen requires biometric before UI is usable

### Requirement: Independent app-access biometric setting

#### Scenario: App lock screen

- **GIVEN** app access is locked
- **WHEN** the operator is shown the gate
- **THEN** only biometric retry is offered (no passcode field)
