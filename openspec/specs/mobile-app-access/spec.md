# mobile-app-access Specification

## Purpose

Mobile hosts SHALL gate the app shell (blur/lock UI) independently of wallet
mount state, using native lifecycle events and secure app-passcode storage.

## Requirements

### Requirement: App access lock does not unmount wallet data

On mobile hosts (`window.gnhMobile` present), app access lock SHALL call only
app-level lock state and MUST NOT invoke wallet runtime `lock()` or disconnect.

#### Scenario: Background resume with mounted wallet

- **GIVEN** wallet data is mounted and the app returns to foreground after background
- **WHEN** app access lock is required
- **THEN** the UI shows the app unlock gate (passcode and/or app biometric)
- **AND** wallet runtime remains mounted
- **AND** chat transport is not torn down by the app-access lock alone

### Requirement: App access triggers on mobile lifecycle

On mobile hosts, app access lock SHALL trigger on: return to foreground after
background, idle exceeding configured auto-lock timeout, and screen-off events
delivered from the native shell (not WebView visibility alone).

#### Scenario: Idle auto-lock

- **GIVEN** `autoLockTimeoutSec` is configured and user is inactive
- **WHEN** idle duration exceeds the configured timeout
- **THEN** app access lock engages
- **AND** sensitive UI is not interactable until unlock succeeds

#### Scenario: Screen-off lock

- **GIVEN** wallet data is mounted and the device screen turns off
- **WHEN** the native shell emits a screen-off lifecycle event
- **THEN** app access lock engages without unmounting wallet data

### Requirement: App passcode stored in native secure storage on mobile

On mobile hosts, app passcode material SHALL be stored via native secure
preferences and MUST NOT be persisted in WebView `localStorage`.

#### Scenario: Set passcode on mobile

- **GIVEN** the operator sets an app passcode on a mobile host
- **WHEN** passcode is saved
- **THEN** verification uses native secure storage
- **AND** WebView localStorage does not contain the passcode or its hash

### Requirement: App access lock gates sensitive operations

While app access is locked on mobile, the system SHALL prevent wallet balance
display, chat composer send, and outbound P2P bridge commands except unlock
and lifecycle handlers.

#### Scenario: Locked app blocks composer

- **GIVEN** app access is locked and wallet data is mounted
- **WHEN** the operator attempts to send a chat message
- **THEN** the send action is blocked until app access unlock succeeds

### Requirement: Blur overlay on background when enabled

When `blurInAppSwitcher` is enabled on mobile, the system SHALL show a blur
overlay over sensitive UI when the app is backgrounded without data-locking.

#### Scenario: Background blur with mounted wallet

- **GIVEN** `blurInAppSwitcher` is enabled and wallet is mounted
- **WHEN** the app moves to background
- **THEN** sensitive UI is obscured by blur
- **AND** wallet data remains mounted

### Requirement: Independent app-access biometric setting

The system SHALL expose a separate setting `appAccessBiometricEnabled` that
controls app-access biometric unlock only and is independent of data-unlock
biometrics.

#### Scenario: Data biometric on, app biometric off

- **GIVEN** `dataUnlockBiometricEnabled` is true and `appAccessBiometricEnabled` is false
- **WHEN** app access lock is required after resume
- **THEN** only passcode (not app biometric) is offered for app access
- **AND** data-unlock biometric remains available when data is locked

### Requirement: Web and Electron hosts unchanged

Browser dev and Electron hosts SHALL NOT gain app-access biometric or native
auto-lock behavior from this capability; existing mock/local passcode behavior
remains unchanged.

#### Scenario: Web dev unchanged

- **GIVEN** the app runs without `window.gnhMobile`
- **WHEN** the operator uses security settings
- **THEN** no native biometric enroll or auto-lock lifecycle wiring is invoked
