# Settings Backup Spec

## Purpose

Describe this capability.

## Requirements

### Requirement: Passcode-gated seed reveal dialog
Backup settings SHALL reveal the wallet seed phrase in a dedicated dialog after
successful passcode verification, without rendering the onboarding
`SeedBackupPanel` on that screen.

#### Scenario: Reveal opens dialog after correct passcode

- GIVEN an initialized wallet with an in-memory seed phrase and Backup settings
  showing the locked passcode form
- WHEN the operator enters the correct passcode and activates Reveal seed
- THEN the system opens a seed reveal dialog that displays the restore warning
  copy and the seed words
- AND the inline SeedBackupPanel is not shown on the Backup settings page

#### Scenario: Incorrect passcode does not open dialog

- GIVEN Backup settings showing the locked passcode form
- WHEN the operator enters an incorrect passcode and activates Reveal seed
- THEN the system shows an error
- AND the seed reveal dialog remains closed

### Requirement: Seed reveal dialog dismissal and timer
The seed reveal dialog SHALL dismiss on Got it (or equivalent close) without
marking backup confirmed, and SHALL auto-close unless the operator extends
time via Need more time.

#### Scenario: Got it closes without confirmBackup

- GIVEN the seed reveal dialog is open
- WHEN the operator activates Got it
- THEN the dialog closes and passcode/dialog state is cleared
- AND `confirmBackup` is not invoked (deferred — TO BE RE_ASSESS)

#### Scenario: Need more time fade and enable at 30 seconds

- GIVEN the seed reveal dialog just opened
- WHEN fewer than 30 seconds have elapsed
- THEN Need more time is disabled and becomes progressively more visible
- WHEN 30 seconds have elapsed
- THEN Need more time is enabled and fully visible
- AND a 5-second grace period begins

#### Scenario: Auto-close after grace if Need more time unused

- GIVEN Need more time has become enabled
- WHEN 5 seconds elapse without activating Need more time or Got it
- THEN the dialog closes

#### Scenario: Need more time restarts the fade cycle

- GIVEN Need more time is enabled
- WHEN the operator activates Need more time
- THEN the grace period is cancelled
- AND Need more time fades out and restarts the 0–30s fade/disabled cycle

### Requirement: Password-gated export QR dialog
Backup settings SHALL offer **Show export QR code** immediately after
**Reveal seed & keys**. The action SHALL use the same wallet-password gate as
reveal. After a correct password on a full wallet, the system SHALL open a
dialog that displays only the export QR (no warning or disclaimer copy).
The QR payload SHALL be
`conceal.<address>?spend_key=<spend>?view_key=<view>?height=<creationHeight>`
so import QR decode can recover keys and scan start height.

#### Scenario: Button sits after reveal
- GIVEN an initialized wallet on Backup settings
- WHEN the operator views the backup actions
- THEN **Show export QR code** appears immediately after **Reveal seed & keys**
- AND before **Download wallet .json**

#### Scenario: Password required before export QR
- GIVEN Backup settings with an empty password field
- WHEN the operator activates **Show export QR code**
- THEN the system shows an error asking for the wallet password
- AND the export QR dialog remains closed

#### Scenario: Incorrect password does not open export QR
- GIVEN Backup settings showing the password field
- WHEN the operator enters an incorrect password and activates **Show export QR code**
- THEN the system shows an error
- AND the export QR dialog remains closed

#### Scenario: Correct password opens export QR
- GIVEN an initialized full wallet and Backup settings
- WHEN the operator enters the correct password and activates **Show export QR code**
- THEN the system opens a dialog whose body is the export QR for that wallet
- AND the dialog does not show warning or disclaimer copy
- AND the encoded payload uses address, spend key, view key, and creation height

### Requirement: Export QR dialog dismissal and timer
The export QR dialog SHALL use the same Got it / Need more time timer
behavior as the seed reveal dialog: dismiss on Got it without marking backup
confirmed, auto-close unless the operator extends time, and restart the cycle
on Need more time.

#### Scenario: Got it closes export QR without confirmBackup
- GIVEN the export QR dialog is open
- WHEN the operator activates Got it
- THEN the dialog closes and password / QR state is cleared
- AND `confirmBackup` is not invoked

#### Scenario: Need more time and auto-close match seed reveal
- GIVEN the export QR dialog just opened
- WHEN fewer than 30 seconds have elapsed
- THEN Need more time is disabled
- WHEN 30 seconds have elapsed
- THEN Need more time is enabled
- AND a 5-second grace period begins
- WHEN the operator activates Need more time
- THEN the grace period is cancelled and the 0–30s cycle restarts
- WHEN 5 seconds of grace elapse without Need more time or Got it
- THEN the dialog closes
