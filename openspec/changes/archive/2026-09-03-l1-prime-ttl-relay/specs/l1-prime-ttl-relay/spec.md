## Purpose

Lets a user on chain fallback choose a paid durable L1′ relay or a mempool
TTL relay that auto-destroys from both rooms without mining.

## ADDED Requirements

### Requirement: Chain-fallback send offers TTL presets

When the next send is chain fallback, a single press SHALL send `chat.relay`
with Conceal TTL 0 (mined, paid, durable). A long-press SHALL reveal two
additional same-size send controls above that button: 60 minutes (top) and
6 minutes (middle). Those controls SHALL send the same `chat.relay` body with
mempool TTL of 60 minutes or 6 minutes respectively. The flyout SHALL NOT
appear when the next send is live Holepunch.

#### Scenario: Tap stays durable
- **GIVEN** the composer is on chain fallback and the draft is valid
- **WHEN** the user single-presses send
- **THEN** the system broadcasts `chat.relay` with TTL 0

#### Scenario: Long-press order is 60 then 6 then 0
- **GIVEN** the composer is on chain fallback
- **WHEN** the user long-presses send
- **THEN** a 60-minute control appears above a 6-minute control
- **AND** the original TTL 0 send remains at the bottom

#### Scenario: Live composer has no flyout
- **GIVEN** the next send is live Holepunch
- **WHEN** the user long-presses send
- **THEN** no TTL flyout appears

### Requirement: Signaling stays mined

Create, register, and revoke smart messages SHALL use Conceal TTL 0. Only
`chat.relay` MAY set a non-zero mempool TTL.

#### Scenario: Invite create is not TTL
- **GIVEN** the user sends a contact create
- **WHEN** the transaction is built
- **THEN** Conceal TTL is 0

### Requirement: TTL relay erases from both rooms

A `chat.relay` with non-zero mempool TTL SHALL exist only until that expiry.
After expiry the system SHALL remove the bubble from sender and receiver
room threads. The system SHALL NOT write TTL relay rows into durable room
transcript storage. Unlock or hydrate SHALL NOT recreate an expired TTL
relay. If the room is already expired or revoked, the system SHALL NOT show
the bubble; leftover wallet pending until the tx TTL is acceptable.

#### Scenario: Expiry drops both sides
- **GIVEN** Alice and Bob each have a TTL relay bubble in the same room
- **WHEN** wall-clock time reaches that relay’s TTL
- **THEN** the bubble is gone from Alice’s room
- **AND** the bubble is gone from Bob’s room

#### Scenario: Unlock does not restore expired TTL
- **GIVEN** a TTL relay whose expiry is in the past
- **WHEN** the wallet unlocks and the room thread hydrates
- **THEN** that relay does not appear in the room

#### Scenario: Room already gone
- **GIVEN** a TTL relay whose room has already expired or been revoked
- **WHEN** the relay TTL is still in the future
- **THEN** the room thread does not show the relay
- **AND** no extra chat wipe is required

### Requirement: TTL spend keeps full rings

A TTL `chat.relay` SHALL skip network fee and remote-node fee. It SHALL still
select non-dust inputs and use the same mixin / decoys as a mined message.
If construction or broadcast fails, the system SHALL fail the send and SHALL
NOT retry as TTL 0.

#### Scenario: TTL build uses decoys
- **GIVEN** the user sends a 6-minute or 60-minute relay
- **WHEN** the transaction is built
- **THEN** inputs are above dust
- **AND** mixin / decoys match a normal message spend
- **AND** network fee and node fee are not charged

#### Scenario: TTL broadcast failure stays unpaid
- **GIVEN** the daemon rejects a TTL message transaction
- **WHEN** the send fails
- **THEN** the system does not broadcast a TTL 0 retry
- **AND** no delivered bubble is kept
