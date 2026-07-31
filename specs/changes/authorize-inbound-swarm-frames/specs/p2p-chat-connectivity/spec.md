# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: Inbound swarm frames require connection topic membership
The holepunch sidecar SHALL deliver an inbound NDJSON `{ type: "frame",
topicRef, payload }` to local clients only when (1) this process has locally
joined that `topicRef` and (2) `topicRef` is in `connTopics` for the
connection that received the frame (i.e. Hyperswarm has associated that topic
with the connection). Otherwise the sidecar SHALL silently drop the frame
(same as an unknown topic). Outbound `writeSwarm` filtering and inbound
delivery SHALL use the same `connTopics` allowlist.

#### Scenario: A-only connection cannot inject frames into topic B
- GIVEN the local sidecar has joined topics A and B
- AND a Hyperswarm connection is associated only with A (`connTopics` has A,
  not B)
- WHEN the remote writes `{ type: "frame", topicRef: B, payload: … }`
- THEN no local client subscribed to B receives that frame

#### Scenario: Shared second topic may deliver frames after association
- GIVEN the local sidecar has joined topics A and B
- AND a connection was initially associated only with A
- WHEN Hyperswarm reports topic B on that connection (`topic` event or
  equivalent association that adds B to `connTopics`)
- AND the remote writes a frame for B
- THEN local clients subscribed to B receive the frame
