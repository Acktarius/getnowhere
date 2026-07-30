# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: Swarm peer adoption uses Hyperswarm-shared topics only
The holepunch sidecar SHALL associate a remote peer with a `topicRef` only when
Hyperswarm reports that topic on the connection (`info.topics` at connect time
or a subsequent `topic` event) and this process has locally joined that topic.
The sidecar SHALL NOT use NDJSON `{ type: "hello", topicRef }` to discover,
advertise, or adopt topics.

#### Scenario: Connection shares only one of two local topics
- GIVEN the local sidecar has joined topics A and B
- WHEN a Hyperswarm connection opens whose shared topics are only A
- THEN the sidecar adopts the peer for A if locally joined
- AND the sidecar does not write a hello (or any other app message) carrying B’s
  `topicRef` on that connection
- AND peer count for B is unchanged by that connection alone

#### Scenario: Forged hello cannot seed an unjoined or unshared topic
- GIVEN the local sidecar has joined topic A only (or has joined B but the
  connection is not Hyperswarm-associated with B)
- WHEN the remote writes `{ type: "hello", topicRef: B }`
- THEN the sidecar does not adopt the peer for B from that hello
- AND peer count for B does not increase because of that hello

#### Scenario: Hyperswarm topic event adopts a shared second topic
- GIVEN both peers have locally joined topics A and B from invite contracts
- WHEN Hyperswarm emits a `topic` event for B on an existing connection
- THEN the sidecar adopts the peer for B
- AND peer count for B reflects the remote peer

### Requirement: Join does not broadcast topicRefs to unrelated connections
When the sidecar joins a topic, it SHALL NOT broadcast that `topicRef` to
connections that are not already Hyperswarm-associated with that topic.

#### Scenario: Join second room while connected on the first
- GIVEN an open connection adopted only for topic A
- WHEN the local process joins topic B
- THEN no unfiltered hello for B is written to that connection
- AND adoption for B waits until Hyperswarm reports B on the connection (or a
  new connection associated with B)

### Requirement: Peer presence signaling is Hyperswarm-only
Peer presence for a room SHALL be derived from Hyperswarm topic association
(and local fan-out among clients on the same sidecar), not from an
application-level hello that enumerates joined topics. Invite/accept already
supplies `topicRef` to both peers; the swarm MUST NOT re-advertise the local
topic set.

#### Scenario: Documentation matches runtime
- GIVEN an operator reads Holepunch / P2P protocol docs for peer counting
- WHEN they look for how topics are shared with remotes
- THEN docs state Hyperswarm association only
- AND they do not instruct relying on NDJSON hello for topic discovery
