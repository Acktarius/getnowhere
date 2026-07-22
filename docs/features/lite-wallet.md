# Lite wallet

**Status:** Implemented for web app. Sync engine matches conceal-next-wallet.

Get Now Here ships a **lite Conceal wallet**: send, receive, and transaction history.
Deposit and withdraw transactions may **appear in history** after sync, but the app does
**not** offer UI to create deposits or withdrawals.

## Sync parity with conceal-next-wallet

Wallet sync uses the same engine knobs as Conceal Next Wallet:

- Sync-speed profiles (`I'm too young to die` → `Nightmare!`) mapped to worker count,
  batch block size, and multi-source fan-out (`src/lib/sync-speed.ts`).
- Multi-source catch-up when far behind tip, with verified ranges and Web Worker scan pool
  (`src/services/conceal/sync/`).
- `checkMinerTx` / “Read miner transactions” passed through to `getWalletSyncData`.
- Node precedence: per-wallet custom node → device preferred node → session auto-node →
  static default (`src/lib/network/`).

Message-inbox enrichment and multi-wallet switching from next-wallet are stubbed; getnowhere
keeps a single wallet and uses the separate P2P chat protocol for messaging.

## Import

Supported methods (same as next-wallet):

| Method | Password |
|---|---|
| QR / file backup | Existing backup password |
| Seed / keys | New wallet encryption password |

After a successful import the app navigates to **`/wallet`** (not a passcode / password-change
screen). App unlock passcode can be set later under Settings → Passcode.

## Settings

- **Sync speed** — DOOM-labeled profiles; persisted as `options.readSpeed`.
- **Read miner transactions** — persisted as `options.checkMinerTx`.
- **Wallet password** — re-encrypts the local wallet blob (`/settings/wallet-password`).
  Distinct from the app unlock passcode.
- **Daemon node** — probe list, Use fastest, custom HTTPS URL; triggers resync.
  Defaults match conceal-next-wallet (`explorer.conceal.network/daemon`,
  `ccxapi.conceal.network/daemon`). Fabricated leftovers
  (`daemon.conceal.network`, `concealx.net`) are rejected and scrubbed from
  cache. Local `npm run dev` dials them via Vite proxies `/ccx-daemon/` and
  `/ccx-daemon-alt/` (no browser CORS).

## Send / receive / history

- **Receive** — address + QR.
- **Send** — real `buildTransaction` + `sendRawTransaction` via the sync runtime.
- **History** — kinds: transfer, miner, deposit, withdrawal, fusion (display only).

## Non-goals

- Deposit / withdraw creation UI.
- Multi-wallet index / switcher.
- Next-wallet i18n, Cordova, biometric vault.
- Holepunch / ChaCha P2P (see `docs/security/p2pchatprotocol.md`).
