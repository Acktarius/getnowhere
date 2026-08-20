# Packaged Desktop Identity

## Why

Installing the Linux package and running `getnowhere` from a terminal prints
`[desktop:alice]` and loads the session partition `persist:gnh-alice`. Nothing
about a shipped build is "Alice": the role is a dev-only two-instance harness for
localhost Alice/Bob testing, and its default leaked into packaged builds.

`desktop-electron/main.mjs` resolves `const ROLE = (process.env.GNH_ROLE ??
"alice").toLowerCase()`, and `GNH_ROLE` is set only by the `start:alice` /
`start:bob` scripts. Electron Forge packaging never sets it, so every end-user
launch falls through to the `alice` default. `desktop-electron/preload.cjs`
repeats the same fallback independently.

The same leak governs swarm posture, and there it collides with the product goal.
Get NowHere exists to give two people a private 1-to-1 space, so the app should
not leave predictable local artifacts. Today a packaged install advertises a
fixed bridge on `127.0.0.1:7901`, authenticates it with the constant token
`gnh-desktop-shared`, publishes that token to a predictable tmp lockfile, and
attaches to whatever is already listening rather than owning its own sidecar.
Every part of that is guessable from outside the process.

## What Changes

- Packaged builds carry no role. App name, `userData` directory, session
  partition, window title, and log prefix all drop the `alice` suffix; storage
  lands in `~/.config/getnowhere`.
- Packaged builds ignore the harness environment variables `GNH_ROLE`,
  `GNH_SWARM_MODE`, and `GNH_SIDECAR_TOKEN`. `HOLEPUNCH_HOST`, `HOLEPUNCH_PORT`,
  `GNH_UI_URL`, and `GNH_NODE_BIN` remain honored as operational escape hatches.
- Packaged builds bind an ephemeral loopback port instead of a fixed `7901`, so
  there is no stable local endpoint to look for.
- Packaged builds learn the bound port via Node IPC (`process.send`), not by
  scraping a human log line.
- Packaged builds authenticate the bridge with a `randomUUID()` token generated
  per launch, and write no token lockfile.
- Packaged builds always own the sidecar they talk to and never attach to a
  pre-existing listener.
- Packaged builds take a single-instance lock after `setPath('userData')` so two
  processes never share Chromium storage (wallet / L3 keys).
- The sidecar exits when its Electron parent dies (orphaned-swarm mitigation)
  and handles WebSocket server `error` events so a bind failure exits non-zero.
- The preload bridge exposes `role` only when the dev harness supplies one.
- Dev behavior is unchanged: `npm run desktop:alice` / `desktop:bob` keep their
  roles, shared `:7901` attach semantics, and isolated `:7902` for bob.

## Capabilities

- `desktop-shell-runtime`: packaged-versus-dev identity, storage location, and
  unpredictable bridge posture for the Electron shell — delta at
  `specs/desktop-shell-runtime/spec.md`.

## Impact

Affected code: `desktop-electron/main.mjs`, `desktop-electron/preload.cjs`, a new
`desktop-electron/desktop-identity.mjs`, `holepunch-sidecar/src/server.mjs`, and
the bridge type in `src/vite-env.d.ts`. No renderer logic changes —
`window.gnhDesktop.role` is never read in `src/`; the only bridge consumers are
`getUfwAdvisoryState()` and `getHolepunchWsUrl()` in
`src/services/p2p/HolepunchSidecarClient.ts`, which already take the URL as given.

No wire-format, topic-derivation, or crypto change. The L1/L2/L3 layering and the
sidecar bridge message schema are untouched. The sidecar gains an IPC listening
message and a parent-death exit path.

**No migration, and existing packaged data is orphaned by design.** All desktop
user state — the encrypted `wallet` blob, `gnh.contacts`, `gnh.invites`,
`gnh.roomCatalog`, and the `gnh.roomSessions` L3 key material — lives in
`localStorage` inside the session partition, on disk at
`~/.config/getnowhere-desktop-alice/Partitions/gnh-alice/`. Packaged builds now
start clean at `~/.config/getnowhere`. This is accepted: the project is in a
testing phase, and a migration tool would be the only work touching a directory
that holds a wallet and room keys. Operators remove the old tree with
`rm -rf ~/.config/getnowhere-desktop-alice ~/.config/getnowhere-desktop-bob`.
