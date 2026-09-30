# Proposal

## Why

Two blocker findings break L2 live chat. F3: on mobile, session counters are saved to
secure storage asynchronously, so an app kill can rewind `sendCounter` (ChaCha20-Poly1305
nonce reuse under the same key) or `recvCounter` (replays accepted again). F4: the receiver
only scans 64 counters ahead of `recvCounter`; once the peer has sealed 64 frames we never
opened, every later frame fails closed forever and the room loops proof /
`crypto_mismatch` until a re-invite. An external review of the fix also flagged that the
per-counter HKDF nonce is not injective and that concurrent inbound frames race on
`recvCounter`.

## What Changes

- **BREAKING** L2 live frame layout becomes `0x02 || counter (u64 big-endian) || ciphertext+tag`
  (base64). The 12-byte nonce is no longer on the wire. Hard cut: the old nonce-first
  layout is rejected; both devices must run the new build.
- **BREAKING** Nonce derivation becomes `iv XOR (0x00000000 || counter u64 BE)` with
  `iv = HKDF-SHA256(nonceSeed, salt="send", info="iv", 12)` derived once per session
  (TLS 1.3 style, injective per key). Keys and counters of existing rooms are kept, so
  rooms stuck today resync without a re-invite.
- The 9-byte frame header is appended to the existing proof/chat AAD.
- Receiver accepts any `counter >= recvCounter` whose tag verifies (no 64-counter window,
  no forward cap); `recvCounter` becomes `counter + 1`. Replays and stale counters fail
  closed.
- Inbound frames are handled one at a time per room and opened against the current
  session.
- Sender refuses to seal once `sendCounter` would pass `Number.MAX_SAFE_INTEGER`; never wraps.
- Mobile session-counter saves wait for the secure-prefs flush and fail on a write error.
  A failed save means the frame is not sent and the send rejects, or the inbound envelope
  is dropped.
- `docs/security/p2pchatprotocol.md` §8 and `docs/security/encryption.md` § Nonce rules
  are updated first (spec before code), including rollback coverage, reorder drop, and
  crash-after-persist behaviour.

## Capabilities

### New Capabilities

- `l2-live-frame-crypto`: L2 live frame layout, counter-based nonce, receive acceptance
  rule, per-room receive ordering, counter exhaustion, and counter durability before a
  frame leaves or an envelope is handled.

### Modified Capabilities

None. `chat-message-delivery` ("two frames carry different nonces") still holds.

## Impact

- Code: `src/services/p2p/P2PEncryptionAdapter.ts`, `src/types/services.ts`
  (`P2PEncryptionService.seal` / `open` take and return `counter`), new
  `src/services/p2p/liveFrameCodec.ts`, `src/services/p2p/HolepunchChatTransport.ts`
  (proof send, live send, incoming frame), `src/services/p2p/roomSessionStore.ts`.
- Tests: new adapter, codec, store and transport tests; about ten existing `tests/p2p/*`
  files that build `nonce || ciphertext` wires.
- Docs: `docs/security/p2pchatprotocol.md`, `docs/security/encryption.md`,
  `docs/guidelines/security-module-review.md` (window references).
- No bridge schema change: the sidecar and the Bare worklet forward `payload` as opaque
  base64. Mixed-version device pairs cannot chat until both update.
