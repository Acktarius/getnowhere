# Get NowHere Docs

This `/docs` directory is the source of truth for project structure, workflow,
protocol, security, and release decisions.

**Branding:** user-facing name is **Get NowHere** (dual-read: *now here* / *nowhere*).
Technical identifiers stay `getnowhere` / `im.getnowhere.app`.

Architecture one-liner: **Vite UI + Hyperswarm behind a typed bridge.** Web-dev:
Node sidecar. Desktop: Electron (+ localhost sidecar MVP). Mobile: Bare worklet.
Crypto: L1 SmartMessage (+ session seal) → L2 Noise; L1′ relay when L2 is down.
No L3. UI never joins Hyperswarm.

## Reading order

1. `architecture/web-vs-wrapper.md` — hosts and boundaries (`src/`, not `web/`)
2. `architecture/folder-structure.md`
3. `architecture/electron-desktop.md` — desktop Alice/Bob runbook
4. `architecture/mobile-p2p-runtime.md` — mobile Bare decision
5. `architecture/holepunch-sidecar.md` — live bridge schema
5b. `architecture/local-bridge-transport.md` — ws/wss/IPC policy and roadmap
5c. `architecture/holepunch-bridge-errors.md` — bridge `{ type: "error" }` codes
6. `architecture/pear-runtime.md`
7. `architecture/pairing-and-topics.md` — shipped v1 `topicRef` formula
7b. `security/capabilities-and-derivation.md` — ids as capabilities, v2 HKDF targets
8. `security/encryption.md` — threat model + L1 / L1′ / L2
9. `security/p2pchatprotocol.md`
10. `builds/expo-eas-android-build.md` — Android APK (primary mobile runbook)
10b. `builds/expo-eas-ios-build.md`
10c. `builds/github-pages-and-desktop.md` — Pages (browser) + Linux Electron with embedded UI
11. `features/lite-wallet.md`
12. `features/invitations.md`
13. `features/chat-relay.md` — L1′ fallback when L2 is down (grey bubbles)
13b. `features/local-background-notifications.md` — mobile local L1/L1′ badges + banners
13c. `background-remote-sync.md` — WorkManager / BGAppRefresh → wallet sync
14. `features/app-access-and-data-unlock.md` — mobile biometrics (app vs data)
15. `prompts/coding-constraints.md`

## Rules

- Read the relevant doc before changing code in that area.
- Update the matching doc in the same branch when changing architecture,
  protocol, storage, routing, build, or security behavior.
- Do not treat chat prompts as the final source of truth; stable decisions must
  be copied here.
- Do not invent bridge message types or topic formulas in codegen — match live
  docs/code.

## Structure

- `architecture/` — repo boundaries and system shape
- `builds/` — native wrapper and App Store delivery
- `decisions/` — accepted ADRs (spend policy, etc.)
- `features/` — product behavior and user-facing flows
- `security/` — encryption, key handling, and protocol details
- `prompts/` — durable coding constraints for AI / codegen tools
