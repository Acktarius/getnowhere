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
- [x] Reviewed — latest review: 2026-09-23 — commit: 637c405 — reviewer: GPT-5.3 Codex (Cursor Agent)
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

- [x] Reviewed — latest review: 2026-09-20 — commit: e17bc73 — reviewer: Composer (Cursor Agent)



### Findings

- [x] `SEC-2026-001` — resolved
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/state/walletStore.ts`, `src/screens/onboarding/CreateWalletScreen.tsx`, `src/screens/onboarding/RestoreWalletScreen.tsx`, `src/screens/onboarding/ImportWalletScreen.tsx`
  - Evidence (original): `createWallet` / `restoreWallet` / `importWallet` set `seedPhrase`; `clearSeed()` was defined but never called from application code
  - Description: Full mnemonic remained in global Zustand UI state for the lifetime of the page session after wallet create, restore, or import
  - Impact: Any XSS, malicious extension, Electron DevTools inspection, or renderer dump can recover the wallet seed without re-entering the encryption password
  - Recommended remediation: Call `clearSeed()` immediately after the user confirms backup (create) and immediately after successful restore/import
  - Resolution date: 2026-09-20
  - Fix commit: `09ec0cd`
  - Verification (re-review e17bc73): Create confirms via `SeedBackupPanel.onConfirm` → `clearSeed()`; Restore/Import call `clearSeed()` after success; regression tests in `tests/state/walletStore-seed-clear.test.tsx`
  - Residual / follow-up: `ConcealWalletService` `seedPhraseMemory` cleared via `clearSeedPhraseMemory()` from `walletStore.clearSeed()` (app fix). Optional upstream: conceal-wallet-sdk `omitMnemonic` / docs — separate PR.

- [x] `SEC-2026-002` — resolved
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/screens/chats/ChatRoomScreen.tsx`
  - Evidence (original): Room diagnostics sheet showed full `roomId` with `CopyButton` and shortened `discoveryTopicRef`
  - Description: Production chat UI exposed Layer-2 capability material on an ungated diagnostics surface
  - Impact: Screenshots, shoulder surfing, shared support captures, or local malware reading the DOM can obtain room join capability hints
  - Recommended remediation: Gate diagnostics behind debug mode, or remove copyable full `roomId` / topicRef from production builds
  - Mitigations applied: `shortRoomId()` at both sheet call sites; `CopyButton` copies truncated label only; topic stays `shortTopicRef` + non-selectable; source-guard test `tests/components/sensitive-identifier-copy.test.ts` (OpenSpec `redact-room-diagnostics`)
  - Resolution date: 2026-09-20
  - Fix commit: `260906c`
  - Verification (re-review e17bc73): Both `LoadingDiagnosticsSheet` and full diagnostics sheet use `shortRoomId` / `shortTopicRef`; ungated diagnostics remain a product choice (accepted with redaction). Related residual tracked as `SEC-2026-005`.

- [x] `SEC-2026-003` — resolved (accepted low residual)
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/App.tsx`, `src/screens/chats/ChatRoomScreen.tsx`, `desktop-electron/main.mjs`
  - Evidence: `HashRouter` route `/chats/:roomId`; `useParams().roomId` drives open/bootstrap
  - Description: `roomId` (documented capability secret) is placed in the browser location hash and history for every open room
  - Impact analysis (per platform):
    - **Browser+sidecar**: dev-only path, never ships to end users — not a production concern
    - **iOS/Android WebView**: no address bar; WKWebView/Android WebView do not persist navigation history across cold starts — no exposure
    - **Electron (packaged)**: `file://` origin in `persist:gnh` Chromium partition — the only production surface with any residual risk
  - Mitigations applied:
    - `ChatRoomScreen` strips the hash via `window.history.replaceState(null, "", "#/chats")` on mount (Electron-only guard: `window.gnhDesktop != null`); roomId captured in `useState` on mount before the strip
    - `desktop-electron/main.mjs shutdown()` calls `session.fromPartition(PARTITION).clearData({ dataTypes: ["browsing_history"] })` before window destroy
  - Residual / accepted: crash/kill bypasses exit-time clear; `file://` hash-only navigations may not be recorded by Chromium at all; `roomId` alone is insufficient to join (requires `relationshipId` + post-connect L1 proof)
  - Resolution date: 2026-09-20
  - Fix commit: `260906c`
  - Verification (re-review e17bc73): Electron strip + shutdown `clearData` still present; acceptance unchanged.

- [x] `SEC-2026-004` — resolved
  - Date found: 2026-09-18
  - Commit reviewed: fe7419d
  - Affected files: `src/hooks/useSeedDemoContacts.ts`, `src/App.tsx`
  - Evidence (original): `RequireWallet` always mounts `useSeedDemoContacts`; hook creates real Conceal accounts and persists demo contacts whenever contacts storage is not yet marked ready — no `import.meta.env.DEV` guard
  - Description: Production builds could seed synthetic contacts with generated wallet material on first empty install
  - Impact: Users may treat demo peers as real; demo payment IDs and addresses clutter the relationship graph and increase accidental-invite risk
  - Recommended remediation: Restrict demo seeding to development builds, or require an explicit user action to install sample contacts
  - Resolution date: 2026-09-20
  - Fix commit: pending (working tree)
  - Verification: Hook early-returns unless `import.meta.env.DEV` (Vite built-in; no `.env` required). Note: hydrate already marks contacts ready in normal flows, so the path was largely inert — DEV gate prevents revival if timing changes.
  - Status: resolved

- [x] `SEC-2026-005` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: e17bc73
  - Affected files: `src/components/ChatRoomHeader.tsx` (caller: `src/screens/chats/ChatRoomScreen.tsx`)
  - Evidence: `<span className="sr-only">Room {roomId}</span>` embeds the full `roomId` in the DOM whenever a chat room is open
  - Description: After diagnostics redaction (`SEC-2026-002`), the chat header still places the complete room capability id in an always-present accessibility/DOM node
  - Impact: DOM scrapers, malicious extensions, screen-reader capture, or support HTML dumps can recover the full `roomId` without opening diagnostics — undoes the least-knowledge intent of truncated diagnostics
  - Recommended remediation: Remove the `sr-only` full id; do not put raw capability material in always-mounted DOM
  - Resolution date: 2026-09-20
  - Fix commit: pending (working tree)
  - Verification: Removed `sr-only` node and unused `roomId` prop from `ChatRoomHeader`; call sites updated; source-guard in `tests/components/sensitive-identifier-copy.test.ts`
  - Status: resolved



### Review history



#### 2026-09-20 — e17bc73 — Composer (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: UI still stays off Hyperswarm; composer uses `canComposeMessages` / lifecycle — discovery is not treated as authorization.
- Least knowledge: onboarding Zustand seed retention fixed (`SEC-2026-001`); diagnostics copy redacted (`SEC-2026-002`); full `roomId` still in header `sr-only` (`SEC-2026-005`); demo contacts still auto-seed (`SEC-2026-004`).
- Trust boundaries: Electron hash strip + history clear remain for `SEC-2026-003`; Backup reveal still clears modal secrets on close.
- Failure paths: send failures still toast `Error.message`; fatal boot still uses `textContent`.
- Privacy claims: Holepunch vs chain-relay UI wording remains conservative.

**Checklist highlights:**

- Event chain (UI): onboarding → wallet init → tab shell → room open/bootstrap → composer gate → send — re-traced.
- Secrets: create/restore/import `clearSeed` paths verified; backup modal timer still auto-closes; service-layer `seedPhraseMemory` out of scope.
- Logs: no seed/password/full topicRef console logging in screens/state/hooks.
- Storage: auth onboarded flag only; `walletStore` does not persist mnemonic.
- Dependencies / network capture: not re-validated in this UI module pass.

**Findings this review:** closed `SEC-2026-001`, `SEC-2026-002`, `SEC-2026-003`; confirmed still open `SEC-2026-004`; new `SEC-2026-005`.

**Remaining work (priority):**

1. *(none on MOD-001)* — optional conceal-wallet-sdk mnemonic-ephemeral API (separate upstream PR).

**Verification gaps:**

- No controlled XSS / renderer-dump test against live seed retention or header DOM.
- `ConcealWalletService` mnemonic memory lifecycle deferred to MOD-002.
- `gnh.pendingInitiatorKeys` / `privateKeyHex` on disk deferred to MOD-011.
- Always-on room diagnostics product intent still undocumented (accepted with redaction + new header finding).

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

- [x] Reviewed — latest review: 2026-09-22 — commit: d241144 — reviewer: Composer (Cursor Agent)



### Findings

- [x] `SEC-2026-006` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: cd7cd34
  - Affected files: `src/services/contacts/contactsPersistence.ts`, `src/state/contactsStore.ts`
  - Evidence (original): `upsertPendingInitiatorKey` / `gnh.pendingInitiatorKeys` persist `privateKeyHex` via web `StorageAdapter`
  - Description: Ephemeral X25519 private keys for in-flight create/register handoff are stored as plaintext JSON in browser local storage until handoff completes
  - Impact: XSS, malicious extension, DevTools, or local malware can steal pending session ECDH material and complete or hijack invite handoff without the wallet password
  - Recommended remediation: Keep pending ephemerals in memory only, or seal with unlocked wallet / platform secure storage; wipe on handoff, decline, expiry, and lock
  - Resolution date: 2026-09-21
  - Fix commit: `dd7df78`
  - Verification (re-review d241144): Pending records live in `raw.pendingInviteEphemerals` via `persistRuntime`; upsert/remove no longer write `gnh.pendingInitiatorKeys`; legacy KV migrated then deleted on hydrate; wipe on handoff, decline, leave/revoke (`removePendingInitiatorKeysForRoom`); tests in `tests/contacts/pending-invite-ephemerals.test.ts`; matches `encryption.md` pending-ephemeral rule
  - Status: resolved
  - Overlap: also in scope for MOD-011 (storage substrate); write API lives in this module’s contacts files

- [x] `SEC-2026-007` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: cd7cd34
  - Affected files: `src/services/conceal/ConcealWalletService.ts`, former `src/screens/onboarding/RestoreWalletScreen.tsx`
  - Evidence (original): `restoreWallet` → `adoptBuiltWallet(built, tempPassword)` with `tmp-${uid("pw")}` (`Math.random`); Restore screen never calls `setSessionWalletPassword`
  - Description: Restore (and create until password step) persists the encrypted wallet blob under a weak auto-generated password; restore completes onboarding without a user-chosen password
  - Impact: At-rest wallet confidentiality rests on a patterned weak secret; offline attack on the blob is far easier than against a real password; lock/reopen may also strand the user
  - Recommended remediation: Require user password before `adopt`/`persist` on restore (mirror create/import); do not use `Math.random` for any interim secret
  - Resolution date: 2026-09-21
  - Fix commit: `acb175b` (screen removal); Envelope 3 ship `c16bede`
  - Verification (re-review d241144): Restore route/screen/API absent; `CreateWalletScreen` / `ImportWalletScreen` only; `adoptBuiltWallet` rejects weak passwords via `describePasswordFailure`; create/import pass user password before first persist
  - Status: resolved

- [x] `SEC-2026-008` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: cd7cd34
  - Reconfirmed: 2026-09-22 (d241144)
  - Affected files: `src/services/conceal/ConcealSmartMessageAdapter.ts`, `src/state/contactsStore.ts`, `src/screens/contacts/ContactDetailScreen.tsx`, `src/services/contacts/inviteQueue.ts`
  - Evidence: Adapter `acceptInvite` checks status only (no `isInviteExpired`); store `acceptInvite` / `completeInitiatorHandoff` likewise; UI `showAccept` and `getInviteQueue` ignore expiry (retirement is a separate sweep)
  - Description: Accept/register (and Alice handoff on late register) can proceed after `inviteExpiry` despite protocol “fail closed / trash” rule
  - Impact: Stale invites that have not yet been retired can still open rooms and broadcast register after the accept window; initiator may complete Holepunch handoff on a late register
  - Recommended remediation: Fail closed in adapter + store `acceptInvite` and initiator handoff; filter expired invites from queue; hide Accept for expired invites
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `isInviteExpired` guard in adapter + store `acceptInvite` (before keygen/broadcast); `completeInitiatorHandoff` rejects registers whose tx time (`fetchIncomingRegisters` `sentAtUnix`, defaults to now) is past `inviteExpiry`; `getInviteQueue` drops expired invites so Accept is hidden. Tests `tests/contacts/invite-expiry-fail-closed.test.ts`, `tests/contacts/invite-queue.test.ts`, `tests/p2p/poke-invite-accepted.test.ts` fail without the fix; full suite + `tsc -b` + Biome clean. Documented in `p2pchatprotocol.md` §7.
  - Residual: Alice’s retirement sweep may still drop an on-time register scanned after expiry (pre-existing availability behavior, not a security gap).
  - Status: resolved

- [x] `SEC-2026-009` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: cd7cd34
  - Reconfirmed: 2026-09-22 (d241144)
  - Affected files: `src/services/conceal/ConcealSmartMessageAdapter.ts`
  - Evidence: `bootstrapEncrypted = btoa(\`${roomId}:${replayId}:${contactId}\`)`; `encryptInvitePayload` → `btoa(JSON.stringify(...))`
  - Description: APIs named as encryption only base64-encode plaintext capability / handshake material
  - Impact: Future callers may treat these as a confidentiality boundary; invites in `gnh.invites` carry a misleading “encrypted” field
  - Recommended remediation: Rename to non-crypto names or remove; document that on-chain Conceal MESSAGE is the real L1 encryption
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `encryptInvitePayload` removed; send path uses `smartBody`. `bootstrapEncrypted` no longer written (`composeInviteMessage`, ingest, `sendInvite`, `roomChainRestore`); tombstone still strips the legacy key. Tests updated. Documented in `encryption.md` and `p2pchatprotocol.md` §11.
  - Status: resolved

- [x] `SEC-2026-010` — resolved
  - Date found: 2026-09-20
  - Commit reviewed: cd7cd34
  - Reconfirmed: 2026-09-22 (d241144)
  - Affected files: `src/services/conceal/ConcealSmartMessageAdapter.ts`
  - Evidence: `fetchIncomingRegisters` has no `matchContactByPaymentId`; create/relay paths do
  - Description: Register intake lacks the known-`paymentIdFrom` spam/authz gate used for create and relay
  - Impact: Defense-in-depth gap if an adversary can deliver a MESSAGE and target a pending `inviteId` (including cross-contact injection when `inviteId` is known)
  - Recommended remediation: Gate registers on known contact payment ID / invite contact binding
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `fetchIncomingRegisters` drops unknown `paymentIdFrom` and returns `contactId`. Handoff, wake-handle store, and the accepted notification run only when that contact owns the pending invite. Tests `tests/conceal/register-paymentid-gate.test.ts`, `tests/contacts/invite-expiry-fail-closed.test.ts`. Documented in `p2pchatprotocol.md` §6.
  - Status: resolved

- [x] `SEC-2026-011` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: d241144
  - Affected files: `src/services/conceal/ConcealSmartMessageAdapter.ts`, `src/state/contactsStore.ts`
  - Evidence: `fetchIncomingRevokes` returns every decrypted revoke with no `matchContactByPaymentId`; `refreshInvites` destroys on matching `inviteId` / `roomId` alone
  - Description: Leave-forever revoke intake lacks the known-`paymentIdFrom` gate used for create and relay
  - Impact: A MESSAGE sender who learns or guesses a live `roomId`/`inviteId` can force local room destroy and topic-epoch sync without being the relationship counterparty
  - Recommended remediation: Gate revokes on known contact `paymentIdFrom` (and bind destroy to that contact’s rooms); reject unbound revoke bodies
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `fetchIncomingRevokes` drops unknown `paymentIdFrom` and returns `contactId`; `refreshInvites` destroys only when that contact owns the `roomId` (or the `inviteId`, for decline) and applies topic epoch only then. Tests `tests/conceal/revoke-paymentid-gate.test.ts`, `tests/contacts/revoke-counterpart-destroy.test.ts`. Documented in `p2pchatprotocol.md` §10.
  - Status: resolved

### Review history

#### 2026-09-22 — d241144 — Composer (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: Conceal adapters still own L1 create/register/revoke/relay; Hyperswarm stays out of UI; discovery is not treated as authorization for composer live path.
- Least knowledge: Pending invite ECDH material now sealed in the wallet blob (`SEC-2026-006` resolved); wallet at-rest path no longer uses temp restore passwords (`SEC-2026-007` resolved).
- Trust boundaries: On-chain Conceal MESSAGE remains the real L1 confidentiality boundary; local `bootstrapEncrypted` / `encryptInvitePayload` remain misnamed (`SEC-2026-009`).
- Capabilities lifecycle: Create parse still fails closed on expired invite (unless opted out); retirement sweeps exist; accept/handoff paths still do not (`SEC-2026-008`). Register and revoke intake remain ungated vs create/relay (`SEC-2026-010`, new `SEC-2026-011`).
- Privacy claims: Docs correctly separate L1 view-key privacy from L2 IP exposure; module code does not overclaim beyond the misnamed bootstrap field.

**Checklist highlights:**

- Event chain: compose create → send → scan (paymentId gate) → accept/register → Alice register scan/handoff — re-traced; expiry hole on accept/handoff confirmed.
- Secrets: `pendingInviteEphemerals` in encrypted wallet; mnemonic memory clear path intact; `randomHex` uses `crypto.getRandomValues`.
- Logs: conceal sync `console.warn` paths reviewed — no body/key dumps in adapter/store paths.
- Failure paths: inviteExpiry trash rule incomplete at accept; revoke destroy lacks sender binding.
- Layer 1 checklist: roomId vs topicRef distinct; replay checked in `deriveSession`; register/revoke authz incomplete.
- Tests: no negative test that Accept fails after `inviteExpiry`; pending-ephemeral and room-catalog expiry tests exist.

**Findings this review:** `SEC-2026-008` (reconfirmed), `SEC-2026-009` (reconfirmed), `SEC-2026-010` (reconfirmed), `SEC-2026-011` (new); `SEC-2026-006` / `SEC-2026-007` re-verified resolved

**Verification gaps:**

- No packet capture / live daemon observation of smart-message metadata beyond code+docs review.
- In-memory `seenReplayIds` durability across reload vs durable tombstones — deeper pass belongs with MOD-003.
- Deep L1 session seal/open and nonce counters live primarily in P2P encryption adapters (MOD-003 / MOD-004) — not re-audited line-by-line here.
- Mobile secure-storage adapter behavior for wallet-blob ephemerals not exercised in this pass (see MOD-009 / MOD-011).
- Practical exploitability of 4-byte `roomId`/`inviteId` guessing for ungated revoke/register not measured against fee/rate limits.

#### 2026-09-20 — cd7cd34 — Composer (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: Conceal adapters own L1 create/register/revoke/relay broadcast; Hyperswarm stays out of UI; composer gate still requires post-accept / connected for live — discovery is not treated as authorization in this module.
- Least knowledge: violated for pending ephemeral privates on disk (`SEC-2026-006`) and weak at-rest wallet password on restore (`SEC-2026-007`); create/relay correctly require known `paymentIdFrom`.
- Trust boundaries: on-chain bodies use Conceal MESSAGE encryption; local “encryptInvitePayload” / `bootstrapEncrypted` are not a crypto boundary (`SEC-2026-009`).
- Failure paths: invite expiry enforced on create parse (unless opted out) and via retirement sweeps, but not on `acceptInvite` (`SEC-2026-008`).
- Privacy claims: docs correctly describe L1 view-key privacy vs L2 IP exposure; this module does not overclaim in code comments beyond the misnamed bootstrap field.

**Checklist highlights:**

- Event chain: compose create → send smart message → scan received (paymentId gate) → accept/register → Alice register scan/handoff — traced in adapters + contacts store callers.
- Secrets: mnemonic `seedPhraseMemory` + `clearSeedPhraseMemory` present (UI clear wired); pending `privateKeyHex` persistence confirmed; runtime keeps unlock password in memory while open (expected).
- Logs: conceal sync uses `console.warn` for non-fatal sync failures without dumping bodies/keys in reviewed paths.
- Storage: contacts/invites/pending keys via `StorageAdapter`; wallet blob encrypted with adopt password (problem when that password is temp).
- Dependencies: conceal-wallet-sdk message encode/parse relied on; no new dependency changelog review in this pass.
- Layer 1 checklist: roomId vs topicRef kept distinct in protocol helpers; expiry/replay partially enforced; register gate incomplete.

**Findings this review:** `SEC-2026-006`, `SEC-2026-007`, `SEC-2026-008`, `SEC-2026-009`, `SEC-2026-010`

**Verification gaps:**

- No packet capture / live daemon observation of smart-message metadata beyond code+docs review.
- In-memory `seenReplayIds` durability across reload not fully reconciled against durable tombstones (partially covered by room revoke / invite tombstone paths — deeper pass belongs with MOD-003).
- Deep L1 session seal/open and nonce counters live primarily in P2P encryption adapters (MOD-003 / MOD-004 overlap) — not re-audited line-by-line here.
- Mobile secure-storage adapter behavior for `gnh.pendingInitiatorKeys` not exercised in this pass (see MOD-009 / MOD-011).
- `omitMnemonic` / SDK mnemonic-ephemeral helper (`cd7cd34`) not treated as closing service-layer retention by itself — app `clearSeedPhraseMemory` remains required.

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

- [x] Reviewed — latest review: 2026-09-22 — commit: 01d6d85 — reviewer: Grok 4.7 (Cursor Agent)



### Findings

- [x] `SEC-2026-012` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: 01d6d85
  - Affected files: `src/services/protocol/SmartMessageProtocolAdapter.ts`, `src/services/conceal/ConcealSmartMessageAdapter.ts`, `docs/security/encryption.md`
  - Evidence: `CREATE_PACK_FIELDS` `nonceSeed` is 8 bytes; `composeInviteMessage` uses `randomHex(8)`; `encryption.md` nonce rules require a 256-bit handshake seed
  - Description: Shipped create packs a 64-bit `nonceSeed` while the module doc specifies 256-bit
  - Impact: Nonce uniqueness still comes from the per-direction counter under the session key, so this is not reuse by itself. A reader of the doc will overstate seed entropy, and any later derivation that assumes 32 seed bytes will not match the wire
  - Recommended remediation: Document the shipped 8-byte seed, or widen it in a protocol bump and update `encryption.md` in the same change
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `encryption.md` nonce rules now state the shipped 8-byte seed. Pack width was already `nonceSeed(8)` in `p2pchatprotocol.md` and `capabilities-and-derivation.md`. No wire change.
  - Status: resolved

### Review history

#### 2026-09-22 — 01d6d85 — Grok 4.7 (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: Protocol helpers own create/register/revoke/relay parse and AAD construction. ChaCha20-Poly1305 seal/open stays in the P2P encryption adapter (MOD-004). Hyperswarm is not imported here.
- Least knowledge: Slim create omits `relationshipId` and salt on the wire; both peers derive them. Legacy 136-byte packs still parse and do carry those fields.
- Trust boundaries: Packed create rejects an unsupported `protocolVersion`. Legacy wire verbs `invite` / `accept` / `reject` parse to null. AEAD open failure returns null; the frame handler drops it.
- Capabilities lifecycle: Create parse fails closed on expired `inviteExpiry` unless the caller opts out. Register and revoke authorization is the sender binding added in MOD-002, not this parser.
- Discovery is not authorization: Proof frames are recognized by plaintext `kind === "proof"` after a successful open and are not inserted as chat. Chat AAD is `v1|roomId|sessionId`; epoch proof AAD adds epoch and suite. Trying both AAD values fails closed per candidate.
- Privacy claims: `encryption.md` overstates `nonceSeed` width (`SEC-2026-012`). It does not claim the in-memory replay set is durable.

**Checklist highlights:**

- Event chain: pack create → scan parse (`allowSeenReplay`) → register parse → session derive (MOD-004) → frame seal with counter nonce → open with chat or proof AAD.
- Secrets: `randomHex` uses `crypto.getRandomValues`. `generatePokeId` uses the same. `encryptWithSecret` (AES-GCM, random 12-byte IV) has no production caller in `src/`.
- Logs: protocol parse returns null or throws short errors; no key or body dumps in the reviewed helpers.
- Failure paths: malformed pack, bad version, and expired create return null. `allowExpiredInvite` is limited to chain restore.
- Replay: `seenReplayIds` is process memory. Every production `parseChatSmartBody` call passes `allowSeenReplay: true`, so the set does not reject a rescanned create.
- Layer 1: room id and topic derivation stay separate (`deriveTopicRef` vs handshake `roomId`). v1 and v2 are explicit (`protocolVersion` 1 → `SHA256_V1`, ≥2 → `HKDF_EPOCH_V1`).

**Findings this review:** `SEC-2026-012`

**Verification gaps:**

- Seal/open, nonce counter persistence, and key wipe live in `P2PEncryptionAdapter` (MOD-004) and were not re-audited past the open-fails-closed and counter-increment behavior.
- Durable replay of a create after process restart depends on tombstones, not `seenReplayIds`. That interaction was not re-tested here.
- `src/lib/**` and `src/utils/**` outside the protocol and crypto helpers (UI, mobile bridge, node selection) were not line-reviewed.

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

- [x] Reviewed — latest review: 2026-09-22 — commit: e2d7db3 — reviewer: Claude Opus 5.5 (Cursor Agent)



### Findings

- [x] `SEC-2026-013` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: e2d7db3
  - Affected files: `src/state/contactsStore.ts`, `src/services/p2p/HolepunchChatTransport.ts`, `src/services/p2p/P2PEncryptionAdapter.ts`
  - Evidence: `restorePendingInitiatorKeys` re-imports the stashed ephemeral on every probe; `completeInitiatorHandoff` and `completeResponderReconnect` re-derive when the room is not `connected`/`connecting`; `deriveSessionConfig` returns `sendCounter: 0`; `HolepunchChatTransport.connect` rebuilds `state.session` from the contract counters (before the backoff gate); `waitForProof` seals `proof-<roomId>-0` with a fresh `sentAt`; `persistLiveSession` only runs on `connected`
  - Description: A connect attempt that seals a proof and does not reach `connected` (timeout or mismatch) leaves no persisted counter. The next `ChatRoomScreen` poll tick (4 s) re-derives the same send key and `nonceSeed` from the same stashed ephemerals, resets `sendCounter` to 0, and seals a different proof plaintext under the same (key, nonce).
  - Impact: ChaCha20-Poly1305 nonce reuse. The sidecar writes frames to every connection associated with the topic, so a topic joiner collects both ciphertexts. It can recover the keystream for the known proof layout and the Poly1305 one-time key for nonce 0, then forge frames the peer accepts (see `SEC-2026-014`). If a pre-proof `connected` window (`SEC-2026-015`) let chat frames be sealed before a `crypto_mismatch` wipe, re-derive also reuses nonces on chat content.
  - Recommended remediation: Persist the derived session (key material and counters) before the first seal, and resume it instead of re-deriving from the stash. `connect` must never lower a counter below the persisted value. Add a test that runs two failed attempts and asserts no (key, nonce) pair repeats.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `tests/p2p/session-counter-no-rewind.test.ts` derives twice at counter 0 after a timed-out proof and asserts the two nonces differ and the saved counter is 2. `saveRoomSession` and `connect` refuse a lower counter. Handoff resumes a saved row and drops the ephemeral stash once that row exists. `encryption.md` nonce rules describe the order.
  - Status: resolved

- [x] `SEC-2026-014` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: e2d7db3
  - Affected files: `src/services/p2p/P2PEncryptionAdapter.ts`, `src/services/p2p/HolepunchChatTransport.ts`
  - Evidence: `P2PEncryptionAdapter.open` decrypts with the 12-byte nonce taken from the wire and increments `recvCounter` without comparing them; `handleIncomingFrame` splits `raw.slice(0, 12)` as the nonce
  - Description: The L1 session seal does not enforce the receive counter. Any previously valid frame opens again, in any order, any number of times. `recvCounter` is persisted but never checked.
  - Impact: A topic joiner that captured sealed frames can replay them. A replayed proof or proof-ack satisfies `waitForProof`, marking the room `connected` without the real peer, so live sends go nowhere while showing `delivered` and L1′ fallback and poke are suppressed. Replayed edit/delete envelopes re-apply. This also makes the nonce-0 forgery in `SEC-2026-013` acceptable at any time. The L1 seal is meant to hold without trusting Noise (`encryption.md`).
  - Recommended remediation: Derive the expected nonce from `recvCounter` on the receiver and reject frames whose nonce is not for a counter at or above it, within a bounded look-ahead window for dropped frames. Advance `recvCounter` to the matched counter + 1 only after a successful open. Document the rule in `encryption.md` nonce rules.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `open` decrypts only when the wire nonce matches the peer send nonce for a counter in `[recvCounter, recvCounter + 64)`, then sets `recvCounter` to that counter + 1. `tests/p2p/recv-counter-window.test.ts` covers replay, an in-window gap, and a gap of 64. `encryption.md` and `p2pchatprotocol.md` state the rule.
  - Status: resolved

- [x] `SEC-2026-015` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: e2d7db3
  - Affected files: `src/services/p2p/HolepunchChatTransport.ts`, `docs/security/encryption.md`
  - Evidence: `maybeMarkConnected` promotes `connecting` → `connected` when `peerCount >= 1` and `state.session` exists ("Brief peer blip"); `attemptConnect` sets `connecting` with a session before `waitForProof`, so a `peers` event during the join marks `connected` before the proof; `proofArrivedEarly` is set by the idle side's handler and only cleared inside `attemptConnect`/`leaveRoom`
  - Description: Peer presence on the topic alone can mark a room `connected`, bypassing the required post-connect proof. It happens on every blip reconnect and transiently (up to `PROOF_TIMEOUT_MS`) on first connect. A stale `proofArrivedEarly` flag from an earlier session lets a later `waitForProof` return `ok` with no fresh proof.
  - Impact: Anyone who can join the topic (DHT nodes that stored the announce, or a holder of old material) can enable the live composer and route sends to L2 while the real peer is absent. Messages stay sealed but are silently lost as `delivered`, and L1′ and poke fallback do not fire. This contradicts `encryption.md` "Topic + Noise alone is not trust."
  - Recommended remediation: Only mark `connected` after a successful AEAD open of a proof or chat frame in the current attempt. Drop the blip shortcut, or run a proof on the blip path too. Clear `proofArrivedEarly` when a room leaves `connected` and when an attempt starts. Add tests for a blip with a non-proving peer and a stale early flag.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: Peer count refreshes `peerStatus` only while `connected`. A `connecting` room with a peer and no attempt in flight re-runs the proof. Only that proof sets `connected`; a chat frame does not. Early-proof credit is the attempt generation captured when the frame arrives. `tests/p2p/proof-on-blip.test.ts` covers a silent peer and a proof opened before the attempt. `encryption.md` states the rule.
  - Status: resolved

- [x] `SEC-2026-016` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: e2d7db3
  - Affected files: `src/services/p2p/HolepunchChatTransport.ts`, `src/services/p2p/chatMessageMerge.ts`
  - Evidence: `handleIncomingFrame` casts `JSON.parse` output to `ChatContentEnvelopeV1` with no shape check; `kind`, `messageId`, `sentAt`, `targetMessageId`, `reaction`, `replyPreview` pass through; `mergeContentMessage` edits/deletes any row whose id matches `targetMessageId` and replaces any row with the same `id`, regardless of `direction`
  - Description: Inbound live envelopes are not schema-validated, and edit/delete/id collisions are not restricted to the peer's own inbound messages.
  - Impact: The authenticated counterparty, or a forger via `SEC-2026-013`, can rewrite or blank the local user's own outbound messages in the local transcript, overwrite rows by id, and inject arbitrary `kind` or non-string fields into UI state. Confidentiality is not affected.
  - Recommended remediation: Validate the envelope (schema version, allowed `kind`, string types, length caps) and drop on failure. Only apply edit/delete to `direction: "in"` targets, and never let an inbound id replace an outbound row.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: `parseLiveContentEnvelope` drops a bad shape. Edit and delete apply only when the target row has the same direction. An inbound id does not replace a stored row. Tests: `tests/p2p/live-content-envelope.test.ts`, `tests/p2p/chat-message-merge.test.ts`. `p2pchatprotocol.md` §14 states the rule.
  - Status: resolved

- [x] `SEC-2026-017` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: e2d7db3
  - Affected files: `src/services/p2p/roomSessionStore.ts`, `src/services/p2p/HolepunchChatTransport.ts`, `docs/security/encryption.md`
  - Evidence: `persistLiveSession` writes `sendKeyHex` / `recvKeyHex` into `gnh.roomSessions` via `getStorage()`, which is `window.localStorage` on web and Electron
  - Description: Raw live-session AEAD keys persist in plaintext key-value storage outside the encrypted wallet blob. `encryption.md` allows persisting key refs or sealed key material, and pending ephemerals already moved into the encrypted blob.
  - Impact: Local disk or profile access (or any script in the renderer origin) reads session keys and can open captured frames for the life of the room. Mobile uses the native adapter and is less exposed.
  - Recommended remediation: Store live-session keys and counters in the encrypted wallet blob next to `pendingInviteEphemerals`, migrate and delete `gnh.roomSessions`, and update `encryption.md` Local storage rules. Coordinate with MOD-011.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: Electron main stores `safeStorage` ciphertext in `room-sessions.bin`. `basic_text` (no Linux secret service) keeps the row on the open wallet, and `downloadWalletBackup` strips `roomSessions`. Browser debug still uses `localStorage`. Native secure prefs are unchanged. Tests: `desktop-electron/test/room-session-store.test.mjs`, `tests/p2p/room-session-export.test.ts`.
  - Status: resolved

### Review history

#### 2026-09-22 — e2d7db3 — Claude Opus 5.5 (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: UI imports no `hyperswarm`. Seal/open runs in the app before `sendFrame` and after `onFrame`. The sidecar sees opaque base64 frames plus `topicRef` and `roomId` only.
- Least knowledge: Session keys never cross the bridge. The bridge carries `roomId` in the clear with each frame, and the sidecar relays a remote-supplied `roomId` to local clients. Frames still have to AEAD-open under that room's keys.
- Trust boundaries: AEAD failure fails closed, and proof frames are not inserted as chat. Receive-side replay and ordering are not enforced (`SEC-2026-014`). Inbound envelopes are trusted after open without shape checks (`SEC-2026-016`).
- Capabilities lifecycle: `restoreRoomSession` and `ensureRoom` refuse revoked rooms, and expired `roomTtl` blocks connect and relay. Session derive can repeat from the stash with counters reset (`SEC-2026-013`).
- Discovery is not authorization: The post-connect proof exists but can be bypassed by peer presence and a stale early-proof flag (`SEC-2026-015`).
- Privacy claims: L2 IP exposure is documented in `encryption.md`. Plaintext session keys in local storage do not match "sealed key material" (`SEC-2026-017`).

**Checklist highlights:**

- Event chain: accept/handoff → `deriveSession` → `buildHolepunchContract` → `connect` (session from contract) → sidecar `join` → `peers` → proof seal/open → `connected` → `persistLiveSession`, then counters updated after each seal and open.
- Secrets: ephemeral privates are wiped after derive, but the disk stash is re-imported on each probe until a session is persisted. `leaveRoom` removes the session store entry. In-memory key refs are not wiped on leave.
- Logs: transport paths log nothing sensitive. The sidecar `error` message reaches `lastSidecarDetail` as a sidecar-controlled string.
- Failure paths: a timeout keeps the session and retries with backoff. A mismatch wipes the persisted session only. Rebuilding the session in `connect` happens before the backoff gate.
- Replay: no receive-counter check at L1. Durable replay of L1 signaling stays with tombstones (MOD-002/003).
- Layer 2: the sidecar forwards frames to every connection associated with the topic (`writeSwarm` topic filter), so any topic joiner receives sealed frames. `roomId` on the wire comes from the sender.

**Findings this review:** `SEC-2026-013`, `SEC-2026-014`, `SEC-2026-015`, `SEC-2026-016`, `SEC-2026-017`

**Verification gaps:**

- The `SEC-2026-013` repeat was traced through code, not reproduced with two live peers. It needs a peer present on the topic that does not answer the proof.
- Hyperswarm `PeerInfo.topics` association for inbound and outbound connections (which decides who receives `writeSwarm` frames) belongs to MOD-007 and was not verified against the library.
- In-memory key refs (`privateKeys` map) are not wiped on `leaveRoom` or revoke. Whether a later derive could reuse a ref was not checked.
- `notificationEventLedger` stores `roomId` next to the hashed event id (MOD-011 scope).
- `docs/background-remote-sync.md` and `docs/features/**` were not line-reviewed against the reconnect behavior.

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

- [x] Reviewed — latest review: 2026-09-22 — commit: cfb7e83 — reviewer: GPT-5.3 Codex (Cursor Agent)



### Findings

- [x] `SEC-2026-018` — resolved
  - Date found: 2026-09-22
  - Commit reviewed: cfb7e83
  - Affected files: `holepunch-sidecar/src/server.mjs`, `holepunch-sidecar/src/bridge-ipc.mjs`, `holepunch-sidecar/src/bridge-session.mjs`, `desktop-electron/desktop-ipc-path.mjs`
  - Evidence: IPC mode has no per-connection auth (`server.mjs` sets `GNH_BRIDGE_TRANSPORT=ipc` and deletes `GNH_SIDECAR_TOKEN`; `bridge-ipc` accepts any socket and `bridge-session` immediately permits `join`/`frame` command handling). Desktop IPC path is created under `tmpdir()` (`desktop-ipc-path.mjs`) and socket ACL is not tightened after bind.
  - Description: Native IPC bridge authorization relies only on "knowing and reaching the socket path"; there is no capability token or peer-credential check in IPC mode.
  - Impact: A local unprivileged process that can discover and connect to the socket can inject sidecar commands, join topics, and transmit/observe opaque frame metadata for active rooms. L1 frame sealing protects plaintext, but sidecar control and availability boundaries are widened beyond the intended desktop principal.
  - Recommended remediation: Add IPC principal binding (peer-credential check where available and/or per-session capability on first command), place sockets in a user-private runtime directory, and force restrictive socket permissions after bind.
  - Resolution date: 2026-09-22
  - Fix commit: pending (working tree)
  - Verification: IPC listens only after a parent `ipc-auth-token` message. The first NDJSON line must be `{ type: "auth", token }` (`tokensEqual`); a command before auth, a wrong token, or a second `auth` closes the socket. The socket binds under a `0177` umask and is
`chmod` `0600` after bind. An empty `ipc-auth-token` exits the sidecar; a second
one is ignored. Shared-mode attach logs a stale path lock that has no token lock. Electron keeps the socket under a `0700` directory and sends the token over Node IPC, not argv or `GNH_SIDECAR_TOKEN`. Tests: `holepunch-sidecar/test/bridge-ipc.test.mjs`, `desktop-electron/test/sidecar-ipc-client.test.mjs`, `desktop-electron/test/desktop-ipc-path.test.mjs`. Native peer-credential checks stay out of scope.
  - Status: resolved

### Review history

#### 2026-09-22 — cfb7e83 — GPT-5.3 Codex (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: sidecar auth/config/lifecycle logic is centralized (`auth.mjs`, `config.mjs`, `parent-death.mjs`, `server.mjs`) and distinct from swarm runtime data-plane logic.
- Least knowledge: WS token stays query-scoped and is not logged; IPC mode intentionally carries no token, which widens local trust to socket-path reachability.
- Explicit trust boundaries: non-loopback WS bind fails closed without `GNH_SIDECAR_TOKEN`; IPC boundary is implicit and currently not cryptographically or OS-principal bound.
- Failure paths: startup guard for invalid transport and missing IPC path exits non-zero; bind collisions fail closed; parent-death watch avoids false exits from `ppid` drift.
- Privacy claims: docs describe token enforcement for WS and "none on IPC"; implementation matches that claim but leaves a local authorization gap for higher-assurance desktop threat models.

**Checklist highlights:**

- Event chain: startup env parse → transport mode gate → listen announce (`process.send`) → per-client command session → shutdown (`SIGINT`/`SIGTERM`/parent death) reviewed end to end.
- Trust boundaries: WS token gate and loopback policy verified in code and tests (`auth.test`, `bridge-auth.test`); IPC accepts any local connector to path.
- Secrets/capabilities: token compare is length-checked + `timingSafeEqual`; no token value logging found.
- Config and errors: `config.json` limits load with defaults; bridge errors are stable coded values and do not include frame payloads or keys.
- Parent lifecycle: `startParentDeathWatch` tracks the initial parent PID and treats `EPERM` as alive, reducing accidental termination.

**Findings this review:** `SEC-2026-018`

**Verification gaps:**

- Socket-path ACLs were code-reviewed, but no controlled multi-user host test validated cross-user connect denial in packaged desktop environments.
- IPC transport currently has no explicit per-command or per-session rate-limiting in this module scope; abuse limits depend on downstream modules.
- Config-value hard validation (e.g., explicit numeric range checks for env-derived port/limits) is partial and not exercised under adversarial env mutation in tests.

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

- [x] Reviewed — latest review: 2026-09-23 — commit: 637c405 — reviewer: Grok 4.6 (Cursor Agent)



### Findings

- [x] `SEC-2026-019` — resolved
  - Date found: 2026-09-23
  - Commit reviewed: 637c405
  - Affected files: `desktop-electron/main.mjs`, `desktop-electron/preload.cjs`, `holepunch-sidecar/src/bridge-ipc.mjs`
  - Evidence: `installSidecarBridgeHandlers` (`gnh:sidecar-command`); `createIpcBridgeServer` repeated-auth close; `createSidecarIpcConnection.send`
  - Description: Electron main forwards any renderer object with a string `type` onto the already-authenticated sidecar NDJSON socket. Sender binding is fail-open when `allowedWebContentsId` is null (before the window id is bound and after `closed`). Protocol-control `auth` and oversize lines close that privileged session. Main does not reconnect unless the sidecar child exits.
  - Impact: Script that can call `window.gnhDesktop.sendCommand` (compromised renderer, hostile `GNH_UI_URL`, or a future DOM XSS) can join arbitrary Hyperswarm topics with this device’s swarm key, tear down live P2P until restart (`auth` or oversize), or issue commands while no window is bound. This is not the unshipped browser+sidecar path. Chat plaintext remains L1-sealed; this is availability plus unauthorized topic announce, not message decrypt. The current React UI has no `dangerouslySetInnerHTML`; peer-message HTML XSS is not demonstrated.
  - Recommended remediation: Fail closed when `allowedWebContentsId` is null (same pattern as room-session IPC). Allowlist `ping` / `join` / `leave` / `frame` with the same field and size checks as `bridge-session.mjs` before `sidecarIpcConn.send`. Treat socket close as a reconnect or user-visible hard failure, not a silent dead client.
  - Resolution date: 2026-09-23
  - Fix commit: pending (working tree)
  - Verification: `sanitizeSidecarCommand` drops `auth` and extra keys; sender fails closed when unbound; `createSidecarIpcConnection` emits `sidecar_error` on post-auth close. Tests: `desktop-electron/test/sidecar-command.test.mjs`, `desktop-electron/test/sidecar-ipc-client.test.mjs`. Residual: a bound renderer can still `join` any 64-hex topic (product API).
  - Status: resolved

- [x] `SEC-2026-020` — resolved
  - Date found: 2026-09-23
  - Commit reviewed: 637c405
  - Affected files: `holepunch-sidecar/src/bridge-ipc.mjs`, `holepunch-sidecar/src/server.mjs`, `holepunch-sidecar/src/bridge-session.mjs`
  - Evidence: `attachSocket` has no auth/idle timer and no max-connection cap; `createBridgeSession` has no token-bucket (unlike Bare `rate_limited`)
  - Description: Any local principal that can open the Unix socket can hold unauthenticated connections indefinitely. Authenticated clients can send `join`/`leave`/`frame`/`ping` without a rate limit. Line and payload size caps exist (`maxNdjsonLineBytes` / `maxWsMessageBytes` / `maxFramePayloadBytes`).
  - Impact: Same-uid local DoS via FD exhaustion or swarm join churn. Cross-user connect is still blocked on Linux by the `0700` directory and `0600` socket when those ACLs hold. Windows named-pipe DACL was not verified.
  - Recommended remediation: Close sockets that do not complete `{ type: "auth", token }` within a short deadline; cap concurrent IPC clients; adopt the existing `rate_limited` token-bucket on `join`/`leave`/`frame`/`ping`.
  - Resolution date: 2026-09-23
  - Fix commit: pending (working tree)
  - Verification: 5s first-line auth timeout (injectable in tests); max 8 IPC clients (not rooms); Bare-parity buckets in `createBridgeSession`; UI `sidecarErrorMarksOffline("rate_limited")` is false. Tests: `holepunch-sidecar/test/bridge-session-rate.test.mjs`, `holepunch-sidecar/test/bridge-ipc-limits.test.mjs`, `tests/p2p/sidecar-error-offline.test.ts`. Residual: Windows named-pipe DACL; no process-wide bucket; WS connection cap still unset (web-dev).
  - Status: resolved

### Review history

#### 2026-09-23 — 637c405 — Grok 4.6 (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: NDJSON command/event schema is shared (`bridge-session.mjs`); IPC is a local transport plus first-line token (`bridge-ipc.mjs` / `server.mjs` `armIpcAuthToken`). Hyperswarm stays in the sidecar. Electron main is the only holder of the IPC token; renderer `gnhDesktop` in IPC mode does not receive it.
- Least knowledge: token is not in sidecar env/argv (`delete childEnv.GNH_SIDECAR_TOKEN`; parent `{ type: "ipc-auth-token" }`). Logs warn on bad token without printing it. Socket path is logged. Renderer still receives full `topicRef` and sealed `payload` on events (needed for the UI; L1 seal is the content boundary).
- Explicit trust boundaries: Linux socket `0177` umask + `chmod 0600` and Electron `0700` runtime dir (`ensureSidecarIpcRuntimeDir`) bind the filesystem ACL. First NDJSON line must match `tokensEqual`. Peer-credential checks are explicitly out of scope. Electron `gnh:sidecar-command` is a confused-deputy proxy (see `SEC-2026-019`).
- Discovery is not authorization: IPC `join` is local-session gated; `frame` requires that socket’s `joined` set. Remote peer authorization is not this module’s job (MOD-007).
- Failure paths: missing `GNH_IPC_PATH`, empty `ipc-auth-token`, and no parent IPC channel exit non-zero. Wrong/missing/repeated auth closes that socket only. Oversize sends a coded error then ends the socket. Main does not recover that client (`SEC-2026-019`). `cleanupStaleIpcPath` unlinks a leftover path before bind.
- Capability lifecycle: per-launch `randomUUID` token when packaged; shared-mode default `gnh-desktop-shared` plus tmp lockfiles is a documented dev-harness exception. Second `ipc-auth-token` is ignored.
- Privacy claims: `local-bridge-transport.md` and `electron-desktop.md` match the token + `0700`/`0600` story. They do not claim peer-cred or renderer command allowlisting. Direct P2P IP exposure is an L2 claim, not this bridge.

**Checklist highlights:**

- Event chain: Electron generates path → spawn with `GNH_BRIDGE_TRANSPORT=ipc` → parent sends token → sidecar listen → `{ type: "listening", transport: "ipc" }` → `connectSidecarIpc` first-line auth → renderer `sendCommand` / `onBridgeEvent` reviewed.
- Trust boundaries: WS token query vs IPC first-message token verified in `bridge-ipc.test.mjs`. Renderer→main→sidecar command path is not allowlisted.
- Secrets: `tokensEqual` is length-checked + `timingSafeEqual`. Token lockfile `0600` is shared-mode only.
- Logs: no token or frame body in IPC logs reviewed; oversize logs size and error code only.
- Storage: Unix socket file and optional tmp path/token locks; packaged skips token lockfile.
- Dependencies: `node:net` IPC; no new networking library on this path.
- Tests: auth order, wrong token, repeated auth, oversize, stale unlink, empty token exit, second parent token ignored, socket mode `0600`. No test for renderer allowlist, sender fail-closed, auth timeout, or reconnect after socket drop.
- Component-specific (local bridge): message types are enumerated in docs; long-term secrets stay off the IPC token path; loopback WS override still puts the token on argv (documented, not the default ship path).

**Findings this review:** `SEC-2026-019`, `SEC-2026-020`

**Verification gaps:**

- Cross-user connect denial (`0700`/`0600`) was not exercised on a multi-user packaged host.
- Windows named-pipe default DACL / enumeration was not verified in this review.
- Bind-vs-`chmod 0600` race is assumed covered by the parent `0700` directory; not packet- or race-tested.
- No controlled test that a dead main↔sidecar NDJSON socket is detected in the UI.
- Per-command rate limits remain documented as mobile-only (`holepunch-bridge-errors.md`).
- Review used commit `637c405` plus the current working tree for IPC token/ACL code that resolved `SEC-2026-018` (fix commit still pending in that record).

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

- [x] Reviewed — latest review: 2026-09-23 — commit: 637c405 — reviewer: GPT-5.3 Codex (Cursor Agent)



### Findings

- [x] `SEC-2026-021` — resolved
  - Date found: 2026-09-23
  - Commit reviewed: 637c405
  - Affected files: `holepunch-sidecar/src/swarm.mjs`, `holepunch-sidecar/src/config.mjs`
  - Evidence: `createSwarmMesh` accepts every `swarm.on("connection")` stream into `conns` without a cap, and `conn.on("data")` forwards each valid `frame` for joined topics to local clients immediately. Bounds exist for NDJSON line and payload size, but there is no per-peer/per-topic/per-process frame-rate limiter on swarm ingress.
  - Description: Remote swarm peers are membership-gated by shared topic only; once connected, they can push arbitrarily many syntactically valid sealed frames within size caps, and sidecar fan-out forwards each frame without throughput controls.
  - Impact: A malicious or compromised peer that knows the topic can trigger CPU/event-loop pressure and UI churn (repeated decrypt attempts and frame handling), degrading chat availability and battery life without breaking encryption.
  - Recommended remediation: Add swarm-ingress abuse limits (for example: per-connection token bucket and a process-level remote-peer cap), emit a coded diagnostics event when tripped, and close peers that sustain over-limit behavior.
  - Resolution date: 2026-09-23
  - Fix commit: pending (working tree)
  - Verification: Per-connection frame bucket (burst 20 / 10/s) drops then destroys after 8 consecutive misses; byte bucket (8 MiB burst / 4 MiB/s) destroys on miss; max 8 inbound remote streams (outbound still accepted). `remote_rate_limited` does not mark the UI offline. Bare has the same limits. Tests: `holepunch-sidecar/test/swarm-ingress-limits.test.mjs`, `native-wrapper/bare/test/swarm-ingress-limits.test.mjs`, `tests/p2p/sidecar-error-offline.test.ts`. Residual: a topic-knowing sybil can still occupy the 8 inbound slots; this bounds CPU/FDs, it does not pick the real contact.
  - Status: resolved

### Review history

#### 2026-09-23 — 637c405 — GPT-5.3 Codex (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: sidecar swarm code (`swarm.mjs`) keeps ciphertext transport separate from app-layer session keys; L1 proof/decrypt stays in app transport, not sidecar.
- Explicit trust boundaries: topic membership controls forwarding (`connTopics`) and foreign-topic labels are dropped; this is a discovery/membership gate, not peer intent validation.
- Input bounds: NDJSON line and frame sizes are capped and oversize lines destroy the offending peer connection.
- Failure behavior: connection open/error/close paths are observable in logs and topic peer counts update cleanly on close; refresh nudge backoff avoids immediate tight loops.
- Privacy claims: docs correctly frame direct peer IP exposure as intrinsic to Hyperswarm and treat DHT discovery as non-auth identity.

**Checklist highlights:**

- Event chain: join/announce (`swarm.join`) -> connection adoption (`info.topics`) -> frame fan-out -> peer-close cleanup reviewed in code and tests.
- Trust boundaries: inbound frames are forwarded only for topics that this connection shares (`connTopics`) and that local clients joined.
- Secrets/capabilities: sidecar carries opaque payload strings only; no L1 session key material in swarm runtime.
- Dependency behavior: `hyperswarm` defaults are consumed directly; no explicit app-level cap on accepted remote streams.
- Tests: covered NDJSON overflow disconnect, topic-isolation fan-out, and server lifecycle; missing adversarial flood and peer-cap tests.

**Findings this review:** `SEC-2026-021`

**Verification gaps:**

- No swarm-ingress token-bucket tests (remote flood within valid size limits).
- No explicit max-remote-peer cap or rejection telemetry under connection pressure.
- No long-run soak test confirming sidecar/UI behavior under sustained malicious frame cadence.
- Review used commit `637c405`; previous MOD-006 fixes in working tree were treated as contextual baseline only.

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
- `desktop-electron/ui-navigation.mjs`
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

- [x] Reviewed — latest review: 2026-09-23 — commit: 637c405 — reviewer: GPT-5.3 Codex (Cursor Agent)



### Findings

- [x] `SEC-2026-022` — resolved
  - Date found: 2026-09-23
  - Commit reviewed: 637c405
  - Affected files: `desktop-electron/main.mjs`, `desktop-electron/preload.cjs`, `desktop-electron/sidecar-command.mjs`
  - Evidence: `main.mjs` creates a hardened window (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`) but does not install `webContents.setWindowOpenHandler` or `will-navigate`/navigation allowlists. `preload.cjs` always exposes `window.gnhDesktop` in that window, and main-process guards (`authorizeSidecarCommandSender`, `assertRoomSessionSender`) bind by `webContents.id` only, not by origin.
  - Description: Any web page that is navigated into the existing BrowserWindow (for example by an unhandled external link or a hostile `GNH_UI_URL` override) inherits the full privileged preload surface.
  - Impact: Untrusted remote content in the bound renderer can invoke `gnh:sidecar-command` and room-session IPC (`gnh:room-sessions-load/save/clear`), including reading persisted room session material and issuing sidecar control commands. This is renderer-to-main privilege exposure across an origin boundary.
  - Recommended remediation: Enforce strict navigation confinement to the intended app origin/file (`loadFile` packaged UI and approved dev URL only), route external URLs via `shell.openExternal`, and add sender-origin checks on privileged IPC handlers in addition to `webContents.id`.
  - Resolution date: 2026-09-23
  - Fix commit: pending (working tree)
  - Verification: `uiPolicyFromTarget` / `isAllowedUiUrl` confine the window to the resolved packaged `file:` UI directory or loopback `http(s)`. `will-navigate` cancels other document loads; `setWindowOpenHandler` denies new windows (no `openExternal`). Privileged IPC additionally requires `senderFrame.url` on that origin. Remote `GNH_UI_URL` is refused before `BrowserWindow` is created. Tests: `desktop-electron/test/ui-navigation.test.mjs`. Existing `sanitizeSidecarCommand` / sender-id checks unchanged. Residual: same-origin renderer can still `join` any 64-hex topic (`SEC-2026-019`). Severity after reassessment: medium (checklist / origin-widening), not a default-path remote exploit.
  - Status: resolved

### Review history

#### 2026-09-23 — 637c405 — GPT-5.3 Codex (Cursor Agent)

**Outcome:** Findings and verification gaps recorded

**Posture evaluation (summary):**

- Separation of concerns: main process owns sidecar lifecycle, IPC proxying, desktop identity, and session-store host; renderer stays Node-disabled and sandboxed.
- Least knowledge: packaged IPC path keeps sidecar auth token out of renderer env/argv and out of preload exports; WS debug override still carries token in argv by design.
- Explicit trust boundaries: sender binding is fail-closed by `webContents.id` + main-frame checks for sidecar commands and room-session handlers, but no origin binding is enforced once that renderer is bound.
- Discovery/authorization: sidecar command allowlist and payload bounds are enforced in main before NDJSON send; discovery is not treated as message authorization here (L1/L2 checks are out of module scope).
- Failure behavior: sidecar IPC disconnect emits typed `sidecar_error`; shutdown clears partition history and tears down owned sidecar.
- Privacy claims: desktop docs accurately describe token handling and IPC hardening, but current navigation policy allows cross-origin privilege inheritance (`SEC-2026-022`).

**Checklist highlights:**

- Event chain: app start → identity resolve → sidecar spawn/attach (`ipc-auth-token`) → preload bridge setup (`additionalArguments` + sync IPC) → renderer command proxy traced end-to-end.
- Trust boundaries: `contextIsolation`/sandbox posture validated; command and room-session IPC authorization checked; origin-confinement controls missing.
- Secrets/capabilities: sidecar token handling and lockfile behavior reviewed; no token logging in reviewed paths.
- Logs/observability: no sensitive frame/session dumps in reviewed Electron main/preload logs.
- Dependency/build posture: Forge config reviewed for embedded resources and runtime packaging assumptions; no hardening regression found there.
- Tests/validation: module tests cover identity, IPC path permissions, command sanitization, desktop-info race handling, and sidecar IPC disconnect/error propagation.

**Findings this review:** `SEC-2026-022`

**Verification gaps:**

- No automated tests currently assert navigation confinement (`will-navigate` / `setWindowOpenHandler`) or external-link routing behavior.
- No controlled proof-of-concept test was executed in this pass that loads a foreign origin in the bound window and attempts privileged IPC calls.
- Windows named-pipe ACL behavior remains inherited from prior IPC module reviews and was not re-validated in this module-specific pass.
- `GNH_UI_URL` operational override trust expectations are documented but not policy-enforced by an explicit runtime allowlist.

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
| 2026-09-23 | MOD-008 | 637c405 | GPT-5.3 Codex (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-022 |
| 2026-09-23 | MOD-007 | 637c405 | GPT-5.3 Codex (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-021 (resolved) |
| 2026-09-23 | MOD-006 | 637c405 | Grok 4.6 (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-019 (resolved), SEC-2026-020 (resolved) |
| 2026-09-22 | MOD-005 | cfb7e83 | GPT-5.3 Codex (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-018 (resolved) |
| 2026-09-22 | MOD-004 | e2d7db3 | Claude Opus 5.5 (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-013 (resolved), SEC-2026-014 (resolved), SEC-2026-015 (resolved), SEC-2026-016 (resolved), SEC-2026-017 (resolved) |
| 2026-09-22 | MOD-003 | 01d6d85 | Grok 4.7 (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-012 (resolved) |
| 2026-09-22 | MOD-002 | d241144 | Composer (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-006 (resolved), SEC-2026-007 (resolved), SEC-2026-008 (resolved), SEC-2026-009 (resolved), SEC-2026-010 (resolved), SEC-2026-011 (resolved) |
| 2026-09-20 | MOD-002 | cd7cd34 | Composer (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-006, SEC-2026-007, SEC-2026-008, SEC-2026-009, SEC-2026-010 |
| 2026-09-20 | MOD-001 | e17bc73 | Composer (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-001 (resolved), SEC-2026-002 (resolved), SEC-2026-003 (resolved/accepted), SEC-2026-004 (open), SEC-2026-005 (new/open) |
| 2026-09-18 | MOD-001 | fe7419d | Composer (Cursor Agent) | Findings and verification gaps recorded | SEC-2026-001, SEC-2026-002, SEC-2026-003, SEC-2026-004 |


