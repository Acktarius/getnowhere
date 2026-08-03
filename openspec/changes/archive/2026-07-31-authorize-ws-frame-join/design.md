# Design — Authorize WS frame join

## Context

Finding 02 gated Hyperswarm inbound frames via `connTopics`. Finding 03 is the
local bridge edge: `sendFrame` trusts any WS client once topic state exists.

## Decisions

- **Decision:** Enforce in `sendFrame` via `state.localClients.has(client)`.
  - **Rationale:** Single source of truth for mesh membership; covers direct
    callers and the WS path.

- **Decision:** Also check socket `joined` in `server.mjs` and reply with
  `{ type: "error", message: "…" }` (not silent drop).
  - **Rationale:** Matches existing bridge error style; defense in depth.

- **Decision:** Store lowercased `topicRef` in `joined`.
  - **Rationale:** `mesh.join` / `sendFrame` already normalize case.

## Risks

- Shared Alice/Bob on one sidecar still both may `join` any topic they know —
  product rules remain residual (documented, not coded here).
