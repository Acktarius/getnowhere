# Tasks

## 1. Preserve post-accept messaging
- [ ] 1.1 Add lifecycle/catalog regression tests covering post-accept bootstrap
  downgrade and durable `connect_failed` state in
  `tests/protocol/composer-gate.test.ts` and
  `tests/p2p/holepunch-chat-transport.test.ts`; verify with
  `npx vitest run tests/protocol/composer-gate.test.ts tests/p2p/holepunch-chat-transport.test.ts`.
- [ ] 1.2 Update
  `src/services/p2p/HolepunchChatTransport.ts` and
  `src/services/p2p/roomCatalogStore.ts` so bootstrap hydration is monotonic
  after acceptance and failure/error state is persisted; make the new tests
  pass.

## 2. Bound Holepunch reconnect work
- [ ] 2.1 Add transport tests proving concurrent connect/restore calls share one
  attempt and a completed/failed attempt releases the single-flight guard.
- [ ] 2.2 Implement per-room single-flight connection/restoration in
  `src/services/p2p/HolepunchChatTransport.ts`, and adjust
  `src/screens/chats/ChatRoomScreen.tsx` polling so it does not create
  overlapping retries; verify focused transport tests.
- [ ] 2.3 Change `HOLEPUNCH_CONNECT_TIMEOUT_MS` to 120 seconds in
  `src/services/p2p/holepunchPolicy.ts`, update policy assertions in
  `tests/protocol/composer-gate.test.ts`, and verify with the focused test.

## 3. Clarify fallback status and operations
- [ ] 3.1 Update `src/screens/chats/ChatRoomScreen.tsx` and status copy so
  `Connecting` explicitly means Holepunch and chain wording describes only the
  message fallback; add `e2e/holepunch-fallback.spec.ts` to exercise the
  post-accept connecting/failed UI and prove the composer remains enabled.
- [ ] 3.2 Add a privilege-free Linux UFW detector in
  `desktop-electron/firewall-status.mjs`, expose its read-only advisory through
  `desktop-electron/main.mjs`, `desktop-electron/preload.cjs`, and
  `src/vite-env.d.ts`, and render a conditional warning in chat diagnostics
  after retryable Holepunch failure. Cover active, inactive, unknown, missing,
  and permission-denied results in
  `desktop-electron/test/firewall-status.test.mjs`; verify with
  `npm --prefix desktop-electron test`.
- [ ] 3.3 Update `docs/architecture/holepunch-sidecar.md`,
  `docs/architecture/electron-desktop.md`, and
  `docs/security/p2pchatprotocol.md` with reconnect policy and same-LAN
  requirements (UDP, DHT bootstrap/internet, matching topic, firewall), plus
  the limits of the Electron UFW advisory.

## 4. Verify the complete change
- [ ] 4.1 Run `npm test`, `npm run holepunch:test`, `npm run types`, and
  `npm --prefix desktop-electron test`, and `npm run build`; resolve regressions
  introduced by this change.
- [ ] 4.2 Run `forge e2e run` and require a green current product-loop result
  proving post-accept fallback behavior through the production UI entry point.
- [ ] 4.3 Perform the two-machine Alice/Bob acceptance: while Holepunch is
  connecting or times out, verify lifecycle never returns to `pending`, the
  composer remains usable through L1 relay, attempt count does not stack, and
  status copy distinguishes Holepunch from chain fallback. On Linux with UFW
  detected active, verify the advisory appears without requesting privileges.
