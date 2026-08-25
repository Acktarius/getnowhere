## Purpose

Defines phone-only iOS packaging via Expo EAS TestFlight preview builds from Linux, and the operator contract for APNs AuthKey (`.p8`) used by poke-gateway peer wake.

## ADDED Requirements

### Requirement: iOS wrapper is phone-only

The native-wrapper Expo iOS configuration MUST set the app as phone-only (tablet support disabled) while keeping bundle identifier `im.getnowhere.app`.

#### Scenario: Phone-only flag

- **WHEN** an operator inspects `native-wrapper` Expo iOS config
- **THEN** tablet support is disabled and the iOS bundle identifier is `im.getnowhere.app`

### Requirement: EAS preview builds iOS for TestFlight

The native-wrapper EAS configuration MUST provide an iOS build profile with store distribution so the artifact can be submitted to TestFlight from Linux via EAS. Android internal `preview` MAY remain a separate profile when EAS cannot mix platform distributions on one profile.

#### Scenario: Preview profile includes iOS store distribution

- **WHEN** an operator runs an EAS iOS build with the TestFlight preview profile (`preview-ios`) from a Linux host
- **THEN** the profile targets store distribution suitable for TestFlight upload (not ad-hoc-only internal distribution)

### Requirement: APNs AuthKey operator contract

Project documentation MUST describe creating an Apple App ID for `im.getnowhere.app` with Push Notifications (without Broadcast), creating a Production topic-restricted AuthKey (`.p8`), placing it at the poke-gateway secrets path expected by Compose, and setting `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_KEY_PATH`, and `APNS_BUNDLE_ID`. The AuthKey MUST NOT be committed to git.

#### Scenario: Documented placement path

- **WHEN** an operator follows the iOS EAS / APNs build docs
- **THEN** they are instructed to store the key as `AuthKey.p8` under poke-gateway `secrets/` (gitignored) and configure `APNS_*` for the container path `/secrets/AuthKey.p8`

#### Scenario: Key options for TestFlight-first

- **WHEN** an operator creates a new APNs AuthKey for Get NowHere TestFlight
- **THEN** docs specify Production environment, topic restriction to `im.getnowhere.app` when available, and Push without Broadcast
