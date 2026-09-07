## Context

See proposal.md — Why. Today `maybeSendPoke` skips whenever `lastPokedAt` is set for the room. The poke-gateway already rate-limits to 1 poke per handle per 5 minutes.

## Goals / Non-Goals

**Goals:**

- Re-poke on a later L1′ when at least 300 seconds have passed since `lastPokedAt`.
- Keep behavior aligned with the gateway 5-minute window so successful re-pokes are not routinely 429’d.

**Non-Goals:**

- APNs register `env` fix, rename of `maybeSendPoke`, Settings UI for X, gateway rate-limit changes.

## Decisions

1. **Cooldown = 300s constant** in transport code (`POKE_RENOTIFY_AFTER_SEC`), not a user setting. Matches gateway `WINDOW_MS`.
2. **App gate only** — if app fires slightly early, gateway 429 is best-effort; we still set `lastPokedAt` only after a successful `sendPoke` (unchanged).
3. **Still clear `lastPokedAt` on L2 connected** so the next relay session pokes immediately.

## Risks / Trade-offs

- [Clock skew / stored `lastPokedAt` from older app] → Older builds never re-poke; new builds re-poke after 300s. Acceptable.
- [Gateway 429 if clocks disagree] → Poke remains best-effort; message still on L1′.
