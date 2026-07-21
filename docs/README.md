# Get Now Here Docs

This `/docs` directory is the source of truth for project structure, workflow, protocol, security, and release decisions. The application is developed as a web-first product with `npm run dev`, while Expo.dev / EAS is used only for the native wrapper, iOS builds, signing, and App Store delivery.

## Reading order

1. `architecture/overview.md`
2. `architecture/folder-structure.md`
3. `setup/local-development.md`
4. `builds/expo-eas-ios-build.md`
5. `security/p2pchatprotocol.md`
6. `features/lite-wallet.md`
7. `features/invitations.md`

## Rules

- Read the relevant doc before changing code in that area.
- Update the matching doc in the same branch when changing architecture, protocol, storage, routing, build, or security behavior.
- Do not treat chat prompts as the final source of truth; stable decisions must be copied here.

## Structure

- `architecture/` explains repo boundaries and system shape.
- `setup/` explains how to run the project locally.
- `builds/` explains native wrapper and App Store delivery.
- `features/` explains product behavior and user-facing flows.
- `security/` explains encryption, key handling, and protocol details.