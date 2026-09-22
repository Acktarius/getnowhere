## Purpose

Gives a backgrounded or terminated peer a generic lock-screen wake without decrypting mail or unlocking the wallet. Lock-screen text never includes message content or who sent it.

## ADDED Requirements

### Requirement: New-message wake on L1′ after L2 drop

When push wake is enabled and a partner wake handle is known, the system SHALL attempt one peer-wake (`POST /poke { to }` only) on an L1′ send if the room has no last-poke time for the current relay stretch.

#### Scenario: First relay after L2

- **WHEN** push wake is enabled, a partner wake handle is present, and no last-poke time is set
- **THEN** the system attempts one wake and, on success, records the last-poke time

### Requirement: Re-poke after five minutes on later L1′

When push wake is enabled and a partner wake handle is known, the system SHALL attempt one peer-wake on an L1′ send if at least 300 seconds have elapsed since the last successful poke for that room.

#### Scenario: L1′ after cooldown

- **WHEN** push wake is enabled, a partner wake handle is present, and at least 300 seconds have passed since the last poke
- **THEN** the system attempts one wake and, on success, updates the last-poke time

#### Scenario: L1′ within cooldown

- **WHEN** push wake is enabled, a partner wake handle is present, and fewer than 300 seconds have passed since the last poke
- **THEN** the system MUST NOT attempt a wake

### Requirement: Clear last-poke time when L2 is live

When a room returns to a live L2 channel, the system SHALL clear that room's last-poke time so the next L1′ stretch can wake immediately.

#### Scenario: Connected clears last-poke time

- **WHEN** the room reaches connected / live
- **THEN** the last-poke time for that room is cleared

### Requirement: Invite-accepted wake on register

When push wake is enabled and the initiator's wake handle is known, the acceptor SHALL attempt one peer-wake after a successful `chat.register` send. The request is the same `{ to }` poke as L1′ — no `kind` field.

#### Scenario: Accept pokes initiator

- **WHEN** the acceptor sends `chat.register`, push wake is enabled, and the initiator wake handle is present
- **THEN** the system attempts one wake with body `{ to }` only

#### Scenario: Accept without handle or wake off

- **WHEN** push wake is disabled or no initiator wake handle is known
- **THEN** the system MUST NOT attempt an invite-accepted wake
- **AND** accept still completes normally

### Requirement: Fixed lock-screen copy

Visible lock-screen alerts SHALL use only:

- Peer-wake (APNs, deployed gateway): title `Get NowHere`, body `New message`
- Invite received (local after sync): title `Get NowHere`, body `You received a room invite`

The alert MUST NOT include contact alias, room identifier, message preview, sender identity, or an unread count. This change MUST NOT require a poke-gateway redeploy.

#### Scenario: Peer-wake text

- **WHEN** a peer-wake is delivered by the deployed gateway
- **THEN** the visible APNs body is `New message`
- **AND** the client poke body has no `kind` field

#### Scenario: Invite-received local text

- **WHEN** an inbound invite is ingested and a local banner is posted
- **THEN** the visible body is `You received a room invite`

### Requirement: Invite received is local after sync

A first inbound room invite SHALL produce a local generic banner only after the recipient's wallet has ingested the invite. The system MUST NOT attempt an APNs/ntfy wake for invite received.

#### Scenario: Invite received after sync

- **WHEN** an inbound `chat.create` is ingested while banners are enabled and the app is backgrounded
- **THEN** a local alert with body `You received a room invite` is posted
- **AND** no peer-wake request is sent for that event

### Requirement: No L1′ content banners

The system MUST NOT publish a local lock-screen banner whose body is derived from decrypted L1′ plaintext or a contact alias.

#### Scenario: Relay ingest does not post preview

- **WHEN** background or live sync ingests an L1′ message for a known room
- **THEN** no local banner containing the contact name or message preview is posted
- **AND** in-app unread state MAY still update

### Requirement: Wake payload is opaque

A peer-wake request SHALL identify only an opaque handle: `{ to }`. The client MUST NOT send `kind` or any other property. The deployed gateway MUST NOT be required to change. The gateway MUST NOT store or forward room ids, message ids, plaintext, or public keys.

#### Scenario: Poke body is handle only

- **WHEN** a client sends a peer-wake
- **THEN** the JSON body is exactly `{ to: <opaque handle> }`
- **AND** the body has no `kind` property

### Requirement: Wake does not require wallet unlock

Delivery of invite-accepted and new-message wakes MUST NOT require wallet unlock, WebView execution, or a background app-refresh task on the recipient.

#### Scenario: Locked or terminated recipient

- **WHEN** the recipient app is backgrounded or terminated, or the wallet is locked
- **AND** a valid wake is accepted by the gateway
- **THEN** the generic APNs/ntfy alert is still eligible for lock-screen delivery

### Requirement: Foreground clears icon pin only

When the iOS app becomes active, the system SHALL set the application icon badge to 0. The system MUST NOT remove all pending and delivered notifications as a side effect of that badge clear.

#### Scenario: Return to app zeros badge

- **WHEN** the iOS app transitions to active
- **THEN** the icon badge is 0
- **AND** remote wake notifications already in Notification Center are not bulk-deleted by that clear

### Requirement: Settings gates

Push wake off, missing permission, or a missing partner handle SHALL skip the wake with no user-visible error. The Notifications master switch off SHALL force wake and banner off. Wake remains off by default.

#### Scenario: Wake disabled

- **WHEN** push wake is disabled
- **THEN** no peer-wake request is sent on L1′ or on accept

### Requirement: Partner wake handle survives catalog rewrite

The durable room catalog SHALL keep the partner wake handle and last-poke time across catalog rewrites. Storing a partner wake handle SHALL persist even when no catalog row exists yet.

#### Scenario: Upsert keeps partner wake handle

- **WHEN** a catalog row already has a partner wake handle (and optionally a last-poke time)
- **AND** the catalog row is rewritten with a full-room upsert that omits those fields
- **THEN** the partner wake handle remains
- **AND** the last-poke time remains when it was already set

#### Scenario: Store handle before catalog row exists

- **WHEN** a valid partner wake handle is stored for a room id that has no catalog row
- **THEN** a catalog row exists afterward with that partner wake handle
- **AND** a later full-room upsert that omits the handle still keeps it
