# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: Bridge frames require prior topic join
The holepunch sidecar SHALL accept a local client `frame` for a `topicRef` only
when that client has previously `join`ed that topic (i.e. the client is in
`state.localClients` for the topic). Otherwise it SHALL NOT fan out the frame
to other local clients or write it to Hyperswarm. The WebSocket bridge SHOULD
reject an unauthorized `frame` with a typed `error` event.

#### Scenario: Non-joined client cannot inject into an active topic
- GIVEN client A has joined topic T
- AND client B is connected to the same mesh but has not joined T
- WHEN B calls `sendFrame` (or sends WS `frame`) for T
- THEN A does not receive that frame
- AND the frame is not written to Hyperswarm for T

#### Scenario: Joined client may still send frames
- GIVEN clients A and B have both joined topic T
- WHEN A sends a frame for T
- THEN B receives the frame
