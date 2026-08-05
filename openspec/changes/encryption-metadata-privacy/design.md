# Design: encryption metadata privacy documentation

## Context

Get NowHere uses three delivery channels with different metadata properties:

- **L1** — Conceal smart messages (`create` / `register` / `revoke`): async,
  store-and-forward via chain; `buildMessageTransaction` with mixin, decoys,
  change outputs (`src/services/conceal/sync/spend.ts`).
- **L1′** — `{contact,e,…}` relay on chain when L2 is down.
- **L2** — Direct Hyperswarm hole punch + Noise; peer IP exchange is inherent.

Brainstorm sessions corrected two common misreadings: (1) Bob does **not** learn
Alice's IP from L1/L1′; (2) Conceal is **not** a transparent payment graph —
ring signatures, stealth outputs, and encrypted MESSAGE bodies apply.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- Single source of truth in `encryption.md` for **who learns what** per channel.
- Explicit split: **content confidentiality** (existing) vs **metadata / linkability**.
- Accurate Conceal on-chain privacy claims aligned with implementation.
- Clear statement that **IP/geolocation leak is an L2 problem**, not L1/L1′.
- Note VPN split-tunnel risk for sidecar UDP (user/OS config, not app-enforced).
- Mention future mitigations (relay-only L2, VPN leak check) as non-goals today.

**Non-Goals:**

- Implement relay-only mode, VPN enforcement, or Tor transport.
- Change `p2pchatprotocol.md` wire formats or composer preference (still prefer live).
- Sync delta to main OpenSpec specs until archive (delta lives under change).

## Decisions

### 1. Two top-level sections under Threat model

**Decision:** Add `### On-chain metadata privacy (L1 / L1′)` and
`### Network metadata privacy (L2 live)` after the existing adversary table.

**Rationale:** Keeps content-crypto material unchanged; metadata is additive.
Avoids conflating Conceal privacy with Hyperswarm IP exposure.

**Alternative rejected:** Single combined table — caused the original confusion.

### 2. Observer matrix format

**Decision:** Use a compact table: Observer × Channel → what they learn (IP,
content, tx existence, timing).

**Rationale:** Matches developer/agent use case ("minimize who knows about chat").

### 3. Conceal claims scoped to implementation

**Decision:** Document ring mixin, encrypted payment ID, MESSAGE encryption,
change outputs — cite `spend.ts` / protocol §2 in prose, not code dump.

**Rationale:** Prevents Bitcoin-style "tx graph proves chatting" overstatement
while acknowledging residual timing/size metadata.

### 4. Future options in "Non-goals / roadmap" subsection

**Decision:** Brief bullet list (relay-only, VPN preflight) under L2 section;
mark as **not implemented**.

**Rationale:** Captures brainstorm without implying shipped behavior.

## Risks / Trade-offs

- **[Risk] Doc drift from Conceal SDK** → Mitigation: point at `buildMessageTransaction`
  path and `p2pchatprotocol.md` fee/mixin facts; review on spend-path changes.
- **[Risk] Overclaiming Conceal anonymity** → Mitigation: list residual chain
  metadata (tx existence, timing, daemon broadcast IP) without transparent-graph language.
- **[Risk] Users assume VPN fixes everything** → Mitigation: split-tunnel /
  sidecar UDP paragraph under L2.

## Migration Plan

Docs-only: merge `encryption.md` edits; archive OpenSpec change; optional
`openspec sync-specs` for `chat-encryption-privacy` capability.

## Open Questions

- Product toggle "prefer L1′ over live for privacy" — defer to future change.
- When L2 relay ships, update L2 section with relay operator trust model.
