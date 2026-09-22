# wallet-onboarding Specification

## Purpose

Defines how Get NowHere creates and imports wallets, including password policy,
encrypted backup parsing, and first persist onto this device.

## Requirements

### Requirement: New wallets are first persisted with the chosen password

The system SHALL validate and confirm the user's wallet password before creating
and persisting a wallet. A compliant password SHALL contain at least 13
characters including uppercase, lowercase, digit, and symbol characters and
SHALL NOT exceed 1024 UTF-8 bytes. The system SHALL NOT generate or persist
under a temporary password.

#### Scenario: Create persists Envelope 3 directly

- **WHEN** the user enters and confirms a compliant password
- **AND** creates a wallet
- **THEN** the first stored wallet blob is Envelope 3 encrypted from that password
- **AND** no `Math.random`-derived password is used

### Requirement: Encrypted file import separates source and local passwords

The system SHALL use the backup password only to decrypt the selected file and
SHALL require a compliant confirmed password for local wallet storage.

#### Scenario: Legacy JSON imports into Envelope 3

- **WHEN** the user selects a valid Envelope 1 or 2 backup
- **AND** supplies its correct backup password
- **AND** supplies and confirms a compliant new wallet password
- **THEN** the source opens without modification
- **AND** the imported local wallet is persisted as Envelope 3 under the new password

#### Scenario: Envelope 3 JSON imports into fresh Envelope 3

- **WHEN** the user selects a valid Envelope 3 backup
- **AND** supplies its correct backup password and a confirmed local password
- **THEN** the imported wallet is persisted locally as a newly salted Envelope 3

### Requirement: Wallet JSON parsing is size-gated by the SDK

The system SHALL pass encrypted wallet text through
`parseEncryptedWalletJson` before calling `openEncryptedWallet`.

#### Scenario: Oversized or malformed backup is rejected safely

- **WHEN** encrypted wallet text exceeds the SDK limit or is malformed
- **THEN** import fails with a generic user-safe error
- **AND** the app does not call `JSON.parse` directly on that wallet text
