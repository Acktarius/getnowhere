# Fix QR wallet import and import password UX

## Why

Wallet QR codes encode a `conceal.ccx7…?spend_key=…` URI (see conceal-next-wallet
`wallet-qr.ts`), not encrypted JSON. Get NowHere currently treats QR import like
file import (`JSON.parse` + decrypt), so a successfully scanned QR fails with
"The QR code does not contain valid wallet data."

The import screen also asks for a **backup decryption password** on QR, which is
wrong — QR payloads carry keys in plain text. Seed/key imports already use a
**new wallet password** with confirmation; QR should match.

## What Changes

- Decode wallet QR URIs via `decodeWalletQr` (parity with conceal-next-wallet).
- Route decoded mnemonic / spend keys / view-only into existing `buildFrom*` paths.
- Keep encrypted JSON handling for **file** import only.
- QR + seed + keys: require new wallet password with double confirmation + strength.
- File: keep single backup password field (decrypt the export).
- **Privacy:** never log or display addresses, keys, mnemonics, or QR payloads
  during import; successful QR scan shows only “Scan successful” (no payload preview).

## Capabilities

- `wallet-onboarding`: QR decode + import password UX (delta spec).

## Impact

`ConcealWalletService.importWallet`, `ImportWalletScreen`, new `walletQr.ts`,
types comment, unit tests.

## Non-goals

- Changing wallet export QR format.
- Room restore on QR import (unchanged — file-only per repair-room-restoration).
