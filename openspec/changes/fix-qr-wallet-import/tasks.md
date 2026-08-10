# Tasks — fix QR wallet import

> **Status:** implemented — pending Forge verify + review.

## 1. decodeWalletQr module

- [x] 1.1 Add `src/services/conceal/walletQr.ts` (port from conceal-next-wallet)
- [x] 1.2 Add `tests/conceal/wallet-qr.test.ts`

## 2. Service import path

- [x] 2.1 Split QR from file in `ConcealWalletService.importWallet`
- [x] 2.2 Update `ImportWalletInput` qr field comment in `types/services.ts`
- [x] 2.3 Add service-level QR import test

## 3. Import screen — password UX

- [x] 3.1 QR: replace backup password with `PasswordSection`
- [x] 3.2 Fix `handleImport` validation (file-only decrypt password)

## 4. Import screen — scan privacy

- [x] 4.1 QR scan success: show “Scan successful”, remove payload preview
- [x] 4.2 Audit import path for console logging of secrets (none found)
- [x] 4.3 Keys preview: `shortAddress(addr, 5, 5)` only

## 5. Verify + Forge review

- [x] 5.1 Run scoped unit tests
- [ ] 5.2 Forge verify phase
- [ ] 5.3 Forge review phase
