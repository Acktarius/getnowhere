## Context

See proposal.md for why. Backup already password-gates reveal and download.
`decodeWalletQr` already parses Conceal `CoinUri.encodeWalletKeys` payloads.
`SeedRevealModal` already owns Got it / Need more time (30s fade + 5s grace).

## Goals / Non-Goals

**Goals:**
- Third backup action that shows a scannable export QR
- One shared timer function/hook used by seed reveal and export QR
- Encode that round-trips through existing decode

**Non-Goals:**
- View-only wallets
- PDF / file-embedded QR
- Warning copy in the modal
- Changing import QR

## Decisions

1. **Encode next to decode** — add `encodeWalletKeys` in `walletQr.ts`
   (`conceal.` prefix, `?`-separated fields, include `height` when known).
   Alternative: copy Conceal `CoinUri` wholesale — rejected as extra surface.

2. **Reuse `revealSecrets`** — same password check. Add `creationHeight` to
   `WalletSecretsExport` from `rt.raw.creationHeight` (default 0). Screen
   encodes and opens the QR modal. Alternative: a second service method —
   rejected; one password-gated read is enough.

3. **Shared timer** — extract the existing 30s / 5s Got it / Need more time
   logic from `SeedRevealModal` into a small hook both modals call.
   Alternative: duplicate timers — rejected; reuse is the point.

4. **Modal body** — existing `WalletQrCode` only. Title optional (e.g. Export
   QR). No warning paragraph.

5. **View-only** — if `viewOnly` or missing spend key, show an error and do
   not open the modal.

## Risks / Trade-offs

- [Dense keys URI + large QR logo] → verify by scanning or decoding the
  rendered value; drop logo / lower EC only if it fails to encode or scan.
- [Creation height missing on old blobs] → encode `height=0` (import already
  treats missing/0 as start-from-genesis).
