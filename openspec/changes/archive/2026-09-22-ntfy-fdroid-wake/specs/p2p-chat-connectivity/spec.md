## MODIFIED Requirements

### Requirement: sendPoke routes through gateway for all platforms

The `sendPoke` function SHALL call `POST /poke { to: partnerPokeId }` on the poke-gateway
for all platforms. The gateway SHALL handle routing internally: if the pokeId is registered
(iOS APNs), it uses APNs; otherwise it POSTs `wake` to `ntfy.getnowhere.im/gnh-<partnerPokeId>`.
The gateway SHALL always return `202 Accepted` regardless of the delivery path taken,
revealing no platform information to the caller.

The `sendPoke` caller SHALL NOT pass a `platform` field. The gateway determines the path.

#### Scenario: Sender is platform-agnostic

- **WHEN** a sender calls `POST /poke { to: partnerPokeId }`
- **THEN** the gateway returns `202 Accepted`
- **AND** the response body does not indicate whether APNs or ntfy was used

#### Scenario: Gateway falls back to ntfy for unregistered pokeId

- **WHEN** the gateway receives a poke for a pokeId not in its APNs registry
- **THEN** it POSTs `wake` to `https://ntfy.getnowhere.im/gnh-<partnerPokeId>`
- **AND** returns `202 Accepted` to the caller

#### Scenario: Gateway SSRF guard

- **WHEN** the `to` field contains characters outside `[A-Za-z0-9_-]` or is not 14 characters
- **THEN** the gateway returns `400 Bad Request` without making any downstream request

### Requirement: FCM platform is removed

The system SHALL NOT include any FCM, Firebase, or Google Play Services code path.
The `"fcm"` platform type SHALL be removed from all TypeScript types, native modules, and
gateway code. The GMS APK CI variant SHALL be removed.

#### Scenario: No FCM references in build

- **WHEN** the F-Droid APK is built
- **THEN** no `com.google.firebase` or `com.google.android.gms` dependency is present
- **AND** `scripts/fix-for-fdroid.py` reports no Google dependencies to strip

#### Scenario: CI tag routing

- **WHEN** a tag matching `v*-f-droid` is pushed
- **THEN** only the F-Droid APK workflow runs
- **AND** the Electron desktop workflow does not run

- **WHEN** a tag matching `v*` (not ending in `-f-droid`) is pushed
- **THEN** only the Electron desktop workflow runs
- **AND** the APK workflow does not run
