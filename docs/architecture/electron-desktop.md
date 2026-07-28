# Electron desktop (decision + runbook)

**Status:** Adopted for packaged **desktop**. Complements web-dev sidecar and
mobile Bare. MVP shell lives in `desktop-electron/`.

## Intent

- **Desktop package:** Electron shell around the Vite UI.
- Hyperswarm stays **out of the renderer**. Packaged builds own a private
  sidecar child; localhost Alice/Bob testing may share or isolate sidecars
  (below).
- **Mobile:** unchanged — Expo UI + Bare worklet (`mobile-p2p-runtime.md`).
- **Out of scope:** React Native desktop, Nitro Hyperswarm modules.

## Packaged vs development

Identity is resolved by `desktop-electron/desktop-identity.mjs` from
`app.isPackaged` (not from a default `alice` role).

| | Packaged (`getnowhere` / `.deb`) | Dev harness |
|---|---|---|
| Role | none | `GNH_ROLE` (`alice` / `bob`) |
| Log prefix | `[desktop]` | `[desktop:alice]` |
| `userData` | `~/.config/getnowhere` | `~/.config/getnowhere-desktop-<role>` |
| Partition | `persist:gnh` | `persist:gnh-<role>` |
| Window title | `Get Now Here` | `Get Now Here — Alice [shared:owner]` |
| Swarm | always own sidecar; never attach | shared attach or isolated |
| Port | ephemeral (`HOLEPUNCH_PORT=0`) unless overridden | `7901` / bob isolated `7902` |
| Port handoff | Node IPC `{ type: "listening", port }` | `waitForPort` |
| Bridge token | per-launch `randomUUID()`; no lockfile | shared default or UUID |
| Single instance | yes (`requestSingleInstanceLock` after `setPath`) | no (Alice/Bob need two) |

Packaged builds **ignore** `GNH_ROLE`, `GNH_SWARM_MODE`, and `GNH_SIDECAR_TOKEN`.
They still honor `HOLEPUNCH_HOST`, `HOLEPUNCH_PORT`, `GNH_UI_URL`, `GNH_NODE_BIN`,
and `GNH_HOLEPUNCH_WS_URL` as operational overrides.

Pre-release note: renaming `userData` / partition orphans older
`getnowhere-desktop-alice` trees (no migration). Remove with
`rm -rf ~/.config/getnowhere-desktop-alice ~/.config/getnowhere-desktop-bob`.
After a hard kill, a stale Chromium `SingletonLock` under `~/.config/getnowhere`
can block relaunch until removed.

## Dev: two instances on one PC (Alice / Bob)

Goal: two Electron windows, two Conceal wallets, Hyperswarm via sidecar child(ren).
**Dev only** — not used by packaged installs.

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

Main hands `{ role?, holepunchWsUrl, wsToken, ufwState }` to preload over a
synchronous IPC round-trip (`gnh:get-desktop-info`, `ipcRenderer.sendSync`),
scoped to that window's own `webContents` — **not** `additionalArguments` and
not `executeJavaScript` into the page's main-world scope. Both of those older
paths leaked the token further than necessary: `additionalArguments` lands in
this process's command line (readable via `/proc/<pid>/cmdline` or `ps` by
any co-resident process), and `executeJavaScript` places it in the
main-world scope of the page (more exposed to page-level XSS than the
isolated preload world `contextBridge` uses).

**Ordering:** set the desktop-info payload and register the sync IPC handler
*before* `new BrowserWindow`. Sandboxed preload can `sendSync` during the
initial `about:blank` load inside the constructor. If the handler is missing
then, `preload-bridge.cjs` falls back to `ws://127.0.0.1:7901` with an empty
token while the packaged sidecar listens on an ephemeral port — the UI never
joins, and Hyperswarm shows no outbound/inbound. Until `webContents.id` is
bound, the handler still returns the prepared payload (see
`desktop-info-ipc.cjs`).

`desktop-electron/preload-bridge.cjs` validates the IPC reply's shape before
exposing it as `window.gnhDesktop`; base URL and token stay separate fields —
`HolepunchSidecarClient.ts` reassembles `?token=` itself. Root `.env`
`VITE_HOLEPUNCH_WS_URL=ws://127.0.0.1:7901` is for browser-only web-dev (no
token); Electron must use `gnhDesktop`, not that env alone.

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

Optional env (**dev harness**; packaged ignores the first three):

| Variable | Default | Meaning | Packaged |
|---|---|---|---|
| `GNH_ROLE` | `alice` | `alice` \| `bob` (storage partition + title) | ignored |
| `GNH_SWARM_MODE` | `shared` | `shared` \| `isolated` | ignored (always isolated) |
| `GNH_SIDECAR_TOKEN` | random / shared default | Required by sidecar when set | ignored (fresh UUID) |
| `HOLEPUNCH_HOST` | `127.0.0.1` | Swarm bind / attach host | honored |
| `HOLEPUNCH_PORT` | `7901` (bob isolated: `7902`) | Sidecar listen port (`0` = ephemeral) | honored |
| `GNH_HOLEPUNCH_WS_URL` | derived from host/port | Base URL; token query added by main | honored |
| `GNH_UI_URL` | `http://127.0.0.1:5173` (dev) / embedded `resources/ui` (packaged) | UI origin override (`loadURL`); packaged default is `loadFile` | honored |
| `GNH_NODE_BIN` | `node` (dev) / bundled runtime (packaged) | Node used to spawn sidecar | honored |

Isolated commands:

```bash
npm run desktop:alice:isolated
npm run desktop:bob:isolated
```

### Two physical machines

Use one sidecar (or one Electron app) **per machine**. Do not expect shared-mode
localhost fan-out to reach the other PC.

**Same LAN lab:** HyperDHT prefers a private-address LAN shortcut when both
peers share one reflexive public host (both off VPN). Ubuntu UFW (or similar)
default-deny will block that inbound UDP even when DHT bootstrap succeeds —
allow LAN UDP on **both** hosts for the test, then restart the apps. Allowing
TCP `7901` alone is useless (localhost bridge only). **Quick local tip:** put
**one** peer on a VPN so HyperDHT holepunches like an internet pair and you can
test L2 without editing UFW (masks the same-LAN path — see
`docs/architecture/holepunch-sidecar.md`).

**Internet / different NATs (product path):** ordinary users must **not** be
required to edit UFW or open ports. Outbound UDP + holepunch is the normal
path; hostile NAT needs an L2 relay, not a firewall cookbook.

Full triage (topic match, NAT buckets, connection-direction dedup logs):
`docs/architecture/holepunch-sidecar.md` § Two machines on one LAN.

On Linux, Electron may pass a read-only UFW advisory into the renderer after
repeated Holepunch timeouts; it never requests elevation or changes rules.

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
  desktop-identity.mjs  # packaged vs Alice/Bob decision table
  main.mjs              # window + sidecar child lifecycle; owns gnh:get-desktop-info IPC
  preload-bridge.cjs    # pure normalize(ipcReply) → gnhDesktop bridge object (no electron import)
  preload.cjs           # ipcRenderer.sendSync + contextBridge.exposeInMainWorld("gnhDesktop", ...)
```

`preload-bridge.cjs` validates only the object `main.mjs` returned over
`gnh:get-desktop-info` — it never reads `process.env`. `main.mjs` is the
single place that knows `app.isPackaged`; an independent env fallback here
(the previous argv-based design's actual bug) let a leftover dev-harness
variable (e.g. `GNH_ROLE=alice` exported in a terminal from prior testing)
leak into a packaged install's renderer just because that shell's
environment gets inherited.

## Delivery phases

| Phase | Scope | Networking host |
|---|---|---|
| A — now | Vite + sidecar (browser) | Node |
| B — desktop MVP | Electron + sidecar **child** (Alice/Bob share `:7901`) | Node child |
| B1 — Forge Linux | Embedded Vite `dist/` + Electron Forge zip/deb with bundled sidecar | Node child in package |
| B2 — later | Optional embed swarm in Electron main / pear-electron | In-process |
| C — mobile | Expo + Bare worklet | Bare |

Packaging runbook: `docs/builds/github-pages-and-desktop.md`.

## Wording

Prefer:

- “Electron desktop shell; Hyperswarm via a localhost sidecar child.”
- “Packaged builds use an ephemeral bridge port and a per-launch token.”
- “Close stops that app’s UI and, if it owns the sidecar, the swarm.”

Avoid:

- “The Electron renderer joins Hyperswarm.”
- “React Native desktop.”
- “Nitro Hyperswarm module.”
- Implying packaged installs are “Alice”.

See also: `mobile-p2p-runtime.md`, `holepunch-sidecar.md`, `pear-runtime.md`.
