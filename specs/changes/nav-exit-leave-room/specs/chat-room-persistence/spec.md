# Delta for chat-room-persistence

## ADDED Requirements

### Requirement: Leave-forever API is leaveRoom
The chat transport SHALL expose `leaveRoom(roomId)` for leave-forever behavior
(catalog/session removal and revoke path). Call sites MUST NOT name this
operation `disconnect`.

#### Scenario: Leave forever uses leaveRoom
- GIVEN an accepted room in the catalog
- WHEN the user leaves the room forever
- THEN `leaveRoom` is invoked
- AND the room is removed from the live catalog per existing leave-forever rules

### Requirement: Room transcripts persist in the encrypted wallet blob
Active room message history SHALL be stored inside the encrypted `"wallet"`
blob (sealed with the wallet password), not as a plaintext StorageAdapter key.
On wallet unlock / room open, the system SHALL hydrate in-memory messages from
that blob when present.

#### Scenario: Exit preserves conversation
- GIVEN an unlocked wallet with messages in an open room
- WHEN the user confirms nav Exit (disconnect)
- THEN those messages are written into the wallet blob before keys leave memory
- AND after re-opening the wallet the room shows the persisted messages

#### Scenario: Revoked room has no message payload
- GIVEN a room that has been revoked or left forever
- WHEN the wallet blob is inspected for that roomId
- THEN the entry is only `{ roomId, revoked: true }`
- AND no message bodies remain for that roomId

### Requirement: Revoke tombstone blocks roomId reuse
After revoke or leave-forever, the system SHALL retain a tombstone
`{ roomId, revoked: true }` in the wallet blob (and keep the durable re-seed
block consistent) so the same `roomId` cannot be recreated or re-seeded from
chain history.

#### Scenario: Re-seed blocked after revoke
- GIVEN roomId R is revoked
- WHEN hydrate or invite re-seed attempts to recreate room R
- THEN the room is not restored as an active chat room
