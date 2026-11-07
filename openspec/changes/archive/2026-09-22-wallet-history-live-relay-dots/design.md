## Context

See proposal.md — Why. Today `useWalletLiveSync` awaits a full `sync()` then calls `refreshTransactions()`. Deep catch-up can leave the UI stale until that call returns. `peekContactHint` intentionally omits relay/execute. History is an unbounded list on `WalletScreen`.

Mobile is the slower UI host but usually avoids huge catch-ups via background sync; mid-sync publish must stay light (throttle).

## Goals / Non-Goals

**Goals:**

- Throttled mid-sync publish of mapped txs into Zustand
- Client pagination (25) with prev/next
- Relay dots + room→contact click navigation
- Docs + focused unit tests

**Non-Goals:**

- Infinite scroll
- Clickable create/register/revoke
- Sync worker/batch tuning
- Toasts on unresolved relay targets

## Decisions

1. **Publish from sync fold path** — Register a throttled listener (or call into walletStore) after batches that change `rt.state` / message maps, reusing `mapWalletTransactions`. Prefer this over only shortening poll intervals (insufficient during one long `sync()`). Alternative rejected: poll-only refresh.

2. **Client-side pagination** — Full list stays in Zustand; UI slices. Avoid server/daemon paging (not available). Page state is local React state on `WalletScreen`.

3. **Hint shape** — Extend `TransactionContactHint` with `action: "relay"` and optional/required `roomId` for relay only. Keep create/register/revoke without roomId unless already available (out of scope for clicks).

4. **Navigate resolver** — Pure helper: `roomId` → chat room present? → `/chats/:id`; else contact/invite lookup → `/contacts/:id`; else null. WalletScreen wires `useNavigate`.

5. **Throttle** — ~1–2s coalescing or “publish if changed and last publish older than N ms” to protect phone UI; end-of-sync / `refreshTransactions` still authoritative.

## Risks / Trade-offs

- **[Risk] Mid-sync publish work on main thread** → Mitigation: throttle; map only when folded state changed; mobile background sync reduces deep catch-up.
- **[Risk] Page index past last page after list shrinks** → Mitigation: clamp page when `transactions.length` changes.
- **[Risk] Wrong contact if multiple invites share roomId** → Mitigation: prefer catalog room; then contact.roomId match; then invite by roomId (first match) — document in code briefly.

## Migration Plan

No data migration. Ship as UI/sync-publish behavior; users see denser live history and relay dots after update.

## Open Questions

None deferrable — implement model preference (Sonnet 4.6) is an orchestration note, not a product unknown.
