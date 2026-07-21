# Get Now Here — P2P Chat Protocol

**Status:** Living specification. Code scaffolding aligns to this document.
The full P2P transport is **not yet implemented**; adapters are mocked at the
boundaries defined here. This document is the source of truth for the shape of
the code that follows.

**Scope:** Web app (Vite + React) today; future Expo WebView wrapper must remain
compatible. No native-only primitives may be required in the shared protocol
layer.

---

## 1. Purpose

Get Now Here is a Conceal-native messenger: wallet identity is the relationship
anchor, and private chat is established between two parties who have proven a
bidirectional Conceal relationship.

### Why Conceal smart messages are the signaling/bootstrap layer

- Conceal smart messages ride on-chain inside a transaction's `tx_extra`
  MESSAGE record (type `0x04`) with an optional TTL record (`0x05`). They are
  encrypted by the Conceal protocol's own view-key privacy, so the signaling
  channel inherits Conceal's on-chain encryption.
- This gives us a **store-and-forward signaling path** that does not require
  either peer to be online at the same time and does not require a separate
  signaling server.
- The `messages` namespace of `conceal-wallet-sdk` already provides
  `encodeSmartMessage` / `parseSmartMessage` / `ttlMinutesToUnix` and a
  `KNOWN_MODULES` set including `"contact"` and `"trust"`. We use these for
  relationship bootstrap and chat-invite delivery.

### Why live chat moves to a second-layer P2P transport

- On-chain smart messages are high-latency (block times), paid (transaction
  fees), and not suited to streaming interactive chat.
- Once two peers have bootstrapped a session via smart messages, live chat
  moves to a direct P2P transport inspired by Keet/Holepunch (hyperswarm DHT +
  hypercore streams). The smart-message layer remains the fallback signaling
  path for rekey, reconnect, and room recovery.
- The P2P transport is a **separate cryptographic layer** from Conceal's
  on-chain encryption. It is authenticated by the handshake in the invite and
  encrypted with ChaCha20-Poly1305 (see §8).

---

## 2. Scope and non-goals

### Covered now

- Relationship model: CCX address + `paymentIdFrom` + `paymentIdTo`.
- Smart-message invite composition, encoding, and (mocked) delivery.
- Invite lifecycle states and expiry.
- Typed interfaces for the protocol boundaries (§13, §14).
- Handshake payload structure and cipher-suite identifier.

### Intentionally mocked or deferred

- **On-chain delivery** of smart messages (`buildMessageTransaction` +
  `daemon.sendrawtransaction`) — payload is composed but not broadcast.
- **P2P transport** (Hyperswarm/Holepunch) — `ChatTransport` is fully mocked.
- **ChaCha20-Poly1305 session encryption** — cipher suite is defined and
  interfaces are scaffolded; the AEAD implementation is adapter-backed and
  initially mocked. We do not claim a working crypto implementation yet.
- **Rekey and close** flows — message types are defined; handlers are TODO.

### Not yet implemented

- Ephemeral key exchange over the wire (X25519 is the intended KDF input;
  see §9). Key generation helpers are TODO.
- Nonce strategy enforcement (§8) — strategy is specified, enforcement is TODO.
- Native secure storage migration (§12).
- Group chat (this protocol is 1:1 for now).

---

## 3. Trust model

### Trusted

- The user's own device and its local app passcode gate.
- The Conceal wallet's spend/view keys held locally by the wallet service.
- The `conceal-wallet-sdk` `messages` namespace for smart-message
  encode/parse/TTL (pure JS, deterministic, round-tripped).

### Untrusted

- The on-chain message channel contents — treated as attacker-controlled
  input. All incoming smart messages are parsed and validated before any
  state change.
- The P2P transport peers — authenticated solely via the handshake in the
  accepted invite; no peer is trusted before handshake completion.
- Any relay or DHT node — the P2P layer must not trust relays for
  confidentiality; that is the job of the ChaCha20-Poly1305 session layer.

### Data exposure

- **Conceal on-chain:** the *existence* and *timing* of a smart-message
  transaction is public on the chain. The *contents* are encrypted by the
  Conceal view-key privacy layer. Metadata (sender/recipient addresses,
  payment IDs embedded in integrated addresses) are visible to the same
  extent as any Conceal transaction.
- **P2P session:** once established, chat content is encrypted under the
  derived session key. Transport metadata (peer endpoints, connection
  timing) is visible to the P2P transport/relay layer to the extent that
  Holepunch exposes it; content is not.
- **Local storage:** invite envelopes and session configs are stored locally
  (§12). Raw spend keys are never stored outside the wallet service.

### How relationship establishment gates invites

- A chat invite may only be composed for a contact whose
  `relationshipStatus === "established"`, i.e. both `paymentIdFrom` and
  `paymentIdTo` have been exchanged. This is enforced at the
  `SmartMessageProtocolService` boundary (§13), not just in the UI.
- The relationship is the trust root for the invite: the counterpart is
  authenticated *by the fact that they control the CCX address and can read
  the smart message encrypted to its view key*.

---

## 4. Relationship model

A relationship is a bidirectional, on-chain-verifiable link between two Conceal
wallets.

| Field | Meaning |
|---|---|
| `ccxAddress` | The counterpart's Conceal address. Anchors identity. |
| `paymentIdFrom` | Local identifier this app uses to recognize the counterpart. Carried in the `trust/link` smart message. |
| `paymentIdTo` | Identifier provided by the counterpart. Required to complete the relationship. |

### Lifecycle

1. **Contact added** — local record with `ccxAddress` + `paymentIdFrom`,
   `relationshipStatus = "pending"`.
2. **Link request sent** — a `{trust, link, paymentIdFrom}` smart message is
   composed (and, when wired, broadcast) to the counterpart.
3. **Relationship established** — once `paymentIdTo` is received and validated
   (≥16 hex chars, matching the counterpart's integrated-address payment ID),
   `relationshipStatus = "established"`. The contact is now **eligible for a
   chat invite** (`chatStatus` may move to `"eligible"`).

A relationship may also be `"blocked"` or `"archived"`; neither is eligible
for invites.

---

## 5. Signaling flow

Full lifecycle from contact addition to an active P2P room:

```
   Alice (sender)                                Bob (receiver)
   ─────────────                                 ─────────────
1. Add contact (ccxAddress, paymentIdFrom)
   relationshipStatus = pending
2. compose {trust,link,paymentIdFrom} smart msg
   ─── on-chain smart message ───────────────►
3.                                              parse {trust,link,...}
                                                store paymentIdFrom-as-To
                                                relationshipStatus = established
4.                                              compose {trust,link,paymentIdTo}
   ◄── on-chain smart message ────────────────
5. parse, store paymentIdTo
   relationshipStatus = established
6. compose chat.invite (§6) with handshake (§7)
   encrypt payload via Conceal view-key privacy
   ─── on-chain smart message ───────────────►
7.                                              fetchIncomingMessages
                                                parse chat.invite
                                                validate expiry + relationship
                                                inviteStatus = received
8.                                              acceptInvite → chat.accept
   ◄── on-chain smart message (accept) ────────
9. parse chat.accept
   derive session (§9)
10. both peers: sessionBootstrapCompleted
    P2P room becomes active (chatStatus = active)
    ChatTransport.sendMessage now flows over P2P (ChaCha20-Poly1305)
```

Steps 1–5 are the relationship bootstrap. Steps 6–10 are the chat bootstrap.
The P2P room becomes active only after both peers have derived the same
session config from the handshake exchange.

---

## 6. Protocol messages

All protocol messages are carried as Conceal smart-message bodies (via
`encodeSmartMessage`) using module `"contact"`. The action string identifies
the message type.

### `chat.invite` (action `"invite"`)

Sent by the relationship-established peer to bootstrap a P2P chat session.
Carries the sender's half of the handshake (§7).

### `chat.accept` (action `"accept"`)

Sent by the invitee to accept the invite and complete the handshake. Carries
the receiver's ephemeral public key and chosen nonce seed.

### `chat.reject` (action `"reject"`) — optional

Sent by the invitee to explicitly decline. Sets the invite to a terminal
`rejected` state. If absent, the invite simply expires (§10).

### `chat.rekey` (action `"rekey"`) — optional, deferred

Initiates a forward-secret rekey of an active session. New ephemeral keys,
new session key derivation, new nonce window. Handler is TODO.

### `chat.close` (action `"close"`) — optional, deferred

Tear down an active session and forget the room key. Handler is TODO.

---

## 7. Handshake payload

The inner handshake structure is carried inside `chat.invite` and completed
in `chat.accept`. It is the cryptographic root of the P2P session.

| Field | Type | Notes |
|---|---|---|
| `protocolVersion` | `number` | Bumped on breaking protocol changes. Current: `1`. |
| `inviteId` | `string` | Correlation id for the invite/accept pair. |
| `relationshipId` | `string` | Derived from the bidirectional payment IDs; binds the session to the relationship. |
| `roomId` / `roomRef` | `string` | P2P room identifier (hyperswarm topic / room key reference). |
| `cipherSuite` | `CipherSuiteId` | `CHACHA20_POLY1305_V1`. See §8. |
| `senderEphemeralPublicKey` | `string` (hex) | Sender's ephemeral X25519 public key. |
| `receiverEphemeralPublicKey` | `string` (hex) | Filled in the `chat.accept` flow. |
| `kdf` | `"HKDF_SHA256_V1"` | KDF identifier for session derivation. |
| `nonceSeed` | `string` (hex) | Per-session random seed; nonce derivation is deterministic from seed + counter (§8). |
| `nonceStrategy` | `"counter_from_seed"` | How nonces are produced. |
| `salt` | `string` (hex) | HKDF salt; mixes in `relationshipId` + `roomId`. |
| `expirationTimestamp` | `number` (unix seconds) | Invite expiry; enforced before accept. |
| `replayId` | `string` | Unique per invite; tracked to reject duplicates (§10). |
| `correlationTag` | `string` (hex, optional) | Opaque tag to correlate invite/accept without exposing relationship. |
| `capabilityToken` | `string` (optional) | Optional capability/role token for the session. |
| `transportMetadata` | `object` (optional) | Adapter-specific hints (e.g. candidate relays). |

The handshake is **not** self-authenticating over the wire; its authenticity
comes from the Conceal smart-message channel (encrypted to the counterpart's
view key). The handshake's job is to establish the *P2P session key*, not to
authenticate the channel.

---

## 8. Cryptographic model

Two distinct cryptographic layers:

### Layer 1 — Conceal smart-message signaling privacy

- Provided by the Conceal protocol itself: smart messages ride a transaction's
  `tx_extra` and are encrypted under the recipient's view key by the Conceal
  on-chain privacy model.
- We do **not** re-encrypt the smart-message body at the application layer for
  signaling; we rely on Conceal's view-key encryption for transport privacy.
- This layer authenticates *that* the message came from the holder of the
  sender's wallet and is readable only by the holder of the recipient's view
  key.

### Layer 2 — P2P session encryption

- The P2P session uses **ChaCha20-Poly1305** as the AEAD model
  (RFC 8439: ChaCha20 stream cipher + Poly1305 MAC).
- The session key is derived from the handshake (§9), **not** from the
  Conceal wallet keys. The wallet keys authenticate the signaling channel;
  the session key encrypts the live chat.
- **Nonce uniqueness is critical.** ChaCha20-Poly1305 is catastrophically
  broken by nonce reuse under the same key. Nonces are **not** to be
  hand-waved:
  - Nonces are derived deterministically from a per-session `nonceSeed` plus
    a monotonically increasing 32-bit counter (`nonceStrategy = "counter_from_seed"`).
  - The counter is persisted per session so restart does not rewind the
    nonce window.
  - Each direction (A→B, B→A) uses a distinct derived subkey so the two
    directions never share a nonce space.
- We do **not** claim a final, audited crypto implementation today. The
  cipher suite is defined, the interfaces are scaffolded, and the AEAD
  call sites are adapter-backed (initially mocked). See the TODO markers in
  `P2PEncryptionService` (§13).

---

## 9. Session derivation model

Conceptual flow (exact primitives are adapter-backed and may be mocked
initially):

1. **Sender ephemeral key generation** — sender generates an ephemeral X25519
   keypair and places the public key in the `chat.invite` handshake.
2. **Receiver ephemeral key generation** — on `chat.accept`, the receiver
   generates its own ephemeral X25519 keypair and places the public key in the
   acceptance.
3. **Session derivation step** — both sides perform X25519 ECDH
   (sender_priv × receiver_pub == receiver_priv × sender_pub), then run
   HKDF-SHA256 over the shared secret with `salt` and `info = {protocolVersion,
   cipherSuite, relationshipId, roomId}` to produce:
   - `sendKey` (A→B direction)
   - `recvKey` (B→A direction)
   - `nonceSeedA`, `nonceSeedB` (or a single seed + direction discriminator)
4. **Resulting session config** — a `P2PSessionConfig` (§14) capturing the
   keys (as references, not raw material in persisted storage where possible),
   cipher suite, nonce strategy, and room reference.
5. **Adapter note** — the exact ECDH/HKDF implementation may be provided by a
   JS crypto adapter (libsodium/`@noble/curves`) or, in the Expo path, by a
   native module. The `P2PEncryptionService` interface (§13) is the seam.

---

## 10. Replay / expiry / lifecycle rules

- **Invite expiry** — every invite carries `expirationTimestamp`. An accept
  after expiry is rejected; the invite moves to `expired`.
- **Duplicate invite handling** — `replayId` is tracked per relationship.
  A second invite with an already-seen `replayId` is dropped as a replay.
- **Stale room handling** — if a session's room has not seen activity beyond
  a retention window (governed by privacy settings), the room key is dropped
  and a new invite is required to resume.
- **Accepted/rejected/expired states** — terminal. An invite in any of these
  states cannot be accepted again. `chat.rekey` is the only way to refresh
  an *active* session; it does not resurrect a terminal invite.
- **Future rekey path** — `chat.rekey` carries new ephemeral keys and a new
  `nonceSeed`; the same HKDF flow produces a fresh `P2PSessionConfig` under a
  new `sessionId` while preserving `roomId` and `relationshipId`. Handler is
  TODO.

---

## 11. Client state model

### Relationship states (`RelationshipStatus`)

`pending` → `established` → (`blocked` | `archived`)

### Invite states (`InviteStatus`)

`none` → `sent` | `received` → `accepted` | `expired` | `rejected`

### Session states (`PeerSessionState`)

`idle` → `handshaking` → `active` → (`rekeying` | `closed`)

### Room states (`ChatStatus`)

`unavailable` → `eligible` → `invited` → `active`

A room is `eligible` when the relationship is `established`; `invited` when an
invite is sent/received; `active` when the session reaches `active`.

---

## 12. Storage model

### Persisted now (local mock storage)

- Contacts (with relationship + invite + chat status).
- `SmartMessageInvite` records (envelope + metadata).
- `ChatRoom` records (room id, key reference, peer status).
- `ChatMessage` history (mock).

### Should later move to secure/native storage

- Raw session key material (`sendKey`/`recvKey`). Today these are not
  persisted at all (mock). When real, they belong in a native keystore
  (iOS Keychain / Android Keystore) via the Expo native module path.
- Ephemeral private keys — must never be persisted; kept in memory only.
- `nonceSeed` + counter — should be integrity-protected native storage to
  prevent nonce-window rewind (§8).

### Should remain mock/local for now

- Inbox/outbox of smart messages (mock arrays in the adapters).
- Chat message history (mock). Real on-chain message scanning will replace
  the inbox; encrypted local history will replace the mock store.

---

## 13. Transport abstraction

Boundaries the code aligns to. Each is an interface; adapters implement them.

### `SmartMessageProtocolService`

Owns the protocol-message layer on top of the raw smart-message channel:
compose/encode `chat.invite` / `chat.accept` / `chat.reject` / `chat.rekey` /
`chat.close`, validate incoming, enforce relationship-gating and replay/expiry
rules. This is the protocol seam above the raw `SmartMessageService` (which
only handles encode/parse/send of smart-message bodies).

### `SessionBootstrapService`

Derives a `P2PSessionConfig` from a completed invite/accept handshake. Takes
the handshake payloads from both sides, runs the KDF (or delegates to
`P2PEncryptionService`), and emits the session config + room bootstrap.

### `P2PEncryptionService`

The AEAD seam: keypair generation, ECDH, HKDF, and `seal`/`open` of P2P
message frames under the session key with the nonce strategy from §8.
Adapter-backed; initially mocked. **Must not** be assumed to be secure until
a real adapter is wired.

### `ChatTransport`

Unchanged from the existing interface: create/join room, send/subscribe
messages, peer status. The mock implementation stays; a future
HolepunchChatTransport implements the same interface and calls
`P2PEncryptionService` to seal/open frames.

---

## 14. TypeScript mapping

The code must align to these exact interfaces/types (see
`src/types/protocol.ts`):

- `CipherSuiteId` — union, currently `"CHACHA20_POLY1305_V1"`.
- `ChatInvitePayload` — the `chat.invite` protocol message body.
- `ChatInviteAcceptancePayload` — the `chat.accept` protocol message body.
- `ChatInviteHandshake` — the inner handshake structure (§7).
- `P2PSessionConfig` — the derived session config (§9).
- `InviteEnvelope` — the wrapped smart-message envelope carrying an invite.
- `PeerSessionState` — session lifecycle state (§11).

Service interfaces (see `src/types/services.ts` additions):
- `SmartMessageProtocolService`
- `SessionBootstrapService`
- `P2PEncryptionService`

---

## 15. Open questions

1. **ECDH primitive source.** Use `@noble/curves` (pure JS, WASM-free) vs
   libsodium-wrappers vs a native Expo module? Affects bundle size and the
   Expo WebView path. Unresolved.
2. **Nonce counter persistence.** Where exactly does the 32-bit counter live
   to survive app restarts without a native keystore on web? IndexedDB with
   integrity? Unresolved.
3. **`relationshipId` derivation.** Is it `hash(paymentIdFrom ‖ paymentIdTo)`
   (ordered) or `hash(sort([a,b]))` (symmetric)? Affects who can derive it
   without knowing order. Unresolved.
4. **On-chain message scanning.** Does the wallet sync already surface
   `tx_extra` MESSAGE records, or do we need a dedicated scan path? Depends
   on SDK surface not yet verified. Unresolved.
5. **Holepunch/hyperswarm in a WebView.** Does the P2P transport require a
   native network module even in the Expo path, or can a relayed web transport
   be the fallback? Unresolved.
6. **Rekey trigger policy.** Time-based, message-count-based, or
   manual-only? Unresolved.
7. **Group chat.** Intentionally out of scope now; the handshake assumes 1:1.
   Multi-party would need a group session-key agreement. Unresolved.
