# mobile-data-unlock Specification

## Purpose

Mobile hosts SHALL allow wallet data unlock via native biometric shortcut after
wallet-password verification, with cryptographic operations confined to native
code and enrollment metadata stored outside WebView storage.

## Requirements

### Requirement: Native-only biometric crypto for data unlock

On mobile hosts, data-unlock enrollment and authentication SHALL perform
Keystore/Keychain cryptographic operations in native code. Intermediate unlock
secrets (e.g. 32-byte biometric key material) MUST NOT be returned to the
WebView JavaScript context.

#### Scenario: Enroll after password verify

- **GIVEN** the operator has verified the wallet encryption password against the vault
- **WHEN** data-unlock biometric enrollment succeeds on a supported device
- **THEN** native code stores biometric-gated ciphertext and returns only a credential identifier to JS
- **AND** no raw Keystore secret is exposed to the WebView

#### Scenario: Unlock returns password only after biometric success

- **GIVEN** a valid data-unlock enrollment exists and biometrics succeed
- **WHEN** the operator unlocks with biometric shortcut
- **THEN** native code returns the wallet password to JS for `openStoredWallet`
- **AND** unlock fails closed when biometric authentication is cancelled or unavailable

### Requirement: Enrollment metadata in native secure storage

On mobile hosts, data-unlock enrollment envelopes (credential ids, encrypted
password metadata, wallet binding) SHALL be stored via native secure preferences
and MUST NOT be stored in WebView `localStorage`.

#### Scenario: Enrollment persistence

- **GIVEN** data-unlock enrollment completed on mobile
- **WHEN** the app restarts
- **THEN** enrollment is readable from native secure storage
- **AND** WebView localStorage does not contain enrollment ciphertext

### Requirement: Password fallback always available

Data unlock SHALL always allow wallet encryption password entry when biometrics
fail, are disabled, or enrollment is invalid.

#### Scenario: Biometric cancelled

- **GIVEN** data is locked and enrollment exists
- **WHEN** the operator cancels the biometric prompt
- **THEN** password entry remains available
- **AND** wallet data is not mounted until password or successful biometric unlock

### Requirement: Clear enrollment on wallet lifecycle events

The system SHALL remove native data-unlock enrollment when: wallet password
changes, wallet is deleted, a different wallet is opened, user disables
data-unlock biometrics, or native reports biometric key invalidation.

#### Scenario: Password change clears enrollment

- **GIVEN** data-unlock biometric is enrolled
- **WHEN** the wallet encryption password is changed successfully
- **THEN** native enrollment and secure-prefs metadata are cleared
- **AND** the operator must re-enroll to use biometric data unlock again

#### Scenario: Biometric invalidation

- **GIVEN** enrolled biometrics are invalidated by the OS (e.g. new fingerprint)
- **WHEN** unlock is attempted
- **THEN** enrollment is cleared
- **AND** password unlock is required before re-enrollment

### Requirement: Independent data-unlock biometric setting

The system SHALL expose `dataUnlockBiometricEnabled` separate from app-access
biometrics. Legacy `biometricEnabled` true SHALL migrate to
`dataUnlockBiometricEnabled` on first read.

#### Scenario: Legacy setting migration

- **GIVEN** stored settings contain `biometricEnabled: true` and no new keys
- **WHEN** settings are loaded
- **THEN** `dataUnlockBiometricEnabled` is true
- **AND** `appAccessBiometricEnabled` defaults to false unless explicitly set

### Requirement: Android and iOS native implementations

Data-unlock biometrics SHALL be implemented on Android (Kotlin) and iOS (Swift)
with the same JS bridge contract. Unsupported hosts MUST fail closed with a
deterministic error (no insecure fallback storage).

#### Scenario: iOS Keychain path

- **GIVEN** the app runs on iOS with biometrics available
- **WHEN** the operator enrolls data-unlock biometric
- **THEN** Keychain access control gates the stored credential
- **AND** the same JS enroll/unlock/remove contract is used as on Android

#### Scenario: Unsupported device

- **GIVEN** the device reports biometrics unavailable
- **WHEN** enrollment is requested
- **THEN** the system returns an unsupported error
- **AND** no enrollment is written to WebView storage

### Requirement: Exit and LEAVE ROOM behavior unchanged

This capability MUST NOT alter Exit sequence, `walletSessionExit`, LEAVE ROOM,
or revoke outbox behavior defined elsewhere.

#### Scenario: Exit still data-locks

- **GIVEN** wallet is mounted and operator confirms Exit
- **WHEN** Exit completes
- **THEN** existing data-lock and navigation behavior runs unchanged
