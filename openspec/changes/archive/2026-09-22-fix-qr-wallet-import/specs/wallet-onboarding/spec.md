# wallet-onboarding (delta)

## ADDED Requirements

### Requirement: QR import decodes wallet URI payloads

The system SHALL decode wallet QR payloads using the conceal wallet URI scheme
(`conceal.<address>?spend_key=…`, optional mnemonic_seed, view_key, height) and
SHALL NOT require the payload to be encrypted JSON.

#### Scenario: Spend-key QR import succeeds

- **WHEN** the user scans a QR containing `conceal.ccx7…?spend_key=<64-hex>`
- **AND** provides a valid new wallet password with confirmation
- **THEN** the wallet is imported and encrypted locally with that password

#### Scenario: Invalid QR payload rejected

- **WHEN** the QR payload contains neither mnemonic_seed, spend_key, nor
  view_key+address
- **THEN** import fails with a user-safe error (no key material in the message)

### Requirement: Import password UX matches import method

The import screen SHALL distinguish backup decryption from new wallet encryption.

#### Scenario: QR uses new wallet password

- **WHEN** the user imports via QR, seed, or keys
- **THEN** the UI prompts for a new wallet password with confirmation and strength hints
- **AND** does NOT label the field as a backup decryption password

#### Scenario: File uses backup password

- **WHEN** the user imports via encrypted JSON file
- **THEN** the UI prompts for the password used to encrypt that backup file

### Requirement: Import flow does not expose secrets

The import flow SHALL NOT log or display wallet addresses, private keys,
mnemonics, or raw QR payloads during import.

#### Scenario: QR scan success is non-revealing

- **WHEN** the user successfully scans or uploads a wallet QR
- **THEN** the UI shows “Scan successful”
- **AND** does NOT display the decoded payload or any derived address/keys

#### Scenario: Address preview is masked

- **WHEN** the user previews a derived address during keys import
- **THEN** the UI shows only the first 5 and last 5 characters with an ellipsis
- **AND** does NOT show the full address

#### Scenario: Import errors stay user-safe

- **WHEN** import fails
- **THEN** error messages MUST NOT contain key material or long hex runs
