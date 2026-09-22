# Design — Restrict Sidecar Topic Hello

## Context

`createSwarmMesh` multiplexes many local topics over one Hyperswarm process.
Today it announces every local topic on each connection and on every join.
Hyperswarm already reports shared topics on client dials (`info.topics`) and
emits `topic` when a second shared topic is multiplexed. Invite acceptance
already supplies `topicRef` to both peers.

## Decisions

- **Decision:** Hyperswarm-only peer adoption; remove outbound `hello`; ignore
  inbound `hello` for adoption.
  - **Alternatives:** (B) filtered hello for inbound-empty topics; (C) keep
    hello but only for `info.topics` intersection.
  - **Rationale:** Topic knowledge comes from SmartMessage; hello is an
    unnecessary discovery-secret channel. Worst-case Holepunch miss is covered
    by L3 / SmartMessage fallback, not by leaking topics.

- **Decision:** `adoptRemoteTopic` only mutates `connTopics` when the topic is
  locally joined.
  - **Rationale:** Prevents forged hellos from pre-seeding association for a
    future local join.

- **Decision:** Do not reintroduce a “server empty topics” hello fallback.
  - **Rationale:** Operator accepted that edge; both sides join known
    `topicRef` with `client: true`, so lookups associate topics.

## Risks / Trade-offs

- Inbound connections may briefly lack topic association until Hyperswarm
  fires `topic` — peer count may lag vs today’s hello path.
- Multi-topic peers who truly share A and B must still work via multiplex
  `topic` events; covered by regression + manual Alice/Bob check.
- Docs that mention “NDJSON app hello” for peer count must be updated so
  operators are not misled.
