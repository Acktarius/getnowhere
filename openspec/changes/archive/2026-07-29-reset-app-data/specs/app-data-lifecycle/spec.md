# Delta for app-data-lifecycle

## ADDED Requirements

### Requirement: Delete wallet removes wallet-tied persistence only
The system SHALL provide a Settings action **Delete wallet** that, after user
confirmation, disconnects the wallet runtime and removes all wallet-tied
persistence keys while preserving app preference keys (including
`gnh.settings`).

#### Scenario: Delete wallet keeps theme settings
- GIVEN a stored encrypted `wallet` blob, `gnh.onboarded`, contacts/rooms keys,
  and `gnh.settings` with a non-default theme
- WHEN the user confirms **Delete wallet**
- THEN wallet-tied keys are removed
- AND `gnh.settings` remains
- AND in-memory wallet runtimes are cleared via disconnect
- AND the UI reloads into an onboardable state (Welcome / Import)

### Requirement: Reset app data removes wallet and preferences
The system SHALL provide a Settings action **Reset app data** that, after user
confirmation, disconnects the wallet runtime and removes both wallet-tied keys
and app preference keys (including theme settings and known node-preference
side channels).

#### Scenario: Reset app data clears settings
- GIVEN wallet-tied keys and `gnh.settings` are present
- WHEN the user confirms **Reset app data**
- THEN wallet-tied keys are removed
- AND `gnh.settings` and documented app-pref / side-channel keys are removed
- AND in-memory wallet runtimes are cleared via disconnect
- AND the UI reloads into an onboardable state

### Requirement: Host-agnostic wipe path
The wipe functions SHALL use the active `StorageAdapter` for app keys and MUST
NOT require the Settings UI to branch on browser vs Electron vs WebView. Future
native adapters SHALL satisfy the same remove semantics for secrets they store.

#### Scenario: Same Settings actions on Electron and browser
- GIVEN the Vite UI running in a browser or an Electron partition
- WHEN the user uses **Delete wallet** or **Reset app data**
- THEN behavior follows the key-list contracts above without a separate
  Electron-only IPC path in this change

### Requirement: Cancelled confirm is a no-op
If the user cancels the confirmation dialog, the system SHALL NOT remove keys
or disconnect.

#### Scenario: User cancels delete
- GIVEN a stored wallet
- WHEN the user cancels the **Delete wallet** confirm
- THEN all keys remain unchanged
