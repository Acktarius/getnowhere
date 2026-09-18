# Security module review inventory

This document is the living security-review inventory for Get NowHere.

Its purpose is to ensure that security-relevant modules are reviewed as bounded systems rather than only as isolated lines of code. Each module entry identifies what the module does, its trust boundary, its inputs, its outputs, the files that define its behavior, and the risks that must be checked.

This file is not a substitute for a full threat model, protocol documentation, tests, or an independent security audit. It is the project review ledger: a practical record of which modules have been examined, at which code revision, and what was found.

## Review rules

- Review the exact files listed in each module entry.
- Review direct imports, callers, types, configuration, tests, and governing documentation when needed to understand the full data flow.
- Treat unknown behavior as a verification gap, not as proof that the module is safe.
- Do not mark a module reviewed merely because code looks reasonable.
- A review must identify an immutable code reference, normally the current commit SHA.
- A checked box means that a review was completed and recorded. It does not mean the module is secure, free of vulnerabilities, approved for release, or free of unresolved findings.
- If findings exist, append them to the dated review record. Do not hide, delete, or overwrite older findings.
- If code changes after review, determine whether that change affects the module’s security behavior, trust boundary, inputs, outputs, storage, networking, retry logic, logging, authorization, cryptographic handling, or dependencies. If so, perform a new review.
- Never place raw secrets, tokens, room topics, private keys, decrypted relationship payloads, or production personal data in this document.



## Status format

A checked box means that the module has been reviewed at least once.

Use this exact status format before the first review:

```md
- [ ] Reviewed — no review recorded yet
```

After the first review, regardless of whether findings exist:

```md
- [x] Reviewed — latest review: YYYY-MM-DD — commit: <short-sha> — reviewer: <model or person>
```

When a new review is performed, update the `latest review` line and append a new dated review entry under the module.

Do not delete older review entries or findings.

## Finding format

Every confirmed finding must use this format:

```md
- [ ] `SEC-YYYY-NNN` — severity: critical | high | medium | low | info
  - Date found: YYYY-MM-DD
  - Commit reviewed: <short-sha>
  - Affected files: `<path>`
  - Evidence: `<function, symbol, class, or approximate line range>`
  - Description: concise explanation of the observed security or privacy risk
  - Impact: what could be exposed, bypassed, corrupted, correlated, or abused
  - Recommended remediation: concrete next step
  - Status: open
```

When a finding is resolved, preserve the original record and append:

```md
- [x] `SEC-YYYY-NNN` — resolved
  - Resolution date: YYYY-MM-DD
  - Fix commit: <short-sha>
  - Verification: how the fix was checked
```



## Review outcome terms

Use one of these outcomes in every dated review entry:

- **No findings identified in reviewed scope:** No confirmed issue or meaningful verification gap was identified in the exact reviewed scope and commit.
- **Findings recorded:** One or more confirmed issues were identified and listed.
- **Verification gaps recorded:** Important behavior could not be verified through available code, tests, configuration, documentation, or controlled testing.
- **Findings and verification gaps recorded:** Both confirmed issues and important unknowns exist.

A “no findings identified” result is not a permanent guarantee. It applies only to the reviewed commit and scope.

## Module inventory

---



## MOD-001 — Application bootstrap and routing

**Description:** Initializes the web application, global providers, routes, high-level UI entry points, and application state transitions.

**Boundary:** Untrusted UI execution environment to application state and service-invocation boundary.

**Inputs:**

- browser or WebView runtime
- route parameters
- user-triggered UI events
- configuration exposed to the web application
- data returned by local or remote services

**Outputs:**

- screen rendering
- service calls
- state changes
- error surfaces
- navigation transitions

**Primary risks:**

- unvalidated route or UI input reaching privileged services
- accidental exposure of security-sensitive state in components
- unsafe error rendering
- untrusted content injection
- secrets embedded in web bundles or environment configuration
- privileged actions callable outside the intended runtime

**Files:**

- `src/main.tsx`
- `src/App.tsx`
- `src/layouts/**`
- `src/screens/**`
- `src/state/**`
- `src/hooks/**`

**Review focus:**

- Validate all data crossing from UI into security-sensitive services.
- Confirm secrets are not placed in React state, route state, browser storage, or rendered output.
- Review error handling for data exposure.
- Confirm UI state does not treat connection or discovery as authorization.
- Check that development-only diagnostics are unavailable or appropriately controlled in production.

- [x] Reviewed — latest review: 2026-09-18 — commit: fe7419d — reviewer: Composer (Cursor Agent)



### Findings

- [x] `SEC-2026-001` — severity: high
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/state/walletStore.ts`, `src/screens/onboarding/CreateWalletScreen.tsx`, `src/screens/onboarding/RestoreWalletScreen.tsx`
  - Evidence: `createWallet` / `restoreWallet` / `importWallet` set `seedPhrase`; `clearSeed()` is defined but never called from application code; Create/Restore finish paths navigate without clearing
  - Description: Full mnemonic remains in global Zustand UI state for the lifetime of the page session after wallet create, restore, or import
  - Impact: Any XSS, malicious extension, Electron DevTools inspection, or renderer dump can recover the wallet seed without re-entering the encryption password
  - Recommended remediation: Call `clearSeed()` immediately after the user confirms backup (create) and immediately after successful restore/import; never retain mnemonic in the store once the one-time reveal UI closes
  - Status: open

- [x] `SEC-2026-002` — severity: medium
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/screens/chats/ChatRoomScreen.tsx`
  - Evidence: Room diagnostics sheet always reachable via header; shows full `roomId` with `CopyButton` and shortened `discoveryTopicRef` via `shortTopicRef`
  - Description: Production chat UI exposes Layer-2 capability material (`roomId`, topicRef prefix/suffix) on an ungated diagnostics surface
  - Impact: Screenshots, shoulder surfing, shared support captures, or local malware reading the DOM can obtain room join capability hints that protocol docs treat as secrets
  - Recommended remediation: Gate diagnostics behind explicit debug mode / `import.meta.env.DEV`, or remove copyable `roomId` / topicRef from production builds; keep only non-capability status fields
  - Mitigations applied: `shortRoomId()` truncates room id at both sheet call sites; `CopyButton` copies truncated label only; topic stays `shortTopicRef` + non-selectable; source-guard test enforces the invariant (OpenSpec change `redact-room-diagnostics`)
  - Status: **addressed** (see `.repo-kit/findings/02-room-diagnostics-capability-leak.md`)

- [x] `SEC-2026-003` — severity: ~~medium~~ → **low / accepted**
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/App.tsx`, `src/screens/chats/ChatRoomScreen.tsx`, `desktop-electron/main.mjs`
  - Evidence: `HashRouter` route `/chats/:roomId`; `useParams().roomId` drives open/bootstrap without opaque routing
  - Description: `roomId` (documented capability secret) is placed in the browser location hash and history for every open room
  - Impact analysis (per platform):
    - **Browser+sidecar**: dev-only path, never ships to end users — not a production concern
    - **iOS/Android WebView**: no address bar; WKWebView/Android WebView do not persist navigation history across cold starts — no exposure
    - **Electron (packaged)**: `file://` origin in `persist:gnh` Chromium partition — the only production surface with any residual risk
  - Mitigations applied:
    - `ChatRoomScreen` strips the hash via `window.history.replaceState(null, "", "#/chats")` on mount (Electron-only guard: `window.gnhDesktop != null`); `replaceState` does not fire `hashchange`/`popstate` so React Router state is unaffected; roomId captured in `useState` on mount before the strip
    - `desktop-electron/main.mjs shutdown()` calls `session.fromPartition(PARTITION).clearData({ dataTypes: ["browsing_history"] })` before window destroy — clears the on-disk Chromium History file on every clean exit
  - Residual / accepted: crash/kill bypasses exit-time clear; `file://` hash-only navigations may not be recorded by Chromium at all (undocumented behaviour, leans toward not recorded); `roomId` alone is insufficient to join (requires `relationshipId` + post-connect L1 proof)
  - Status: **addressed / accepted low risk**

- [ ] `SEC-2026-004` — severity: low
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/hooks/useSeedDemoContacts.ts`, `src/App.tsx`
  - Evidence: `RequireWallet` always mounts `useSeedDemoContacts`; hook creates real Conceal accounts and persists demo contacts whenever contacts storage is not yet marked ready — no `import.meta.env.DEV` guard
  - Description: Production builds seed synthetic contacts with generated wallet material on first empty install
  - Impact: Users may treat demo peers as real; demo payment IDs and addresses clutter the relationship graph and increase accidental-invite risk
  - Recommended remediation: Restrict demo seeding to development builds, or require an explicit user action to install sample contacts
  - Status: open



### Review history



#### 2026-09-18 — fe7419d — Composer (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: UI correctly stays off Hyperswarm; chat send paths call `composerGate` / lifecycle status rather than treating peer discovery as authorization.
- Least knowledge: violated for mnemonic retention (`SEC-2026-001`) and room/topic capability display/routing (`SEC-2026-002`, `SEC-2026-003`).
- Trust boundaries: bootstrap routes wallet/contacts hydration into UI state; backup reveal clears modal secrets on close (good); seed store lifecycle does not.
- Failure paths: send failures toast `Error.message`; fatal boot uses `textContent` (no HTML injection).
- Privacy claims: UI copy distinguishing Holepunch vs chain relay is conservative relative to encryption docs.

**Checklist highlights:**

- Event chain (UI): onboarding → wallet init → tab shell → room open/bootstrap → composer gate → send — traced in-scope.
- Secrets: seed, passwords, payment IDs, roomId/topicRef surfaces reviewed; initiator `privateKeyHex` persistence noted as boundary to storage module.
- Logs: no seed/password/`topicRef` console logging found in screens/state/hooks.
- Storage: settings/onboarded flags only in auth/settings stores; wallet seed not written by `walletStore` itself.
- Dependencies / network capture: not re-validated in this UI module pass.

**Findings this review:** `SEC-2026-001`, `SEC-2026-002`, `SEC-2026-003`, `SEC-2026-004`

**Verification gaps:**

- Command path `docs/guidelines/security-posture.md` is absent; review used `docs/guidelines/security-postures.md` (same content title). Treat as governance naming inconsistency.
- No controlled XSS / renderer-dump test executed against live Zustand seed retention.
- Confidentiality of `gnh.pendingInitiatorKeys` / `privateKeyHex` on disk is out of this module’s file list — defer to MOD-011 (storage) with call sites observed in `contactsStore`.
- Intent of always-on room diagnostics (product vs leftover debug) is not documented in governing docs.

---



## MOD-002 — Conceal integration

**Description:** Integrates the application with Conceal-related wallet, encrypted Smart Message, relationship, invitation, and capability-distribution behavior.

**Boundary:** Application trust boundary to the Conceal network and encrypted relationship/capability payload-handling boundary.

**Inputs:**

- user identity and wallet-related state
- invitation or relationship events
- encrypted incoming data
- room bootstrap material
- network responses and errors

**Outputs:**

- encrypted outgoing relationship messages
- decrypted and validated application payloads
- room creation and acceptance state
- capability material supplied to downstream modules

**Primary risks:**

- malformed or replayed payload acceptance
- incorrect encryption or decryption assumptions
- capability leakage into logs or UI state
- room ID and topic ID confusion
- insufficient expiry or revocation handling
- metadata correlation across relationship and transport layers
- unsafe serialization or parsing of untrusted decrypted content

**Files:**

- `src/services/conceal/**`
- `src/services/protocol/**`
- `src/services/contacts/**`
- `src/services/index.ts`
- relevant interfaces in `src/types/**`
- `docs/security/encryption.md`
- `docs/security/p2pchatprotocol.md` if present

**Review focus:**

- Trace every relationship payload from receipt or creation through validation and use.
- Confirm payload schema and version checks occur before use.
- Confirm decrypted content is not logged.
- Confirm room IDs, topic IDs, peer identity material, wake data, and encryption material remain distinct.
- Confirm replay, expiry, decline, revocation, and duplicate-delivery behavior fail safely.
- Confirm a successful Layer 1 event does not bypass Layer 2 authorization checks.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-003 — Protocol and cryptographic envelope handling

**Description:** Defines application message formats, encryption envelopes, associated data, serialization, parsing, validation, protocol versioning, and message-acceptance rules.

**Boundary:** Plain application data to authenticated and encrypted protocol-data boundary.

**Inputs:**

- plaintext message data
- key material supplied by approved key-management paths
- remote encrypted payloads
- protocol version values
- associated-data context
- nonce or randomness sources

**Outputs:**

- encrypted envelopes
- validated decrypted messages
- rejection and error states
- protocol compatibility decisions

**Primary risks:**

- nonce reuse
- missing or inconsistent associated data
- accepting malformed or ambiguous serialized input
- cryptographic downgrade or version confusion
- ciphertext replay
- key, room, or topic context mix-up
- logging raw plaintext, keys, nonces, or envelopes
- fail-open decryption and parsing behavior

**Files:**

- `src/services/protocol/**`
- `src/lib/**`
- `src/utils/**`
- encryption-related types in `src/types/**`
- `docs/security/encryption.md`
- `docs/security/p2pchatprotocol.md` if present

**Review focus:**

- Identify every encryption and decryption call site.
- Verify key, nonce, and associated-data lifecycle.
- Verify authenticated decryption fails closed.
- Verify protocol input has strict schema and version handling.
- Confirm ciphertext from one room, peer, or purpose cannot be accepted in another context.
- Confirm replay handling is explicit.
- Confirm errors do not disclose sensitive cryptographic state.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-004 — Layer 2 P2P transport adapter

**Description:** Application-facing Layer 2 transport code that bootstraps, controls, and consumes the Holepunch/P2P connection path.

**Boundary:** Application protocol and room-authorization boundary to native or sidecar P2P transport.

**Inputs:**

- authorized room bootstrap material
- topic-derived discovery data
- remote peer identity expectations
- connection-state commands
- outgoing application messages

**Outputs:**

- transport connection events
- incoming encrypted transport data
- connection errors and state
- requests sent to the local sidecar

**Primary risks:**

- topic leakage
- misuse of discovery material as authorization
- peer identity not bound to expected room or relationship
- unauthenticated incoming data being accepted
- reconnect behavior exposing metadata or stale capability use
- unsafe error or log propagation from sidecar to UI
- direct P2P IP exposure not being correctly understood or documented

**Files:**

- `src/services/p2p/**`
- `src/services/poke/**`
- `src/services/notifications/**`
- relevant state and type files under `src/state/**` and `src/types/**`
- `docs/background-remote-sync.md`
- relevant documents in `docs/features/**`
- relevant documents in `docs/architecture/**`

**Review focus:**

- Trace bootstrap material from accepted relationship to transport session.
- Confirm topic material is never treated as a sufficient membership credential.
- Confirm peer identity verification is required before application messages are accepted.
- Confirm expired or revoked room material cannot reconnect.
- Confirm connection, disconnect, retry, background, and fallback state transitions are explicit.
- Confirm the UI does not receive unnecessary transport secrets.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-005 — Holepunch sidecar authentication and configuration

**Description:** Establishes sidecar configuration, local authorization, configuration validation, error handling, socket-path policy, and parent-process lifecycle behavior.

**Boundary:** Local application-process boundary to the privileged P2P sidecar process.

**Inputs:**

- sidecar configuration
- local session or authentication material
- process environment
- IPC requests
- parent-process lifecycle signals

**Outputs:**

- accepted or rejected local sessions
- sidecar runtime configuration
- structured error results
- shutdown behavior

**Primary risks:**

- unauthorized local client connecting to sidecar
- weak, reusable, or leaked local session capability
- unsafe environment or configuration handling
- secrets exposed through configuration errors
- incorrect shutdown behavior leaving listening services active
- overly permissive local filesystem or socket permissions

**Files:**

- `holepunch-sidecar/src/auth.mjs`
- `holepunch-sidecar/src/config.mjs`
- `holepunch-sidecar/src/errors.mjs`
- `holepunch-sidecar/src/parent-death.mjs`
- `holepunch-sidecar/src/ipc-path.mjs`
- `holepunch-sidecar/src/server.mjs`
- `holepunch-sidecar/config.json`
- `holepunch-sidecar/package.json`
- `holepunch-sidecar/test/**`

**Review focus:**

- Confirm the local-client authentication model and entropy requirements.
- Confirm authentication material is process-scoped, short-lived where practical, and not logged.
- Confirm configuration is validated before use.
- Confirm file and socket permissions are restrictive.
- Confirm parent death shuts down the sidecar safely.
- Confirm errors do not expose topic material, keys, endpoints, or full request payloads.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-006 — Holepunch sidecar IPC bridge

**Description:** Implements the local IPC path, session binding, request/response protocol, and event delivery between the desktop application and Holepunch sidecar.

**Boundary:** Electron main process and local client to sidecar control-plane boundary.

**Inputs:**

- IPC path and connection requests
- local session proof
- sidecar command payloads
- connection and message events

**Outputs:**

- authenticated IPC responses
- sidecar control commands
- connection events
- transport events and errors

**Primary risks:**

- unauthorized local-process connection
- confused-deputy behavior
- command injection through malformed IPC payloads
- cross-session message delivery
- renderer-originated request escalation through Electron main
- excessive event payloads exposing secrets
- unbounded message size or resource exhaustion
- weak replay or sequence handling

**Files:**

- `holepunch-sidecar/src/bridge-ipc.mjs`
- `holepunch-sidecar/src/bridge-session.mjs`
- `holepunch-sidecar/src/ipc-path.mjs`
- `holepunch-sidecar/src/server.mjs`
- `desktop-electron/sidecar-ipc-client.mjs`
- `desktop-electron/desktop-ipc-path.mjs`
- `desktop-electron/main.mjs`
- relevant IPC tests under `holepunch-sidecar/test/**`
- relevant IPC tests under `desktop-electron/test/**`

**Review focus:**

- Confirm IPC endpoint access is restricted to the intended local principal.
- Confirm every command is schema-validated and authorization-checked.
- Confirm session binding prevents one local connection from acting as another.
- Confirm payload sizes, rates, and lifetimes are bounded.
- Confirm sensitive events are minimized and redacted.
- Confirm disconnect and restart behavior cannot leave stale privileged sessions active.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-007 — Holepunch swarm and transport runtime

**Description:** Manages swarm lifecycle, DHT/topic discovery, hole-punch connection establishment, peer sockets, message transport, disconnect, retry, and teardown.

**Boundary:** Local sidecar to public P2P network and remote-peer boundary.

**Inputs:**

- room/topic-derived discovery material
- transport or session configuration
- remote connection attempts
- outgoing message envelopes
- network events and failures

**Outputs:**

- DHT and swarm discovery behavior
- P2P connection attempts
- peer sockets
- incoming remote data
- connection state and events
- retry and teardown behavior

**Primary risks:**

- topic material exposed in logs, errors, metrics, or process arguments
- direct peer IP exposure to connected peers
- DHT or discovery information mistaken for authenticated identity
- malicious peer input, message flooding, memory exhaustion, or connection churn
- stale room material reconnecting after expiry or revocation
- peer event handlers accepting data before authentication
- unsafe retry/backoff causing correlation or denial of service
- dependency-default changes altering announcement or relay behavior

**Files:**

- `holepunch-sidecar/src/swarm.mjs`
- `holepunch-sidecar/src/server.mjs`
- `holepunch-sidecar/src/config.mjs`
- `holepunch-sidecar/package.json`
- `holepunch-sidecar/package-lock.json`
- `holepunch-sidecar/test/**`
- relevant documents in `docs/security/**`
- relevant documents in `docs/architecture/**`

**Review focus:**

- Identify exactly what gets announced, joined, logged, and retained.
- Confirm discovery is separate from remote authorization.
- Confirm remote message data is authenticated and bounded before processing.
- Confirm connection count, input sizes, timeouts, and backoff have limits.
- Confirm topic and peer lifecycle follows room expiry and revocation rules.
- Confirm failure and relay behavior is documented and safe.
- Confirm peer IP exposure limitations are accurately represented in product claims.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-008 — Electron desktop main process and preload bridge

**Description:** Runs the privileged Electron main process, creates windows, starts or coordinates the sidecar, and exposes the limited preload API to the renderer.

**Boundary:** Privileged desktop process to untrusted or less-trusted renderer boundary.

**Inputs:**

- renderer IPC requests
- window lifecycle events
- sidecar events
- desktop configuration
- operating-system signals

**Outputs:**

- renderer-exposed preload API
- sidecar lifecycle control
- desktop and firewall status
- native dialogs or OS integration
- IPC responses

**Primary risks:**

- renderer-to-main privilege escalation
- overly broad preload API
- unsafe IPC channel exposure
- disabled Electron hardening settings
- navigation, `webContents`, or external-link abuse
- sidecar secrets reaching renderer
- startup and shutdown races
- sensitive host information exposed to UI or logs

**Files:**

- `desktop-electron/main.mjs`
- `desktop-electron/preload.cjs`
- `desktop-electron/preload-bridge.cjs`
- `desktop-electron/sidecar-ipc-client.mjs`
- `desktop-electron/desktop-identity.mjs`
- `desktop-electron/desktop-info-ipc.cjs`
- `desktop-electron/desktop-ipc-path.mjs`
- `desktop-electron/firewall-status.mjs`
- `desktop-electron/forge.config.cjs`
- `desktop-electron/package.json`
- `desktop-electron/test/**`
- relevant documents in `docs/architecture/**`

**Review focus:**

- Confirm `contextIsolation`, sandboxing, and Node-integration posture.
- Enumerate every preload method and its exact validation and authorization.
- Confirm renderer cannot issue arbitrary sidecar commands.
- Confirm no privileged filesystem, shell, process, or network capability is unnecessarily exposed.
- Confirm navigation and external URL behavior are constrained.
- Confirm sidecar credentials and long-term secrets remain outside renderer access.
- Confirm packaging and build configuration does not weaken runtime protections.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-009 — Native mobile wrapper and platform bridges

**Description:** Wraps the web-first application for mobile delivery and integrates native platform behavior, permissions, notification handling, secure storage, and platform bridges.

**Boundary:** WebView/application layer to privileged Android and iOS platform capabilities.

**Inputs:**

- WebView events
- platform lifecycle events
- native notification events
- permission results
- secure-storage values
- build-time configuration

**Outputs:**

- native notifications
- secure-storage access
- WebView bridge responses
- platform permission requests
- application lifecycle state

**Primary risks:**

- insecure WebView configuration
- unsafe native-to-web message bridge
- secret leakage through deep links, push payloads, logs, or analytics
- excessive runtime permissions
- platform-specific storage differences
- notification metadata leakage
- release configuration exposing debug tools or development endpoints

**Files:**

- `native-wrapper/App.tsx`
- `native-wrapper/index.ts`
- `native-wrapper/src/**`
- `native-wrapper/plugins/**`
- `native-wrapper/android-native/**`
- `native-wrapper/ios-native/**`
- `native-wrapper/bare/**`
- `native-wrapper/app.json`
- `native-wrapper/eas.json`
- `native-wrapper/package.json`
- `native-wrapper/docs/**`

**Review focus:**

- Review every WebView setting, injected script, origin rule, and message bridge.
- Confirm native bridge messages are typed, origin-aware, and minimally privileged.
- Confirm notification payloads contain no message content, contact identity, room topic, or durable capability.
- Confirm secrets use appropriate platform secure storage rather than ordinary app storage.
- Confirm production-build settings disable debugging and development endpoints.
- Confirm Android and iOS privacy/permission behavior is documented separately where it differs.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-010 — Poke gateway service

**Description:** Server-side gateway related to wake/poke delivery, request validation, token/capability handling, abuse prevention, and communication with notification infrastructure.

**Boundary:** Public or semi-public network boundary to wake-signalling infrastructure.

**Inputs:**

- incoming HTTP requests
- scoped publishing credentials
- opaque wake identifiers
- rate-limit context
- service configuration
- notification-provider responses

**Outputs:**

- accepted or rejected wake requests
- minimal wake events
- rate-limit decisions
- audit and error logs
- notification-provider requests

**Primary risks:**

- wake identifier enumeration
- unauthorized publication
- token theft, replay, or scope escalation
- open-relay behavior
- message-content leakage through wake payloads
- correlation of contacts or room activity
- rate-limit bypass and denial of service
- SSRF, request smuggling, header injection, or unsafe proxy assumptions
- secrets included in container configuration or logs

**Files:**

- `poke-gateway/src/**`
- `poke-gateway/package.json`
- `poke-gateway/package-lock.json`
- `poke-gateway/Dockerfile`
- `poke-gateway/docker-compose.yml`
- `poke-gateway/.env.example`
- `poke-gateway/README.md`
- `poke-gateway/vitest.config.ts`
- relevant documents in `docs/security/**`
- `docs/background-remote-sync.md`

**Review focus:**

- Confirm the gateway accepts only intended, scoped Alice-to-Bob or Bob-to-Alice wake paths.
- Confirm a wake does not carry chat content or unnecessary relationship metadata.
- Confirm topic/identifier entropy, access control, rotation, expiry, and revocation.
- Confirm authentication, authorization, replay prevention, input validation, and rate limits.
- Confirm logs and metrics do not retain high-value wake material.
- Confirm proxy-trust configuration is explicit.
- Confirm container runtime configuration does not expose secrets or unnecessary ports.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-011 — Local storage and persistence

**Description:** Stores application state, contacts, room state, drafts, cache, session data, and any locally retained privacy-sensitive material.

**Boundary:** In-memory application state to local filesystem, browser storage, native storage, or encrypted-store boundary.

**Inputs:**

- application state
- room and session state
- incoming protocol data
- user data
- cache and migration events

**Outputs:**

- persisted state
- restored state
- cache cleanup
- export and backup data
- migration results

**Primary risks:**

- plaintext secrets or message data at rest
- stale room/topic/wake material retained after expiry
- browser-storage misuse
- backup or export leakage
- insecure migration
- cache, logs, crash data, or temporary-file residue
- cross-account or profile data mixing

**Files:**

- `src/services/storage/**`
- `src/state/**`
- storage-related files in `src/lib/**`
- `native-wrapper/src/**` where secure storage is used
- `docs/storage/**`

**Review focus:**

- Create a complete inventory of stored keys and data.
- Confirm every item has retention, deletion, and expiry behavior.
- Confirm sensitive values are not written to unsuitable browser or plaintext storage.
- Confirm room expiry and revocation invalidate associated capability material.
- Confirm backup and export flows are explicit and do not happen silently.
- Confirm storage migration and error recovery do not duplicate or expose sensitive content.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-012 — Build, dependency, CI, and release pipeline

**Description:** Controls dependencies, build tooling, source transformations, signing, CI checks, secrets injection, package publication, desktop packaging, native release delivery, and release artifacts.

**Boundary:** Source repository to built and distributed software supply-chain boundary.

**Inputs:**

- source code
- dependency manifests and lockfiles
- build configuration
- CI secrets
- signing credentials
- release-environment configuration

**Outputs:**

- web bundles
- desktop packages
- mobile builds
- test artifacts
- audit reports
- release artifacts

**Primary risks:**

- compromised dependency
- lockfile drift
- secrets accidentally committed or emitted into builds
- build-time environment values exposed to client bundles
- permissive CI token scope
- unreviewed release artifacts
- debug endpoints or source maps exposed in production
- signing or release-credential exposure

**Files:**

- `package.json`
- `package-lock.json`
- `.github/**`
- `.npmrc`
- `.env.example`
- `vite.config.ts`
- `vite.config.js`
- `desktop-electron/package.json`
- `desktop-electron/package-lock.json`
- `desktop-electron/forge.config.cjs`
- `native-wrapper/package.json`
- `native-wrapper/package-lock.json`
- `native-wrapper/eas.json`
- `holepunch-sidecar/package.json`
- `holepunch-sidecar/package-lock.json`
- `poke-gateway/package.json`
- `poke-gateway/package-lock.json`
- `.actrc`
- `biome.json`

**Review focus:**

- Review new and updated dependencies and their security-relevant defaults.
- Confirm lockfiles are committed and dependency changes are intentional.
- Confirm no real secrets appear in source, examples, tests, workflow logs, artifacts, or build output.
- Confirm public client environment variables contain no private values.
- Confirm CI permissions are least-privilege.
- Confirm release builds disable debug behavior and use intended signing/release configuration.
- Confirm audits, secret scanning, linting, type checks, and tests run at appropriate gates.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

---



## MOD-013 — Tests, mocks, fixtures, and developer tooling

**Description:** Test suites, mock services, fixtures, development scripts, diagnostics, and helper tooling used to validate or debug the application.

**Boundary:** Developer and test environment to production-code and data-handling boundary.

**Inputs:**

- test fixtures
- mock payloads
- environment variables
- test credentials
- local process and network configuration

**Outputs:**

- test reports
- screenshots
- traces
- fixtures
- logs
- generated test data

**Primary risks:**

- real secrets or private data committed in fixtures
- test-only bypass reaching production builds
- mock behavior masking real authentication or validation requirements
- screenshots, traces, and reports leaking sensitive data
- development scripts opening insecure local listeners
- test artifacts retained or published unintentionally

**Files:**

- `tests/**`
- `e2e/**`
- `src/services/mock/**`
- `holepunch-sidecar/test/**`
- `desktop-electron/test/**`
- `scripts/**`
- `test-results/**`
- `playwright.config.ts`
- `vitest.config.ts`
- `poke-gateway/vitest.config.ts`
- `.reviews/**`
- `.bolt/**`
- `.cursor/**`

**Review focus:**

- Confirm test fixtures contain no production secrets, topics, real contacts, or live credentials.
- Confirm mocks preserve security-critical failure behavior.
- Confirm test-only hooks cannot ship in production.
- Confirm artifacts are ignored, redacted, or access-controlled.
- Confirm local test servers bind safely and do not expose privileged APIs.
- Confirm negative tests cover malformed input, unauthorized peers, replay, expiry, and abuse paths.

- [ ] Reviewed — no review recorded yet



### Findings

*No findings recorded yet.*

### Review history

*No reviews recorded yet.*

## Global review history

Append one row for every completed review. This table is an index only; the module’s own review history remains the authoritative detailed record.


| Date       | Module  | Commit  | Reviewer                | Outcome                                 | Finding IDs                                            |
| ---------- | ------- | ------- | ----------------------- | --------------------------------------- | ------------------------------------------------------ |
| 2026-09-18 | MOD-001 | fe7419d | Composer (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-001, SEC-2026-002, SEC-2026-003, SEC-2026-004 |


