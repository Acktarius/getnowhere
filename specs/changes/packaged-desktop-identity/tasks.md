# Tasks

## 1. Identity resolver

- [x] 1.1 Add `desktop-electron/test/desktop-identity.test.mjs` covering the
  decision table: packaged yields `role: null`, `[desktop]`, `getnowhere`,
  `persist:gnh`, `isolated`, `port: 0`, `usesEphemeralPort: true`,
  `usesTokenLock: false`, `singleInstance: true`; packaged ignores
  `GNH_ROLE=bob`, `GNH_SWARM_MODE=shared`, and `GNH_SIDECAR_TOKEN`; packaged with
  `HOLEPUNCH_PORT` set uses that port and `usesEphemeralPort: false`; dev
  defaults reproduce `alice` / `persist:gnh-alice` / `shared` / `7901` /
  `singleInstance: false`; dev `GNH_ROLE=bob` with `GNH_SWARM_MODE=isolated`
  yields `persist:gnh-bob` and `7902`. Tests fail because the module does not
  exist. Verify with `npm --prefix desktop-electron test`.
- [x] 1.2 Add `desktop-electron/desktop-identity.mjs` exporting
  `resolveDesktopIdentity({ isPackaged, env })` per `design.md` D1–D2, reading
  only the injected `env`. Make 1.1 pass.

## 2. Sidecar IPC, bind failure, and parent-death exit

- [x] 2.1 Add `holepunch-sidecar` tests: with `HOLEPUNCH_PORT=0` and an IPC
  channel, the child sends `{ type: "listening", host, port }` with a real
  non-zero port and logs that port; with the port already bound, the process
  logs an address conflict and exits non-zero; with a fake parent PID that
  disappears (or a unit hook), the sidecar exits. Verify with
  `npm run holepunch:test`.
- [x] 2.2 In `holepunch-sidecar/src/server.mjs`: report `wss.address().port` in
  the log; `process.send` the listening message when `process.send` exists; add
  `wss.on("error")` that logs and exits non-zero; watch parent death
  (`process.ppid` poll and/or Linux `PR_SET_PDEATHSIG`) and exit. Make 2.1 pass.

## 3. Electron shell wiring

- [x] 3.1 Replace the `ROLE` / `ROLE_LABEL` / `SWARM_MODE` constants in
  `desktop-electron/main.mjs` with a single `resolveDesktopIdentity` call, and
  route `app.setName`, the `userData` path, `log()`, `windowTitle()`, and the
  `createWindow` partition through it. Packaged title omits the mode tag.
  After `setPath('userData')`, when `singleInstance` is true, call
  `app.requestSingleInstanceLock()`; if false, exit; on `second-instance`,
  restore/focus the existing window. Verify: `npm --prefix desktop-electron test`
  stays green.
- [x] 3.2 Teach `spawnSidecar` the ephemeral IPC handshake: when
  `usesEphemeralPort`, spawn with `stdio` that includes `'ipc'` (stdout/stderr
  inherit), wait for `{ type: 'listening', port }` under a bounded timeout, and
  build the bridge URL from the reported port. Keep `stdio: "inherit"` plus
  `waitForPort` for dev. Do not create the window until the handshake
  succeeds. High-risk (bridge transport) — per-task review.
- [x] 3.3 Make packaged builds always own their sidecar: skip the attach branch
  in `ensureLocalSwarm`, gate `writeTokenLock` / `readTokenLock` /
  `clearTokenLock` on `usesTokenLock`, and use `randomUUID()` for the token.
  High-risk (bridge auth) — per-task review.
- [x] 3.4 Omit the `--gnh-role=` argument and the `role` key of
  `window.__GNH_DESKTOP__` when packaged; drop the `|| "alice"` fallback in
  `desktop-electron/preload.cjs` so `role` is exposed only when supplied; make
  `role` optional in the `GnhDesktopBridge` type in `src/vite-env.d.ts`. Verify
  with `npm run types`.
  - [x] 3.4.1 Follow-up fix (found on code review): `preload.cjs` still had
    `|| process.env.GNH_ROLE` / `GNH_SIDECAR_TOKEN` / `GNH_HOLEPUNCH_WS_URL`
    fallbacks, independent of `app.isPackaged`. Since a packaged launch
    inherits the invoking shell's environment, a leftover
    `GNH_ROLE=alice` from a prior dev-harness session in the same terminal
    would still leak into a packaged bridge — the exact symptom reported.
    Extracted pure `desktop-electron/preload-bridge.cjs`
    (`buildGnhDesktopBridge(argv)`, no `electron` import, no `env` read at
    all) and added `desktop-electron/test/preload-bridge.test.mjs` proving
    ambient `GNH_ROLE`/`GNH_SIDECAR_TOKEN`/`GNH_HOLEPUNCH_WS_URL` cannot
    reach the bridge regardless of CLI args. Also removed dead
    double-assignment of `authToken` in `main.mjs` (computed from
    `GNH_SIDECAR_TOKEN` then unconditionally overwritten when packaged).
    Verified with `npm --prefix desktop-electron test`.
  - [x] 3.4.2 Follow-up hardening (requested after 5.2 passed): the bridge
    token/URL/role still reached the renderer via `additionalArguments`
    (readable from this process's command line via `/proc/<pid>/cmdline` or
    `ps` by any co-resident process) and via a redundant
    `executeJavaScript` write of `window.__GNH_DESKTOP__` into the page's
    main-world scope (more exposed to page-level XSS than the isolated
    preload world). Replaced both with a synchronous IPC round-trip
    (`gnh:get-desktop-info`, `ipcRenderer.sendSync`) scoped to the window's
    own `webContents`; rewrote `preload-bridge.cjs` to normalize and
    validate the IPC reply's shape (still no `electron` import, still no
    `env` read) instead of parsing argv; removed `window.__GNH_DESKTOP__`
    from `src/vite-env.d.ts` and `HolepunchSidecarClient.ts` since it's now
    dead. Verified with `npm --prefix desktop-electron test`, `npm test`,
    `npm run types`.

## 4. Documentation

- [x] 4.1 Update `docs/architecture/electron-desktop.md` with a packaged-versus-dev
  table, mark harness env as ignored when packaged, document ephemeral port,
  IPC handoff, single-instance lock, and `~/.config/getnowhere` (plus stale
  SingletonLock note).
- [x] 4.2 Update `docs/architecture/holepunch-sidecar.md` with the IPC listening
  message, parent-death exit, bind-failure exit, and packaged token posture;
  note orphaned `getnowhere-desktop-alice` data in
  `docs/builds/github-pages-and-desktop.md`.

## 5. Verify

- [x] 5.1 Run `npm test`, `npm run holepunch:test`,
  `npm --prefix desktop-electron test`, `npm run types`, and `npm run build`.
- [ ] 5.2 Packaged acceptance (manual, needs a display): build with
  `npm run desktop:make`, install, run `getnowhere` from a terminal, and confirm
  the log prefix is `[desktop]`, the title is `Get Now Here`, the sidecar port is
  ephemeral, storage lands in `~/.config/getnowhere`, no `gnh-sidecar-*.token`
  appears, and a second launch focuses the first window.
- [ ] 5.3 Dev regression: run `npm run desktop:alice` and `npm run desktop:bob`
  together and confirm unchanged roles, titles, partitions, and shared `:7901`
  attach behavior.
