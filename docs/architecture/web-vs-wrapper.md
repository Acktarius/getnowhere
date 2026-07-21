# Web vs Wrapper

This project is built as a **web-first** application. Local development happens in the web app with `npm run dev`, while Expo.dev / EAS is used only for the native wrapper, iOS builds, signing, TestFlight, and App Store delivery.[web:14][web:35]

## Purpose

The goal of this split is to keep daily product development fast and simple while still using Expo's cloud build and submission services for Apple distribution.[web:14][web:35] EAS Build is Expo's hosted service for producing app binaries, and it supports building iOS separately with `eas build --platform ios`.[web:14]

## Web app

The `web/` folder is the main product.

It should contain:

- React UI, routes, pages, and components.
- State management and client-side business logic.
- Invitation, relationship, and chat flows.
- Wallet integration adapters that can run in the web-first architecture.
- Shared TypeScript types, utilities, and service modules.
- Build output for browser deployment and possible wrapper embedding.

Rules for `web/`:

- Use `npm run dev` for normal development.
- Keep the app deployable as a normal web project.
- Avoid tight coupling to Expo runtime APIs.
- Avoid browser features that are known to behave badly inside mobile WebViews unless documented and tested.
- Keep product logic here unless native APIs are truly required.

## Native wrapper

The `native-wrapper/` folder is a minimal Expo shell around the web app.

It should contain:

- `app.json`
- `eas.json`
- Expo app metadata
- Bundle identifiers
- Icons, splash assets, and platform configuration
- WebView host code, if the app is wrapped in a WebView
- Native-only glue code required for packaging or store compliance

Rules for `native-wrapper/`:

- Keep it thin.
- Do not duplicate product logic from `web/`.
- Use it for packaging, build configuration, signing, and store delivery.[web:14][web:35]
- Put Expo and EAS commands here, not in the web app.
- Treat wrapper changes as release-engineering changes unless they directly affect runtime behavior.

## Decision boundary

Use this rule when deciding where code belongs:

Put code in `web/` if it is part of the product experience, domain logic, UI flow, or cross-platform application behavior.

Put code in `native-wrapper/` if it exists only because the app must be packaged, signed, configured, or submitted as a native iOS or Android app.[web:14][web:35]

## Examples

Place these in `web/`:

- Contact list UI
- Invite acceptance flow
- Chat session screen
- Message composer
- Shared encryption service interfaces
- App state for onboarding and relationships

Place these in `native-wrapper/`:

- Expo config
- iOS bundle identifier
- EAS build profiles
- App icon and splash config
- WebView container component
- Store submission configuration

## Commands

Web app commands:

```bash
cd web
npm install
npm run dev
npm run build
npm run preview
```

Native wrapper commands:

```bash
cd native-wrapper
npm install
npx eas build:configure
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

Expo documents EAS Build as the hosted service for creating installable Android and iOS binaries, and EAS Submit as the command-line path for sending signed builds to the stores.[web:14][web:35]

## Documentation rule

Any change that moves responsibility across the `web/` and `native-wrapper/` boundary must update this file in the same branch.

Examples:

- Moving a feature from browser-only to native-assisted behavior.
- Adding a native dependency.
- Changing how the wrapper loads the web app.
- Changing the iOS build or submission flow.

## Project wording

Use this wording in docs and prompts:

> Get Now Here is developed as a web-first application. Local work happens with `npm run dev` in the web app. Expo.dev / EAS is used only for the native wrapper, iOS builds, signing, TestFlight, and App Store delivery.[web:14][web:35]