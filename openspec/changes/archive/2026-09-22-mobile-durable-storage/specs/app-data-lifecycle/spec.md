## ADDED Requirements

### Requirement: Mobile wipe clears native durable storage

On mobile hosts, **Delete wallet** and **Reset app data** SHALL clear the
encrypted wallet file, same-directory temp files, and adapter-owned
namespaced keys through the active storage adapter. Those operations MUST
await native durable completion before the workflow reports success or
reloads. This is logical app-level deletion: it MUST NOT be described as
forensic erasure, and it MUST NOT claim to remove OS snapshots or copies
already taken by a prior backup. Biometric enrollment and session
keep-alive keys MUST continue to use their existing dedicated wipe paths and
MUST NOT be deleted via the adapter key index.

#### Scenario: Delete wallet removes the encrypted wallet file

- **GIVEN** a mobile host with a durable encrypted wallet file and app prefs
- **WHEN** the user confirms **Delete wallet**
- **THEN** the encrypted wallet file and same-directory temp files are removed
- **AND** wallet-tied namespaced adapter keys are removed
- **AND** `gnh.settings` remains
- **AND** biometric keys are cleared only through the existing biometric
  lifecycle, not the adapter index

#### Scenario: Reset app data removes wallet file and adapter prefs

- **GIVEN** a mobile host with a wallet file, adapter key index, and
  namespaced prefs
- **WHEN** the user confirms **Reset app data**
- **THEN** the wallet file, listed `gnh.app:` keys, and the index are removed
- **AND** a later wallet write that was in flight cannot recreate the file
  after reset completes

## MODIFIED Requirements

### Requirement: Host-agnostic wipe path

The wipe functions SHALL use the active `StorageAdapter` for app keys and MUST
NOT require the Settings UI to branch on browser vs Electron vs WebView. On
mobile hosts the active adapter SHALL be the native durable adapter installed
at boot. Native adapters SHALL satisfy the same remove semantics for secrets
they store, including awaiting durable completion for `"wallet"`.

#### Scenario: Same Settings actions on Electron and browser

- **GIVEN** the Vite UI running in a browser or an Electron partition
- **WHEN** the user uses **Delete wallet** or **Reset app data**
- **THEN** behavior follows the key-list contracts above without a separate
  Electron-only IPC path in this change

#### Scenario: Same Settings actions on mobile use native durable storage

- **GIVEN** a mobile host with the native adapter installed
- **WHEN** the user uses **Delete wallet** or **Reset app data**
- **THEN** Settings still calls the same wipe functions
- **AND** those functions persist their removals through the native adapter
