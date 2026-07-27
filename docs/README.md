# Get Now Here Docs

This `/docs` directory is the source of truth for project structure, workflow,
protocol, security, and release decisions.

Architecture one-liner: **Vite UI + Hyperswarm behind a typed bridge.** Web-dev:
Node sidecar. Desktop: Electron (+ localhost sidecar MVP). Mobile: Bare worklet.
Crypto: L1 SmartMessage derive → L2 Noise → L3 ChaCha E2E. UI never joins
Hyperswarm.

## Reading order

1. `architecture/web-vs-wrapper.md` — hosts and boundaries (`src/`, not `web/`)
2. `architecture/folder-structure.md`
3. `architecture/electron-desktop.md` — desktop Alice/Bob runbook
4. `architecture/mobile-p2p-runtime.md` — mobile Bare decision
5. `architecture/holepunch-sidecar.md` — live bridge schema
6. `architecture/pear-runtime.md`
7. `architecture/pairing-and-topics.md` — sole `topicRef` formula
8. `security/encryption.md` — threat model + L1/L2/L3
9. `security/p2pchatprotocol.md`
10. `builds/expo-eas-ios-build.md`
10b. `builds/github-pages-and-desktop.md` — Pages (browser) + Linux Electron with embedded UI
11. `features/lite-wallet.md`
12. `features/invitations.md`
13. `features/chat-relay.md` — L1 sealed chat fallback (grey bubbles)
14. `prompts/coding-constraints.md`

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
- `features/` — product behavior and user-facing flows
- `security/` — encryption, key handling, and protocol details
- `prompts/` — durable coding constraints for AI / codegen tools
