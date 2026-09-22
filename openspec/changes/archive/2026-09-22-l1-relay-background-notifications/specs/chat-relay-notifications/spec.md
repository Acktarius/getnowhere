# chat-relay-notifications (delta)

## Purpose

Surfaces unread L1′ chain-relay chat to the user via in-app pins while the
wallet stays unlocked, including when the app is in background.

## ADDED Requirements

### Requirement: Background relay ingest while wallet unlocked

The system SHALL continue chain sync and L1′ relay ingestion while the wallet
is unlocked and the user has not exited/disconnected, even when the app tab or
window is not visible.

#### Scenario: Hidden tab still ingests new relay

- **WHEN** the wallet is unlocked
- **AND** the document visibility state is hidden
- **AND** a new L1′ relay message for a post-accept room arrives on-chain
- **THEN** the system ingests the relay on a background poll cadence
- **AND** the message appears in the room thread without requiring foreground

#### Scenario: Exit stops background ingest

- **WHEN** the user confirms Exit/disconnect and the wallet locks
- **THEN** background relay polling stops
- **AND** session notification state is cleared

#### Scenario: Background poll is slower than foreground

- **WHEN** the document visibility state is hidden
- **THEN** the relay poll interval SHALL be no faster than the foreground
  near-tip interval
- **AND** MAY use a dedicated slower interval to reduce battery use

### Requirement: Relay unread pins on chat and contact surfaces

The system SHALL show in-app notification pins for unread L1′ relay messages on
post-accept rooms (`accepted`, `connecting`, `connect_failed`, `connected`).

#### Scenario: Chats list shows per-room relay pin

- **WHEN** a post-accept room has one or more unread L1′ relay messages
- **AND** the user is not viewing that room
- **THEN** the Chats list row for that room shows a relay notification pin
- **AND** the Chats tab shows an aggregate unread indicator

#### Scenario: Contacts list shows contact-level relay pin

- **WHEN** any post-accept room for a contact has unread L1′ relay messages
- **AND** the user is not viewing those rooms
- **THEN** the Contacts list row for that contact shows a relay notification pin
- **AND** the Contacts tab shows an aggregate unread indicator

#### Scenario: Contact detail shows per-room relay pins

- **WHEN** the user opens a contact with one or more catalog rooms
- **AND** a room has unread L1′ relay messages
- **THEN** the contact detail lists each room/topic with its own relay pin when unread
- **AND** opening contact detail alone does NOT clear room unread state

#### Scenario: Pin priority on contact row

- **WHEN** a contact row qualifies for both invite/register pins and relay pins
- **THEN** invite count takes precedence over register dot
- **AND** register dot takes precedence over relay pin

### Requirement: Relay unread clear and suppression

The system SHALL NOT badge relay messages the user is already viewing and SHALL
clear unread when the room is opened.

#### Scenario: Open room clears relay pin

- **WHEN** the user opens a chat room that had unread L1′ relay messages
- **THEN** that room's relay notification pin is cleared

#### Scenario: Active room suppresses increment

- **WHEN** a new L1′ relay message is ingested for the room the user is
  actively viewing on the chat room screen
- **THEN** the relay unread count for that room does NOT increment

#### Scenario: Startup rescan does not badge history

- **WHEN** the app rescans existing L1′ relays during session bootstrap
- **THEN** those messages do NOT increment relay unread counts
- **AND** only relays ingested after bootstrap completion MAY increment unread

### Requirement: Relay unread is session-scoped

Relay unread counts SHALL NOT persist across wallet lock or Exit.

#### Scenario: Lock clears notification session

- **WHEN** the user exits the wallet session
- **THEN** all relay unread pins are cleared
