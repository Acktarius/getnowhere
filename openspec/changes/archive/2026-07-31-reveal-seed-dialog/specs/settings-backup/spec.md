# Delta for Settings Backup

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Inline SeedBackupPanel on Backup settings reveal path

Backup settings SHALL NOT switch to an inline `SeedBackupPanel` after passcode
verification for seed reveal (onboarding may still use `SeedBackupPanel`).
