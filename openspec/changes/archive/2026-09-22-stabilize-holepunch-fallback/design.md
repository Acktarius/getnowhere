# Design

## Context

L1 relay is intentionally available for `accepted`, `connecting`, and
`connect_failed`, but not for a genuinely unaccepted `pending` invite. The
observed composer lock is therefore not a missing relay feature: it is a
lifecycle regression. `ensureRoom` currently accepts incoming bootstrap status
as authoritative, while periodic `openRoom` calls can restore an offline
session and invoke `connect()` repeatedly without an in-flight guard.

Hyperswarm's `discovery.flushed()` confirms publication, not peer discovery.
Separate machines on one LAN still need usable UDP and normally public DHT
bootstrap access. Discovery can exceed the current 30-second application
deadline even when the network is healthy.

## Decisions

- Decision: lifecycle acceptance is monotonic.
  - `pending` bootstrap data SHALL NOT replace any post-accept lifecycle.
  - True pre-accept `pending` remains relay-ineligible.
  - Alternative considered: allow relay for every `pending` room.
  - Rationale: that would mask the state bug and permit messaging before the
    invitee accepts.

- Decision: connection work is single-flight per room.
  - Concurrent connect/restore callers share the same promise.
  - Automatic retries observe the existing exponential backoff and cannot be
    started by overlapping UI polling ticks.
  - The UI may continue refreshing room state, but refresh is not an
    unconditional connect trigger.
  - Alternative considered: remove polling entirely.
  - Rationale: polling still supports wallet handoff and sidecar state refresh;
    deduplicating the runtime operation is the safer boundary.

- Decision: persist connection failure lifecycle and error code.
  - Catalog state must reflect `connect_failed` after timeout or unreachable
    sidecar so reload cannot restore an older `pending` value.
  - Runtime memory remains the source for transient `peerStatus`.

- Decision: use a 120-second per-attempt discovery deadline.
  - Alternative considered: 90 seconds.
  - Rationale: reported DHT meets can exceed 90 seconds; single-flight prevents
    a longer deadline from multiplying attempts. Manual retry remains available.

- Decision: separate transport state from fallback copy.
  - Lifecycle text names Holepunch explicitly.
  - Chain text describes the next message path, for example
    `Messages use chain fallback until Holepunch connects`.

- Decision: add a best-effort, Electron-only UFW advisory.
  - Electron main checks Linux host firewall state without `sudo`, elevation,
    rule mutation, or collection of the full ruleset.
  - A small testable helper returns `active`, `inactive`, or `unknown`.
    Permission errors, missing UFW, non-systemd hosts, and non-Linux platforms
    resolve to `unknown` rather than blocking startup.
  - Main passes the read-only result through the existing preload bridge.
  - The chat diagnostics surface warns only when UFW appears active and the room
    has a retryable Holepunch timeout/unreachable failure.
  - The warning says UFW *may* block dynamic UDP; it does not claim localhost
    bridge port `7901` or any specific Hyperswarm port is blocked.
  - Alternative considered: parse the full UFW ruleset or invoke `sudo ufw
    status`.
  - Rationale: Electron must not request privilege or make an unreliable
    allow/deny determination for Hyperswarm's dynamic UDP socket.

- Decision: preserve architecture and protocol boundaries.
  - No Hyperswarm import in UI, bridge change, topic formula change, or crypto
    change is permitted by this work. The preload host-advisory field is not a
    sidecar bridge message.

## Risks / Trade-offs

- A longer deadline delays `connect_failed`; L1 relay remains usable throughout
  `connecting`, so messaging is not delayed.
- Single-flight cleanup must occur on resolve and rejection or a room could be
  permanently stuck behind a stale promise.
- Monotonic lifecycle logic must still allow explicit terminal transitions such
  as decline, expiry, close, destruction, and revoke.
- Same-LAN success cannot be guaranteed when UDP or DHT bootstrap traffic is
  blocked; documentation and diagnostics make that limitation explicit.
- UFW being active does not prove it caused a timeout. The advisory must remain
  conditional language and must not appear in the browser build.

## Verification

- Unit tests prove a post-accept room cannot regress to `pending`, concurrent
  restore/connect requests create one attempt, failure state is durable, and
  relay remains enabled while connecting or failed. Electron helper tests cover
  active, inactive, unavailable, and permission-denied firewall detection.
- Existing transport, protocol, sidecar, type, and build checks remain green.
- Product-level manual acceptance uses two Alice/Bob desktop instances or two
  machines: during Holepunch connection/failure, the composer stays enabled and
  chain messages send; the UI identifies Holepunch as the attempted transport.
