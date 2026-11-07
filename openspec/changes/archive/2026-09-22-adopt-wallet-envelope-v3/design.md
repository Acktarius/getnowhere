# Design — adopt wallet Envelope 3

## SDK boundary

`ConcealWalletAdapter` owns the typed SDK calls:

- `parseEncryptedWalletJson(text)` performs the pre-parse size gate.
- `openEncryptedWallet(parsed, password)` decrypts Envelope 1/2/3.
- `saveEncryptedWallet(raw, password)` always emits Envelope 3.

Application services do not call `JSON.parse` for encrypted wallet files.

## Wallet creation

The creation screen validates and confirms the wallet password before calling
`createWallet(password)`. The service generates and adopts the wallet using that
password, so its first persisted blob is Envelope 3. Seed reveal and optional
biometric enrollment follow without a password rewrite.

## File import

Encrypted file import keeps two distinct credentials:

1. Backup password: decrypts the selected Envelope 1/2/3 file.
2. New wallet password: validated and confirmed by the app, then passed to
   `adoptBuiltWallet` so local storage is freshly written as Envelope 3.

The selected source file is never modified. Failed parse, decrypt, password
validation, or persist leaves it untouched.

## Legacy device storage

Runtime unlock continues through SDK `openStoredWallet`. SDK 0.3.0 performs its
verified, non-destructive Envelope 1/2→3 migration. The app does not duplicate
that migration logic.

## Removed path

The deleted restore screen has no remaining service/store API. Mnemonic restore
is the Import screen's mnemonic method, which already requires a new password.

## Documentation

Update `docs/features/lite-wallet.md` and the security review finding so the
source of truth reflects Envelope 3 and the removed temporary password.
