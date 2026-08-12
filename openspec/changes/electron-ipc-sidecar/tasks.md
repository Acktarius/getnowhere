# Tasks

## 1. Sidecar IPC transport (TDD)

- [x] 1.1 Add failing tests in `holepunch-sidecar/test/` for IPC mode: listens on
  `GNH_IPC_PATH`, sends `{ type: "listening", transport: "ipc", path }` over Node
  child IPC, NDJSON command round-trip (`ping`/`pong`), oversize line rejection,
  join-gated frames, stale Unix socket cleanup. Verify with
  `npm run holepunch:test`.
- [x] 1.2 Add `ipc-path.mjs` and `bridge-ipc.mjs`; refactor `server.mjs` to route
  WS and IPC through shared `handleBridgeClient`. Gate WS bind on
  `GNH_BRIDGE_TRANSPORT !== 'ipc'` (or allow dual only when explicitly needed).
  Make 1.1 pass.

## 2. Electron main IPC client

- [x] 2.1 Add failing unit tests for `desktop-electron/sidecar-ipc-client.mjs`:
  connect retry, NDJSON send/receive, event dispatch, cleanup on close. Verify
  with `npm --prefix desktop-electron test`.
- [x] 2.2 Implement `sidecar-ipc-client.mjs` and IPC path generation in `main.mjs`
  (platform-specific path, unique session id). Spawn sidecar with
  `GNH_BRIDGE_TRANSPORT=ipc` and `GNH_IPC_PATH`. Wait for IPC listening message.
  High-risk (bridge transport) — per-task review.
- [x] 2.3 Register `gnh:sidecar-command` / `gnh:sidecar-event` with webContents
  sender validation. Wire shared-mode IPC path lockfile handoff (extend token
  lockfile pattern). Make 2.1 pass.

## 3. Preload + UI backend

- [x] 3.1 Extend `preload-bridge.cjs` tests: IPC mode exposes `bridgeTransport:
  'ipc'`, `sendCommand`, `onBridgeEvent`; WS mode unchanged. Verify with
  `npm --prefix desktop-electron test`.
- [x] 3.2 Extend self-contained `preload.cjs` with IPC bridge (mirror
  `preload-bridge.cjs`). Update `GnhDesktopBridge` in `src/vite-env.d.ts`.
- [x] 3.3 Add `createElectronIpcSidecarBackend()` and backend selection in
  `HolepunchSidecarClient.ts` (mobile → electron IPC → websocket). Add unit tests
  for backend selection. Verify with `npm test` and `npm run types`.

## 4. Documentation

- [x] 4.1 Update `docs/architecture/local-bridge-transport.md` — mark IPC as
  in-progress/shipped for desktop; clarify web-dev stays WS, future browser prod
  may use `wss://`.
- [x] 4.2 Update `docs/architecture/electron-desktop.md` and
  `docs/architecture/holepunch-sidecar.md` with IPC transport, env vars, bootstrap
  message, preload API, and shared attach path lockfile.

## 5. Verify

- [ ] 5.1 Run `npm test`, `npm run holepunch:test`,
  `npm --prefix desktop-electron test`, `npm run types`, `npm run build`.
- [x] 5.2 Manual: `npm run desktop:alice` — IPC sidecar listen/connect, UI load,
  clean shutdown (shared mode smoke, 2026-08-12). Remaining: isolated Alice/Bob
  L2 peer connect if not yet exercised.
- [ ] 5.3 Manual: web-dev regression — `npm run holepunch` + `npm run dev` still
  connects via `ws://127.0.0.1:7901`.
