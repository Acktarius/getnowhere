## Purpose

Enables F-Droid and GrapheneOS Android users to receive peer-wake signals over a self-hosted
ntfy server (`ntfy.getnowhere.im`) without Google Play Services or FCM. Room-scoped opaque
`pokeId` tokens are generated locally, exchanged in the L1 invite handshake, and used as ntfy
topic capabilities. On wake receipt the app triggers the existing WorkManager remote-node sync.

## ADDED Requirements

### Requirement: F-Droid pokeId is minted locally

The Android F-Droid build SHALL generate a 10-byte CSPRNG `pokeId` locally at room creation
(`chat.create`) and at room acceptance (`chat.register`). The pokeId SHALL be encoded as
base64url without padding (14 characters). It SHALL NOT be registered with any external gateway.

#### Scenario: pokeId generation

- **WHEN** a F-Droid client creates or accepts a room invite
- **THEN** a 10-byte CSPRNG value is generated and encoded as 14-char base64url
- **AND** it is stored as the own pokeId for that room
- **AND** it is included in the `ph` field of the outgoing L1 message

#### Scenario: pokeId character set

- **WHEN** a pokeId is generated
- **THEN** the resulting string matches `/^[A-Za-z0-9_-]{14}$/`

### Requirement: ntfy topic is derived from pokeId

The ntfy topic for a room SHALL be `gnh-<pokeId>` (18 characters). The topic SHALL only
contain characters from `[A-Za-z0-9_-]` and SHALL be at most 64 characters.

#### Scenario: Topic derivation

- **WHEN** a pokeId `abc123XYZ_-abc` is in use
- **THEN** the ntfy topic is `gnh-abc123XYZ_-abc`

### Requirement: F-Droid client subscribes to own ntfy topic

The F-Droid Android native module SHALL open a persistent SSE connection to
`https://ntfy.getnowhere.im/gnh-<ownPokeId>/json` using a read-only per-topic credential.
It SHALL ignore `open` and `keepalive` events. On a `message` event with body `wake` (or
empty body), it SHALL deduplicate by ntfy message `id` and then call
`scheduleSoonRemoteNodeSync`. It SHALL reconnect with exponential backoff after disconnects.

#### Scenario: Wake received while backgrounded

- **WHEN** the ntfy stream delivers a `message` event with body `wake`
- **THEN** `scheduleSoonRemoteNodeSync` is called exactly once
- **AND** no notification banner is shown to the user

#### Scenario: Duplicate wake suppressed

- **WHEN** the same ntfy message `id` arrives twice (reconnect replay)
- **THEN** `scheduleSoonRemoteNodeSync` is called only once

#### Scenario: keepalive ignored

- **WHEN** the stream delivers an `open` or `keepalive` event
- **THEN** no sync work is scheduled

### Requirement: ntfy server access is authenticated and scoped

The ntfy server at `ntfy.getnowhere.im` SHALL have `auth-default-access: deny-all`.
The poke-gateway SHALL hold a write-only ntfy credential scoped to publish on `gnh-*` topics.
Each F-Droid device SHALL receive a read-only ntfy credential scoped to its own exact topic
only. No wildcard subscribe credentials SHALL be issued to devices.

#### Scenario: Unauthorized publish rejected

- **WHEN** a client without a write credential attempts to publish to any `gnh-*` topic
- **THEN** the ntfy server returns 403

#### Scenario: Device cannot subscribe to a different device's topic

- **WHEN** a device holds a read-only credential for `gnh-aaa`
- **THEN** it cannot subscribe to `gnh-bbb`

### Requirement: pokeId forgotten on room destroy

The own pokeId and partner pokeId for a room SHALL be cleared when the room is destroyed.
Destroy events include: LEAVE ROOM (local or L1 `room_revoked`), `roomTtl` expiry, and
unaccepted invite expiry. On destroy the F-Droid client SHALL unsubscribe from its own ntfy
topic.

#### Scenario: pokeId cleared on leave

- **WHEN** the user leaves a room or receives `room_revoked`
- **THEN** `room.ownPokeId` and `room.partnerPokeHandle` are both set to undefined
- **AND** the ntfy subscription for the own topic is closed

#### Scenario: pokeId cleared on roomTtl expiry

- **WHEN** `roomTtl` elapses
- **THEN** own and partner pokeIds are cleared and the ntfy subscription is closed

#### Scenario: Unaccepted invite expiry

- **WHEN** an invite expires before acceptance
- **THEN** the inviter's own pokeId is discarded without ever subscribing
