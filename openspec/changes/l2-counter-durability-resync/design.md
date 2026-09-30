# Design

## Context

See proposal.md (Why) and `specs/l2-live-frame-crypto/spec.md` (requirements).

- `P2PEncryptionAdapter.seal` derives `nonce = HKDF(nonceSeed, "send", "nonce|{counter}", 12)`
  and returns `{ ciphertext, nonce, session }`; `open` scans `[recvCounter, recvCounter+64)`
  comparing derived nonces to the wire nonce.
- `HolepunchChatTransport` builds `nonce || ciphertext` in `writeProofFrame` and
  `writeLiveFrame`, and splits it in `handleIncomingFrame`. Both send paths already run
  seal → `mergeSessionCounters` → `await updateRoomSessionCounters` → `sendFrame`; the
  receive path runs open → `await updateRoomSessionCounters` → handle envelope.
- `handleIncomingFrame` captures `state.session` before its first `await`, so two frames
  arriving back to back open against the same `recvCounter`.
- `roomSessionStore` in `storage` host mode (mobile, browser dev) calls
  `getStorage().setItem`, which on mobile writes memory and queues the secure-prefs write
  without awaiting it. `flushPrefs()` resolves after the queue drains, even if a queued
  write failed; failures show up only in `lastPrefFlushError()`.
- Electron `os` mode writes the file synchronously before the IPC reply; `wallet` mode
  awaits `persistRuntime`. Neither changes.
- Sidecar and Bare worklet forward `payload` as opaque base64.

## Goals / Non-Goals

**Goals:**
- One frame codec used by every L2 send and receive site.
- Service contract speaks counters, not nonces; transport never derives nonces.
- Counter persistence is durable before bytes leave or plaintext is handled, on every host.

**Non-Goals:**
- Rekeying, key epochs, or a resync handshake.
- A reorder bitmap (Hyperswarm streams are ordered per connection).
- Counter-block reservation to reduce secure-prefs writes.
- Changing L1 / L1′ crypto, handshake `protocolVersion`, or bridge message schemas.

## Decisions

### D1 Explicit counter on the wire, hard cut
`0x02 || u64 BE counter || ct+tag`. The receiver can no longer resync from a derived nonce
it cannot invert; carrying the counter is what WireGuard and TLS do.
Alternatives: automatic rekey on gap (new handshake, much larger); wider scan window
(moves the limit, costs HKDF per junk frame); accept both layouts (an old peer cannot read
new frames and the proof needs both directions, so it buys nothing and keeps the buggy scan).

### D2 TLS 1.3 style nonce
`iv = HKDF-SHA256(nonceSeed, "send", "iv", 12)`, computed per seal/open call (cheap, no
cache to invalidate); `nonce = iv XOR (0^4 || counter BE)`. Injective per key. Old
per-counter HKDF nonces and new structured nonces collide only with negligible
probability, so existing rooms keep their keys.
Alternative: `0^4 || counter` without an iv — also injective, but drops the session seed
from the nonce for no gain.

### D3 Header in AAD
`aad = existingAad || header`. The proof/chat AAD builders and
`incomingFrameAadCandidates` keep their candidates; the adapter appends the header, so
callers cannot forget it. The counter is already bound by the nonce; this is
defence-in-depth matching TLS 1.3's record header in AAD.

### D4 Service contract
`seal({ session, plaintext, aad }) → { ciphertext, counter, session }` (counter = the one
used). `open({ session, counter, ciphertext, aad }) → { plaintext, session } | null`.
`seal` throws when `sendCounter >= Number.MAX_SAFE_INTEGER`. `RECV_NONCE_WINDOW` is deleted.

### D5 Codec module
`src/services/p2p/liveFrameCodec.ts`: `encodeLiveFrame(counter, ciphertext): string` and
`decodeLiveFrame(payloadB64): { counter, ciphertext } | null`, plus `liveFrameHeader(counter)`
used by the adapter for AAD. Pure; rejects wrong version, short input, unsafe counter
(high 11 bits set).

### D6 Per-room receive chain
Reuse the `runSerializedSend` pattern: a `liveReceiveChains` map; `handleIncomingFrame`
enqueues the decode → open → persist → handle body and reads `state.session` inside the
queued function. Cleared wherever `liveSendChains` is cleared.

### D7 Durable mobile persistence
In `persistHost` for `storage` mode: `writeStorage(all)`; then if a mobile native adapter
is installed (`getInstalledMobileStorageAdapter()`, the same object as the active adapter
in production), `await flushPrefs()` and throw if `lastPrefFlushError()` is set. The wait is bounded
(`ROOM_SESSION_FLUSH_TIMEOUT_MS`, 5 s): the native secure-prefs bridge has no timeout,
and a write that never settles would stall the room's send and receive chains. A timeout
counts as a failed write. Because
`mergeSessionCounters` already advanced the in-memory counter, a failed write never lets
the same counter be sealed twice in this process; after a restart the stored counter is
at most one behind a frame that was never sent.

## Risks / Trade-offs

- [Mixed-version pairs break] → documented; release both desktop and mobile together.
- [Secure-prefs write per frame adds latency on mobile] → acceptable at chat rates;
  counter-block reservation is a later optimisation.
- [Reordered frame across two connections is dropped] → same as today; documented.
- [Crash after receive persist, before handling, loses that envelope] → resend after
  reconnect plus `messageId` dedupe recovers the common case; documented.
- [Stale `lastPrefFlushError` from an unrelated key fails a send] → the error is cleared
  on the next successful write; a failing secure store should fail closed anyway.

## Migration Plan

Docs first, then code. Ship desktop and mobile builds together. Rooms keep their keys and
counters; no data migration. Rollback = previous build on both devices (frames sealed by
the new build are unreadable by the old one, so roll both back together).
