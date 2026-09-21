## Purpose

Protects invite ECDH ephemeral private keys at rest by storing them only inside
the encrypted wallet blob until session handoff completes, then wiping them on
room end paths including leave and revoke.

## ADDED Requirements

### Requirement: Pending invite ephemerals persist only in the encrypted wallet blob

While an invite handoff is incomplete, the system SHALL persist invite ECDH
ephemeral private key material only inside the encrypted wallet blob (the same
sealed store as the wallet). The system MUST NOT write plaintext ephemeral
private keys to StorageAdapter KV keys such as `gnh.pendingInitiatorKeys`.

#### Scenario: Upsert after send or accept
- **WHEN** the user sends a chat invite or accepts an invite and an ephemeral
  private key must survive process death
- **THEN** that private key material is written into the encrypted wallet blob
- **AND** no plaintext `privateKeyHex` is stored under `gnh.pendingInitiatorKeys`

#### Scenario: Restore after unlock
- **WHEN** the wallet is unlocked and a pending invite handoff is still incomplete
- **THEN** the system restores pending ephemeral private keys from the encrypted
  wallet blob into the unlocked session

### Requirement: Wipe pending ephemerals when no longer needed

The system SHALL remove pending invite ephemeral private key material from both
the unlocked session and the encrypted wallet blob when the material is no longer
needed for handoff.

#### Scenario: Wipe after successful handoff
- **WHEN** session derivation for an invite completes successfully
- **THEN** that invite’s pending ephemeral private key is removed from memory and
  from the encrypted wallet blob

#### Scenario: Wipe on leave or revoke
- **WHEN** the user leaves a room or a room is destroyed via L1 revoke / local
  destroy for a room that still had pending ephemeral material
- **THEN** that room’s pending ephemeral private key material is removed from
  memory and from the encrypted wallet blob

#### Scenario: Wipe on decline or abandon
- **WHEN** an invite is declined or abandoned before handoff completes
- **THEN** that invite’s pending ephemeral private key material is removed from
  memory and from the encrypted wallet blob

### Requirement: Migrate and delete legacy plaintext pending-key KV

On unlock or contacts hydrate, if legacy plaintext pending-key KV data exists,
the system SHALL migrate valid records into the encrypted wallet blob (when the
wallet runtime is available) and MUST delete the legacy plaintext KV entry.

#### Scenario: Legacy key removed after migration
- **WHEN** `gnh.pendingInitiatorKeys` contains plaintext pending records and the
  wallet is unlocked
- **THEN** those records are merged into the encrypted wallet blob
- **AND** `gnh.pendingInitiatorKeys` is removed from StorageAdapter
