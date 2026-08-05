# Folder Structure

## Product wording (architecture)

Get NowHere uses a **Vite UI** with a **Hyperswarm runtime behind a typed bridge**.

| Surface | UI host | Hyperswarm host |
|---|---|---|
| Web-dev | Vite in browser | `holepunch-sidecar/` (Node) |
| Desktop | Vite in Electron renderer | Electron main / Pear-end |
| Mobile | Expo | Bare worklet |

- Topics only via `deriveTopicRef` (`pairing-and-topics.md`).
- Bridge schema: `holepunch-sidecar.md` (live).
- Decisions: `electron-desktop.md`, `mobile-p2p-runtime.md`.

## Current repository layout

```text
getnowhere/
  src/                      # React + Vite UI (static bundle)
    services/
      p2p/                  # bridge client / ChatTransport — no hyperswarm
      protocol/ids.ts       # deriveTopicRef (canonical)
    features/
  holepunch-sidecar/        # Node Hyperswarm host + WebSocket bridge (web-dev)
    src/
      swarm.mjs
      server.mjs
  native-wrapper/           # Expo shell + Bare worklet host (mobile); WebView UI scaffold
  desktop-electron/         # Electron shell (Alice/Bob + localhost swarm child)
    main.mjs
    desktop-identity.mjs    # packaged vs Alice/Bob decision table
    preload.cjs             # self-contained sandboxed preload → gnhDesktop
    preload-bridge.cjs      # test mirror of preload normalize/resolve helpers
    forge.config.cjs        # Linux Forge package (sidecar as extraResource)
    scripts/prepare-sidecar.mjs
  docs/
    architecture/
    builds/
      github-pages-and-desktop.md
    security/
    features/
    prompts/
```

### Layer rule

| Layer | Location | May depend on Hyperswarm? |
|---|---|---|
| UI | `src/` (Vite) | **No** — bridge client only |
| Runtime (web-dev) | `holepunch-sidecar/` | **Yes** |
| Runtime (desktop target) | `desktop-electron/` main / Pear-end | **Yes** |
| Runtime (mobile target) | Bare bundle in `native-wrapper/` | **Yes** |
| Shared protocol helpers | `src/services/protocol`, types | Types/crypto only; no swarm join |
| Mobile wrapper | `native-wrapper/` | Hosts Bare worklet + bridge |
| Desktop shell | `desktop-electron/` | Hosts Hyperswarm + loads Vite UI |

Do not move or rename these top-level product folders without updating this
file in the same branch.

## Recommended monorepo target (optional later)

Only if the repo is actually split. **Do not** invent `apps/ui` paths in codegen
while the UI still lives in root `src/`.

```text
getnowhere/
  apps/
    ui/                 # today’s src/
    runtime-web/        # today’s holepunch-sidecar
    runtime-desktop/    # today’s desktop-electron main
    runtime-bare/       # Bare Pear-end for mobile
    mobile/             # Expo shell
  packages/
    shared/             # bridge types, deriveTopicRef, protocol
  docs/
```

### Rule

UI code (Vite renderer, Expo UI) may depend on shared types + bridge client only.
Any direct Hyperswarm dependency belongs in a runtime package. No Nitro
Hyperswarm modules. No React Native desktop shell.
