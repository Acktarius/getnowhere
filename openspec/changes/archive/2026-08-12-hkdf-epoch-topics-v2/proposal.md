# HKDF epoch topic derivation (protocol v2)

## Why

v1 derives Hyperswarm `topicRef` as a deterministic SHA256 of public-ish ids
(`roomId`, `relationshipId`). That works when ids stay Conceal-private, but it
is not key-bound: leaked id fragments enable offline grinding to the join
topic. Post-connect L1 proof mitigates unauthorized peers, yet discovery
topics should be **capability secrets** derived from relationship key material,
with rotation on revoke/compromise — without widening the 4-byte create pack
(Conceal size budget is fixed).

Strategy docs from prior design review are ready to land; this change implements
v2 derivation and documents the layer-separation model.

## What Changes

- Land security/architecture docs:
  - `docs/security/capabilities-and-derivation.md`
  - `docs/architecture/local-bridge-transport.md`
  - Cross-links in `encryption.md`, `pairing-and-topics.md`, `holepunch-sidecar.md`,
    `p2pchatprotocol.md`, `electron-desktop.md`, `docs/README.md`
- **Protocol v2:** HKDF relationship key + epoch-scoped `topicRef` derivation
- Epoch starts at 0 on accept; bump on leave-forever / revoke / agreed rotation
- L1 SmartMessage to sync epoch when needed (no per-rotation chain writes by default)
- Post-connect proof AAD binds `epoch` + protocol/topic suite id
- **v1 backward compatibility:** existing v1 rooms keep SHA256 topics until
  destroyed/recreated; new creates use v2 when both peers support it
- Unit tests for HKDF vectors, epoch mismatch, v1/v2 selection
- **Out of scope:** `wss://` sidecar, IPC/Unix socket, Ed25519 signed invites,
  widening 4-byte `roomId`/`inviteId`

## Capabilities

### New Capabilities

- `topic-derivation-v2`: HKDF epoch topic derivation, suite selection, epoch
  rotation, and v1 coexistence rules (`specs/topic-derivation-v2/spec.md`).

### Modified Capabilities

_(none — sidecar join contract unchanged; only how `topicRef` is computed in app
protocol layer)_

## Impact

- `src/services/protocol/ids.ts` — new derive functions, v1/v2 dispatch
- `SmartMessageProtocolAdapter.ts` / `ConcealSmartMessageAdapter.ts` — topic
  suite id on wire (minimal field or protocol version gate)
- `HolepunchChatTransport.ts` — persist epoch, pass to proof AAD
- Session / room persistence — store epoch + topic suite per room
- `docs/security/*`, `docs/architecture/*` (strategy docs)
- **BREAKING** for new v2-only peers pairing with unmigrated v1-only builds
  (guarded by protocol version / suite negotiation)

Independent crypto/security review required before merge.
