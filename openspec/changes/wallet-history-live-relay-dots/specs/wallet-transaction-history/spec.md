## Purpose

Wallet transaction history stays current during chain sync, paginates for clarity, and surfaces L1′ relay smartmessages with navigation into the related room or contact.

## ADDED Requirements

### Requirement: History updates during sync catch-up
The wallet UI SHALL display newly discovered transactions from the Zustand history store as chain sync folds batches, without requiring the user to press the manual resync control.

#### Scenario: New txs appear while catching up
- **WHEN** sync folds one or more batches that add owned transactions
- **THEN** the wallet history store is updated within a short throttle window and the visible page refreshes from that store

#### Scenario: Manual resync still works
- **WHEN** the user presses the resync control
- **THEN** history refreshes as today and remains consistent with the live-publish path

### Requirement: History pagination of 25
The wallet history UI SHALL show at most 25 transactions per page, newest first, with navigation to other pages when more than 25 transactions exist.

#### Scenario: Few transactions
- **WHEN** fewer than or equal to 25 transactions exist
- **THEN** all are shown and page navigation controls are hidden

#### Scenario: Many transactions
- **WHEN** more than 25 transactions exist
- **THEN** the UI shows one page of 25 and exposes prev/next (or equivalent) with a page indicator

#### Scenario: Stay on page while syncing
- **WHEN** the user is viewing page 2 or later and new transactions arrive via live publish
- **THEN** the current page index does not automatically jump to page 1

### Requirement: L1′ relay smartmessage dots
The wallet history SHALL show a distinct colored dot for contact-module smartmessages with action execute/relay (in addition to existing create/register/revoke dots).

#### Scenario: Relay tx is dotted
- **WHEN** a history row carries a contact relay/execute smartmessage body
- **THEN** the row shows a relay-styled contact dot

#### Scenario: Invite dots unchanged
- **WHEN** a history row carries create or register
- **THEN** existing create/register coloring remains and those dots are not required to be clickable

### Requirement: Relay dot navigates to room or contact
Clicking a relay contact dot SHALL navigate to the related chat room when that room still exists; otherwise it SHALL navigate to the related contact when one can be resolved; otherwise it SHALL do nothing.

#### Scenario: Room exists
- **WHEN** the user clicks a relay dot whose roomId is present in the chat catalog/store
- **THEN** the app navigates to that chat room

#### Scenario: Room missing, contact known
- **WHEN** the user clicks a relay dot whose room is gone but a contact (or invite) still references that roomId
- **THEN** the app navigates to that contact’s detail screen

#### Scenario: Neither room nor contact
- **WHEN** the user clicks a relay dot and neither room nor contact can be resolved
- **THEN** navigation does not occur
