# Authorize WS frame join

## Why

Local WebSocket clients can send `{ type: "frame", topicRef }` for any topic
that already has state because another client joined. Per-socket `joined` is
tracked but unused; `sendFrame` does not require the sender in
`state.localClients`. Any process that can open the bridge can inject into live
rooms and fan out over Hyperswarm.

## What Changes

- `sendFrame` returns without local or swarm fan-out unless the sending client
  is in `state.localClients`.
- WS `frame` handler rejects with an error unless the socket’s `joined` set
  contains the (lowercased) `topicRef`.
- Regression test for a non-joined client.
- Docs + `.findings/03` remediation.

## Capabilities

- `p2p-chat-connectivity`: WS/bridge frames require prior join for that topic.

## Impact

- `holepunch-sidecar/src/swarm.mjs`, `server.mjs`, tests, docs, finding 03.
- Legitimate UI that joins before framing is unchanged.
