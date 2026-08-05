### [Medium] Inbound swarm frames accepted for topics the connection never joined

- **Severity:** Medium (was High before hello remediation)
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/swarm.mjs` — `conn.on("data")` frame branch
- **Issue:** Remote NDJSON `frame` messages were delivered to local clients whenever
  `topics.get(msg.topicRef)` existed; membership in `connTopics` was not checked.
  Outbound `writeSwarm` already filtered on `connTopics`.
- **Why it matters (post finding 01):** Cross-topic hello no longer leaks foreign
  `topicRef`s, so an A-only peer cannot learn B from the wire. Residual risk: a
  peer who already knows topic B (prior invite, old membership) can still inject
  B-labeled frames on an A-only Hyperswarm connection without Hyperswarm
  associating B — proof-window garbage / presence noise without appearing on B’s
  peer count. App-layer ChaCha20-Poly1305 (session seal) still blocks plaintext
  forgery; failed opens during proof can become `crypto_mismatch`. Knowing B also
  allows DHT-join of B; this finding is about mis-labeled frames on an unshared
  connection, not discovery secrecy.
- **Evidence (pre-fix):** Frame handling checked `msg.type === "frame"` and
  `topics.get(msg.topicRef)` only. `connTopics` was used for outbound filtering
  and close cleanup, not inbound authorization. (Hello-based `connTopics`
  seeding is already fixed by finding 01.)
- **Suggested solution:** Drop inbound `frame` unless
  `connTopics.get(conn)?.has(topicRef)`. Populate `connTopics` only from
  Hyperswarm-shared topics (done in finding 01).
- **Residual risk:** Multi-topic peers who truly share two DHT topics must still
  exchange frames after association (`topic` events). Attacker who knows B can
  still join B via DHT.
- **Remediation (authorize-inbound-swarm-frames):** Inbound frame fan-out now
  silent-drops unless `topicRef ∈ connTopics` for that connection — same
  allowlist as outbound `writeSwarm`.

# follow-up

- [x] Reject inbound swarm `frame` unless `topicRef ∈ connTopics` for that connection
- [x] Populate `connTopics` only from Hyperswarm-shared topics (not peer-asserted foreign hellos) — finding 01
- [x] Add regression test: connection on topic A cannot inject frames into topic B
- [ ] Manually verify proof-window garbage inject no longer reaches local clients for foreign topics
