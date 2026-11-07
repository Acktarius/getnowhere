# Security posture

This document defines the expected security posture for Get NowHere. It exists to keep architectural decisions grounded in verifiable privacy properties rather than assumptions, convenience defaults, or marketing language.

Get NowHere is being built as a privacy-first communication system with distinct layers for relationship establishment, discovery, wake-up signalling, and real-time transport. That separation is a strength only if each layer has a clearly defined role, a minimal knowledge set, and explicit rules about what data it may receive, store, expose, or derive.

## Why this matters

Strong encryption alone does not guarantee real privacy. Privacy failures often come from misunderstood library behavior, weak trust boundaries, metadata correlation across layers, overexposed logs, token reuse, or failure paths that reveal more than the primary success path.

The practical goal is not to trust libraries blindly, nor to reimplement every dependency from scratch. The goal is to understand each critical dependency well enough to explain:

- what it knows
- what it can observe
- what it stores
- what it emits on the network
- what happens on retry, reconnect, backgrounding, expiry, and failure
- which assumptions are guaranteed by code and which are only hoped for

If a privacy claim cannot be tied to a concrete mechanism that can be described, tested, and falsified, it must not be treated as a guarantee.

## Core principles

### 1. Separation of concerns

Each layer must do one job well and must not silently absorb responsibilities that belong elsewhere.

- Layer 1 establishes relationships and distributes sensitive capability material.
- Layer 2 performs live peer discovery, NAT traversal, and direct transport.
- Wake signalling is only a wake mechanism, not a message transport.
- Local process bridges exist only for local coordination and must not become secret distribution channels unless explicitly designed and audited for that purpose.

Room identity, topic identity, peer identity, wake credentials, and message encryption material must remain conceptually separate even if some are delivered in the same sealed payload.

### 2. Least knowledge

Every component should know only what it strictly needs.

Examples:

- A wake service should not know message contents.
- A DHT should not know human-readable room meaning.
- A local renderer should not receive long-term secrets unless there is a clear need and containment story.
- A peer that knows a topic must not automatically be trusted as an authorized room member.

### 3. Explicit trust boundaries

Every boundary must be named and documented.

At minimum, the project must treat these as separate trust zones:

- Conceal relationship and capability distribution layer
- Layer 2 peer discovery and connection establishment
- direct peer transport
- wake/notification infrastructure
- local app UI process
- local native sidecar / transport process
- local persistence and logs

A compromise in one zone must not be casually assumed to imply compromise of all others.

### 4. Verify behavior, do not infer it from branding

A library described as secure, private, decentralized, encrypted, or serverless must still be verified at the level of actual runtime behavior.

Questions that must be answerable:

- What exactly is announced to the network?
- Which identifiers are stable?
- What metadata can peers observe?
- What metadata can infrastructure nodes observe?
- What is persisted locally by default?
- What is logged by default?
- What fallback path activates when the preferred path fails?
- What changes when the device sleeps, reconnects, or changes network?

### 5. Failure paths matter as much as success paths

The project must assume that privacy leaks are more likely to appear in retries, reconnects, offline fallback, topic rotation, expiry, invitation recovery, error reporting, and debugging workflows than in the ideal happy path.

Any feature that is private only when everything works perfectly is not a strong privacy feature.

## Required understanding by component

The maintainer should be able to explain the following for every critical component before making strong privacy claims about the app.

### Conceal Smart Message layer

Must be understood in terms of:

- who can read relationship and capability payloads
- what metadata exists outside ciphertext
- how room identifiers and topic identifiers are separated
- how expiry, revocation, and replay are handled
- what anonymity properties are expected from the underlying network

### HyperDHT / Hyperswarm / Holepunch layer

Must be understood in terms of:

- what is announced and looked up
- how topics or keys are derived and rotated
- how peers are matched
- how hole punching is coordinated
- when direct peer IP exposure occurs
- what relays or fallback nodes may observe
- what assumptions fail under restrictive NAT or mobile conditions

### Wake / notification layer

Must be understood in terms of:

- who can publish
- who can subscribe
- what a wake reveals
- whether wake identifiers are reusable
- token scope and revocation
- rate limiting and abuse resistance
- whether notification infrastructure can correlate relationship activity

### Local bridge and UI boundary

Must be understood in terms of:

- which secrets cross between UI and native/runtime processes
- whether local transport is IPC, ws, or wss
- whether loopback endpoints can be abused by local malware or browser contexts
- whether compromised UI code can exfiltrate reusable secrets
- whether local compromise is contained to the current device/session or escalates into long-term relationship compromise

### Local persistence and observability

Must be understood in terms of:

- what is stored on disk
- what remains after logout, app kill, or room expiry
- whether topics, wake identifiers, room IDs, or peer IDs appear in logs
- whether crash reports, analytics, metrics, or traces can leak sensitive correlation material

## Non-negotiable engineering rules

### Do not log secrets or high-value capabilities

The following must never appear in routine logs, analytics, crash messages, screenshots, or debug telemetry unless explicitly redacted for a controlled local-only debug session:

- raw room secrets
- topic secrets
- wake credentials or publish tokens
- long-term private keys
- full sealed relationship payloads
- stable peer identifiers if they create cross-layer correlation risk

### Do not equate discovery with authorization

Knowing a topic, reaching a socket, or appearing on the network is not sufficient proof of authorization. Remote identity must be cryptographically bound to the expected room or relationship before message acceptance.

### Do not reuse capabilities longer than necessary

Topics, wake identifiers, tokens, and ephemeral room capabilities should rotate according to room lifecycle, membership change, revocation, or expiry requirements. Reuse should be treated as a deliberate exception, not a default.

### Do not trust defaults silently

Any default behavior in a dependency that affects privacy, persistence, announcement scope, retry policy, logging, or transport fallback must be reviewed and documented.

### Do not widen a trust boundary for convenience

A shortcut that makes implementation easier but moves secrets into a broader process, broader service, or broader log surface must be treated as a security decision, not a refactor.

## Development discipline

### 1. Sequence diagrams first

Before or during implementation of any sensitive flow, write a sequence diagram that covers:

- pairing / relationship establishment
- room creation
- topic or capability delivery
- first live connection
- reconnect after disconnect
- offline wake
- fallback to Layer 1
- expiry / revocation / rotation
- room deletion or teardown

If the exact event chain cannot be drawn clearly, it is not yet understood well enough.

### 2. Threat model per layer

Each major layer must maintain a short threat model covering:

- assets to protect
- adversaries
- visible metadata
- trust assumptions
- entry points
- abuse cases
- failure cases
- mitigations
- open questions

Short, accurate threat models are more valuable than large vague ones.

### 3. Instrument real behavior

Mental models must be checked against reality.

Use packet capture, controlled test peers, logging review, storage inspection, and failure injection to confirm:

- actual network announcements
- peer-visible metadata
- infrastructure-visible metadata
- reconnection behavior
- token rotation behavior
- fallback activation
- log cleanliness

### 4. Encode invariants in code and review

Important privacy assumptions should appear as explicit invariants, guards, or tests.

Examples:

- topic material is never written to standard logs
- wake credentials are scoped and rotated with room lifecycle
- renderer does not receive long-term secret material
- socket establishment does not imply authorization
- expired room capability is rejected everywhere it is checked

### 5. Prefer contained interfaces

Interfaces between layers should be narrow, typed, and explicit. Passing large generic payloads between systems increases the chance that secrets are copied into places that were never meant to hold them.

## Common failure modes to watch for

The project should assume these are realistic risks:

- metadata correlation between relationship layer and transport layer
- reuse of topic or wake material beyond the intended privacy window
- logs that accidentally include capability material
- local bridge designs that leak secrets into a wider attack surface
- treating “peer found” as equivalent to “peer authenticated”
- fallback systems that reveal more metadata than the primary path
- library updates that silently change announcement, persistence, or retry behavior
- debug tooling that becomes permanent production surface area

## Standard for privacy claims

Public privacy claims must be conservative.

A claim is strong enough to publish only when:

1. the mechanism behind it is known,
2. the trust boundary is identified,
3. the observable metadata has been considered,
4. the failure behavior has been examined, and
5. the behavior has been tested rather than assumed.

If those conditions are not met, the project should describe the feature as a goal, design intention, or current hypothesis rather than a guarantee.

## Working rule for maintainers

For every new library, transport path, fallback path, wake mechanism, or local bridge, the maintainer should be able to answer:

- What does it know?
- What can it observe?
- What can it leak?
- What happens when it fails?
- What survives longer than intended?
- What exact privacy claim does it support, and what claim does it not support?

That discipline is the practical foundation for building privacy software responsibly as a small team or solo maintainer.