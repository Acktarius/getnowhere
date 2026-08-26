## ADDED Requirements

### Requirement: Stale app-access biometric flag self-heals

On mobile hosts, if `appAccessBiometricEnabled` is true but no app-access
biometric enrollment exists, the system SHALL set
`appAccessBiometricEnabled` to false (persist) and MUST NOT present the App
Lock gate for that session until the operator re-enables app-access biometrics
in Security settings.

#### Scenario: Flag on without enrollment skips App Lock

- **GIVEN** a mobile host with `appAccessBiometricEnabled` true and no
  app-access biometric credential enrolled
- **WHEN** the app would otherwise show App Lock
- **THEN** the flag is cleared to false
- **AND** App Lock is not shown
- **AND** the operator can use the app without a biometric prompt

#### Scenario: Flag on with enrollment still locks

- **GIVEN** a mobile host with `appAccessBiometricEnabled` true and a valid
  app-access biometric enrollment
- **WHEN** app access lock is engaged
- **THEN** App Lock is shown and biometric unlock is required
