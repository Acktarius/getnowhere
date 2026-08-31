# Capabilities, IDs, and derivation strategy

Decisions for how relationship, room, and discovery material is created,
distributed, and derived across L1 (Conceal SmartMessage), L2 (Hyperswarm),
and the local UI↔runtime bridge.

**Codegen rule:** only formulas marked **shipped (v1)** may be implemented
without a protocol bump. Items marked **target (v2)** require updates to this
file, `p2pchatprotocol.md`, and `src/services/protocol/ids.ts` in the same
change.

@see `docs/security/encryption.md` · `docs/architecture/pairing-and-topics.md`
· `docs/architecture/local-bridge-transport.md`

## Layer separation (security boundary)

Get NowHere uses three independent layers. Each has a distinct job; none is
the authoritative source of trust for the others.

```text
Conceal Smart Message (L1)
  - Relationship establish / accept / revoke
  - Encrypted delivery of capability material (roomId, handshake seeds)
  - Async, durable, view-key private — not a live chat transport

Hyperswarm (L2)
  - Discovery and live duplex using relationship-derived topicRef
  - Noise-encrypted peer streams
  - Does not know how the relationship was initiated

UI ↔ runtime bridge (local only)
  - Commands/events between app UI and sidecar/worklet on the same host
  - Not part of relationship credential distribution
  - Must never be treated as proof of remote identity
```

**Conceal observers** see encrypted transaction activity, not plaintext invite
graphs. **Hyperswarm observers** see topic announce/lookup and IP hints, not
Conceal message bodies. **Local bridge observers** see bridge metadata and
opaque sealed frames — not Conceal decryption keys or unrelated relationships.

Compromising the local bridge may affect the local device/session; it must not
let an attacker decrypt historic Conceal Smart Messages, derive unrelated
topics, or impersonate a remote peer without relationship and session keys.

## IDs are capabilities, not labels

`roomId`, `inviteId`, and especially `topicRef` are **capability material**:

- Knowing `topicRef` lets a party **find and attempt to join** a swarm topic.
- Joining alone is **not** authorization — post-connect L1 proof is required.
- Capability material is distributed only through **L1 Conceal SmartMessages**
  (encrypted to the relationship's view keys), not through the local bridge.

Display room topics (General, Work, …) are UI metadata only — never embedded
in DHT topic strings (`docs/architecture/pairing-and-topics.md`).

## Shipped (v1) — current implementation

### Relationship id

```ts
relationshipId = sha256Hex(`gnh-rel-v1|${lowerA}|${lowerB}`) // sorted payment-id pair
```

- 256-bit, order-independent, derived locally — **never on the L1 create wire**.
- Both peers must `normalizeHexId` inputs before hashing.

### Room and invite ids (create pack)

Slim create pack widths (`SmartMessageProtocolAdapter.ts`):

| Field | Width | Notes |
|---|---|---|
| `roomId` | 4 bytes (32-bit) | Random at create |
| `inviteId` | 4 bytes | Random at create |
| `replayId` | 8 bytes | Replay tracking |
| `nonceSeed` | 8 bytes | Session nonce derivation |

The 4-byte ids are a **fixed Conceal message size budget** (~120-char create
body target). They are **not** scheduled to widen — v2 hardening focuses on
HKDF topic derivation and epoch rotation instead. Collision risk within one
relationship is low for expected room counts; global uniqueness is combined
with `relationshipId` in topic derivation.

### Topic derivation (v1 — only live formula for codegen)

```ts
topicRef = sha256Hex(`gnh-chat-v1||${roomId}||${relationshipId}`)
```

- Output: 64 lowercase hex chars → 32-byte Hyperswarm topic.
- Deterministic hash of ids already known to both peers after L1 handshake.
- **Not** an HMAC or HKDF — security relies on id secrecy (Conceal-encrypted
  distribution) plus post-connect proof, not on hash keying.

Implemented in `src/services/protocol/ids.ts` (`deriveTopicRef`).

### Session and live-frame keys (v1)

After create/register ECDH + HKDF (`p2pchatprotocol.md` § Key schedule):

- Directional send/recv keys from handshake OKM.
- Live frames: ChaCha20-Poly1305 **L1 session seal** before the bridge.
- Post-connect: sealed `kind: "proof"` / `proof-ack` — topic + Noise alone
  is not trust.

## Target (v2) — planned hardening (not shipped)

Requires protocol version bump, doc updates, and migration path. Do not
implement piecemeal. **4-byte `roomId` / `inviteId` remain** — Conceal create
pack size limits are not expected to change.

### Relationship-scoped key and epoch topics

Bootstrap a relationship secret from L1 handshake material, then derive scoped
values locally — **do not treat a stored topic hash as the long-lived secret**:

```text
K_relationship = HKDF-SHA256(
  ikm = sharedSecret,           // from L1 ECDH / agreed bootstrap
  salt = relationshipId,
  info = "getnowhere/relationship/v1",
  L = 32
)

topic_epoch = HKDF-SHA256(
  ikm = K_relationship,
  salt = relationshipId,
  info = "getnowhere/hyperswarm-topic/v1" || epoch,
  L = 32
)
```

- `epoch` starts at 0 at accept; increment on revoke, member removal, or
  suspected topic compromise.
- Rotation is **local** — peers agree epoch out-of-band via L1 SmartMessage
  when needed; do not write every rotation to chain by default.
- **Shipped behavior:** invite `topicEpoch` on the create pack is authoritative
  for that session; the value is mirrored on the contact row and wallet
  `addressBook` (export/import). Local store is seeded from contacts on unlock.
- Prefer HKDF over plain SHA256 for topic binding so offline grinding on
  leaked id fragments does not directly yield join topics — the main v2
  improvement over v1, without widening on-wire ids.

### Independent trust after transport connect (v2 extends v1)

Even when both peers use the same derived topic:

1. Prove possession of relationship/session keys or expected identity key.
2. Bind handshake to `relationshipId`, current epoch, protocol version, and
   ephemeral connection nonces.
3. Reject duplicate invite ids, stale epochs, unexpected peer keys, bad
   signatures.
4. Derive **fresh directional chat keys** from the transport handshake — do not
   reuse Smart Message or raw topic material as session keys (v1 already
   derives session keys from ECDH; v2 adds epoch binding and optional
   long-term identity signatures).

### Optional: signed invites (v2)

Ed25519 (or equivalent) signatures over create/register with the wallet
identity key — complements ECDH + post-connect proof; not a replacement.

## Local bridge vs credential path

The UI↔sidecar channel (`ws://`, future `wss://`, or IPC) carries **bridge
commands and opaque sealed frames only**. It does **not**:

- Distribute `roomId` / `topicRef` to remote peers
- Establish relationship trust
- Replace Conceal SmartMessage signaling

Bridge hardening is documented in `docs/architecture/local-bridge-transport.md`.
L1 session seal remains mandatory regardless of bridge transport.

## Implementation status

| Item | Status |
|---|---|
| L1 Conceal capability distribution | Shipped |
| v1 SHA256 topicRef | Shipped |
| 4-byte roomId / inviteId | Shipped (fixed size budget) |
| Post-connect L1 proof | Shipped |
| L1 session seal over L2 | Shipped |
| v2 HKDF epoch topics | Shipped (protocol v2) |
| Ed25519 signed invites | Planned |
| Topic rotation on revoke/compromise | Shipped (epoch bump + L1 revoke sync) |

## Review rules

- Spec first for any change to derivation formulas.
- Never expose stable raw topics on-chain as reusable public bearer tokens.
- Never move session seal/open into Hyperswarm runtime without updating
  `encryption.md` and this file.
- Crypto/security changes require independent review per project rules.
