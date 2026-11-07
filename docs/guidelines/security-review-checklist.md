# Security review checklist

This checklist turns the project security posture into repeatable review work for Get NowHere. It is intended to be used before merging sensitive changes, before shipping releases, and whenever a library, protocol path, or trust boundary changes.

Use this checklist conservatively. If an item cannot be answered clearly, treat it as not yet satisfied.

## How to use this checklist

Apply this checklist when any of the following changes:

- relationship establishment or invitation flows
- room lifecycle logic
- topic derivation or transport bootstrap material
- HyperDHT / Hyperswarm / Holepunch integration
- wake notification design, ntfy tokens, or publish/subscribe scope
- local IPC / ws / wss bridge behavior
- key handling, encryption logic, or local persistence
- logging, analytics, telemetry, or crash reporting
- dependency versions that affect networking, storage, retries, or protocol behavior

For each reviewed change, record:

- feature or component name
- date reviewed
- branch or commit
- reviewer
- decision: pass / pass with follow-up / block
- follow-up items and owner

## Release gate

Do not treat a feature as privacy-safe for release unless all of the following are true:

- the event chain is understood end to end
- trust boundaries are identified
- secrets and capabilities are mapped
- normal path and failure path were both reviewed
- logs and storage were inspected
- network-visible behavior was validated where applicable
- privacy claims were written conservatively

## Cross-cutting review

### 1. Event chain

Confirm the exact sequence is documented for the relevant feature:

- trigger
- local state transitions
- secrets/capabilities loaded or derived
- data sent across local process boundaries
- data sent over the network
- retries, reconnects, expiry, and teardown
- fallback behavior when the preferred path fails

Review questions:

- Can the full flow be drawn as a sequence diagram?
- Is every network hop accounted for?
- Is every actor named clearly?
- Is there any step that is still “assumed” rather than known?

### 2. Trust boundaries

Confirm the feature does not blur boundaries without an explicit decision.

Review questions:

- Which process, service, or peer receives this data?
- Is that recipient inside the intended trust boundary?
- Does this change widen the audience for any secret or identifier?
- If one layer is compromised, what new data becomes exposed?

### 3. Secrets and capabilities

List every high-value item touched by the feature.

Examples:

- private keys
- room secrets
- topic secrets
- wake identifiers
- publish tokens
- peer identity material
- session bootstrap payloads

Review questions:

- Where is each secret created?
- Where is it stored?
- Where is it transmitted?
- Who can read it?
- When is it rotated or destroyed?
- Can it be reused longer than intended?

### 4. Logs and observability

Review all logs added or touched by the change.

Review questions:

- Do logs contain raw secrets, topics, room IDs, peer IDs, tokens, or sealed payloads?
- Do error messages expose relationship or transport metadata?
- Do debug logs exist in production paths?
- Do crash reports, analytics, or metrics include values that can correlate users or rooms?
- Are sensitive values redacted consistently?

### 5. Failure behavior

Review what happens when the flow does not succeed.

Review questions:

- What happens if the peer is offline?
- What happens if wake delivery fails?
- What happens if NAT traversal fails?
- What happens if identity verification fails?
- What happens if rotation or expiry occurs mid-session?
- Does fallback reveal more metadata than the primary path?
- Does retry behavior create correlation or abuse risk?

## Layer 1 review: Conceal relationship and capability distribution

Confirm Layer 1 remains responsible for private asynchronous relationship establishment and capability delivery, not for silently becoming an unbounded general transport.

Checklist:

- Relationship payload purpose is documented.
- Room ID and topic ID remain conceptually separate.
- Payload contents are minimal and justified.
- Expiry, replay, and revocation rules are documented.
- No unnecessary stable identifiers were added.
- No plaintext metadata was added casually.
- Logs do not contain decrypted payload material.
- Failure handling fails closed.

Review questions:

- What exactly is learned by sender, recipient, and outside observers?
- Does this change increase cross-room or cross-contact linkability?
- Can old capability material still be replayed after room expiry?

## Layer 2 review: HyperDHT / Hyperswarm / Holepunch

Confirm the transport layer behavior is understood as implemented, not as imagined.

Checklist:

- Topic derivation is documented.
- Topic secrecy assumptions are documented.
- Peer discovery rules are documented.
- Direct connection establishment is documented.
- Identity binding after discovery is enforced.
- Authorization is not inferred from discovery alone.
- Relay/fallback behavior is documented.
- Known IP exposure limits are documented honestly.

Review questions:

- What is announced to the DHT?
- Who can observe the announcement?
- What can a peer learn before authentication succeeds?
- What happens on restrictive NAT, mobile sleep, or reconnect?
- Does any new code expose a stable identifier longer than necessary?

## Wake path review: ntfy / notification infrastructure

Confirm the wake system remains narrow, pairwise, and abuse-resistant.

Checklist:

- Wake is used only to wake, not to carry chat payloads.
- Publish scope is minimal.
- Subscribe scope is minimal.
- Topics are not guessable from public metadata.
- Tokens are scoped, revocable, and not reused indefinitely.
- Wake identifiers rotate with room lifecycle or equivalent policy.
- Rate limits and abuse controls exist.
- Logs do not expose wake secrets or useful correlation material.

Review questions:

- Can an attacker enumerate wake targets?
- Can one sender publish outside the intended wake path?
- Can the infrastructure operator correlate repeated room activity?
- Does notification content reveal more than “something may be available”?

## Local bridge review: UI, sidecar, IPC, ws, wss

Confirm the local bridge does not become an unreviewed secret tunnel.

Checklist:

- Bridge purpose is documented.
- Message types crossing the bridge are enumerated.
- Secrets crossing the bridge are minimized.
- Long-term secrets are excluded unless explicitly required.
- Local endpoint exposure is documented.
- Authentication or origin restrictions exist where applicable.
- UI compromise impact is documented.
- Logs do not mirror bridge payloads unsafely.

Review questions:

- Could a compromised renderer abuse the local bridge?
- Could another local process connect or inject traffic?
- Would a bridge compromise leak only current session data, or durable capabilities too?

## Storage review

Confirm local storage behavior matches the privacy model.

Checklist:

- Stored data inventory is current.
- Retention rules are documented.
- Room expiry removes or invalidates associated local capability material.
- Deleted or expired rooms do not remain fully recoverable by accident.
- Cache contents are reviewed.
- Debug artifacts are reviewed.
- Backups and export paths are reviewed.

Review questions:

- What persists after logout?
- What persists after app kill?
- What persists after room expiry?
- What persists after uninstall or profile removal, where relevant?

## Dependency review

Confirm dependency changes do not silently modify privacy-relevant behavior.

Checklist:

- Version bump reviewed for changelog and release notes.
- Default behavior changes reviewed.
- Networking behavior changes reviewed.
- Storage behavior changes reviewed.
- Logging behavior changes reviewed.
- Retry/backoff behavior changes reviewed.
- New transitive dependencies reviewed when relevant.

Review questions:

- Did the library change what it announces, stores, retries, or logs?
- Did a new default get introduced that widens the attack surface?
- Are previous assumptions still true after the upgrade?

## Test and validation

Confirm the implementation was checked against reality rather than intuition.

Checklist:

- Controlled local test completed.
- Cross-network test completed where relevant.
- Packet capture reviewed where relevant.
- Log inspection completed.
- Expiry/rotation test completed.
- Offline/reconnect path tested.
- Failure injection performed for critical flows.
- Negative tests performed for unauthorized peer or invalid capability cases.

Suggested validation scenarios:

- same LAN peer test
- separate home networks test
- one peer behind stricter NAT
- peer sleeps and wakes
- room expires mid-lifecycle
- invalid topic or stale token
- unauthorized peer attempts connection
- notification abuse or replay attempt

## Privacy claim review

Before publishing or documenting a privacy claim, confirm:

- the claim names the protection precisely
- the claim does not imply protections the system does not provide
- known metadata exposure is disclosed where relevant
- direct P2P IP visibility is not hidden behind vague language
- fallback behavior is described honestly
- “goal” and “guarantee” are not confused

Review questions:

- What exact attacker is this claim about?
- What does the feature protect against?
- What does it not protect against?
- Is the wording stronger than the implementation justifies?

## Merge decision

Use this final gate before merging privacy-relevant work.

Block merge if any of the following is true:

- the exact event chain cannot be explained clearly
- a trust boundary changed but was not documented
- a secret or capability flow is unclear
- discovery is being treated as authorization
- logs or telemetry expose sensitive material
- fallback behavior is unknown
- a dependency changed privacy-relevant behavior without review
- public wording overclaims the protection level

A change may pass only when remaining risk is understood, documented, and accepted consciously rather than ignored.