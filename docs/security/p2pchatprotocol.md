# Get Now Here — P2P Chat Protocol

**Status:** Living specification. This document is the source of truth.

**Scope:** Web app (Vite + React) today; future Expo WebView wrapper must remain
compatible. No native-only primitives may be required in the shared protocol
layer.

---

## 1. Purpose

Get Now Here is a Conceal-native messenger: wallet identity is the relationship
anchor, and private chat is established between two parties who have proven a
bidirectional Conceal relationship.

### Why Conceal smart messages are the signaling layer

- Conceal smart messages ride on-chain inside a transaction's `tx_extra`
  MESSAGE record (type `0x04`).
- **Chat contact signaling does not use Conceal tx_extra TTL (`0x05`).**
  `inviteExpiry` and `roomTtl` are app-layer fields inside the body only.
  On-chain TTL is a separate mempool feature (used elsewhere, e.g. pulse) —
  not for create / register / revoke.
- They provide store-and-forward signaling without a separate signaling server.
- The `messages` namespace of `conceal-wallet-sdk` provides
  `encodeSmartMessage` / `parseSmartMessage` / `ttlMinutesToUnix` and
  `KNOWN_MODULES` including `"contact"` and `"trust"`.

### Why live chat requires Holepunch

- On-chain smart messages are high-latency and not suited to interactive chat.
- **Holepunch (hyperswarm-style topic join + peer streams) is required
  architecture** for live encrypted chat — not an optional future note.
- Invite **acceptance (`register`) is only the handoff** into peer transport.
  Live messaging is allowed only when the room is **Holepunch-connected**.
- App-layer encryption for live frames is ChaCha20-Poly1305 (see §8 and
  `encryption.md`).

---

## 2. Scope

### Covered

- Relationship model: CCX address + `paymentIdFrom` + `paymentIdTo`.
- Smart-message create / register / revoke (SDK ACTION_MAP verbs).
- Pending rooms, dual TTL (`inviteExpiry` + `roomTtl`), tombstones.
- Typed `HolepunchBootstrapContract` handoff.
- Holepunch connect / retry / connected lifecycle.
- ChaCha20-Poly1305 session frames; content envelopes (text/reaction/edit/delete).

### Still evolving

- Real Hyperswarm DHT in constrained WebViews may need a documented bridge;
  the `ChatTransport` / `HolepunchBootstrapContract` seam stays stable.

### On-chain delivery (landed)

- Create / register / revoke ride `buildMessageTransaction` + daemon broadcast
  as **mined** smart messages. Contact signaling never sets Conceal `tx_extra`
  TTL (`0x05` / `ttlUnixSeconds: 0`).
- Fee shape (atomic units, same as next-wallet mined message):
  - message amount = `100` (`MESSAGE_TX_AMOUNT_ATOMIC`)
  - network fee = `1000` (`MINIMUM_FEE_V2`)
  - remote node fee = `10000` (`REMOTE_NODE_FEE_ATOMIC`) when the node
    advertises a fee address
- Inbound bodies are reconstructed during wallet sync via
  `readMessageFromTransaction` into `raw.receivedMessages`.
- Bodies must fit `MAX_MESSAGE_BODY_BYTES` (251). Create targets **≤120 chars**
  (practical room for payment-id + fees in wallet UIs):
  `{contact,c,pv,<b64url>}` slim pack (64 bytes raw):
  `inviteId(4) | roomId(4) | eph(32) | nonceSeed(8) | inviteExpiry(u32) |
  roomTtl(u32) | replayId(8)`.
  **Not on wire:** `relationshipId` (from payment IDs) and `salt`
  (`deriveInviteSalt(rel, room, invite)`). Suite/kdf/strategy implied by
  `protocolVersion`; alias/caps local-only.
  Legacy 136-byte pack / positional creates are still accepted on parse.

---

## 3. Trust model

### Trusted

- The user's device and local passcode gate.
- Local Conceal wallet spend/view keys.
- SDK `messages` encode/parse/TTL (pure JS).

### Untrusted

- On-chain smart-message contents — parse and validate before state change.
- Holepunch peers — authenticated via handshake-derived session keys.
- Relays / DHT nodes — not trusted for confidentiality.

---

## 4. Relationship model

Both `paymentIdFrom` and `paymentIdTo` (≥16 hex) are required for
`relationshipStatus === "eligible"`. That means the contact is **eligible** for
a chat invite — nothing is “established” or live yet. Only eligible contacts may
receive `chat.create`. Blocked/archived are ineligible.

**Pending invites** (`inviteStatus` `sent` | `received`) are only valid while
the contact remains eligible. If eligibility is lost (missing payment ID,
blocked, archived), pending invite state is cleared to `none`.

| Field | Meaning |
|---|---|
| `paymentIdFrom` | **Receiver-assigned.** You generate and share this ID. On **receive**, you use it to identify who the tx comes **from**. Counterpart stores it as their `paymentIdTo`. (Same pattern as an exchange giving you a deposit payment ID.) |
| `paymentIdTo` | **Sender-facing.** Your contact generated this for you. On **send**, you attach it so they identify you on receive. |

---

## 5. Wire mapping (SDK ACTION_MAP)

Module: **`contact`**.

| UX | App type | Wire action | Shorthand |
|---|---|---|---|
| Create chat | `chat.create` | `create` | `c` |
| Accept | `chat.register` | `register` | `r` |
| Decline | `chat.revoke` | `revoke` | `k` |

Legacy scaffold verbs `invite` / `accept` / `reject` are **rejected** (no compat shim).

Relationship signaling remains `{trust,link,…}` (unchanged).

---

## 6. Signaling flow → Holepunch handoff

```
Alice                                         Bob
─────                                         ───
1. relationship eligible (both payment IDs)
2. {contact,c,…} chat.create  ──────────────►
3. pending room (local)                       pending room (local)
4.                                            UI Accept / Decline
5a. ◄──────── {contact,k,…} revoke            (decline → tombstone both)
5b. ◄──────── {contact,r,…} register
6. Alice scans received register (refreshInvites / open contact or room),
   restores stashed initiator ephemeral, derives session + contract
6b. Bob already derived on Accept
7. inviteStatus = accepted (signaling terminal)
8. room: accepted → connecting → Holepunch join(topicRef)
9. peer established → room connected
10. live frames under ChaCha20-Poly1305
```

**Accept is not the end of the chat lifecycle.** Steps 6–9 are mandatory.
Alice must observe Bob’s on-chain `register` on her wallet (not only Bob’s
Accept UI). Initiator ephemeral keys are stashed locally until that handoff.

---

## 7. Handshake deadlines (app-layer only)

Handshake fields include: `protocolVersion` (1), `inviteId`, `relationshipId`,
`roomId`, `cipherSuite: CHACHA20_POLY1305_V1`, ephemeral pubs, `kdf`,
`nonceSeed`, `nonceStrategy: counter_from_seed`, `salt`, **`inviteExpiry`**,
**`roomTtl`**, `replayId`.

These deadlines live **only inside the smart-message body**. They are **not**
Conceal `tx_extra` TTL (`0x05`). The on-chain send always uses `ttlUnixSeconds: 0`.

| Field | Meaning |
|---|---|
| `inviteExpiry` | Accept window. If user2 does not `register` before this unix time, the invite is trash (`expired`); user1 must compose and send a new create. |
| `roomTtl` | Chat-instance auto-destruct — room ends whether pending, connecting, or connected. |

Clock skew allowance: ±120 seconds, then fail closed.

---

## 8. Cryptographic model

### Layers

- **Layer 1:** Conceal view-key privacy for smart-message signaling.
- **Layer 2:** **ChaCha20-Poly1305 (RFC 8439)** for Holepunch frames — IETF
  construction with a **96-bit nonce**. We do **not** use XChaCha20-Poly1305
  (192-bit nonce variant) for `CHACHA20_POLY1305_V1`.

Library note: `@noble/ciphers` exposes both ChaCha and XChaCha helpers. The
product cipher suite id `CHACHA20_POLY1305_V1` binds to **ChaCha20-Poly1305
only**. Switching to XChaCha requires a new suite id, doc update, and
version bump — never a silent swap.

### Key schedule (session derive)

1. Ephemeral X25519 keypairs (Alice on create, Bob on register).
2. ECDH shared secret = X25519(local_priv, remote_pub).
3. HKDF-SHA256:
   - IKM = shared secret
   - salt = handshake `salt` (hex)
   - info = `protocolVersion|cipherSuite|relationshipId|roomId`
   - L = 64 bytes
4. Split OKM:
   - bytes[0..32) = initiator→responder key (Alice send / Bob recv)
   - bytes[32..64) = responder→initiator key (Bob send / Alice recv)
5. Each peer stores **sendKeyRef** / **recvKeyRef** (handles), not raw keys in UI.
6. Wipe ephemeral private keys immediately after derive.

### Nonce strategy (`counter_from_seed`)

RFC 8439 security collapses on nonce reuse under the same key.

Rules (enforced in `P2PEncryptionService`):

- Nonce length: **12 bytes (96 bits)**.
- Per direction, use a distinct key (send vs recv) so nonce spaces never share.
- For each seal under `sendKey`:
  - `nonce = HKDF-SHA256(nonceSeed, salt=direction, info="nonce|{counter}", 12)`
  - then increment persisted `sendCounter` (never rewind after reconnect).
- Open uses the peer’s counter space via `recvKey` + received nonce bytes.
- Counters persist with the session; app restart must restore counters before seal.
- UI and transport must not invent nonces.

See also `docs/security/encryption.md` § Nonce rules / Key schedule.

---

## 9. HolepunchBootstrapContract

Built only after valid register + session derive. Consumed by
`HolepunchChatTransport.connect`.

### Carried from smart-message → P2P

| Field | Source | Purpose |
|---|---|---|
| `roomId` | create handshake | Room identity |
| `relationshipId` | create handshake | Bind session to relationship |
| `inviteId` / `sessionId` | handshake / derive | Correlation |
| `cipherSuite` | handshake | AEAD selection |
| `sendKeyRef` / `recvKeyRef` | HKDF split | Directional keys (handles) |
| `nonceSeed` / counters / strategy | handshake + derive | Nonce uniqueness |
| `peerRole` | create vs register | Initiator/responder |
| `transport.topicRef` | hash(roomId, relationshipId) | DHT/topic join |
| `roomTtl` | create handshake | Hard destroy while connecting/connected |

### Explicitly NOT carried

Raw private keys, smart-message bodies, payment IDs, display aliases, bootstrap ciphertext.

### Holepunch transport responsibilities

1. Join `topicRef` (discovery).
2. Establish peer channel; set room `connecting` → `connected` or `connect_failed`.
3. Retry with exponential backoff + jitter (see §10); respect `roomTtl`.
4. Seal/open content envelopes only when lifecycle is `connected`.
5. On disconnect within TTL: return to `connecting` and reconnect without resetting nonce counters.

### Composer / send enablement (product rule)

| Room lifecycle | Composer | `sendMessage` |
|---|---|---|
| `pending` / `accepted` / `connecting` / `connect_failed` / … | **Disabled** | **Throws** |
| `connected` | **Enabled** | Allowed |

`inviteStatus === accepted` alone must never enable the composer.

**Topic derivation:**

`topicRef = hex(hash("gnh-chat-v1" || roomId || relationshipId))`

Never embed raw payment IDs in the topic.

---

## 10. State machines

### InviteStatus

`none` → `sent`|`received` → `accepted`|`rejected`|`expired`|`failed`

`accepted` is terminal for **signaling only**.

### RoomLifecycleStatus

`pending` → `accepted` → `connecting` → `connected`

Also: `connecting` ↔ `connect_failed` (retry); `pending` → `declined`|`expired`|`failed`;
any → `expired`/`destroyed`/`closed` via TTL or teardown.

**Invalid:** send live messages unless `connected`.

### ChatStatus (derived)

`unavailable` → `ready` → `invited` → `connecting` → `active` (only when connected)

Relationship `eligible` (both payment IDs) unlocks chat `ready` — still not live.

### Connect failure / retry

Codes: `timeout`, `unreachable`, `crypto_mismatch`, `aborted`, `expired`, `unknown`.

Policy (see `src/services/p2p/holepunchPolicy.ts`):

- **30s** per-attempt connect timeout
- Exponential backoff with jitter: 1s, 2s, 4s… **cap 60s**
- Retry until `roomTtl` or user cancel; surface `connectAttempts`
- Retryable: `timeout`, `unreachable`, `unknown`; not retryable: `crypto_mismatch` without rekey

Composer remains disabled in `connect_failed` until a successful connect reaches `connected`.

---

## 11. Tombstones

On decline/expiry/destroy: wipe bootstrap ciphertext and ephemeral/session secrets;
retain minimal `{ inviteId, replayId, roomId, contactId, status, TTLs, tombstonedAt }`
for replay/idempotency. GC after `max(inviteExpiry, roomTtl) + 7d` (keep replay ids).

---

## 12. Storage

Persist separately (do not collapse these):

| Record | Key fields | Note |
|---|---|---|
| Invite | `inviteStatus` including `accepted` | Signaling terminal — **not** live |
| Room | `lifecycleStatus` (`accepted` ≠ `connected`) | Composer uses room status only |
| Session | `sendCounter` / `recvCounter` + key refs | Restore before seal after restart |

- Contacts → `gnh.contacts` (StorageAdapter) **and** wallet blob
  `addressBook` (encrypted .json export/import).
- Invite records (tombstoned), rooms, nonce counters — local via
  `StorageAdapter` / IndexedDB as implemented.
- Metadata export (`Settings → Backup`) includes contacts in the downloaded
  `.json` (no seed).
- Raw session keys: memory / secure storage path; never in logs.
- Ephemeral private keys: memory only.
- **Never** derive UI “chat live” from `inviteStatus === accepted` alone.

---

## 13. Service boundaries

- `SmartMessageProtocolService` — create/register/revoke compose + validate
- `ConcealSmartMessageAdapter` — SDK encode + delivery channel
- `SessionBootstrapService` — derive session + `buildHolepunchContract`
- `P2PEncryptionService` — X25519/HKDF/AEAD
- `HolepunchChatTransport` — connect/retry/send/subscribe (required product path)

Wiring: `src/services/index.ts` imports **real** adapters; mocks commented out.

---

## 14. Content envelopes (Holepunch frames)

`ChatContentEnvelopeV1`: `schemaVersion`, `messageId`, `clientId`, `sentAt`,
`kind: text|reaction|edit|delete`, optional `text` / `targetMessageId` / `reaction`.

These never ride Conceal smart messages.

---

## 15. Open questions (defaults)

1. ECDH: `@noble/curves` + `@noble/hashes` (web-first).
2. `relationshipId`: `hash(sort([paymentIdFrom, paymentIdTo]))`.
3. One pending invite per relationship; new create supersedes prior pending.
