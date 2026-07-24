# Coding Constraints (AI / codegen)

Paste or cite this when generating Get Now Here code so tools stop emitting
browser Hyperswarm usage or inventing alternate bridge/topic shapes.

## Coding constraints

When generating code for Get Now Here, follow these rules strictly:

- Use **TypeScript, React, and Vite** for the web UI (`src/`).
- Treat the Vite app as a **static UI bundle** — not a Hyperswarm host.
- Do **not** import or initialize `hyperswarm` in UI code (Vite renderer or Hermes).
- Platforms:
  - **Web-dev:** `holepunch-sidecar/` (Node) over WebSocket.
  - **Desktop:** Electron — Hyperswarm in main / Pear-end; Vite in renderer
    (`docs/architecture/electron-desktop.md`). Prefer pear-electron + pear-bridge
    alignment when packaging.
  - **Mobile:** Expo UI + Bare worklet (`docs/architecture/mobile-p2p-runtime.md`).
- Do **not** use React Native for the desktop app.
- Do **not** implement Hyperswarm as a Nitro / custom native module.
- Bridge messages must match the **live** schema in
  `HolepunchSidecarClient.ts` / `docs/architecture/holepunch-sidecar.md`
  (`join` / `leave` / `frame` / `ready` / `peers` / `error`).
- Topic derivation: **only**
  `sha256Hex(\`gnh-chat-v1||${roomId}||${relationshipId}\`)` via `deriveTopicRef`.
- Prefer **ChaCha20-Poly1305** for app-layer content envelopes (L3 E2E) per
  `encryption.md` / `p2pchatprotocol.md`. Runtime carries opaque sealed frames.
- Rely on Hyperswarm **Noise** for DHT transport (L2); do not re-wrap the live
  stream with a third ad hoc cipher.
- Do not remove L3 seal/open “because Noise exists” — the bridge/runtime is
  untrusted for plaintext under the max-security threat model.
- Product UI paths are under `src/` (not a `web/` folder).
- **Comments:** prefer JSDoc; keep prose to **≤2 lines**. Longer guidance belongs in
  `docs/` with a `@see` pointer — see `.cursor/rules/code-comments.mdc`.

## Expected output shape

1. bridge client matching live SidecarCommand / SidecarEvent types
2. runtime swarm manager (sidecar, Electron main, or Bare) — not UI Hyperswarm
3. `deriveTopicRef` only as implemented
4. ChatTransport backend swap (WS / IPC / Bare IPC)
5. UI that reacts to room lifecycle from services

## Avoid these mistakes

- direct Hyperswarm in React hooks for browser/renderer/Hermes execution
- React Native desktop shell
- Nitro-as-Hyperswarm
- dual topic formulas or `inviteSecret` topics
- new bridge `type` strings without updating sidecar + docs together

## Product phrasing

Prefer the wording in `docs/architecture/web-vs-wrapper.md` § Networking phrasing.

Canonical docs:

- `docs/architecture/electron-desktop.md`
- `docs/architecture/mobile-p2p-runtime.md`
- `docs/architecture/holepunch-sidecar.md`
- `docs/architecture/pear-runtime.md`
- `docs/architecture/pairing-and-topics.md`
- `docs/architecture/folder-structure.md`
