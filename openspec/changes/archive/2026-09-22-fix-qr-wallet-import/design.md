# Design — fix QR wallet import

## Root cause

```219:258:src/services/conceal/ConcealWalletService.ts
// qr and file share JSON.parse + openEncryptedWalletFile — wrong for QR
```

conceal-next-wallet splits them: **file** → encrypted envelope; **qr** →
`decodeWalletQr` → `buildFromMnemonic` / `buildFromSpendKey` / `buildViewOnly`.

## QR payload format

Mirrors `CoinUri.encodeWalletKeys`:

```
conceal.<ccx7-address>?spend_key=<hex>?view_key=<hex>?mnemonic_seed=<words>?height=<n>
```

Prefix optional; options are `?`-separated (legacy encoder quirk).

## Service change

1. `importWallet`: only `method === "file"` uses JSON + `openEncryptedWalletFile`.
2. `method === "qr"`: `decodeWalletQr(input.qr)` then same branch logic as
   conceal-next-wallet (mnemonic → spend → view-only).
3. `input.password` on QR/seed/keys is the **local encryption password** passed
   to `adoptBuiltWallet`, not a backup decrypt password.

## UI change

| Method   | Password UX                                      |
| -------- | ------------------------------------------------ |
| QR       | New wallet password + confirm + strength (like seed/keys) |
| Seed     | unchanged                                        |
| Keys     | unchanged                                        |
| File     | Single "backup password" (decrypt export)        |

Remove `isFileLike` grouping that treated QR like file for password validation.

## Scan success UX (privacy)

After camera or image QR decode:

- Show **“Scan successful”** (and optional rescan control).
- **Do not** render the decoded payload (`qrText.slice(…)`, mono preview, etc.).
- Payload stays in React state only until import submits — never logged.

Applies to all import paths: no `console.log` / debug output of addresses, keys,
mnemonics, or raw QR/file contents in the import stack. Existing
`toFriendlyImportError` / `SENSITIVE_ERROR_PATTERN` guard stays.

**Decision:** keys-import “Preview address” shows **first 5 + last 5 chars** only
(`shortAddress(addr, 5, 5)`); full address never shown during import.
