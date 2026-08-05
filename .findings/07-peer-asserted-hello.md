### [Low] Peer-asserted `hello` can mark remotes on topics Hyperswarm did not share

- **Severity:** Low
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/swarm.mjs` — `adoptRemoteTopic` + inbound `hello` handling
- **Issue:** Trusting peer `hello.topicRef` mutates `connTopics` / `remotePeerIds` independently of DHT-shared topics.
- **Why it matters:** Enables false `peers.count >= 1` on rooms the remote never discovered via Hyperswarm, which starts post-connect proof against the wrong party (availability / session-wipe path when combined with injected frames).
- **Evidence:** Inbound `hello` calls `adoptRemoteTopic` with attacker-controlled `topicRef`; hex format is validated, shared-topic provenance is not.
- **Suggested solution:** Same as the High hello finding—only adopt from `info.topics` / `topic` events; treat app `hello` as obsolete or strictly scoped to already-shared topics.
- **Residual risk:** Regression-test peer-count behavior when Hyperswarm emits late `topic` events.

# follow-up

- [ ] Adopt remotes only from `info.topics` / `topic` events (not peer-asserted `hello`)
- [ ] Treat app `hello` as obsolete or strictly scoped to already-shared topics
- [ ] Add regression test: peer-asserted hello does not inflate `peers.count` for foreign topics
- [ ] Regression-test peer-count when Hyperswarm emits late `topic` events
