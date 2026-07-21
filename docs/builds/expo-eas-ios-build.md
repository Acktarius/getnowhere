# Expo EAS iOS Build

This document explains how Get Now Here uses Expo.dev / EAS for the iOS build and App Store delivery path. The project is developed locally as a web-first app, while EAS Build is used to create the iOS binary and EAS Submit is used to upload it to Apple.

## Scope

This document is `native-wrapper only`.

It does not describe day-to-day feature development. Normal development belongs in the web app and runs through `npm run dev`.

## Why this exists

Expo documents EAS Build as a hosted service for creating Android and iOS app binaries in the cloud. Expo also documents EAS Submit as the recommended way to upload an iOS app to the Apple App Store, and notes that `eas submit` works on macOS, Linux, and Windows.

For this project, that means:

- Build the product in the web app.
- Keep the native wrapper minimal.
- Use EAS for iOS packaging, signing, and store upload.

## Prerequisites

Before running the iOS build flow, make sure the following exist:

- An Expo account.
- A paid Apple Developer account, which Expo documents as required for App Store submission.
- A `native-wrapper/` Expo project.
- A valid iOS bundle identifier in app config, which Expo requires before submission.
- EAS CLI installed and authenticated.

## Required files

The iOS build flow depends on these files inside `native-wrapper/`:

```text
native-wrapper/
├─ app.json
├─ eas.json
├─ package.json
├─ assets/
└─ src/
```

Rules:

- `app.json` holds the Expo app configuration, including the iOS bundle identifier.
- `eas.json` holds build and submit profiles.
- `package.json` holds wrapper commands.
- Icons, splash assets, and app metadata belong here, not in the main web app.

## Minimal `app.json` expectations

At minimum, define the iOS bundle identifier in `app.json`, because Expo documents it as a prerequisite for App Store submission.

Example:

```json
{
  "expo": {
    "name": "Get Now Here",
    "slug": "get-now-here-wrapper",
    "ios": {
      "bundleIdentifier": "im.getnowhere.app"
    }
  }
}
```

Replace the bundle identifier with the real production value used by your Apple developer setup.

## Minimal `eas.json` expectations

Expo documents `eas.json` as the configuration file for EAS Build profiles. Keep at least one production build profile and one production submit profile.

Example:

```json
{
  "build": {
    "production": {
      "ios": {
        "simulator": false
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

Expo documents `ascAppId` as the App Store Connect app ID used for EAS Submit profiles.

## Install and login

Run these commands from the wrapper project when setting it up:

```bash
cd native-wrapper
npm install
npm install --global eas-cli
eas login
npx eas build:configure
```

Expo documents `eas build:configure` as part of the build setup flow and requires EAS CLI authentication before running cloud builds.

## Production build

To create the iOS production archive:

```bash
cd native-wrapper
npx eas build --platform ios --profile production
```

Expo documents `eas build --platform ios --profile production` as the command to create the production `.ipa` needed for submission.

## Submit to Apple

After the production build is ready:

```bash
cd native-wrapper
npx eas submit --platform ios --profile production
```

Expo documents `eas submit --platform ios` as the recommended command for uploading the build to App Store Connect. On first run, the command can prompt for Apple credentials and help you choose the build to upload.

## Optional one-step build and submit

Expo also documents automatic submission after a successful build with `--auto-submit`.

Example:

```bash
cd native-wrapper
npx eas build --platform ios --profile production --auto-submit
```

Use this only after the standard two-step process is already working reliably.

## Team rules

Use these repo rules for iOS delivery:

- The wrapper is for packaging and release, not for core product development.
- Keep build profiles in `native-wrapper/eas.json`.
- Keep iOS identifiers, assets, and signing-related changes documented in `/docs/builds/`.
- Any change to bundle identifier, signing setup, App Store Connect ID, or wrapper loading behavior must update this file in the same branch.
- Do not move product logic from `web/` into `native-wrapper/` unless native APIs make it necessary.

## Troubleshooting rules

If the iOS build flow breaks:

- Check `app.json` first for bundle identifier and metadata issues.
- Check `eas.json` for the correct build and submit profile names.
- Check Expo account login status with EAS CLI.
- Check Apple account access and App Store Connect app configuration.

If EAS Submit is unavailable, Expo notes that a manual App Store Connect upload can still be done from a Mac with Xcode.

## Policy text

Use this wording in project documentation:

> Get Now Here is developed as a web-first application. Local work happens with `npm run dev` in the web app. Expo.dev / EAS is used only for the native wrapper, iOS builds, signing, TestFlight, and App Store delivery.