# Design — Mobile bridge hardening

## Context

Phase B mobile P2P: Expo WebView loads bundled Vite UI; `window.gnhMobile` posts
commands to `GnhMobileBridge`, which forwards NDJSON over BareKit IPC to a
Hyperswarm worklet (`bare/bridge.mjs` + `bare/swarm.mjs`). Bridge token is
transport ACL only — L1 session proof remains in the UI.

Sidecar already caps Hyperswarm NDJSON (`openspec/changes/unbounded-ndjson-buffer`)
and enforces WS bridge auth (`openspec/changes/archive/2026-08-02-bridge-auth`).
Mobile gaps are RN-side IPC parsing, WebView trust boundary, and fail-open empty
token on the worklet.

## Decisions

- **Decision:** Reuse `bare/config.mjs` limits (`maxNdjsonLineBytes` 262144) for
  RN IPC line reassembly.
  - **Alternatives:** Separate RN-only constant; share `createLineReader` from a
    small TS port.
  - **Rationale:** Parity with worklet ↔ sidecar; one knob for chat NDJSON.

- **Decision:** On RN IPC overflow, clear buffer and `worklet.terminate()`.
  - **Alternatives:** Soft-reset buffer only.
  - **Rationale:** Matches sidecar destroy-on-overflow; isolates bad worklet.

- **Decision:** Require non-empty CSPRNG bridge token before worklet start; throw
  in `bare/entry.mjs` if argv token empty.
  - **Alternatives:** Generate token inside worklet.
  - **Rationale:** Fail-closed like sidecar non-loopback policy; RN owns secret.

- **Decision:** Remove readable `bridgeToken` from injected `window.gnhMobile`;
  commands flow via injected closure holding token (WebView cannot read secret).
  - **Alternatives:** Header-based native channel bypassing postMessage entirely.
  - **Rationale:** Smallest change; postMessage schema unchanged except token not
    on window.

- **Decision:** WebView navigation locked to `file:///android_asset/ui/`; drop
  `allowUniversalAccessFromFileURLs` when regression tests pass without it.
  - **Rationale:** Reduces XSS blast radius paired with token hiding.

- **Decision:** Simple token-bucket rate limits in `bare/bridge.mjs` (authoritative)
  with optional early reject in `handleWebViewMessage`.
  - **Rationale:** Worklet is source of truth; RN layer saves IPC spam.

- **Decision:** Finding 14 (length leak on `tokensEqual`) — document only; UUID
  tokens are fixed length.
  - **Rationale:** No practical exploit on current format.

## Risks / Trade-offs

- Tighter WebView flags may break asset loading paths — regression-test workers
  and relative imports in bundled UI.
- Hiding `bridgeToken` may break tests that read `window.gnhMobile.bridgeToken` —
  update `HolepunchSidecarClient` mobile path if needed.
- Rate limits must not block legitimate reconnect bursts during room open.

## Migration

None for end users. Developers: rebuild Android assets after bare bundle changes.
