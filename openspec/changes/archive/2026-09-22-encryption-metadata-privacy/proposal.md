# Document encryption metadata privacy (L1 vs L2)

## Why

`docs/security/encryption.md` covers crypto layering and content confidentiality
but does not clearly separate **on-chain metadata privacy** (Conceal L1 / L1′)
from **network metadata privacy** (Hyperswarm L2). Developers and agents have
misread the threat model (e.g. treating chain signaling like a transparent tx
graph or implying Bob learns Alice's IP from L1). The doc must state what each
channel exposes, to whom, and what is out of scope today.

## What Changes

- Add **Metadata privacy** sections to `docs/security/encryption.md`:
  - On-chain privacy (L1 signaling + L1′ relay) — Conceal ring/stealth/view-key model
  - Network privacy (L2 live only) — IP, DHT, VPN split-tunnel, relay-only future
  - Observer matrix (Alice, Bob, chain, DHT, daemon, ISP)
  - Non-goals and future options (relay-only mode, VPN leak check)
- Extend the threat-model table with network-metadata rows (L2-specific).
- Cross-link `p2pchatprotocol.md` and `holepunch-sidecar.md`; no protocol or code changes.

## Capabilities

### New Capabilities

- `chat-encryption-privacy`: documented threat model for metadata exposure per
  channel (L1 / L1′ / L2) in `encryption.md`.

### Modified Capabilities

_(none — no runtime behavior change)_

## Impact

- `docs/security/encryption.md` (primary)
- `openspec/specs/chat-encryption-privacy/spec.md` (new, via delta sync after archive)
- No UI, sidecar, or wallet code changes in this change.
