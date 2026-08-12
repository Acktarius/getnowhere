# Design: HKDF epoch topic derivation v2

## Context

Three layers (`docs/security/capabilities-and-derivation.md`):

1. **L1 Conceal** — encrypted capability distribution (`roomId`, handshake seeds)
2. **L2 Hyperswarm** — Noise transport + DHT discovery on derived `topicRef`
3. **Local bridge** — UI↔sidecar control only (`docs/architecture/local-bridge-transport.md`)

v1 topic: `sha256Hex("gnh-chat-v1||" + roomId + "||" + relationshipId)`.

Fixed constraints:

- **4-byte** `roomId` / `inviteId` on create wire (Conceal ~120-char budget)
- L1 ECDH shared secret already exists at session derive (`p2pchatprotocol.md` § Key schedule)
- Post-connect L1 proof already required before `connected`

## Goals / Non-Goals

**Goals:**

- Key-bound discovery topics via HKDF from relationship material
- Epoch rotation without widening on-wire ids
- v1 rooms continue until recreated/destroyed
- Document layer separation + local bridge roadmap (already drafted)

**Non-Goals:**

- `wss://` / IPC sidecar (follow-on change)
- Ed25519 signed invites
- Widening create pack ids
- Tor / relay-only L2

## Decisions

### 1. Topic suite id

**Decision:** Add `topicSuite: "SHA256_V1" | "HKDF_EPOCH_V1"` (name TBD in
code) carried in handshake / bootstrap contract. Default v1 for legacy parses;
new creates emit `HKDF_EPOCH_V1`.

**Rationale:** Explicit dispatch in `deriveTopicRef` without breaking stored v1 rooms.

### 2. HKDF formulas (v2)

```text
K_relationship = HKDF-SHA256(
  ikm = ecdhSharedSecret,
  salt = UTF8(relationshipId),
  info = "getnowhere/relationship/v1",
  L = 32
)

topicRef = hex(HKDF-SHA256(
  ikm = K_relationship,
  salt = UTF8(relationshipId),
  info = "getnowhere/hyperswarm-topic/v1" || uint32_be(epoch),
  L = 32
))
```

- `relationshipId` inputs use existing `normalizeHexId`.
- Output: 64 lowercase hex → 32-byte swarm topic (same as v1 wire shape).

**Alternative rejected:** HMAC-SHA256 with separate key — HKDF matches existing
KDF profile (`HKDF_SHA256_V1`).

### 3. Epoch lifecycle

| Event | Epoch action |
|---|---|
| Accept invite (v2) | `epoch = 0` |
| Leave forever / revoke | Bump epoch locally; peer learns via L1 revoke + optional `topic.epoch` sync message |
| Suspected topic leak | Either peer may propose bump via L1 SmartMessage |
| Reconnect within TTL | Same epoch; rejoin same topic |

Persist `{ topicSuite, epoch }` with room session.

### 4. Epoch sync on L1 (minimal wire)

**Decision:** New compact smart message action `topic.epoch` (or extend revoke
with epoch hint) — **only when rotation needed**, not every connect.

Fields: `roomId`, `inviteId`, `epoch`, `replayId` (reuse replay tracking).

**Rationale:** Avoid chain churn; rotation is rare.

### 5. Post-connect proof binding

**Decision:** Extend proof/ack AAD to include `topicSuite` + `epoch` (versioned
AAD prefix `v2|roomId|sessionId|epoch` or suite-specific).

**Rationale:** Prevents cross-epoch or cross-suite confusion if DHT still has
stale announces.

### 6. v1 coexistence

**Decision:** Rooms loaded from persistence with `topicSuite: SHA256_V1` keep v1
formula. New creates after both peers ship v2 use HKDF. No automatic in-place
migration of active v1 rooms.

**Alternative rejected:** Dual-join v1+v2 topics — doubles DHT exposure.

### 7. Documentation first in same change

Strategy docs (capabilities, local-bridge-transport) land with implementation so
agents have a single source of truth before codegen touches `ids.ts`.

## Component map

| Component | Change |
|---|---|
| `ids.ts` | `deriveTopicRefV2`, `deriveKRelationship`, suite dispatch |
| `SmartMessageProtocolAdapter` | Optional epoch sync parse/compose |
| `HolepunchChatTransport` | Epoch in session state, proof AAD |
| `P2PEncryptionService` | AAD helper for epoch-bound proof |
| Tests | HKDF test vectors, suite selection, epoch bump |
| Docs | Already drafted; verify cross-links |

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| v1/v2 peer mismatch | Suite id + clear connect failure; docs |
| Epoch desync | L1 sync message; diagnostics show epoch |
| Crypto review gap | Forge security review subagent before merge |

## Migration

None for in-flight v1 rooms. Users recreate room or wait for natural revoke/TTL
to move to v2-only discovery.
