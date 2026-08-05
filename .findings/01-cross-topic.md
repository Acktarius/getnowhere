### [High] Cross-topic `hello` leaks unrelated `topicRef`s to every Hyperswarm peer

- **Severity:** High
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/swarm.mjs` — `announceTopicsOnConn`, `join` → `writeSwarm({ type: "hello", … })` without filter
- **Issue:** On each connection (and on every local join), the sidecar advertises every locally joined topic to peers who may share only one of those topics.
- **Why it matters:** `topicRef` is the Hyperswarm discovery secret. A peer who is legitimately in room A learns room B’s topic, can DHT-join B, observe sealed traffic metadata, inflate peer counts, and disrupt post-connect proof (including driving `crypto_mismatch` / session wipe when garbage frames fail AEAD open during the proof window).
- **Evidence:** `announceTopicsOnConn` walks all `topics` and writes `{ type: "hello", topicRef }` on the connection; `join` calls `writeSwarm({ type: "hello", topicRef })` with no `topicRefFilter`, so the hello goes to every open connection.
- **Suggested solution:** Announce and adopt only topics Hyperswarm already reports as shared on that connection (`info.topics` / `topic` events). Do not broadcast hellos for unrelated topics.
- **Residual risk:** Confirm whether any intentional multi-topic multiplex still needs an app-level hello after that change; verify Alice with two rooms cannot learn Bob’s second topic via a shared first room.
- **Remediation (restrict-sidecar-topic-hello):** App NDJSON `hello` was **removed** (not merely filtered). Peer adoption is Hyperswarm `info.topics` / `topic` only; inbound hello is ignored. Topic knowledge remains from SmartMessage invite/accept; L3/SmartMessage is the fallback if discovery lags.

# follow-up

- [x] Restrict topic announce/adopt to Hyperswarm-shared topics only (`info.topics` / `topic` events)
- [x] Stop unfiltered `hello` broadcast in `announceTopicsOnConn` and `join` → `writeSwarm` (hello path removed)
- [x] Add regression test: peer on topic A must not receive hello for topic B
- [ ] Manually verify Alice with rooms A+B: adversary invited only to A does not learn B’s `topicRef`
- [x] Confirm multi-topic peers who truly share two DHT topics still work after the change — lab OK with peer on 0.1.9 vs local 0.1.10
