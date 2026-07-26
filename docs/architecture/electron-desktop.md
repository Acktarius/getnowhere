# Electron desktop (decision + runbook)

**Status:** Adopted for packaged **desktop**. Complements web-dev sidecar and
mobile Bare. MVP shell lives in `desktop-electron/`.

## Intent

- **Desktop package:** Electron shell around the Vite UI.
- Hyperswarm stays **out of the renderer**. For localhost Alice/Bob testing, main
  owns (or attaches to) the `holepunch-sidecar` process on `127.0.0.1:7901`.
- **Mobile:** unchanged — Expo UI + Bare worklet (`mobile-p2p-runtime.md`).
- **Out of scope:** React Native desktop, Nitro Hyperswarm modules.

## Dev: two instances on one PC (Alice / Bob)

Goal: two Electron windows, two Conceal wallets, Hyperswarm via sidecar child(ren).

### Swarm modes (`GNH_SWARM_MODE`)

| Mode | Ports | Behavior | Use when |
|---|---|---|---|
| `shared` (default) | both use `:7901` | First binder **owns** the child; second **attaches**. Closing the owner drops the bridge for the attacher. Local WS fan-out only — **not** two independent Hyperswarm peers. | Quick UI / fan-out tests |
| `isolated` | alice `:7901`, bob `:7902` (defaults) | Each window **owns** its own sidecar. Peers meet via real DHT + Noise. | Verifying end-to-end Hyperswarm + L3 crypto |

Window title tags: `[shared:owner]`, `[shared:attach]`, or `[isolated]`.

### Per-session WS auth token

**Shared mode (Alice/Bob same PC):** default token is `gnh-desktop-shared` so both
windows always match. Owner also writes `$TMPDIR/gnh-sidecar-<host>-<port>.token`.

**Isolated mode:** each role gets a random UUID token for its own sidecar.

Pass **base WS URL and token as separate Electron args** — never put `?token=` in
`--gnh-holepunch-ws` (Chromium can truncate `additionalArguments` at `?`).

```text
--gnh-holepunch-ws=ws://127.0.0.1:7901
--gnh-ws-token=<token>
```

Preload builds `window.gnhDesktop.holepunchWsUrl` with the query. Root `.env`
`VITE_HOLEPUNCH_WS_URL=ws://127.0.0.1:7901` is for browser-only web-dev (no token);
Electron must use `gnhDesktop`, not that env alone.

Optional: set the same `GNH_SIDECAR_TOKEN` in both terminals. Web-dev
(`npm run holepunch` without the env) stays open (no token).

### Shared-mode table

| Instance | `GNH_ROLE` | Storage | Swarm |
|---|---|---|---|
| Alice | `alice` | `userData` + `persist:gnh-alice` | First to bind `:7901` **owns** sidecar child |
| Bob | `bob` | `userData` + `persist:gnh-bob` | Attaches to existing `:7901` |

Either start order works in shared mode. Closing the **attacher** only stops that UI.

### Shell UX

- Default `BrowserWindow` size is **780×800** so the frame fits the Vite
  `.app-shell` desktop max-width (760px) without changing CSS layout.
- No application / window menu bar (`Menu.setApplicationMenu(null)`).
- Use the window **close** control to exit.
- Close always quits that Electron app; if it owns the sidecar child, the child
  receives SIGTERM (then SIGKILL) so swarm + UI stop together for that owner.

### Commands

Install once:

```bash
npm run holepunch:install
npm run desktop:install
```

Terminal 1 — Vite UI:

```bash
npm run dev
```

Terminal 2 — Alice:

```bash
npm run desktop:alice
```

Terminal 3 — Bob:

```bash
npm run desktop:bob
```

Import / create a different wallet in each window. Live chat uses
`ws://127.0.0.1:7901` (injected as `window.gnhDesktop.holepunchWsUrl`).

Optional env:

| Variable | Default | Meaning |
|---|---|---|
| `GNH_ROLE` | `alice` | `alice` \| `bob` (storage partition + title) |
| `GNH_SWARM_MODE` | `shared` | `shared` \| `isolated` |
| `HOLEPUNCH_HOST` | `127.0.0.1` | Swarm bind / attach host |
| `HOLEPUNCH_PORT` | `7901` (bob isolated: `7902`) | Sidecar listen port |
| `GNH_HOLEPUNCH_WS_URL` | `ws://127.0.0.1:7901` | Base URL; token query added by main |
| `GNH_SIDECAR_TOKEN` | random UUID | Required by sidecar when set |
| `GNH_UI_URL` | `http://127.0.0.1:5173` (dev) / Pages URL (packaged defaults) | UI origin |
| `GNH_NODE_BIN` | `node` (dev) / bundled runtime (packaged) | Node used to spawn sidecar |
| `GNH_PACKAGED_UI_URL` | set in CI before `prepare:sidecar` | Written into `gnh-defaults.json` |

Isolated commands:

```bash
npm run desktop:alice:isolated
npm run desktop:bob:isolated
```

## Architecture (MVP)

```text
Alice Electron ──┐
                 ├── ws://127.0.0.1:7901 ── holepunch-sidecar (Hyperswarm)
Bob Electron ────┘
        │
        └── each loads Vite UI in an isolated session partition
```

Longer term (release packaging): embed swarm in Electron main / pear-electron
instead of a child process; keep the **same** bridge message schema.

### Bridge invariant

Same live schema as web-dev (`HolepunchSidecarClient.ts`):

- Commands: `ping` | `join` | `leave` | `frame`
- Events: `pong` | `ready` | `peers` | `frame` | `error`

### Layout

```text
desktop-electron/
  package.json
  main.mjs          # window + sidecar child lifecycle
  preload.cjs       # exposes gnhDesktop { role, holepunchWsUrl, wsToken }
```

## Delivery phases

| Phase | Scope | Networking host |
|---|---|---|
| A — now | Vite + sidecar (browser) | Node |
| B — desktop MVP | Electron + sidecar **child** (Alice/Bob share `:7901`) | Node child |
| B1 — Pages + Forge Linux | Pages UI + Electron Forge zip/deb with bundled sidecar | Node child in package |
| B2 — later | Optional embed swarm in Electron main / pear-electron | In-process |
| C — mobile | Expo + Bare worklet | Bare |

Packaging runbook: `docs/builds/github-pages-and-desktop.md`.

## Wording

Prefer:

- “Electron desktop shell; Hyperswarm via localhost sidecar child for Alice/Bob testing.”
- “Close stops that app’s UI and, if it owns the sidecar, the shared swarm.”

Avoid:

- “The Electron renderer joins Hyperswarm.”
- “React Native desktop.”
- “Nitro Hyperswarm module.”

See also: `mobile-p2p-runtime.md`, `holepunch-sidecar.md`, `pear-runtime.md`.
