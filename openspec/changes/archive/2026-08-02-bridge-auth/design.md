# Design — Harden sidecar bridge auth off-loopback

## Context

See proposal.md — Why. Today `server.mjs` skips auth when
`GNH_SIDECAR_TOKEN` is empty and compares with `!==` when set. Token arrives
as `?token=` (browser WS cannot set custom headers). Electron already always
sets a token when spawning the sidecar child. Scope A: sidecar only.

## Goals / Non-Goals

**Goals:**

- Fail closed at startup for non-loopback + empty token.
- Timing-safe compare when auth is on.
- Testable helpers; docs state the web-dev loopback exception.

**Non-Goals:**

- Changing `?token=` to header/subprotocol/IPC.
- Electron shared-default token hardening.
- Requiring tokens on loopback.
- Changing join/frame authorization.

## Decisions

- **Decision:** New `holepunch-sidecar/src/auth.mjs` with `isLoopbackHost` and
  `tokensEqual`.
  - **Alternatives:** inline-only in `server.mjs`; config flag to disable.
  - **Rationale:** Unit-testable without spinning WSS; security invariant
    should not be optional via config.

- **Decision:** Loopback = `127.0.0.1`, `::1`, `localhost` (case-insensitive).
  - **Alternatives:** also treat `0.0.0.0` as “dev”; resolve DNS hostnames.
  - **Rationale:** Explicit set; `0.0.0.0`/`::` listen on all interfaces and
    MUST require a token; no DNS surprises.

- **Decision:** Fail with `process.exit(1)` before `new WebSocketServer(...)`.
  - **Alternatives:** listen-and-reject-all; both.
  - **Rationale:** Operator chose startup fail — no open window without auth.

- **Decision:** Keep `?token=` parsing; only swap compare to
  length-check + `crypto.timingSafeEqual` on UTF-8 buffers.
  - **Rationale:** No client churn; finding’s transport item deferred.

- **Decision:** Product-loop evidence via sidecar `node --test` steps in
  `e2e.json` (same pattern as `ws-message-size-limit`), not Playwright UI.
  - **Rationale:** No UI surface; capability owner is the sidecar process.

## Risks / Trade-offs

- [Risk] Lab binds to LAN IP without setting token → Mitigation: clear
  stderr message; document in `holepunch-sidecar.md`.
- [Risk] `localhost` vs `127.0.0.1` inconsistency in operators’ mental model →
  Mitigation: both accepted as loopback; document the set.
- [Risk] `?token=` still leaks via process lists/logs → Mitigation: deferred;
  record as residual on finding 06.
- [Risk] Length-mismatch early return leaks length via timing → Mitigation:
  acceptable for shared secret presence check; equal-length path is
  constant-time (standard pattern).

## Migration

No data migration. Operators who already set `GNH_SIDECAR_TOKEN` when binding
off-loopback see no behavior change except timing-safe compare. Those who
bind off-loopback without a token must set the env var before start.
