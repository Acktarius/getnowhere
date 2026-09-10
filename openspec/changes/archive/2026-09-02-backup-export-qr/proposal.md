# Backup export QR

## Why

Backup settings already reveal seed/keys and download an encrypted `.json`.
Import already accepts a Conceal wallet QR, but there is no way to *show*
that QR so another device can scan it. Operators need a third backup action
that displays the export QR after the same wallet-password gate.

## What Changes

- Add **Show export QR code** on Settings → Backup, immediately after
  **Reveal seed & keys**, using a QR-code icon.
- After a correct wallet password, open a modal that shows only the export
  QR (no extra warning copy).
- Reuse the existing Got it / Need more time timer from seed reveal (shared
  helper — both modals call it).
- Encode the QR as
  `conceal.<address>?spend_key=…?view_key=…?height=<creationHeight>`
  (same scheme as Conceal `CoinUri.encodeWalletKeys` and existing
  `decodeWalletQr`).
- Full wallets only. View-only is out of project scope (fail closed if hit).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `settings-backup`: password-gated export QR modal on Backup settings,
  same dismissal/timer as seed reveal

## Impact

- Backup settings UI (`BackupSettingsScreen`)
- Seed reveal timer extracted for reuse (`SeedRevealModal` + new export QR
  modal)
- `walletQr.ts` encode next to existing decode
- `WalletSecretsExport` / seed backup adapter may include creation height
- Tests: encode ↔ decode round-trip; Backup screen opens the QR modal
- Docs: `docs/features/lite-wallet.md` (or settings backup note) if the
  backup actions list is documented there
