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
6. Sealed chat frames are opaque to the runtime (ChaCha20-Poly1305 L3 E2E in
   the app crypto path). Hyperswarm Noise is L2 transport. Dual protection is
   intentional — see `docs/security/encryption.md`.

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
| A — now | Vite UI + sidecar | Node Hyperswarm |
| B — mobile MVP | Expo UI + Bare worklet + same bridge | Bare Hyperswarm |

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
