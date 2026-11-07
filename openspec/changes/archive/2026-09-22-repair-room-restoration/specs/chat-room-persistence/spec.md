# Delta for chat-room-persistence

## ADDED Requirements

### Requirement: Room restore runs only on file import
The system SHALL attempt chat room restoration replay **only** when the wallet
was imported via encrypted JSON file (`method: "file"`). Seed, spend/view keys,
QR, unlock, and resync MUST NOT trigger room restore planning.

#### Scenario: Seed import does not restore rooms
- GIVEN a wallet imported from mnemonic or keys
- WHEN sync completes
- THEN no rooms are added to the chat catalog from message replay

#### Scenario: File import triggers room replay
- GIVEN a wallet imported from encrypted JSON backup with smart-message records
- WHEN file-import restoration runs
- THEN eligible rooms are planned per TTL and acceptance rules below

### Requirement: File replay uses sent and received message records
Restoration from file import SHALL parse `chat.create` from **both**
`raw.sentMessages` and `raw.receivedMessages`. The system MUST NOT restore
from chain rescan, `contact.roomId`, or register-only records without create
handshake material.

#### Scenario: Initiator create from sentMessages
- GIVEN file backup includes a sent `chat.create` for room R with acceptance
  evidence in sent or received messages
- WHEN file-import restoration runs
- THEN room R may be planned per case rules

#### Scenario: Register without create does not restore
- GIVEN file backup contains `chat.register` without matching `chat.create`
- WHEN restoration runs
- THEN no room is created

### Requirement: Wall-clock TTL pruning at replay
During file-import replay the system SHALL apply wall-clock rules using current
time without waiting for chain tip:

#### Scenario: Expired roomTtl skips restore
- GIVEN a parsed create with `roomTtl` before now
- WHEN restoration runs
- THEN room R is not cataloged

#### Scenario: Expired invite without accept tombstones roomId
- GIVEN a parsed create with no accept and `inviteExpiry` before now
- WHEN restoration runs
- THEN room R does not appear in Chats
- AND `roomId` is recorded as revoked so it cannot be reused

#### Scenario: Pending invite within inviteExpiry is kept
- GIVEN a parsed create with no accept and `inviteExpiry` after now
- WHEN restoration runs
- THEN the pending invite or room may be kept for recipient acceptance

### Requirement: Accepted file-replayed rooms await chain tip
When create and accept are both present and `roomTtl` is after now, the system
SHALL catalog the room with `awaitingChainSync` until wallet sync is within one
block of network tip. Chats MUST show the tile but MUST NOT allow opening or
connect/send until the flag clears.

#### Scenario: Accepted room disabled mid-sync
- GIVEN case-4 room restored during deep sync
- WHEN wallet lag exceeds near-tip threshold
- THEN the room tile is visible but not openable

#### Scenario: Accepted room enables at tip without revoke
- GIVEN case-4 room with `awaitingChainSync`
- WHEN sync reaches near tip and no `chat.revoke` was found
- THEN `awaitingChainSync` clears and the room becomes openable

#### Scenario: Revoke during sync removes accepted room
- GIVEN case-4 room awaiting tip
- WHEN sync discovers `chat.revoke` for that room
- THEN the room is removed or tombstoned per existing revoke rules

## MODIFIED Requirements

### Requirement: Revoke tombstone blocks roomId reuse
After revoke, leave-forever, or **expired invite without accept during file
replay**, the system SHALL record the `roomId` as revoked (durable tombstone)
so the same `roomId` cannot be recreated or re-seeded.

#### Scenario: Expired invite tombstone blocks reuse
- GIVEN inviteId I expired without accept during file replay
- WHEN a later flow attempts to reuse roomId R from that create
- THEN the room is not restored as active
