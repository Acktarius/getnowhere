# Delta for Crypto Layering

## ADDED Requirements

### Requirement: Two layers plus L1-prime fallback
The system SHALL document chat crypto as **L1**, **L1′**, and **L2** only.
It SHALL NOT name a separate **L3** layer.

#### Scenario: Vocabulary
- GIVEN security or architecture documentation
- WHEN describing live Holepunch content encryption
- THEN it is described as an **L1 session-key seal** (ChaCha20-Poly1305), not L3

#### Scenario: L1-prime compensates L2
- GIVEN room lifecycle is post-accept and Holepunch is not `connected`
- WHEN the user sends text
- THEN the message MAY use L1′ (`chat.relay` / `{contact,e,…}`) and SHALL NOT
  be described as a third crypto layer

### Requirement: Unified room from two sources
The product SHALL present one room object keyed by `roomId` whose thread MAY
mix L2 live frames and L1′ relay messages, ordered by timestamp, with
`channel: live | relay` distinguishing source.

#### Scenario: Dual-source thread
- GIVEN messages arrived via Holepunch and via `chat.relay` for the same `roomId`
- WHEN the user opens the room
- THEN both appear in one timeline (accent vs grey), not separate rooms

## REMOVED Requirements

### Requirement: L3 as a distinct layer
Documentation SHALL NOT treat ChaCha live AEAD as a third network layer named L3.
