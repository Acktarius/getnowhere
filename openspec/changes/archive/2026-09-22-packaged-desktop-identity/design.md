# Design — Packaged Desktop Identity

## Context

`desktop-electron/main.mjs` derives eleven behaviors from a single `ROLE`
constant that defaults to `alice`. The dev harness sets `GNH_ROLE` explicitly;
packaged builds never do, so the default ships. The fix is not to change the
default string but to make the role a dev-only concept that packaged builds do
not participate in.

`main.mjs` imports `electron` at module scope and cannot be loaded by
`node --test`. `desktop-electron/firewall-status.mjs` already establishes the
pattern of extracting testable logic into a plain module; this change follows it.

Independent review (session subagent) required three blocking changes relative to
an earlier draft: reinstate single-instance lock for packaged builds, hand off
the ephemeral port via Node IPC (not log scraping), and exit the sidecar when
the Electron parent dies.

## Decisions

### D1 — One pure resolver module

`desktop-electron/desktop-identity.mjs` exports
`resolveDesktopIdentity({ isPackaged, env })` returning:

| Field | Packaged | Dev |
| --- | --- | --- |
| `role` | `null` | `env.GNH_ROLE` lowercased, default `alice` |
| `logPrefix` | `[desktop]` | `[desktop:alice]` |
| `appName` | `getnowhere` | `getnowhere-desktop-alice` |
| `userDataDirName` | `getnowhere` | `getnowhere-desktop-alice` |
| `partition` | `persist:gnh` | `persist:gnh-alice` |
| `titleBase` | `Get NowHere` | `Get NowHere — Alice` |
| `showsModeTag` | `false` | `true` |
| `swarmMode` | `isolated` | `env.GNH_SWARM_MODE`, default `shared` |
| `host` | `env.HOLEPUNCH_HOST` or `127.0.0.1` | same |
| `port` | `env.HOLEPUNCH_PORT` or `0` | `7901`, or `7902` for isolated bob |
| `usesEphemeralPort` | `true` unless `HOLEPUNCH_PORT` set | `false` |
| `usesTokenLock` | `false` | `true` |
| `singleInstance` | `true` | `false` |

The resolver takes `env` as a parameter rather than reading `process.env`
directly, so tests drive it without mutating global state.

Alternative rejected: inline `app.isPackaged` conditionals at each of the eleven
sites in `main.mjs`. That spreads the decision table across the file and leaves
it untestable.

### D2 — Packaged ignores harness environment variables

`GNH_ROLE`, `GNH_SWARM_MODE`, and `GNH_SIDECAR_TOKEN` are read only when
`isPackaged` is false. Honoring harness knobs in shipped builds is precisely the
mechanism that produced this bug, and `GNH_SIDECAR_TOKEN` in particular would let
an ambient environment variable pin the bridge token to a predictable value.

`HOLEPUNCH_HOST`, `HOLEPUNCH_PORT`, `GNH_UI_URL`, and `GNH_NODE_BIN` stay honored
in both modes as operational overrides. `GNH_HOLEPUNCH_WS_URL` remains an
operational override when set (same as today); it is not a harness role knob.

### D3 — Ephemeral port, chosen for privacy

The product goal is a private 1-to-1 space, so the shipped app should not present
a stable local endpoint. A packaged build passes `HOLEPUNCH_PORT=0`; the kernel
assigns a free loopback port and the sidecar reports it back. Combined with the
per-launch `randomUUID()` token and no lockfile, nothing about the local bridge
is guessable between launches.

This removes the need for a free-port precondition and the need to distinguish
"my child bound it" from "someone else did" — `waitForPort` cannot make that
distinction, which is what made a fixed port unsafe once packaged builds stopped
attaching.

Threat model note: ephemeral port + random token mitigates **guessable** bridge
posture (docs-driven attach to `7901` + `gnh-desktop-shared`). It does not stop
a same-user attacker who can enumerate sockets or read argv. That is accepted
defense-in-depth, not strong local isolation.

Alternative rejected: keep `7901` and refuse to start when occupied — preserves a
documented, predictable endpoint.

### D4 — Port handoff via Node IPC (not stdout scrape)

When `usesEphemeralPort`, main spawns the sidecar with an IPC channel
(`stdio` includes `'ipc'`), stdout/stderr stay `inherit` for terminal UX, and
the sidecar `process.send({ type: 'listening', host, port })` once
`wss.address()` is known. Main waits for that message with a bounded timeout,
then builds the bridge URL. Dev keeps `stdio: "inherit"` (no IPC) and
`waitForPort`.

The sidecar still logs `wss.address().port` (not the requested `0`) for humans.

Alternative rejected: scrape a human log line from piped stdout — couples
startup to prose, risks partial chunks / format drift, and can deadlock if the
pipe is not drained. Alternative rejected: parent pre-bind port 0 then hand off
— TOCTOU.

### D5 — Packaged single-instance lock

Packaged builds call `app.requestSingleInstanceLock()` **after**
`app.setName` / `app.setPath('userData', …)` and before `whenReady`. If the lock
is not acquired, the process exits without spawning a sidecar. On
`second-instance`, the existing window is restored and focused.

Ephemeral ports avoid TCP bind collisions; they do **not** isolate Chromium
DOM Storage / LevelDB under one `userData` + `persist:gnh`. Without the lock,
two packaged launches share wallet and L3 room keys and can run two sidecars on
the same session state.

Dev stays unlocked so Alice/Bob can run with different `userData` trees.

### D6 — Sidecar exits when parent dies

If Electron main is `SIGKILL`’d, graceful `stopOwnedSwarm` never runs and the
child can stay up under init with Hyperswarm still live. Owned sidecar spawns
enable parent-death watching: poll whether the **start-time parent PID** is
still alive (`kill(pid, 0)`; EPERM counts as alive). Skip the watch if that
PID is unusable at start. Do **not** exit on bare `process.ppid` changes
(v0.1.7 false-kill under Electron). Document that graceful shutdown alone is
insufficient. See also D10.

### D7 — Sidecar bind-failure handling

`new WebSocketServer({ host, port })` has no `error` listener, and an `error`
event with no listener throws. An explicit `HOLEPUNCH_PORT` override can still
collide, so the handler stays in scope.

### D8 — No migration

All desktop state is partition-scoped `localStorage` (and other partition state
under `Partitions/…`), including the encrypted `wallet` blob and
`gnh.roomSessions` L3 key material, so renaming `userData` and the partition
orphans it. Accepted for the current testing phase.

### D9 — Window only after bridge ready

`createWindow` runs only after the port handoff (or `waitForPort`) and token are
known. That ordering must not regress when ephemeral IPC is added.

### D10 — Sandboxed preload is a single file

`webPreferences.sandbox: true` polyfills `require` for `electron` (and a few
Node builtins) only. `preload.cjs` MUST NOT `require("./preload-bridge.cjs")`
or any other local module — that throw aborts before
`contextBridge.exposeInMainWorld`, leaving `window.gnhDesktop` undefined.

Keep pure helpers self-contained in `preload.cjs`. Mirror them in
`preload-bridge.cjs` for `node --test` only (or bundle preload later).

Bridge delivery: prefer `additionalArguments` (proven v0.1.6), with sync IPC
`gnh:get-desktop-info` as secondary. IPC-only (an earlier hardening pass) can
miss on sandboxed `about:blank`; empty defaults then reconnect-loop on `:7901`
while the real sidecar is ephemeral.

Parent-death (D6 follow-up): exit only when the **start-time parent PID** is
gone (`kill(pid, 0)`; EPERM = alive). Do not exit on bare `process.ppid`
changes — that false-killed packaged sidecars under Electron.

## Risks

| Risk | Mitigation |
| --- | --- |
| Existing installs lose wallet access | Release-note callout; seed export is the recovery path |
| IPC listening message never arrives | Bounded timeout, then fail with clear error |
| Stale `SingletonLock` after hard kill | Document Linux cleanup under `~/.config/getnowhere` |
| Dev harness regression | Resolver tests assert alice/bob/shared/isolated values |
| `role` removal breaks a renderer consumer | Verified none exists |
| Sandboxed preload `require` of local files | D10 — self-contained `preload.cjs`; bridge helpers mirrored for unit tests only |
