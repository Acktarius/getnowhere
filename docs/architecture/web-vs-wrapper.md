# Web, desktop, and mobile hosts

This project is built as a **web-first** application. Daily work uses the Vite
app (`npm run dev`). Packaged hosts:

| Host | Role |
|---|---|
| Browser + `holepunch-sidecar/` | Web-dev UI + Hyperswarm |
| `desktop-electron/` | Desktop shell (Alice/Bob testing today) |
| `native-wrapper/` | Mobile Expo + Bare (target) + EAS store delivery |

## Purpose

Keep product development fast in Vite while packaging desktop and mobile
separately. Expo.dev / EAS is for mobile binaries and store submission.
Electron is for desktop. Neither UI host imports `hyperswarm`.

## Web app (product UI)

Product UI and domain logic live at the **repo root** (`src/`, Vite config,
root `package.json`) — there is no top-level `web/` folder.

It should contain:

- React UI, routes, pages, and components
- State management and client-side business logic
- Invitation, relationship, and chat flows
- Wallet integration adapters
- Shared TypeScript types, utilities, and service modules
- Bridge **client** only for P2P (`HolepunchSidecarClient`) — no Hyperswarm
- Build output for browser and for loading inside Electron / optional WebView

Rules:

- Use `npm run dev` for normal development
- Keep the app deployable as a normal static web project
- Avoid tight coupling to Expo or Electron APIs in `src/`
- Keep product logic here unless a host-specific API is truly required

## Desktop shell

`desktop-electron/` loads the Vite UI in a BrowserWindow, isolates Alice/Bob
storage partitions, and attaches to (or owns) the localhost Hyperswarm sidecar
child. See `docs/architecture/electron-desktop.md`.

## Local wipe (Settings)

Settings exposes two wipe actions, both implemented in
`src/services/storage/appDataLifecycle.ts` via `StorageAdapter` key-list
`removeItem` (not a full storage clear). Confirms use shared `ConfirmModal`
(not `window.confirm`).

| Action | Clears | Keeps |
|---|---|---|
| **Delete wallet** | Wallet-tied keys (`wallet`, contacts, invites, rooms, …) | App prefs (`gnh.settings`, theme, etc.) |
| **Reset app data** | Wallet-tied keys **plus** prefs and side channels (`ccx-*`) | Nothing local for this identity |

**Nav Exit** (bottom bar) is **not** a wipe: it saves the wallet blob (and chat
text when Local message retention is on), soft-leaves Holepunch, locks keys out
of memory, and returns to welcome/open. Use `leaveRoom` for leave-forever.

All hosts use the same UI path. Electron isolation is partition-scoped
`localStorage` (Alice/Bob / packaged `persist:gnh`) — this change does not add
a separate IPC wipe.

## Mobile wrapper

`native-wrapper/` is the Expo shell for iOS/Android packaging (EAS Build /
Submit). Hyperswarm on mobile is a **Bare worklet**, not WebView JS. See
`docs/architecture/mobile-p2p-runtime.md`.

It should contain:

- `app.json` / `eas.json`, bundle ids, icons, splash
- Bare worklet host + bridge (when implemented)
- Optional WebView only as a UI shell — never as the swarm host

Rules:

- Keep it thin; do not duplicate product logic from `src/`
- Put Expo and EAS commands here, not in the root web app scripts (except
  convenience wrappers)
- Treat wrapper changes as release-engineering unless they change runtime
  behavior documented elsewhere

## Packaged desktop (Ubuntu)

CI builds Vite `dist/`, then a Linux **Electron Forge** zip/deb that embeds that
UI (`resources/ui`) plus a bundled Hyperswarm sidecar. The packaged app does
**not** load GitHub Pages at runtime. One-click desktop does **not** put
Hyperswarm in the renderer. Details: `docs/builds/github-pages-and-desktop.md`.

## Decision boundary

| Put it in… | When |
|---|---|
| `src/` | Product UX, domain logic, wallet, protocol, bridge client, encryption L1/L3 |
| `holepunch-sidecar/` | Web-dev Hyperswarm host + WS bridge server |
| `desktop-electron/` | Electron window lifecycle, Alice/Bob partitions, sidecar child ownership |
| `native-wrapper/` | Expo/EAS packaging, Bare worklet host, store metadata |

## Networking architecture

Hyperswarm stays **out of the Vite / UI bundle**.

- **Web-dev:** Vite ↔ WebSocket ↔ `holepunch-sidecar/`
- **Desktop:** Vite in Electron renderer ↔ same bridge schema ↔ sidecar child
  (MVP) or main / Pear-end later — `electron-desktop.md`
- **Mobile:** Expo UI ↔ same bridge ↔ Bare worklet — `mobile-p2p-runtime.md`

Crypto (max security): L1 SmartMessage derive → L2 Hyperswarm Noise → L3
ChaCha20-Poly1305 E2E before the bridge — `docs/security/encryption.md`.

Further detail:

- `holepunch-sidecar.md` — live bridge schema
- `pairing-and-topics.md` — sole `topicRef` formula
- `folder-structure.md` — tree map
- `pear-runtime.md` — runtime responsibilities

## Commands

Web-dev:

```bash
npm install
npm run holepunch:install
npm run holepunch   # optional if Electron owns the sidecar
npm run dev
npm run build
npm run preview
```

Desktop:

```bash
npm run desktop:install
npm run desktop:alice
npm run desktop:bob
```

Mobile wrapper:

```bash
cd native-wrapper
npm install
npx eas build:configure
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

## Documentation rule

Any change that moves responsibility across `src/`, `holepunch-sidecar/`,
`desktop-electron/`, or `native-wrapper/` must update this file and
`folder-structure.md` in the same branch.

## Project wording

> Get Now Here is developed as a web-first application. Local work happens with
> `npm run dev`. Packaged desktop uses Electron. Mobile uses Expo + Bare.
> Expo.dev / EAS covers store delivery.

### Networking phrasing

Prefer:

- “Vite UI plus a Pear-shaped Node Hyperswarm sidecar (web-dev).”
- “Desktop: Electron shell; shared localhost sidecar for Alice/Bob testing.”
- “Mobile: Expo UI plus a Bare Hyperswarm worklet behind the same bridge.”
- “L1 SmartMessage secret → L2 Noise transport → L3 ChaCha E2E on frames.”
- “Topics come only from `deriveTopicRef`.”

Avoid:

- Referring to a top-level `web/` folder (use `src/`)
- “The UI / WebView / renderer joins Hyperswarm”
- “Noise alone is enough for chat plaintext across the bridge”
- “React Native desktop” / “Nitro Hyperswarm”
- Public room names as topics; trusting peers from topic join alone
- Alternate `topicRef` formulas unless protocol + `ids.ts` change together
