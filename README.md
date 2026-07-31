# getnowhere

A web-app-first Conceal (CCX) wallet and private-relationship client.
React + TypeScript + Vite. The UI never joins Hyperswarm.

**Networking:** Vite UI ↔ typed bridge ↔ Hyperswarm runtime.

| Host | UI | Hyperswarm | Doc |
|---|---|---|---|
| Web-dev | Vite in browser | `holepunch-sidecar/` (Node WS) | `docs/architecture/holepunch-sidecar.md` |
| Desktop | Vite in Electron | sidecar child (shared or isolated) | `docs/architecture/electron-desktop.md` |
| Mobile | Expo (target) | Bare worklet (target) | `docs/architecture/mobile-p2p-runtime.md` |

Crypto: L1 SmartMessage (+ session seal) → L2 Noise; L1′ when L2 is down — `docs/security/encryption.md`.

## Install (once)

```bash
npm install
npm run holepunch:install
npm run desktop:install
```

## Test scenarios

Pick the scenario that matches what you are verifying. Always start Vite for
desktop shells that load `http://127.0.0.1:5173`.

### 1. Web UI only (no live P2P)

Wallet / invite / UI flows without Hyperswarm.

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. Composer stays locked for live chat (no sidecar).

### 2. Web + sidecar (browser Alice / Bob)

Same-machine fan-out over one Node sidecar. Good for UI + bridge + L1-sealed frames.
**Not** two independent Hyperswarm DHT peers (both UIs share one process).

```bash
# Terminal 1
npm run holepunch

# Terminal 2
npm run dev
```

Open two browser profiles (or private + normal) on the same origin. Create /
import a different wallet in each. Live chat uses `ws://127.0.0.1:7901`.

Optional second sidecar port:

```bash
HOLEPUNCH_PORT=7902 npm run holepunch
# then VITE_HOLEPUNCH_WS_URL=ws://127.0.0.1:7902 npm run dev
```

### 3. Desktop — shared swarm (quick Alice / Bob)

Two Electron windows, isolated wallets/storage, **one** sidecar on `:7901`.
First window owns the child; closing the owner drops Bob’s bridge.
Title tags: `[shared:owner]` / `[shared:attach]`.

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run desktop:alice

# Terminal 3
npm run desktop:bob
```

Use for shell + partitions + local fan-out. Details:
`docs/architecture/electron-desktop.md`.

### 4. Desktop — isolated swarm (real peer path)

Each Electron owns its own sidecar (alice `:7901`, bob `:7902`). Peers meet via
DHT + Noise. Use this to verify end-to-end Hyperswarm + L1 session seal + post-connect proof.

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run desktop:alice:isolated

# Terminal 3
npm run desktop:bob:isolated
```

### 5. Web as stand-in while building mobile

There is no runnable `native-wrapper/` Expo app in-repo yet. Until Bare lands:

- Develop product UI and protocol in **scenario 1–2** (Vite + sidecar).
- Keep Hyperswarm out of the Vite bundle; bridge schema stays the contract for
  a future Bare IPC host — `docs/architecture/mobile-p2p-runtime.md`.
- Production `dist/` is tuned for WebView / `file://` embedding (see below).

### 6. Automated checks

```bash
npm run test          # Vitest
npm run test:e2e      # Playwright (starts Vite)
npm run preflight     # types + tests + biome
npm run build && npm run preview
```

## Scenario cheat sheet

| Goal | Scenario | Swarm |
|---|---|---|
| UI / wallet without peers | 1 | none |
| Bridge + L1-sealed frames in browser | 2 | shared Node sidecar |
| Electron shells, fast dual-wallet | 3 | shared `:7901` |
| Prove DHT / Noise / proof handshake | 4 | two sidecars |
| Mobile product work today | 5 → use 1–2 | same as web-dev |
| CI / regression | 6 | mocks / e2e |

## Native delivery notes

Daily work is Vite. Desktop packaging is Electron. Mobile target is Expo + Bare
(not React Native desktop, not Nitro Hyperswarm).

### Web UI embedding

- Desktop (dev): Vite at `http://127.0.0.1:5173`; swarm via localhost WS.
- Desktop (release target): `dist/` in Electron; same bridge schema (WS/IPC).
- Mobile (target): Expo UI + Bare IPC; WebView only if UI-only.
- Vite `base: "./"` and `HashRouter` keep relative assets working from
  local / `file://` loads.

### Config: local bundled assets vs. hosted assets

- **Local bundled (default for offline-first):** copy `dist/` into the Expo
  app's assets and load `index.html` via WebView. Relative `base: "./"` ensures
  `./assets/*.js` and `./assets/*.css` resolve from the bundle.
- **Hosted (for OTA updates):** deploy `dist/` to any static host and point the
  WebView at the URL. Relative paths still work at any subpath.

### file:// compatibility

The Vite config is tuned so `dist/` loads from `file://` inside a WebView:

1. **Relative asset paths** — `base: "./"`
2. **No dynamic-import chunks** — `inlineDynamicImports: true`
3. **Inlined WASM** — `assetsInlineLimit` for Conceal SDK `.wasm`
4. **No `crossorigin` on entry assets** — build plugin strips it for `file://`

Verify after config changes: `dist/index.html` has no `crossorigin` and no
separate `.wasm` files are emitted.

### Storage adapters

Persist only through `StorageAdapter` (`src/services/storage/StorageAdapter.ts`).
Default is `localStorage` for browser/dev. Before shipping in Expo, inject a
native secure adapter (Keychain / EncryptedSharedPreferences) before React mounts.
Seed phrase stays in-memory only — never route it through storage.

### What NOT to do in the web app

- Do not add Capacitor / Cordova / Expo / React Native deps to the Vite app.
- Do not add SSR or a backend; the build is static.
- Do not import `hyperswarm` in the Vite/React bundle.
- Do not codegen Nitro-Hyperswarm or a React Native desktop shell.
- Do not drop the L1 session seal because Noise exists — `docs/security/encryption.md`.

## Docs

Start at `docs/README.md`. Architecture runbooks beat this file for deep detail.
