# Topic Derivation v2 Spec

## Purpose

HKDF epoch-scoped Hyperswarm discovery topics for protocol v2, with legacy
SHA256 v1 coexistence for persisted rooms.

## Requirements

### Requirement: topic suite selection

The protocol layer SHALL support two topic derivation suites:

- `SHA256_V1` — legacy: `sha256Hex("gnh-chat-v1||" + roomId + "||" + relationshipId)`
- `HKDF_EPOCH_V1` — v2: HKDF relationship key + epoch (see below)

New chat creates after this change ships SHALL use `HKDF_EPOCH_V1` when the
local build supports v2. Persisted rooms SHALL retain their stored suite until
destroyed or recreated.

#### Scenario: legacy room keeps v1 topic

- GIVEN a room session persisted with `topicSuite: SHA256_V1`
- WHEN the peer reconnects after upgrade
- THEN `topicRef` is derived with the SHA256 v1 formula
- AND Hyperswarm join uses that topic

#### Scenario: new create uses v2 topic

- GIVEN both peers run builds with v2 support
- WHEN Alice sends a new `chat.create` and Bob accepts
- THEN the bootstrap contract stores `topicSuite: HKDF_EPOCH_V1` and `epoch: 0`
- AND `topicRef` is derived via HKDF with epoch 0

### Requirement: HKDF epoch topic derivation

For `HKDF_EPOCH_V1`, the app SHALL derive:

```text
K_relationship = HKDF-SHA256(ikm=ecdhSharedSecret, salt=relationshipId,
                             info="getnowhere/relationship/v1", L=32)

topicRef = hex(HKDF-SHA256(ikm=K_relationship, salt=relationshipId,
                             info="getnowhere/hyperswarm-topic/v1" || uint32_be(epoch),
                             L=32))
```

All hex id inputs SHALL pass through `normalizeHexId` before use as salt/info
components. Output SHALL be 64 lowercase hex characters (32 bytes).

#### Scenario: both peers derive identical topic at epoch 0

- GIVEN the same `ecdhSharedSecret`, `relationshipId`, and `epoch: 0`
- WHEN Alice and Bob each call v2 derivation
- THEN they produce the same `topicRef`

#### Scenario: epoch bump changes topic

- GIVEN the same relationship keys and `epoch: 0` topic joined
- WHEN epoch increments to 1 on both peers
- THEN the newly derived `topicRef` differs from epoch 0
- AND peers leave the old topic before joining the new one

### Requirement: fixed create pack id widths

The slim create pack SHALL retain 4-byte `roomId` and 4-byte `inviteId`. v2
SHALL NOT require wider on-wire ids.

#### Scenario: create pack size unchanged

- GIVEN a v2-capable build composes `chat.create`
- WHEN the packed handshake is encoded
- THEN `roomId` and `inviteId` remain 4 bytes each

### Requirement: epoch rotation triggers

The app SHALL bump `epoch` and re-derive `topicRef` when:

- the room is revoked / leave-forever completes, or
- an agreed L1 epoch-sync message is received from the peer, or
- local policy detects suspected topic compromise (manual/dev hook acceptable in v1 of feature)

After bump, the app SHALL leave the prior Hyperswarm topic before joining the new one.

#### Scenario: revoke bumps epoch for future rooms

- GIVEN an active v2 room at `epoch: 0`
- WHEN either peer completes leave-forever
- THEN session teardown occurs on the current topic
- AND a subsequent recreate for the same contact uses a fresh room with `epoch: 0` on a new roomId

### Requirement: post-connect proof binds epoch

For `HKDF_EPOCH_V1` rooms, post-connect L1 proof/ack AEAD associated data
SHALL include the current `epoch` and topic suite identifier. AEAD failure
SHALL yield `crypto_mismatch` (existing behavior).

#### Scenario: wrong epoch fails proof

- GIVEN a v2 room at `epoch: 1`
- WHEN a peer sends proof with AAD for `epoch: 0`
- THEN AEAD open fails and the session is not marked connected

### Requirement: capability documentation

The repository SHALL maintain:

- `docs/security/capabilities-and-derivation.md` — layer separation, v1/v2 strategy
- `docs/architecture/local-bridge-transport.md` — local ws/wss/IPC roadmap

Cross-links from `encryption.md`, `pairing-and-topics.md`, and `p2pchatprotocol.md`
SHALL reference these documents.

#### Scenario: agent reads canonical topic policy

- GIVEN a coding agent needs topic derivation rules
- WHEN it reads `docs/architecture/pairing-and-topics.md`
- THEN it finds v1 as the legacy shipped formula for persisted SHA256 rooms
- AND it is directed to the capabilities doc for v2 HKDF epoch derivation
