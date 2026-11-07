# Spec Delta

## Purpose

Defines how an L2 live frame is laid out, sealed, accepted and ordered, and when the
per-session counters must be durable, so nonces never repeat under a key and a receiver
that missed frames resyncs without a re-invite.

## ADDED Requirements

### Requirement: Live frames carry an explicit counter

Every L2 live frame (proof, proof-ack and chat content) SHALL be the base64 encoding of
`0x02 || counter || ciphertext+tag`, where `counter` is the sender's send counter as an
unsigned 64-bit big-endian integer. The 12-byte nonce SHALL NOT be on the wire. A frame
whose first byte is not `0x02`, or that is shorter than 25 bytes (1 + 8 + 16-byte tag), SHALL
be rejected. There SHALL be no fallback to the previous nonce-first layout.

#### Scenario: Sender writes the new layout
- **WHEN** a peer sends a live chat message with send counter 7
- **THEN** the decoded payload starts with byte `0x02` followed by the 8 bytes `00 00 00 00 00 00 00 07`
- **AND** the remaining bytes are the ciphertext and tag

#### Scenario: Old layout is rejected
- **WHEN** a frame in the previous `nonce || ciphertext` layout arrives
- **THEN** the frame is dropped and the receive counter does not change

#### Scenario: Truncated frame is rejected
- **WHEN** a frame shorter than 25 bytes after base64 decoding arrives
- **THEN** the frame is dropped and the receive counter does not change

### Requirement: Nonce is an injective function of the counter

For each session the sender SHALL derive a 12-byte `iv = HKDF-SHA256(ikm=nonceSeed,
salt="send", info="iv", L=12)` once, and SHALL seal each frame with
`nonce = iv XOR (0x00000000 || counter as u64 big-endian)`. Two different counters under
the same key SHALL never produce the same nonce. The receiver SHALL derive the same nonce
from the frame's counter. The 9-byte frame header (`0x02 || counter`) SHALL be appended to
the existing proof or chat AAD for both seal and open.

#### Scenario: Distinct counters give distinct nonces
- **WHEN** the same session seals frames with counters 0 through 10 000
- **THEN** all derived nonces are pairwise different

#### Scenario: Tampered counter fails
- **WHEN** an attacker changes the counter bytes of a genuine frame
- **THEN** authentication fails, the frame is dropped, and the receive counter does not change

#### Scenario: Existing session keeps its keys
- **WHEN** a room created before this change reconnects after both devices update
- **THEN** it seals and opens frames with its stored keys and counters, without a re-invite

### Requirement: Receiver accepts any authentic frame at or above its receive counter

The receiver SHALL accept a frame only when its counter is a safe integer, the counter is
greater than or equal to `recvCounter`, and the AEAD tag verifies. On acceptance
`recvCounter` SHALL become `counter + 1`. There SHALL be no upper limit on how far the
counter may be ahead of `recvCounter`. A counter below `recvCounter` (replay or stale
reordered frame), an unsafe integer, or a tag failure SHALL drop the frame and leave
`recvCounter` unchanged.

#### Scenario: Large gap resyncs
- **WHEN** the peer sealed 100 frames the receiver never saw and then sends a chat message
- **THEN** the receiver opens it, shows the message, and sets its receive counter to the frame counter plus one

#### Scenario: Replay is rejected
- **WHEN** a frame that was already accepted arrives again
- **THEN** it is dropped and no message or subscriber notification results

#### Scenario: Stale frame after a newer one is dropped
- **WHEN** a frame with counter 5 arrives after a frame with counter 6 was accepted
- **THEN** the frame with counter 5 is dropped

### Requirement: Inbound frames are handled one at a time per room

The receiver SHALL process inbound frames for a room sequentially: each frame SHALL be
opened against the room's current session state, and its receive-counter update SHALL be
committed before the next frame for that room is opened.

#### Scenario: Duplicate delivered on two connections
- **WHEN** the same frame arrives twice in immediate succession
- **THEN** exactly one copy is accepted and the other is dropped as a replay

### Requirement: Send counter never wraps

The sender SHALL refuse to seal when `sendCounter` is `Number.MAX_SAFE_INTEGER` or higher and
SHALL surface a send failure instead. The counter SHALL NOT wrap or reset within a session.

#### Scenario: Exhausted session
- **WHEN** a send is attempted with `sendCounter` equal to `Number.MAX_SAFE_INTEGER`
- **THEN** no frame is sealed or sent and the send fails

### Requirement: Counters are durable before a frame leaves or an envelope is handled

After sealing, the advanced send counter SHALL be durably stored on the host before the
frame is handed to the bridge. After opening, the advanced receive counter SHALL be
durably stored before the envelope is handled. On mobile, "durably stored" SHALL mean the
secure-preferences write has completed within a bounded wait. If the durable write fails or
does not complete within that wait, the frame SHALL NOT be
sent (the send rejects) and an inbound envelope SHALL be dropped.

#### Scenario: Mobile send waits for secure storage
- **WHEN** a live message is sent on mobile
- **THEN** the bridge receives the frame only after the secure-preferences write of the new send counter has completed

#### Scenario: Failed counter write blocks the send
- **WHEN** the secure-preferences write of the new send counter fails
- **THEN** no frame is handed to the bridge, the send rejects with an error, and no outbound row with status `sent` is created

#### Scenario: Failed counter write drops the inbound envelope
- **WHEN** the secure-preferences write of a new receive counter fails
- **THEN** the opened envelope is not shown or passed to subscribers
