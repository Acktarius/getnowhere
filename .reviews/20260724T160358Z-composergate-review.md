# Code review — paths — composergate

**Review ID:** 20260724T160358Z-composergate
**Kind:** review
**Created:** 2026-07-24T16:03:58.417Z
**Scope:** paths — paths — composergate
**Lenses:** architecture
**Parent report:** —

## Executive summary

Reviewed composerGate.ts (architecture). 4 tentative → 3 confirmed (1 important, 2 minor), 1 false positive. Top action: unify isRetryableConnectFailure with holepunchPolicy / docs.

### Verdict counts

| Verdict | Count |
| ------- | ----- |
| Confirmed | 3 |
| False positive | 1 |

### Top actions

1. Single-source isRetryableConnectFailure: align composerGate with holepunchPolicy (or delete the unused policy helper) and point ChatRoomScreen + tests + p2pchatprotocol.md at one module
2. Fix @deprecated JSDoc on isComposerEnabled — prefer canSendLiveMessages / assertCanSendLive, not canComposeMessages
3. Optionally move COMPOSER_DISABLED_REASON / CONNECT_ERROR_HINT out of protocol into UI copy if layering is a hard rule

---

## Important

### F-001: Divergent duplicate isRetryableConnectFailure

- **Lens:** architecture
- **Location:** `src/services/protocol/composerGate.ts:82`
- **Severity:** important
- **Verdict:** confirmed
- **Claim:** Duplicate isRetryableConnectFailure with divergent semantics vs holepunchPolicy creates split ownership of connect-retry policy; UI uses composerGate while docs/tests assert holepunchPolicy.
- **Reason:** Same-named helpers disagree. UI path uses the broader composerGate predicate; documented policy and tests cover holepunchPolicy. JSDoc on composerGate even states the holepunchPolicy taxonomy while implementing the broader gate.

---

## Minor

### F-002: UI copy owned by protocol gate

- **Lens:** architecture
- **Location:** `src/services/protocol/composerGate.ts:16`
- **Severity:** minor
- **Verdict:** confirmed
- **Claim:** User-facing presentation strings (COMPOSER_DISABLED_REASON / CONNECT_ERROR_HINT) are owned by the protocol service layer, mixing UI copy into protocol.
- **Reason:** Presentation strings live under src/services/protocol/ while project rules prefer UI separate from protocol. Functional impact is low; cohesion of a composer-facing adapter softens but does not erase the layer mix.

### F-004: Misleading deprecation target for isComposerEnabled

- **Lens:** architecture
- **Location:** `src/services/protocol/composerGate.ts:43`
- **Severity:** minor
- **Verdict:** confirmed
- **Claim:** Deprecated isComposerEnabled aliases live-only canSendLiveMessages while canComposeMessages is broader relay+live, creating a misleading module API boundary.
- **Reason:** Deprecation comment points callers at a broader predicate and would flip live-only to relay+live. Tests still treat isComposerEnabled as live-only; no production callers remain — API/docs hazard, not a live bug.

---

## Coverage ledger

- **Files reviewed:** 1

---

## Pipeline stats

**Scouts:** 1 · **Dedicated skeptics:** 1 · **Batched skeptics:** 1 · **Inline verdicts:** 0 · **Grounded skips:** 0 · **Carried forward:** 0 · **Second opinions:** 0

---

## Appendix A — Rejected findings (false positives)

### F-003: Dual import surface via re-exports

- **Claim:** Thin wrappers plus barrel re-export of roomLifecycle predicates create dual import surfaces for the same send/channel rules.
- **Why rejected:** Wrappers are intentional UI vocabulary aliases. Production does not import the re-exported roomLifecycle predicates from composerGate; transport/catalog import roomLifecycle directly. Unused re-exports are dead surface, not an active dual-import defect.

---

## Appendix C — Method

- Phase 1: Scout pass (4 tentative findings)
- Phase 2: Adversarial skeptic verification (severity-routed, budgeted)

