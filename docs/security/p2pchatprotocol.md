# Get NowHere — P2P Chat Protocol

**Status:** Living specification. This document is the source of truth.

**Scope:** Web app (Vite + React) today. Mobile delivery uses Expo UI plus a
Bare Hyperswarm worklet behind the same bridge contract (see
`docs/architecture/mobile-p2p-runtime.md`). Shared protocol must not require
browser-only Hyperswarm.

---

## 1. Purpose

Get NowHere is a Conceal-native messenger: wallet identity is the relationship
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
- **0-conf preview:** mempool scan surfaces inbound smart messages early. For an
  existing contact (known `paymentIdFrom`), chat create/register may be acted on
  before the tx mines. Unknown payment IDs are ignored until (and unless) matched —
  never use 0-conf alone to establish a *new* relationship.
- The `messages` namespace of `conceal-wallet-sdk` provides
  `encodeSmartMessage` / `parseSmartMessage` / `ttlMinutesToUnix` and
  `KNOWN_MODULES` including `"contact"` and `"trust"`.

### Why live chat requires Holepunch

- On-chain smart messages are high-latency and not suited to interactive chat.
- **Holepunch (hyperswarm-style topic join + peer streams) is required
  architecture** for live encrypted chat — not an optional future note.
- Invite **acceptance (`register`) is only the handoff** into peer transport.
  **Live** (`channel: "live"`) messaging is allowed only when the room is
  **Holepunch-connected**.
- **L1′ chat relay** (`channel: "relay"`, wire `execute` / `e`) is an
  SMS-class fallback after accept when Hyperswarm is not connected — fee +
  ~block latency, grey bubbles. App text inside Conceal MESSAGE (chain ChaCha).
  Never while `pending`. It does **not** replace L2. See §16.
- **L1 session seal** (ChaCha20-Poly1305 with handshake-derived keys) seals live
  frames before the bridge; Hyperswarm Noise (**L2**) protects the DHT hop.
  There is **no L3** — live AEAD is an L1 key use, not a third layer. See
  `encryption.md`.
- One **room** (`roomId`) may show both L2 live and L1′ relay messages in one
  thread (timestamp order; `channel` distinguishes source).
- The Vite UI does **not** join Hyperswarm. The Pear-shaped runtime
  (`holepunch-sidecar/` today; Bare worklet on mobile) owns swarm lifecycle;
  the UI uses the live bridge schema. See
  `docs/architecture/holepunch-sidecar.md`,
  `docs/architecture/mobile-p2p-runtime.md`,
  `docs/architecture/pairing-and-topics.md`, and
  `docs/prompts/coding-constraints.md`.

---

## 2. Scope

### Covered

- Relationship model: CCX address + `paymentIdFrom` + `paymentIdTo`.
- Smart-message create / register / revoke (SDK ACTION_MAP verbs).
- L1′ chat relay (`chat.relay` / wire `execute`) for offline fallback.
- Pending rooms, dual TTL (`inviteExpiry` + `roomTtl`), tombstones.
- Typed `HolepunchBootstrapContract` handoff.
- Holepunch connect / retry / connected lifecycle.
- L1-sealed ChaCha20-Poly1305 live frames; content envelopes (text/reaction/edit/delete).
- Dual-path composer: prefer `live` when connected; allow L1′ `relay` when
  lifecycle is relay-eligible.

### Still evolving

- Hyperswarm runs in the **Node Holepunch sidecar** for desktop/web-dev
  (`docs/architecture/holepunch-sidecar.md`). Browser JS is UI-only.
- Packaged desktop target: **Electron** main / Pear-end + same bridge
  (`docs/architecture/electron-desktop.md`).
- Mobile target: **Bare worklet** + same bridge
  (`docs/architecture/mobile-p2p-runtime.md`).
- Rejected: Nitro-Hyperswarm; React Native desktop.
- The `ChatTransport` / `HolepunchBootstrapContract` seam stays stable across
  sidecar vs Electron IPC vs Bare backends.

### On-chain delivery (landed)

- Create / register / revoke / **L1′ relay** ride `buildMessageTransaction` + daemon
  broadcast as **mined** smart messages. Contact signaling never sets Conceal
  `tx_extra` TTL (`0x05` / `ttlUnixSeconds: 0`). L1′ is app-layer text inside
  Conceal MESSAGE (chain ChaCha); see §16.
- Fee shape (atomic units, same as next-wallet mined message):
  - message amount = `100` (`MESSAGE_TX_AMOUNT_ATOMIC`)
  - network fee = `1000` (`MINIMUM_FEE_V2`)
  - remote node fee = `10000` (`REMOTE_NODE_FEE_ATOMIC`) when the node
    advertises a fee address
- Inbound bodies are reconstructed during wallet sync via
  `readMessageFromTransaction` into `raw.receivedMessages`.
-   Bodies must fit `MAX_MESSAGE_BODY_BYTES` (251). Create targets **≤122 chars**
  (practical room for payment-id + fees in wallet UIs):
  `{contact,c,pv,<b64url>}` slim pack (64 bytes raw):
  `inviteId(4) | roomId(4) | eph(32) | nonceSeed(8) | inviteExpiry(u32) |
  roomTtl(u32) | replayId(8)`.
  Optional **`ph`** field (10 bytes, base64url, 14 chars): the sender's `ownPokeId`
  (wake capability). Omitted when push wake is disabled or unavailable.
  `chat.register` carries the same optional `ph` field from the acceptor's side.
  The `ph` field serves dual purpose: on iOS it is registered with the poke gateway to map
  to an APNs device token; on F-Droid it is used directly as the ntfy topic capability
  `gnh-<ph>`. The field name and wire format are identical — the routing decision is made
  by the gateway (APNs token found → APNs push; DB miss → ntfy POST).
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
| Decline | `chat.revoke` | `revoke` | `k` (`user_declined`) |
| Leave forever | `chat.revoke` | `revoke` | `k` (`room_revoked` + `roomId`) |
| L1′ chat relay | `chat.relay` | `execute` | `e` |

Legacy scaffold verbs `invite` / `accept` / `reject` are **rejected** (no compat shim).

Relationship signaling remains `{trust,link,…}` (unchanged).

`chat.relay` (L1′) is **not** create / register / revoke. It carries plain app
fields `{contact,e,roomId,ts,text}`; Conceal MESSAGE encrypts on chain. See §16.

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
11. either ── {contact,k,…} room_revoked ──►  (leave forever → destroy both)
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

### Layers (max security across runtimes)

Canonical layering is defined in `docs/security/encryption.md` § Threat model /
Layering. Summary — **there is no L3**:

| Name | What | Owner |
|---|---|---|
| **L1** | SmartMessage signaling: ECDH + HKDF → session secret, topic bind, post-connect auth; **and** ChaCha20-Poly1305 seal/open of **live** frames with those keys | App / protocol |
| **L1′** | `chat.relay` / `{contact,e,…}` when L2 is unavailable (Conceal MESSAGE on chain) | App / Conceal |
| **L2** | Hyperswarm **Noise** encrypted peer streams (opaque L1-sealed payloads) | P2P runtime (sidecar / Electron / Bare) |

**Why L1 seal over L2:** Noise protects the DHT hop; it ends at the Hyperswarm
process. Every runtime still has a UI↔runtime bridge. Treating that bridge and
runtime as untrusted for plaintext requires seal-before-bridge with L1 session
keys. That seal is an L1 *use*, not a third layer. Do not drop it to “simplify,”
and do not add a third ad hoc stream cipher on Noise.

**L1′:** compensates L2 failure/absence (SMS-class). Different confidentiality
(view-key / chain) than live — see §16. Mixing L1′ and live in one `roomId`
thread is intentional UX.

**Live history is local, not a shared log.** L2 carries sealed frames. This
device may persist what it already saw (wallet blob). There is no Hypercore
replica to request missed live messages. Room TTL / leave-forever wipe local
copies. Peer catch-up is a later protocol change. @see `docs/security/encryption.md`
(local storage rules).

Library note: `@noble/ciphers` exposes both ChaCha and XChaCha helpers. The
product cipher suite id `CHACHA20_POLY1305_V1` binds to **ChaCha20-Poly1305
only**. Switching to XChaCha requires a new suite id, doc update, and
version bump — never a silent swap.

Post-connect: after transport peer presence, prove L1 session/invite binding
before `connected` / composer enable. Topic + Noise alone is not trust.

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

These steps run in the P2P runtime (sidecar / Bare worklet), not in UI React:

1. Await DHT bootstrap, then join `topicRef` via Hyperswarm
   (`swarm.join`, client+server) and `discovery.flushed()`.
2. Establish peer channel; set room `connecting` → `connected` only when
   **peer count ≥ 1** (never self-alone). Else `connect_failed` (`timeout` /
   `unreachable` if sidecar is down). Peer count uses Hyperswarm `peerInfo`
   topics / `topic` events for topics this process has joined (invite already
   carries `topicRef`; the sidecar does not advertise local topics via NDJSON
   hello). Noise streams still use NDJSON for opaque `frame` lines.
3. Retry with exponential backoff + jitter (see §10); respect `roomTtl`.
4. Seal/open **live** content envelopes when lifecycle is `connected` (L1
   session ChaCha20-Poly1305; runtime carries opaque sealed frames over bridge + DHT).
5. On disconnect within TTL: return to `connecting` and reconnect without resetting nonce counters.
6. After transport connect, perform application-layer peer verification
   (relationship / invite identifiers). A shared topic alone does not imply
   trust.
7. On process exit, `swarm.destroy()` so HyperDHT can unannounce (stale DHT
   records slow the next join).

**Runtime (web-first):** Vite UI ↔ live bridge WebSocket
(`VITE_HOLEPUNCH_WS_URL`, default `ws://127.0.0.1:7901`) ↔
`holepunch-sidecar` (Hyperswarm). Port `7901` is localhost bridge only — LAN
peers need UDP/DHT, not an open TCP `7901` between machines. Same-LAN + host
firewall (UFW) is a **developer lab** pitfall; ordinary users on different
NATs must not be required to edit firewalls — see
`docs/architecture/holepunch-sidecar.md` § Two machines on one LAN.
UI must never import `hyperswarm` (`docs/prompts/coding-constraints.md`).

### Composer / send enablement (product rule)

| Room lifecycle | Composer | Preferred channel |
|---|---|---|
| `connected` | **Enabled** | `live` |
| `accepted` / `connecting` / `connect_failed` | **Enabled** | `relay` (L1′) |
| `pending` / terminal | **Disabled** | — |

```ts
preferredChannel(status) => status === "connected" ? "live" : "relay"
canSendMessages(status) =>
  status === "connected" || relayEligible(status)
// relayEligible = accepted | connecting | connect_failed
// pending NEVER — invitee must not be spam-messaged before accept
```

`inviteStatus === accepted` alone does not imply live Holepunch; it does unlock
L1′ relay once the room lifecycle is post-accept.

**Topic derivation (v1 shipped — only formula for codegen):**

```ts
topicRef = sha256Hex(`gnh-chat-v1||${roomId}||${relationshipId}`)
```

Implemented in `src/services/protocol/ids.ts` (`deriveTopicRef`).

- Never use a human-readable room name or guessable string as the raw topic.
- Never embed raw payment IDs or display aliases in the topic.
- Both peers join the derived topic only inside the P2P runtime.
- `roomId` / `topicRef` are capability secrets distributed via encrypted L1
  SmartMessages — not via the local bridge.
- Do not codegen alternate formulas without a protocol bump. Details:
  `docs/architecture/pairing-and-topics.md` (v1) and
  `docs/security/capabilities-and-derivation.md` (strategy + v2 targets).

---

## 10. State machines

### InviteStatus

`none` → `sent`|`received` → `accepted`|`rejected`|`expired`|`failed`

`accepted` is terminal for **signaling only**.

### RoomLifecycleStatus

`pending` → `accepted` → `connecting` → `connected`

Also: `connecting` ↔ `connect_failed` (retry); `pending` → `declined`|`expired`|`failed`;
any → `expired`/`destroyed`/`closed` via TTL or teardown.

**Room list durability:** the Chats room list is persisted (`gnh.roomCatalog`).
A room **disappears from the list only when**:

1. the user **leaves forever** (`leaveRoom`) — local destroy **immediately**, durable
   revoke tombstone written; L1 `chat.revoke` (`room_revoked`) fired in the
   background **only when both `contactId` and `inviteId` resolve**. When ids are
   missing (legacy/incomplete rows), local retirement still completes — peer is
   not notified on-chain. Wallet blob keeps `{ roomId, revoked: true }` so the
   same `roomId` cannot be re-seeded, or
2. the invite was **never accepted** and `inviteExpiry` has passed, or
3. `roomTtl` has expired, or
4. the transport sets `lifecycleStatus: "expired"` (TTL detected at connect or send
   time) — treated as `room_ttl` for retirement purposes and auto-removed on the
   next `loadRooms`.

Restart, `crypto_mismatch`, and temporary offline must **not** remove the room.

**Destroy-path persistence durability:** room destruction (revoke send/receive,
decline, abandon) must **await** the encrypted wallet-blob write
(`persistContacts`), not fire-and-forget it. `hydrateContacts()` prefers the
wallet blob's `addressBook` over `localStorage` on unlock, so a fire-and-forget
write left in flight when the app quits leaves the on-disk blob stale — the
next unlock resurrects the "deleted" room's `roomId`/`inviteStatus` from that
stale blob. Fire-and-forget (`schedulePersistContacts`) is fine for routine,
non-terminal updates; destructive actions must block on the durable write.

**Multiple rooms per contact:** a contact MAY have several live rooms at once
(different `roomId`s, including different `roomTopic` and/or TTL). Sending a
fresh `chat.create` **does not** automatically abandon prior rooms. The create
UI MUST confirm when an open room already exists for the same
`contactId + roomTopic` ("You already have an open room with the same topic…").
Cancel aborts create; confirm creates alongside the existing room.
`contact.roomId` MAY point at the latest room as a deep-link hint only — it
MUST NOT invalidate other open rooms in the UI.

**Pending invites:** for unaccepted (`received`) creates, the newest invite per
`contactId + roomTopic` remains the actionable Accept target; older unaccepted
creates for that pair may be marked expired. This MUST NOT destroy already-
accepted rooms.

**Leave forever (revoke):** either peer may end a room before `roomTtl` by
sending `chat.revoke` (`room_revoked`) to the other over L1. Wire fields:
`inviteId`, optional `replayId`, `reasonCode`, and **`roomId`** (required for
leave-forever). Receiver rule: **`{contact, revoke, roomId}` → destroy that
room** (catalog + session + UI), and record a durable revoke tombstone so a
later scan of the original on-chain `create` cannot resurrect it. Sender
**destroys locally immediately** and fires the L1 revoke in the background —
do **not** block leave on broadcast/confirm. The room **MUST** disappear from
Chats at once. Decline of a pending invite still uses `user_declined`
(inviteId is enough).

**Invalid:** send `live` frames unless `connected`. **Invalid:** send `relay`
while `pending` (or terminal). L1′ text rides Conceal MESSAGE encryption
(ChaCha + DH) — app body is plain smart-message fields, not a second L1 session seal.

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

`connect_failed` enables **relay** send (grey bubbles), not live. Live resumes
only when connect reaches `connected`. `pending` never enables send.

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
| Room | `lifecycleStatus` (`accepted` ≠ `connected`) | Composer: live vs L1′ |
| Session | `sendCounter` / `recvCounter` + key refs | Live frames only |
| Chat message | `channel: live \| relay` | Accent vs grey; same `roomId` thread |

- Contacts → `gnh.contacts` (StorageAdapter) **and** wallet blob
  `addressBook` (encrypted .json export/import).
- Invite records (tombstoned), rooms, nonce counters — local via
  `StorageAdapter` / IndexedDB as implemented.
- **Room replay on import:** only **encrypted wallet JSON file** import replays
  rooms from blob `sentMessages` + `receivedMessages`. Seed/key/QR/resync do **not**
  restore chat rooms (chain scan cannot recover both sides of the handshake).
  Accepted replays stay `awaitingChainSync` until near chain tip (revoke scan).
  Expired invite without accept → silent skip + revoked `roomId` tombstone.
  @see `openspec/changes/repair-room-restoration/design.md`
- Metadata export (`Settings → Backup`) includes contacts in the downloaded
  `.json` (no seed).
- Raw session keys: memory / secure storage path; never in logs.
- Ephemeral private keys: memory only.
- **Never** derive UI “chat live” from `inviteStatus === accepted` alone.

---

## 13. Service boundaries

- `SmartMessageProtocolService` — create/register/revoke/**relay** compose + validate
- `ConcealSmartMessageAdapter` — SDK encode + delivery channel (incl. relay broadcast/scan)
- `SessionBootstrapService` — derive session + `buildHolepunchContract`
- `P2PEncryptionService` — X25519/HKDF/AEAD
- `HolepunchChatTransport` — connect/retry/send/subscribe; dual-path L1 seal → live frame **or** L1′ relay

Wiring: `src/services/index.ts` imports **real** adapters; mocks commented out.

---

## 14. Content envelopes

`ChatContentEnvelopeV1`: `schemaVersion`, `messageId`, `clientId`, `sentAt`,
`kind: text|reaction|edit|delete`, optional `text` / `targetMessageId` / `reaction`.

- **Live path:** L1 session seal → Holepunch bridge frame (`channel: "live"`).
- **L1′ path:** plain `{contact,e,roomId,ts,text}` (`channel: "relay"`).
  Conceal MESSAGE encryption covers the chain; no second session-key seal.
- Reaction / edit / delete remain **live-only**. L1′ is text only (§16).

---

## 15. Open questions (defaults)

1. ECDH: `@noble/curves` + `@noble/hashes` (web-first).
2. `relationshipId`: `hash(sort([paymentIdFrom, paymentIdTo]))`.
3. Multiple rooms per contact allowed; same-topic create requires UI confirm.
   Newest unaccepted invite per contact+topic is the Accept target.

---

## 16. L1′ chat relay (`chat.relay`)

**Purpose:** SMS-class **L1′** fallback when Hyperswarm (L2) is not `connected`,
**after** invite accept. Prefer live whenever `lifecycleStatus === "connected"`.
L1′ must not replace L2. **Never** while `pending` (invitee must not be
spam-messaged before Accept).

**UI:** `channel: "live"` → accent bubbles; `channel: "relay"` → grey bubbles.
Same **room** (`roomId`) mixes both sources, ordered by timestamp. Subtle “via
chain” when sending relay. Merging sources is intentional — not a crypto flaw.

### Wire

Module `contact`, action `execute` (`e`):

```text
{contact,e,<roomId>,<sentAtUnix>,<text>}
```

App-layer text (no `,` `{` `}` — SDK smart-message delimiter rules). Conceal
MESSAGE already encrypts the body with ChaCha + DH to sender/receiver view keys
— chain observers without the view key cannot read it. No second L1 session seal.

| Field | Meaning |
|---|---|
| `roomId` | Target chat room (same object as live) |
| `sentAt` | Unix seconds (thread order) |
| `text` | Message body (≤ ~200 chars / `MAX_MESSAGE_BODY_BYTES`) |

Same fee shape as other mined contact smart messages (§2). Fee + ~block latency.

### Trust / receive

- Room must exist, **not** `pending`, and not past `roomTtl`.
- Known `paymentIdFrom` only (same as other contact smart messages).
- Append `ChatMessage` with `channel: "relay"`; dedupe by `roomId+sentAt+text`.
- **0-conf:** preview OK; do not change relationship finality rules.

### Send

1. If `connected` → live Holepunch frame (L1 session seal over L2).
2. Else if this session was live (L2) → show `queued` (no checkmarks), wait
   **6s** for L2, then live; if still down → L1′ (`chat.relay`, may poke).
3. Else if post-accept → broadcast `{contact,e,…}` via `sendChatRelay` (L1′).
4. Else (`pending` / terminal) → composer blocked.

@see `docs/features/chat-relay.md`, `docs/prompts/coding-constraints.md`
