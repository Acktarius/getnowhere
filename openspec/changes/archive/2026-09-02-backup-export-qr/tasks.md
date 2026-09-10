# Tasks

## 1. Encode wallet keys

- [x] 1.1 Fail-first Vitest: `encodeWalletKeys` emits
      `conceal.<address>?spend_key=…?view_key=…?height=<n>` and
      `decodeWalletQr` round-trips address, keys, and height.
- [x] 1.2 Implement `encodeWalletKeys` next to `decodeWalletQr` in
      `src/services/conceal/walletQr.ts` until tests pass.

## 2. Creation height on reveal

- [x] 2.1 Add `creationHeight` to `WalletSecretsExport`; return it from
      `SeedBackupAdapter.revealSecrets` (`rt.raw.creationHeight`, default 0)
      and the mock adapter. Update `SeedBackupAdapter` tests.

## 3. Shared Got it / Need more time

- [x] 3.1 Extract the existing 30s fade + 5s grace timer from
      `SeedRevealModal` into a small shared hook. Keep
      `tests/components/SeedRevealModal.test.tsx` green.

## 4. Export QR modal + Backup button

- [x] 4.1 Fail-first: Backup screen shows **Show export QR code** after
      Reveal; password required; correct password opens a dialog with the
      export QR and Got it / Need more time; `confirmBackup` is not called.
- [x] 4.2 Add the export QR modal (QR only, shared timer) and the button
      (QrCode icon) on `BackupSettingsScreen`. Encode from reveal payload.
      View-only / missing spend key: error, no modal.

## 5. Copy + docs

- [x] 5.1 Settings Backup row subtitle mentions export QR. Note the third
      backup action in `docs/features/lite-wallet.md` if backup actions are
      listed there (or add a one-line Settings backup note).

## 6. Product-loop acceptance

- [x] 6.1 Green `forge e2e run` for this change (encode + Backup screen
      tests + types).
