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

**Mempool (0-conf):** sync polls `getTransactionsPool` and reconstructs inbound smart
messages before they mine. Chat `create` / `register` from a **known** `paymentIdFrom`
(existing contact) are actionable immediately. Unknown payment IDs never become invites.
Do not treat 0-conf as proof for establishing a *new* relationship.

**Live poll (parity with next-wallet #112):** while the wallet is open, the app polls
sync at ~2.5s while catching up and ~20s near tip (`useWalletLiveSync`). Invite fetch
uses a **mempool-first** path (`pollMempoolRuntime`) so L1 creates/registers do not wait
on deep tip catch-up. Contact detail also refreshes invites every ~3s while open.
0-conf received copies are kept for a **2h grace** after leaving the mempool so the
mempool→block gap cannot erase chat creates before Accept appears.

## Import

Supported methods (same as next-wallet):

| Method | Password |
|---|---|
| QR / file backup | Existing backup password |
| Seed / keys | New wallet encryption password |

After a successful import the app navigates to **`/wallet`** (not a passcode / password-change
screen). App unlock passcode can be set later under Settings → Passcode.

**Open / import / restore:** decrypt and enter the app immediately. Tip catch-up runs in the
background (`resync` + `useWalletLiveSync`) so L2 chat is usable while L1 sync continues.

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
  Contact picker (when eligible contacts exist) autofills recipient address and
  `paymentIdTo` (PidTo) when present; rows show a round letter mark (multi-word
  initials, or single-word ≤3 letters).
- **History** — kinds: transfer, miner, deposit, withdrawal, fusion (display only).
- **Spend failures** (no funds, unmixable denominations, build/broadcast errors) surface
  as an in-app toast and inline error — invite create must not spin forever on deep sync.

### Contact smartmessage dots (L1)

Wallet history joins scanned txs with smartmessage bodies (`sentMessages` /
`receivedMessages`) and shows a small colored dot when the body is module
`contact`:

| Action | Dot |
|---|---|
| `create` | blue (`--secondary`) |
| `register` | green (`--success`) |
| `revoke` | amber (`--accent`) |

**0-conf / mempool:** unconfirmed smartmessage rows also show a pulsing dot and a
subtle `0-conf` mark (alongside the existing pending pill). After the tx mines,
`zeroConf` clears and the dot stays solid.

**Non-final:** these affordances are **UI preview only**. Relationship eligibility,
accept handoff, and trust still follow the mined (or existing confirmed) path —
do **not** treat mempool alone as proof of a new relationship. See
`docs/security/p2pchatprotocol.md` (§ 0-conf preview).

## Non-goals

- Deposit / withdraw creation UI.
- Multi-wallet index / switcher.
- Next-wallet i18n, Cordova, biometric vault.
- Holepunch / P2P chat crypto (L1 / L1′ / L2) — see `docs/security/p2pchatprotocol.md`
  and `docs/security/encryption.md`.
