# Delta for app-data-lifecycle

## ADDED Requirements

### Requirement: Shared ConfirmModal for destructive and session confirms
The system SHALL present user confirms for wallet Exit, Delete wallet, and
Reset app data through a shared `ConfirmModal` component (not `window.confirm`).
The modal SHALL support generic busy labeling so leave-room and other flows can
reuse it without hardcoding leave-forever copy.

#### Scenario: Settings delete uses ConfirmModal
- GIVEN the Settings screen with a stored wallet
- WHEN the user starts **Delete wallet**
- THEN a `ConfirmModal` is shown
- AND cancelling leaves all keys and runtimes unchanged

#### Scenario: Settings reset uses ConfirmModal
- GIVEN the Settings screen
- WHEN the user starts **Reset app data**
- THEN a `ConfirmModal` is shown
- AND confirming proceeds with the existing wipe contract

### Requirement: Bottom nav Exit disconnects wallet session
The system SHALL expose an Exit control on the primary bottom nav (order:
Chats, Contacts, Wallet, Settings, Exit). Activating Exit SHALL show a confirm
titled **Confirm disconnect**. On confirm the system SHALL persist the
encrypted wallet blob (including room history), soft-leave live Holepunch
topics without revoking rooms, clear unlocked wallet material from memory, and
return the user to the open/welcome flow. The wallet blob SHALL remain on
device storage.

#### Scenario: User confirms disconnect
- GIVEN an unlocked wallet with open rooms
- WHEN the user confirms **Confirm disconnect**
- THEN the encrypted `"wallet"` blob is persisted
- AND room catalog entries are not destroyed by Exit
- AND in-memory wallet keys are cleared
- AND the UI navigates to the welcome/open path

#### Scenario: User cancels disconnect
- GIVEN the Confirm disconnect modal is open
- WHEN the user cancels
- THEN the wallet remains unlocked and navigation is unchanged

## MODIFIED Requirements

### Requirement: Cancelled confirm is a no-op
If the user cancels the confirmation dialog, the system SHALL NOT remove keys
or disconnect. Confirmation UI for Delete wallet and Reset app data SHALL use
the shared `ConfirmModal` (same cancel semantics as before).

#### Scenario: User cancels delete
- GIVEN a stored wallet
- WHEN the user cancels the **Delete wallet** confirm
- THEN all keys remain unchanged
