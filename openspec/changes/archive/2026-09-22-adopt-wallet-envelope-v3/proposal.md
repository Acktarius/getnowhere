# Adopt authenticated wallet Envelope 3

## Why

Get NowHere now uses `conceal-wallet-sdk` 0.3.0, which writes Argon2id-backed
Envelope 3 and safely reads legacy Envelope 1/2. The app still parses backup
JSON directly, creates wallets under a generated `Math.random` password before
the user chooses one, and reuses a legacy backup password for local storage.

## What Changes

- Route encrypted backup text through the SDK's bounded
  `parseEncryptedWalletJson` helper before decryption.
- Create wallets only after a compliant password is confirmed, eliminating the
  temporary-password write.
- Require a compliant new local password when importing an encrypted JSON file;
  the backup password is used only to decrypt the source file.
- Use SDK 0.3.0 return/types while preserving Envelope 1/2 compatibility.
- Remove the unused restore service/store path left after deleting its route.
- Verify new storage and downloaded backups are Envelope 3.

## Capabilities

- `wallet-onboarding`: password-first creation and safe encrypted-file import.
- `wallet-backup`: bounded parsing and Envelope 3 export/storage.

## Impact

Wallet service types, onboarding screens, Conceal SDK adapter/service, wallet
store, backup tests, and wallet security documentation.

## Non-goals

- Changing the SDK Envelope 3 wire format or Argon2id profile.
- Adding a Worker for synchronous Argon2id.
- Replacing the current biometric credential design.
