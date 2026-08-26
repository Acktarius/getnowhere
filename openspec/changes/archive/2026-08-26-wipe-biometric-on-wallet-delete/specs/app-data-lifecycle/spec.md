## MODIFIED Requirements

### Requirement: Delete wallet removes wallet-tied persistence only

The system SHALL provide a Settings action **Delete wallet** that, after user
confirmation, disconnects the wallet runtime and removes all wallet-tied
persistence keys while preserving app preference keys (including
`gnh.settings` theme and non-biometric preferences). On mobile hosts, delete
wallet SHALL also remove native data-unlock biometric enrollments and
app-access biometric credentials tied to that wallet. When those enrollments
are cleared, the system SHALL set `appAccessBiometricEnabled` and
`dataUnlockBiometricEnabled` to `false` in `gnh.settings` (persist and
in-memory settings) so a later wallet import does not require biometrics until
the operator re-enables them.

#### Scenario: Delete wallet keeps theme settings

- **GIVEN** a stored encrypted `wallet` blob, `gnh.onboarded`, contacts/rooms keys,
  and `gnh.settings` with a non-default theme
- **WHEN** the user confirms **Delete wallet**
- **THEN** wallet-tied keys are removed
- **AND** `gnh.settings` remains with the non-default theme
- **AND** in-memory wallet runtimes are cleared via disconnect
- **AND** the UI reloads into an onboardable state (Welcome / Import)

#### Scenario: Delete wallet clears mobile biometric enrollments

- **GIVEN** a mobile host with data-unlock biometric enrolled for the active wallet
- **WHEN** the user confirms **Delete wallet**
- **THEN** native secure-prefs enrollment metadata is removed
- **AND** native biometric credentials for that wallet are removed

#### Scenario: Delete wallet resets biometric setting flags

- **GIVEN** `gnh.settings` has `appAccessBiometricEnabled` true and
  `dataUnlockBiometricEnabled` true and a non-default theme
- **WHEN** the user confirms **Delete wallet**
- **THEN** both biometric flags are false in persisted `gnh.settings`
- **AND** the non-default theme remains
