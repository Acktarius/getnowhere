# 001 — Skip dust when selecting ordinary spend inputs

Status: **Accepted**  
Date: 2026-08-01  
Source: conceal-next-wallet `docs/decisions/001-skip-dust-on-spend.md`

## Context

The SDK's `selectInputs` accepts a `dustThreshold` argument but defaults it to
`0`. Without an explicit threshold, pretty dust (e.g. amount `6`) can still be
chosen as inputs for ordinary sends and smart-message txs — even though product
policy treats outs below `DUST_THRESHOLD` (10 atomic) as **Dust**, not
**Available**.

Pretty dust is mixable. The bug is policy mismatch (Available vs builder), not
decoy failure. Conceal Desktop already skips those outs
(`WalletGreen::selectTransfers` / legacy `selectTransfersToSend`:
`amount > defaultDustThreshold()`).

## Decision

1. Add `selectSpendInputs(outputs, target)` in
   `src/services/conceal/sync/spend.ts` that calls
   `txns.selectInputs(outputs, target, DUST_THRESHOLD)` — same helper as
   conceal-next-wallet.
2. Route **send** and **smart-message** (invite / chat L1) through that helper
   before decoy fetch + build. Pass `unspentOutputs: selected` into the builder.
3. Keep `selectableOutputs` **pretty-only** (no dust strip) so a future
   Optimize / fusion path can still draw pretty dust into fusion buckets.
   Fusion must **not** call `selectSpendInputs`; it uses the pretty pool with
   `dustThreshold: 0` (or the SDK fusion APIs).

## Consequences

- Ordinary spends align with Available and with Desktop / next-wallet.
- Mixable dust stays on the wallet until fusion consolidates it (or another
  client spends it).
- Call sites must not invoke bare `selectInputs` / builder defaults for user
  spends without an explicit dust threshold; fusion (if added) keeps using the
  wider pretty pool.

## Alternatives considered

- **Filter dust inside `selectableOutputs`.** Rejected: that pool should feed
  fusion; stripping dust would hide outs Optimize is meant to sweep.
- **Change the SDK default `dustThreshold` to `DUST_THRESHOLD`.** Optional
  upstream hardening; not required once this app passes the threshold explicitly.
- **Match legacy web-wallet (no dust gate).** Rejected: weaker than Desktop.
