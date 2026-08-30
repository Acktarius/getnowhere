# Encryption

This document defines the current encryption rules for Get NowHere. It is a
practical implementation guide for developers and a boundary document for
Cursor, so security-sensitive changes stay consistent across the codebase.

## Purpose

Protect message confidentiality, integrity, and session correctness without
scattering cryptographic decisions across UI and feature code.

This document defines:

- the threat model and layering (L1 / L1′ / L2 — there is **no L3**)
- **layer separation** and capability distribution (Conceal vs Hyperswarm vs
  local bridge — `@see` `docs/security/capabilities-and-derivation.md`)
- **metadata privacy** per channel (on-chain vs network — see § Threat model)
- the default encryption primitive for L1 session seals
- key handling expectations
- nonce rules
- associated data rules
- storage rules
- implementation boundaries
- review rules for future changes

## Threat model (max security across runtimes)

Get NowHere runs the same product crypto across different hosts:

| Runtime | UI | Hyperswarm host | Bridge |
|---|---|---|---|
| Web-dev | Vite | Node `holepunch-sidecar` | Local WebSocket |
| Desktop | Vite in Electron renderer | Sidecar child / Electron main | WS or IPC |
| Mobile | Expo UI | Bare worklet | Bare IPC |

**Invariant:** treat the P2P runtime and the UI↔runtime bridge as **untrusted
for chat plaintext**. Session keys and seal/open stay with the app identity
path (near the wallet / UI services), not inside Hyperswarm code.

**Layer separation:** Conceal SmartMessages distribute relationship capability
material (encrypted L1). Hyperswarm provides Noise transport and discovery (L2).
The local UI↔sidecar link is control/events only — not credential distribution.
Bridge transport policy: `docs/architecture/local-bridge-transport.md`.
Id/topic derivation strategy (v1 shipped, v2 planned):
`docs/security/capabilities-and-derivation.md`.

### What each piece defeats

| Adversary | Mitigated by |
|---|---|
| DHT / bootstrap / path observers | Hyperswarm **Noise** (L2) |
| Random peer who only knows or guesses a topic | Narrow derived `topicRef` + **post-connect proof** of L1 session secret |
| Curious or compromised sidecar / Bare / Electron main | **L1 session seal** (ChaCha20-Poly1305) — runtime sees opaque frames only |
| Local process sniffing localhost WS / IPC | Same L1 session seal (plaintext never on the bridge) |
| On-chain observers (signaling + L1′) | Conceal view-key privacy + compact SmartMessage bodies |
| Counterparty learning your **IP** via chat transport | **Not L1/L1′** — only **L2 live** (direct hole punch); see § Network metadata |
| DHT / ISP traffic analysis (timing, sizes) on live path | L1 session seal hides **content**; does not hide **metadata** on L2 |

Content confidentiality and metadata privacy are **different** problems. L1/L1′
and L2 are documented separately below.

### On-chain metadata privacy (L1 / L1′)

L1 signaling (`create` / `register` / `revoke`) and L1′ relay (`chat.relay`) use
**async Conceal transactions** — not a direct network session between Alice and
Bob. Bob learns an invite or relay by **scanning the chain** with view keys and
matching `paymentId`; he does **not** learn Alice's IP or geolocation from this
path.

**Delivery shape:** wallet builds `buildMessageTransaction` with ring mixin +
decoys, stealth recipient outputs, change back to sender, encrypted payment ID,
and Conceal MESSAGE encryption for the smart-message body
(`src/services/conceal/sync/spend.ts`; fees in `p2pchatprotocol.md` §2).

| Property | L1 / L1′ on-chain |
|---|---|
| Message body to outsiders without view keys | **Not readable** |
| Transparent sender→recipient payment graph | **No** — ring sigs + stealth outputs |
| Counterparty learns your IP | **No** |
| Counterparty learns message (with view key) | **Yes** — by design |
| Residual public metadata | Tx **existence**, rough **timing/size** (like any Conceal spend) |
| Remote daemon at **broadcast** | Sees raw tx blob + sender **network** IP — **not Bob** |

Do **not** describe L1/L1′ like a public-ledger chat receipt. Conceal privacy
mechanics apply; the product still records encrypted smart messages on-chain.

@see `p2pchatprotocol.md` §1–2, §16; `docs/features/chat-relay.md`

### Network metadata privacy (L2 live)

**L2 live** (Hyperswarm hole punch + Noise) is a **direct peer path**. For
connectivity, each side learns the other's **IP address and port** (and ISPs /
DHT bootstrap nodes see activity on the derived `topicRef`). Rough **geolocation
from IP** is possible. This is **independent** of L1/L1′ — switching to chain
signaling or L1′ relay avoids peer IP disclosure at the cost of latency/fees.

| Property | L2 live |
|---|---|
| Message content to path observers | **Not readable** (L2 Noise + L1 seal) |
| Counterparty learns your IP | **Yes** (direct punch) |
| Private LAN IP (same subnet) | **Possible** — LAN shortcut; `@see` `holepunch-sidecar.md` |
| DHT/bootstrap observers | Topic announce/lookup + reflexive IP hints |
| MAC address to remote peer | **No** — local link layer only; not carried on WAN |

**VPN:** full-tunnel VPN can hide home IP from the peer (peer sees VPN egress).
**Split tunnel** is risky: `holepunch-sidecar` UDP may bypass a browser-only or
split VPN — sidecar traffic follows OS routing, not the Vite tab.

> Then L2 IP disclosure is like Signal knowing server path metadata vs direct
> P2P — except here it's peer↔peer, and if Bob is not hostile, Wireshark
> geolocation is a non-issue.
>
> Live chat (L2) exposes IP to your invited peer — by design for direct P2P. We
> don't add proxy/VPN settings because invited contacts already know who you are;
> chain relay (L1′) avoids IP if you need that tradeoff.

**Not implemented (future):** relay-only L2 (`relayThrough`), VPN leak preflight
before join, Tor transport. Do not document these as shipped behavior.

### Observer matrix (minimize who knows)

Who learns what when Alice and Bob chat (summary):

| Observer | L1 / L1′ | L2 live |
|---|---|---|
| **Bob (counterparty)** | Message with view key; **no Alice IP** | Message + **Alice IP** |
| **Alice** | Symmetric | Symmetric |
| **Chain / mempool / indexers** | Encrypted tx activity; **not** plaintext graph | N/A (off-chain) |
| **Remote daemon (broadcast)** | Sender IP at submit; encrypted body | N/A |
| **DHT / bootstrap** | N/A | Topic + IP hints |
| **ISP (each side)** | Client → daemon/node | **Peer↔peer** UDP/TCP |

**Privacy-first implication:** L1/L1′ minimize **network** exposure to the
counterparty; L2 minimizes **latency**. Prefer live for UX; prefer L1′ when
hiding IP from the peer matters more than instant delivery (product toggle —
future work).

### Decision: L1 seal over L2 is intentional

Hyperswarm Noise alone is **not** enough for “maximum security no matter the
runtime,” because Noise ends at the Hyperswarm process — not at the wallet/UI.
In every shipping shape we use a bridge.

So:

- **Do not drop** L1 session AEAD on live chat frames to “simplify.”
- **Do not** invent a third network layer or a third ad hoc stream cipher on Noise.
- **Do** leverage Noise fully for transport (L2); **do** seal live content with
  L1-derived session keys before the bridge.

Noise + L1 session seal is defense in depth under this threat model, not a
separate “L3.”

## Layering (canonical)

There are **two layers** and one **L1 fallback** when L2 fails:

```text
L1   SmartMessage family (app-owned)
     → create/register/revoke: handshake, ECDH + HKDF → session secret
     → derive topicRef, bind relationship / invite
     → seal/open live content envelopes with those session keys
       (before bridge send / after bridge receive)
     → post-connect proof of session possession

L1′  Availability fallback when L2 is down (still SmartMessage / Conceal)
     → chat.relay / wire {contact,e,roomId,ts,text}
     → post-accept only; does not replace L2
     → Conceal MESSAGE ChaCha + DH to view keys (no second session-key seal)

L2   Hyperswarm Noise (runtime-owned)
     → encrypted peer streams on the DHT path
     → carries opaque L1-sealed live frames only
```

**There is no L3.** Older docs that said “L3 ChaCha E2E” meant the L1 session
seal on live frames — same material, different *use* of L1, not a new layer.

### L1 — SmartMessage + session-key uses

- Create/register ride Conceal smart messages (view-key privacy). Bodies stay
  compact.
- Create/register carry ephemeral X25519 material (and salts / ids).
- Both sides derive the same session OKM (see Key schedule below).
- From that material: directional send/recv keys, `topicRef` inputs, and
  **post-connect auth** (prove the remote is the invite counterpart).
- **Live content:** seal envelopes in the app crypto path with those session
  keys before `frame` hits the bridge. Runtime multiplexes opaque payloads only.
- SmartMessage signaling is bootstrap — **not** a live substitute for Holepunch.

### L1′ — compensate L2 failure

- SMS-class text when Hyperswarm is not `connected`, after invite accept.
- Wire: `{contact,e,<roomId>,<sentAtUnix>,<text>}` — see `p2pchatprotocol.md` §16.
- App body is plain smart-message fields; Conceal MESSAGE encrypts on chain.
- **Never** while `pending`. Does **not** replace L2. Prefer live whenever
  `lifecycleStatus === "connected"`.

### L2 — Hyperswarm Noise

- Owned exclusively by the Pear-shaped runtime (sidecar / Electron main / Bare).
- Provides confidentiality and integrity on the peer-to-peer wire.
- Does **not** authenticate application identity by itself (topic join ≠ invited
  Bob).
- UI must never import `hyperswarm`.

### One room, two sources

The user sees one **room** keyed by `roomId`. Messages may arrive from:

- **L2** — live Holepunch frames (L1-sealed), or
- **L1′** — `{contact,execute,…}` relay

Merge by `roomId` + timestamp into one thread (`channel: live | relay`). That
merge is intentional UX. It is **not** a confidentiality bug; each channel
keeps its own on-wire protection (L1 session seal over L2 vs Conceal MESSAGE).

### Post-connect verification (required)

After transport peer presence (`peers.count >= 1`), the connecting side sends a
sealed `kind: "proof"` frame (`text: proof:v1:<sessionId>`). A peer that is not
itself mid-handshake answers with `proof-ack:v1:<sessionId>` (acks never re-ack,
so no ping-pong). AEAD open success on either proof or ack proves L1 session
keys. Outcomes: AEAD failure → `crypto_mismatch` (session wiped, rekey);
no reply within the window → `timeout` (retryable, session kept). Topic + Noise
alone is not trust.

## Default primitive (L1 session seal)

Use **ChaCha20-Poly1305** as the default authenticated encryption primitive for
**live** peer message payloads (L1 session keys).

Reasons:

- authenticated encryption in one construction
- well standardized; strong software fit
- keeps content confidential when the Hyperswarm host is a separate process

Do not design a custom encryption scheme when a standard AEAD already fits.

## Scope

This document applies to:

- L1-sealed payloads on Holepunch / Hyperswarm frames (live)
- invitation bootstrap / session derive via SmartMessage (L1)
- L1′ relay bodies (Conceal MESSAGE; no second session seal)
- locally persisted encrypted message material
- stored session secrets and related metadata

This document does not redefine Hyperswarm/Noise internals (L2). Live chat must
assume L2 on the DHT hop and still apply the L1 session seal before the bridge.

### Key categories for chat

| Category | When used | Wipe |
|---|---|---|
| Invite/bootstrap material | During create/register signaling (L1) | On tombstone (decline/expiry/destroy) |
| Session keys (send/recv refs) | After session derive; seal/open for **live** Holepunch frames when `connected` | On room destroy / tombstone / logout |
| Ephemeral X25519 private keys | Memory only during handshake | Immediately after derive |

Session keys must not encrypt **live** Holepunch frames until room lifecycle is
`connected`. L1′ does not use session keys — Conceal MESSAGE covers the chain
(`p2pchatprotocol.md` §16). Invite acceptance unlocks L1′; pending never does.

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
- **Room transcripts:** L2 is sealed frames, not a shared Hypercore log. Persist
  what this device already saw in the encrypted wallet blob (`chatRooms`) when
  Settings **P2P message retention** is on: background write ~1s after live
  send/receive (UI never waits), immediately on hide and Exit. Off = do not
  write or hydrate L2; L1′ sent still lives in `sentMessages` while the room
  is available. Rooms are TTL-bounded (default 7d, max 30d). Leave / expire /
  revoke tombstones `chatRooms` and drops matching L1′ `e` rows. No peer
  catch-up in this model — a later change if we add a request protocol or a
  log. @see `openspec/changes/p2p-message-retention/design.md`

## Implementation boundaries

| Concern | Where |
|---|---|
| L1 derive / SmartMessage handshake | Protocol + session bootstrap services |
| L1 session seal/open (live) | `P2PEncryptionService` / adapter only |
| L1′ relay compose / scan | Protocol + Conceal adapters |
| L2 Hyperswarm / Noise | Runtime only (`holepunch-sidecar`, Electron host, Bare) |
| Bridge | Opaque `frame` payloads; no session keys |

UI components must not implement crypto primitives or invent nonces.

## Review rules

Before changing crypto behavior:

1. Update this file and `docs/security/p2pchatprotocol.md` in the same branch.
2. State which threat the change addresses or weakens.
3. Do not remove the L1 session seal “because Noise exists” without an explicit
   trust-boundary redesign approved in these docs.
4. Do not add redundant stream encryption on top of Noise without a documented
   product reason.
5. Do not reintroduce “L3” as a layer name — use L1 / L1′ / L2.
