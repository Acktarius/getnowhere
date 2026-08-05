### [High] Local WS clients can `frame` any active topic without joining it

- **Severity:** High
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/server.mjs` (`frame` handler); `holepunch-sidecar/src/swarm.mjs` — `sendFrame`
- **Issue:** Per-socket `joined` was updated on `join`/`leave` but never consulted;
  `sendFrame` only required that some client already created topic state.
- **Why it matters:** Any process that can open the bridge WS (default loopback,
  token optional in web-dev) can inject into live rooms and fan out over
  Hyperswarm once another UI has joined—proof/DoS path plus local multi-tenant
  interference on a shared sidecar.
- **Evidence (pre-fix):** `server.mjs` maintained `joined` but the `frame` path
  called `mesh.sendFrame` unconditionally; `sendFrame` used `topics.get(topicRef)`
  and did not check that `client` is in `state.localClients`.
- **Suggested solution:** Reject `frame` unless the sending client is in
  `state.localClients` (or `joined.has(topicRef)` on the socket).
- **Residual risk:** Shared Alice/Bob attach-to-one-sidecar setups still need
  explicit product rules for who may join which topic (knowing `topicRef` +
  `join` still authorizes framing).
- **Remediation (authorize-ws-frame-join):** `sendFrame` returns unless
  `state.localClients.has(client)`. WS `frame` rejects with error unless
  lowercased `topicRef` is in the socket’s `joined` set.

# follow-up

- [x] Reject `frame` unless the sending WS client has `join`ed that `topicRef` (`joined` / `localClients`)
- [x] Enforce the same check inside `sendFrame` (defense in depth)
- [x] Add regression test: client that never joined cannot fan out frames on an active topic
- [ ] Document shared Alice/Bob sidecar rules for who may join which topic
