# Mobile P2P runtime (decision)

**Status:** Decided direction for **mobile** delivery. Web-dev stays Vite +
sidecar. Packaged **desktop** is Electron — see
`docs/architecture/electron-desktop.md`.

## Problem

Earlier docs implied “Expo WebView wraps the Vite app and somehow joins Hyperswarm.”
That is misaligned with Holepunch:

- Hyperswarm needs a Bare/Node-class runtime (UDP / DHT / Noise streams).
- Plain browser and plain WebView JavaScript are **UI environments**, not Hyperswarm hosts.
- Holepunch’s documented mobile path is **Expo / React Native UI + Bare worklet**
  (`react-native-bare-kit`, `bare-expo`), with RPC/IPC to the “Pear-end.”

React Native / Expo is **mobile only** in this project. Desktop packaging uses
Electron, not React Native.

## Options considered

| Option | What it is | Verdict |
|---|---|---|
| A. Vite in Expo WebView only | Static UI in WebView; no real swarm host | **Reject** for P2P — WebView cannot own Hyperswarm |
| B. Nitro / custom native “Hyperswarm module” | Re-host DHT/UDP/Noise in a custom native module | **Reject** — out of scope; use Bare |
| C. Expo UI + Bare worklet (Hyperswarm in Bare JS) | Official Holepunch mobile shape | **Adopt (mobile)** |
| D. Vite + Node sidecar | Current `holepunch-sidecar/` | **Keep (web-dev)** |
| E. Electron desktop | Vite renderer + Hyperswarm in main / Pear-end | **Adopt (desktop)** — see `electron-desktop.md` |

## Adopted mobile architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  UI (no hyperswarm import)                                  │
│  • Mobile: Expo UI (screens; optional WebView for UI only)  │
└──────────────────────────┬──────────────────────────────────┘
                           │ typed bridge (same command/event contract)
┌──────────────────────────▼──────────────────────────────────┐
│  P2P runtime (owns Hyperswarm)                              │
│  • Bare worklet via `react-native-bare-kit`                 │
└─────────────────────────────────────────────────────────────┘
```

Cross-platform map:

| Surface | UI | Hyperswarm host | Bridge |
|---|---|---|---|
| Web-dev | Vite | Node `holepunch-sidecar/` | WebSocket |
| Desktop | Vite in Electron renderer | Electron main / Pear-end | IPC / pear-bridge |
| Mobile | Expo | Bare worklet | Bare IPC |

### Invariant (all platforms)

1. UI never imports `hyperswarm`.
2. Runtime joins **32-byte** topics (`topicRef` = 64 hex chars).
3. Bridge messages follow the **current wire schema** in
   `docs/architecture/holepunch-sidecar.md` § Bridge contract (live).
4. Topic derivation is only the formula in `docs/architecture/pairing-and-topics.md`
   (and `deriveTopicRef` in code).
5. App-layer peer verification after transport connect; topic alone is not trust.
6. Sealed chat frames are opaque to the runtime (ChaCha20-Poly1305 **L1 session
   seal** — not a separate L3). Hyperswarm Noise is **L2**. See
   `docs/security/encryption.md`.

### Mobile implementation sketch

- Expo app in `native-wrapper/` (EAS Build / Submit unchanged).
- Start a Bare `Worklet` that loads a packed Pear-end bundle (swarm manager).
- Implement the **same** bridge commands/events over Bare IPC instead of WS.
- UI uses a `ChatTransport` / bridge client that swaps backend:
  - web-dev: WebSocket sidecar
  - desktop: Electron IPC (see `electron-desktop.md`)
  - mobile: Bare IPC
- Do **not** put Hyperswarm in the Hermes UI bundle.

References:

- https://docs.pears.com/guides/making-a-bare-mobile-app
- https://www.npmjs.com/package/react-native-bare-kit
- https://github.com/holepunchto/bare-expo

## Delivery phases (mobile track)

| Phase | Scope | Networking host |
|---|---|---|
| A — web-dev | Vite UI + sidecar | Node Hyperswarm |
| B — mobile MVP (Android) | Expo WebView + Bare worklet + `window.gnhMobile` | Bare Hyperswarm |

Phase B is implemented in `native-wrapper/` (see **Implementation layout** below).
Android device verification (2026-08): packed Bare worklet boots, DHT announces room
topics, and opens Hyperswarm connections to desktop peers. iOS uses the same Bare
bundle; device P2P sign-off on iOS is deferred.

## Bare worklet packaging (Android)

End-to-end path from repo to on-device Hyperswarm:

```text
bare/entry.mjs + deps
  → bare-pack --linked (--host android-arm64, android-arm)
  → assets/bare/app.bundle.mjs (+ extracted app.bundle)
  → prepare-android-assets.mjs copies into android/app/src/main/assets/bare/
  → bare-link copies sodium-native / udx-native .so → android/app/src/main/addons/
  → GnhMobileBridge loads bytes via expo-asset; Worklet.start("/app.bundle", …)
```

Commands (repo root):

```bash
npm run holepunch:install    # bare/node_modules symlink to sidecar deps
npm run mobile:sync-ui && npm run mobile:android
```

Optional: `BARE_ENTRY=other.mjs node native-wrapper/scripts/pack-bare.mjs` for
alternate pack entry points (default `entry.mjs`).

### Implementation constraints (Bare mobile)

These are required for a stable Android worklet — not optional Nitro/CMake steps:

| Constraint | Why |
|---|---|
| `import * as swarm from "./swarm.mjs"` | bare-pack linked bundles fail on named imports from local `.mjs` (`createSwarmMesh` SyntaxError). |
| No `process.on("SIGTERM")` / `process.exit` in worklet | Node sidecar pattern aborts RN (`SIGABRT` on `mqt_v_js`). Teardown: `worklet.terminate()` from `GnhMobileBridge.destroy()`. |
| Single worklet start (`bridgeStartingRef` in `App.tsx`) | `onLoadEnd` + `onError` both fire `onWebViewReady`; guard before `ensureStarted()`. |
| `BARE_INLINE_SMOKE` removed | Packed `.bundle` path is the only production start path. |

Native addons (`libsodium-native`, `libudx-native`, …) are **prebuilt** by
`bare-link` into `jniLibs` — not compiled via app CMake (unlike Nitro modules).

### Device verification (logcat)

```bash
adb logcat | grep -E 'swarm|gnh-mobile|SIGABRT|FATAL'
```

Healthy swarm activity when opening a room:

- `[swarm] DHT bootstrap ok`
- `[swarm] topic … announced (flushed)`
- `[swarm] connection open peer=…`

Cross-platform lab (Android + Electron desktop): same `topicRef` in room
diagnostics; desktop runs sidecar (`npm run holepunch` + `npm run dev` or
`npm run desktop:alice`). Symmetric NAT on mobile Wi‑Fi may log firewalled
warnings; relay paths can still connect. Post-transport **connection reset**
indicates app/session layer (L1 proof), not bundle mount — check both hosts.

## Implementation layout (phase B)

```text
native-wrapper/
  App.tsx                      # starts Worklet, wires WebView postMessage
  src/GnhMobileBridge.ts       # per-launch bridgeToken + Worklet IPC
  src/ipcLineProcessor.ts      # bounded NDJSON reassembly (maxNdjsonLineBytes)
  src/createLineReader.ts      # incremental splitter (parity with bare/swarm.mjs)
  src/injectMobileBridge.ts    # window.gnhMobile injection script
  src/webviewNavigation.ts     # asset-only navigation allowlist
  bare/
    entry.mjs                  # BareKit.IPC + swarm mesh
    bridge.mjs                 # same SidecarCommand/Event as holepunch-sidecar
    swarm.mjs                  # ported from holepunch-sidecar (no-hello policy)
    test/swarm-security.test.mjs
  assets/bare/app.bundle.mjs   # bare-pack output (gitignored)
  scripts/pack-bare.mjs
```

UI bridge selection (`src/services/p2p/HolepunchSidecarClient.ts`):

1. Test injection
2. `window.gnhMobile` → `createMobilePostMessageSidecarBackend()`
3. `window.gnhDesktop` → WebSocket (Electron)
4. Default WebSocket (browser dev)

### Security parity (mobile)

Mobile uses in-process Bare IPC + WebView `postMessage` (no localhost WebSocket).
Controls match packaged desktop / sidecar where applicable:

| Control | Mobile |
|---|---|
| No NDJSON `hello` / Hyperswarm-only topic adoption | `bare/swarm.mjs` (same as sidecar) |
| `connTopics` frame gating | `bare/swarm.mjs` |
| `frame_requires_join`, size limits, error codes | `bare/bridge.mjs` |
| Opaque L1-sealed frames | Unchanged app crypto path |
| Per-launch bridge token (`randomUUID`, constant-time compare) | `GnhMobileBridge` + `bare/auth.mjs` |
| RN IPC NDJSON line cap (`maxNdjsonLineBytes` 262144) | `GnhMobileBridge` → `IpcLineProcessor` / `createLineReader.ts` |
| WebView navigation restricted to `file:///android_asset/ui/` | `App.tsx` → `webviewNavigation.ts` |
| Bridge token not readable in WebView JS (`sendCommand` closure only) | `injectMobileBridge.ts` |
| Ephemeral loopback port | N/A — bridge is in-process only |
| Worklet teardown | `App.tsx` cleanup → `GnhMobileBridge.destroy()` → `worklet.terminate()` (no in-worklet SIGTERM) |

**Pending hardening (2026-08 review):** findings 08–09 (RN IPC cap, WebView
token/navigation) — fixed; `.findings/10-mobile-bridge-token-entropy.md` …
`.findings/15-mobile-bridge-auth-tests.md` remain; tracked in OpenSpec
`openspec/changes/mobile-bridge-hardening/`.

### WebView trust model

The bundled Vite UI runs inside an Android WebView loading only
`file:///android_asset/ui/`. Top-level navigation to `http(s)://`, `intent://`,
or other asset paths is blocked via `onShouldStartLoadWithRequest`. The per-launch
bridge token lives in the RN host and in the injected script closure — it is **not**
published as `window.gnhMobile.bridgeToken`. WebView JS can call `sendCommand` (which
still attaches the token in postMessage payloads validated by RN), but cannot read
the secret for exfiltration by untrusted scripts that lack postMessage access.
`allowUniversalAccessFromFileURLs` is disabled; same-directory asset loads use
`allowFileAccessFromFileURLs` for the packaged bundle only.

`desktop-electron/` is unchanged by the mobile track.

Desktop Electron is a **parallel** track (`electron-desktop.md`), not a
replacement for this mobile plan.

## Wording rules

Prefer:

- “Expo UI with a Bare Hyperswarm worklet behind the bridge.”
- “Desktop uses Electron; mobile uses Expo + Bare.”
- “Web-dev uses a Node sidecar that mirrors the Pear-end.”

Avoid:

- “The WebView joins Hyperswarm.”
- “Nitro module for Hyperswarm.”
- “React Native desktop app.”
- “Pear-native” when you mean the Node sidecar — say **Pear-shaped Node sidecar**
  or **Bare worklet** as appropriate.

See also: `electron-desktop.md`, `holepunch-sidecar.md`, `pear-runtime.md`,
`pairing-and-topics.md`, `folder-structure.md`.
