# Chat Encryption Privacy Spec

## Purpose

Documented threat model for metadata exposure per chat delivery channel (L1
signaling, L1′ relay, L2 live). Source of truth for prose:
`docs/security/encryption.md`.

## Requirements

### Requirement: Encryption doc separates on-chain and network metadata

`docs/security/encryption.md` SHALL document metadata privacy in distinct
subsections for **on-chain channels (L1 signaling and L1′ relay)** and
**network live transport (L2 Hyperswarm)**. The document SHALL NOT describe
L1/L1′ as exposing peer IP addresses or direct Alice↔Bob network sessions.

#### Scenario: Agent reads L1 privacy scope

- GIVEN a developer or agent consults `encryption.md` for invite signaling privacy
- WHEN they read the on-chain metadata section
- THEN they find that L1 delivery is async via Conceal transactions
- AND that the counterparty learns messages by chain scan with view keys, not by IP

### Requirement: On-chain privacy reflects Conceal properties

The on-chain metadata section SHALL state that smart-message transactions use
Conceal privacy mechanics (ring signatures with mixin/decoys, stealth outputs,
encrypted payment IDs, Conceal MESSAGE body encryption, change outputs) and
SHALL NOT characterize chain observers as seeing a transparent sender→recipient
payment graph or plaintext invite content without view keys.

#### Scenario: Threat model avoids transparent-chain misread

- GIVEN a chain observer without wallet view keys
- WHEN they read the documented L1/L1′ threat model
- THEN the doc states message bodies are not readable without view keys
- AND the doc does not claim a simple public ledger link proves "Alice chats with Bob"

### Requirement: Network metadata scoped to L2 live

The network metadata section SHALL state that **direct L2 hole punching** exposes
peer **IP addresses (and often ports)** to the counterparty and path observers
(ISP, DHT/bootstrap nodes). It SHALL state that L1 and L1′ do **not** carry this
leak. It SHALL note VPN split-tunnel risk: sidecar UDP may bypass a browser-only
or split VPN unless the OS routes all traffic through the tunnel.

#### Scenario: Wireshark concern mapped to L2

- GIVEN a user worried about geolocation via peer capture
- WHEN they read the network metadata section
- THEN they find IP exposure is documented for L2 live only
- AND L1′ is described as an IP-safe fallback path (with chain latency/cost)

### Requirement: Observer matrix documents who learns what

`encryption.md` SHALL include an observer matrix (or equivalent tables) listing
at minimum: Alice, Bob, chain/mempool observers, remote daemon at broadcast,
DHT/bootstrap, and ISP — cross-referenced with L1, L1′, and L2 for IP exposure,
content readability, and linkability appropriate to each channel.

#### Scenario: Minimize who knows about chat

- GIVEN the product goal to minimize third-party knowledge of a chat
- WHEN a reader uses the observer matrix
- THEN they can determine which channel avoids peer IP disclosure
- AND which observers still see encrypted tx activity or DHT topic activity

### Requirement: L1′ may be mempool TTL without dropping mixin

`docs/security/encryption.md` SHALL state that L1′ `chat.relay` MAY use
Conceal mempool TTL (`tx_extra` 0x05) so the transaction is not mined and
incurs no network or node fee, and SHALL state that those sends still use
the same mixin / decoys and Conceal MESSAGE encryption as mined L1′. The
document SHALL NOT describe TTL L1′ as a dust or no-decoy path. Create,
register, and revoke SHALL remain mined (TTL 0).

#### Scenario: Threat model distinguishes mined and TTL L1′
- **GIVEN** a developer or agent consults `encryption.md` for L1′ cost and
  persistence
- **WHEN** they read the on-chain channel section
- **THEN** they find that L1′ may be mined (paid, durable) or mempool-TTL
  (unpaid, auto-destroy)
- **AND** both still use mixin / decoys and MESSAGE encryption
