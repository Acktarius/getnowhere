# Design — Authorize inbound swarm frames

## Context

`createSwarmMesh` multiplexes topics over Hyperswarm connections. `connTopics`
is populated only from Hyperswarm `info.topics` / `topic` for locally joined
topics (finding 01). `writeSwarm` already filters outbound by `connTopics`.
Inbound frame fan-out still trusts peer-asserted `msg.topicRef` whenever the
local process has joined that topic.

## Decisions

- **Decision:** Silent-drop inbound `frame` when
  `!connTopics.get(conn)?.has(frameTopic)`.
  - **Alternatives:** (B) close connection on foreign frame; (C) re-query
    Hyperswarm per frame.
  - **Rationale:** Matches “unknown topic” behavior; avoids DoS from disconnect;
    `connTopics` is already the outbound source of truth.

- **Decision:** No change to hello path (already ignored) or adoption rules.
  - **Rationale:** Finding 01 already closed peer-asserted topic seeding.

## Risks / Trade-offs

- Frames arriving before Hyperswarm emits `topic` for a newly shared second
  topic are dropped until association — same window as outbound filter today.
- Residual: attacker who knows topicRef B can still DHT-join B; this fix only
  stops labeling frames for topics the connection never shared.
