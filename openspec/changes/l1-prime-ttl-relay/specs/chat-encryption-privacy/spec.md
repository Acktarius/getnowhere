## ADDED Requirements

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
