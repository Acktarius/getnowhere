# Encryption

This document defines the current encryption rules for Get Now Here. It is a
practical implementation guide for developers and a boundary document for
Cursor, so security-sensitive changes stay consistent across the codebase.

## Purpose

Protect message confidentiality, integrity, and session correctness without
scattering cryptographic decisions across UI and feature code.

This document defines:

- the threat model and layering (why we use Hyperswarm **and** app AEAD)
- the default encryption primitive
- key handling expectations
- nonce rules
- associated data rules
- storage rules
- implementation boundaries
- review rules for future changes

## Threat model (max security across runtimes)

Get Now Here runs the same product crypto across different hosts:

| Runtime | UI | Hyperswarm host | Bridge |
|---|---|---|---|
| Web-dev | Vite | Node `holepunch-sidecar` | Local WebSocket |
| Desktop | Vite in Electron renderer | Sidecar child / Electron main | WS or IPC |
| Mobile | Expo UI | Bare worklet | Bare IPC |

**Invariant:** treat the P2P runtime and the UI↔runtime bridge as **untrusted
for chat plaintext**. Session keys and seal/open stay with the app identity
path (near the wallet / UI services), not inside Hyperswarm code.

### What each layer defeats

| Adversary | Mitigated by |
|---|---|
| DHT / bootstrap / relay observers | Hyperswarm **Noise** streams (transport) |
| Random peer who only knows or guesses a topic | Narrow derived `topicRef` + **post-connect proof** of L1 session secret |
| Curious or compromised sidecar / Bare / Electron main | App **ChaCha20-Poly1305** E2E (runtime sees opaque frames only) |
| Local process sniffing localhost WS / IPC | Same app AEAD (plaintext never on the bridge) |
| On-chain signaling observers | Conceal view-key privacy + compact SmartMessage bodies |

### Decision: dual wire protection is intentional

Hyperswarm Noise alone is **not** enough for “maximum security no matter the
runtime,” because Noise ends at the Hyperswarm process — not at the wallet/UI.
In every shipping shape we use a bridge.

So:

- **Do not drop** app-layer AEAD on live chat frames to “simplify.”
- **Do not add** a third ad hoc stream cipher on top of Noise.
- **Do** leverage Noise fully for transport; **do** keep ChaCha20-Poly1305 for
  application E2E content.

Double encryption (Noise + ChaCha) is defense in depth under this threat model,
not accidental overkill.

## Layering (canonical)

```text
L1  SmartMessage signaling
    → exchange handshake material, ECDH + HKDF → session secret
    → derive topicRef, bind relationship / invite

L2  Hyperswarm Noise (runtime-owned)
    → encrypted peer streams on the DHT path

L3  ChaCha20-Poly1305 content AEAD (app-owned)
    → seal before bridge send; open after bridge receive
```

### L1 — derived secret via SmartMessage

- Create/register ride Conceal smart messages (view-key privacy on the signaling
  channel). Bodies stay compact.
- **Chat relay** (`chat.relay` / wire `execute`) may also ride L1 as app-layer
  text inside Conceal MESSAGE (ChaCha + DH to view keys). SMS-class fallback
  after accept when Hyperswarm is not connected; does not replace L2. See
  `p2pchatprotocol.md` §16. No second app-layer seal on relay.
- Create/register carry ephemeral X25519 material (and salts / ids).
- Both sides derive the same session OKM (see Key schedule below).
- From that material: directional send/recv keys, `topicRef` inputs, and a
  **post-connect auth** capability (prove the remote is the invite counterpart,
  not a random topic joiner).
- SmartMessage is bootstrap + optional L1 relay — **not** a live chat
  transport substitute for Holepunch.

### L2 — Hyperswarm Noise

- Owned exclusively by the Pear-shaped runtime (sidecar / Electron main / Bare).
- Provides confidentiality and integrity on the peer-to-peer wire.
- Does **not** authenticate application identity by itself (topic join ≠ invited
  Bob).
- UI must never import `hyperswarm`.

### L3 — application E2E (ChaCha20-Poly1305)

- Seal content envelopes in the app crypto path before `frame` hits the bridge.
- Runtime multiplexes **opaque** payloads only (no session keys on the bridge).
- Required so chat stays confidential even if the runtime or bridge is observed.

### Post-connect verification (required)

After transport peer presence (`peers.count >= 1`), the connecting side sends a
sealed `kind: "proof"` frame (`text: proof:v1:<sessionId>`). A peer that is not
itself mid-handshake answers with `proof-ack:v1:<sessionId>` (acks never re-ack,
so no ping-pong). AEAD open success on either proof or ack proves L1 session
keys. Outcomes: AEAD failure → `crypto_mismatch` (session wiped, rekey);
no reply within the window → `timeout` (retryable, session kept). Topic + Noise
alone is not trust.

## Default primitive (L3)

Use **ChaCha20-Poly1305** as the default authenticated encryption primitive for
peer message payloads.

Reasons:

- authenticated encryption in one construction
- well standardized; strong software fit
- keeps E2E confidentiality when the Hyperswarm host is a separate process

Do not design a custom encryption scheme when a standard AEAD already fits.

## Scope

This document applies to:

- encrypted payloads exchanged in peer chat (Holepunch / Hyperswarm frames) — L3
- invitation bootstrap / session derive via SmartMessage — L1
- locally persisted encrypted message material
- stored session secrets and related metadata

This document does not redefine Hyperswarm/Noise internals (L2). Live chat must
assume L2 on the DHT hop and still seal with L3 for the bridge.

### Key categories for chat

| Category | When used | Wipe |
|---|---|---|
| Invite/bootstrap material | During create/register signaling (L1) | On tombstone (decline/expiry/destroy) |
| Session keys (send/recv refs) | After session derive; seal/open for **live** Holepunch frames when `connected` | On room destroy / tombstone / logout |
| Ephemeral X25519 private keys | Memory only during handshake | Immediately after derive |

Session keys must not encrypt **live** Holepunch frames until room lifecycle is
`connected`. L1 relay does not use session keys — Conceal MESSAGE encryption
covers the chain (`p2pchatprotocol.md` §16). Invite acceptance unlocks relay;
pending never does.

## Core rules

- Use authenticated encryption, not encryption without integrity.
- Never reuse a nonce with the same key.
- Keep keys, nonces, and ciphertext handling explicit in code.
- Separate protocol metadata from encrypted content.
- Treat cryptographic failure as a hard failure, not a warning.
- Version payload formats from the start.
- Keep cryptographic code centralized in dedicated services.
- Do not move session seal/open into the Hyperswarm runtime unless this doc and
  `p2pchatprotocol.md` are updated first (that changes the trust boundary).

## Algorithm profile

Current baseline (`CHACHA20_POLY1305_V1`):

- algorithm: **ChaCha20-Poly1305 (RFC 8439)** — IETF AEAD with 96-bit nonce
- key size: 256 bits
- nonce size: **96 bits (12 bytes)**
- authentication tag: 128 bits
- KDF: HKDF-SHA256
- ECDH: X25519

**Not used for this suite:** XChaCha20-Poly1305 (extended 192-bit nonce). The
`@noble/ciphers` package can construct both; this project must call the
ChaCha20-Poly1305 helper only for `CHACHA20_POLY1305_V1`. A future XChaCha
suite would need a new id (e.g. `XCHACHA20_POLY1305_V1`) and a protocol bump.

Do not change this profile silently. Any proposed change must update this file
and `p2pchatprotocol.md` before implementation.

## Key schedule (P2P session) — L1 derive

1. Generate ephemeral X25519 keypairs (Alice on create, Bob on register).
2. `shared = X25519(local_private, remote_public)`.
3. `okm = HKDF-SHA256(ikm=shared, salt=handshake.salt, info=version|suite|relationshipId|roomId, L=64)`.
4. Split: `okm[0:32]` = initiator→responder key; `okm[32:64]` = responder→initiator key.
5. Map to local `sendKey` / `recvKey` by role; store as refs; wipe ephemeral privates.
6. `sessionId = hex(HKDF-SHA256(ikm=okm, salt="gnh-session-id-v1", info=same as step 3, L=16))`
   — **deterministic on both peers**. Proof/chat AAD is `v1|{roomId}|{sessionId}`; a
   random per-side id breaks AEAD open (`crypto_mismatch`).

Session keys may be derived at accept/handoff but **must not seal live chat**
until room lifecycle is `connected`.

## Nonce rules

Nonce management is critical. RFC 8439 ChaCha20-Poly1305 is catastrophically
broken by nonce reuse under the same key.

### Strategy: `counter_from_seed`

- `nonceSeed`: 256-bit random from handshake (hex).
- Per seal under the **send** key:
  - `nonce_12 = HKDF-SHA256(ikm=nonceSeed, salt=UTF8("send"|"recv"), info=UTF8("nonce|" + counter), L=12)`
  - persist and increment `sendCounter` **after** successful seal preparation
- Directions never share a key, so Alice’s send counter space is independent of Bob’s.
- After reconnect or app restart: restore `sendCounter` / `recvCounter` before any seal.
- Do not generate nonces in UI code.
- Do not use random 96-bit nonces without a uniqueness proof — counters are required.

If nonce uniqueness cannot be guaranteed, do not ship the implementation.

### Associated data (AAD)

When sealing Holepunch content frames, prefer AAD covering at least:

- protocol / content schema version
- roomId / sessionId
- message kind (`text` | `reaction` | `edit` | `delete`)

AAD must match on decrypt or open fails closed.

## Key categories

Separate keys by purpose:

- long-term identity secrets
- invitation bootstrap secrets
- session keys for peer messaging
- storage encryption keys
- optional future recovery or rotation material

Rules:

- do not reuse one key for unrelated roles
- do not let UI components hold raw key material longer than necessary
- use typed structures so code makes the key purpose obvious

## Key lifecycle

Every key used by the app must have a defined lifecycle:

- how it is created
- where it is stored
- when it is loaded
- what it can encrypt or authenticate
- how it rotates
- how it is invalidated
- how it is destroyed or forgotten

Rules:

- session keys should be scoped to a specific relationship or chat session
- expired or replaced keys must not stay silently active
- key rotation must preserve message parsing rules through versioning

## Local storage rules

- Persist session counters and key **refs** (or sealed key material) so reconnect
  can restore seal/open without rewinding nonces.
- Never log raw session keys, ephemeral privates, or plaintext chat.
- Tombstone flows must wipe bootstrap ciphertext and session secrets per
  `p2pchatprotocol.md`.
- Prefer the active `StorageAdapter`; do not scatter secrets into ad hoc
  `localStorage` calls.

## Implementation boundaries

| Concern | Where |
|---|---|
| L1 derive / SmartMessage handshake | Protocol + session bootstrap services |
| L3 seal/open | `P2PEncryptionService` / adapter only |
| L2 Hyperswarm / Noise | Runtime only (`holepunch-sidecar`, Electron host, Bare) |
| Bridge | Opaque `frame` payloads; no session keys |

UI components must not implement crypto primitives or invent nonces.

## Review rules

Before changing crypto behavior:

1. Update this file and `docs/security/p2pchatprotocol.md` in the same branch.
2. State which threat the change addresses or weakens.
3. Do not remove L3 “because Noise exists” without an explicit trust-boundary
   redesign approved in these docs.
4. Do not add redundant stream encryption on top of Noise without a documented
   product reason.
