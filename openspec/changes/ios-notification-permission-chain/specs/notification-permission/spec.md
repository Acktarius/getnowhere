# Spec Delta

## Purpose

Defines how the mobile app requests notification permission from the OS,
reports the real outcome in Settings, and registers the device for peer wake
so a failed step is visible instead of silent.

## ADDED Requirements

### Requirement: Permission request reports its outcome

A notification permission request from the UI SHALL resolve with exactly one
outcome: `authorized`, `provisional`, `denied`, `notDetermined`, or
`unavailable`, plus whether alerts are enabled. The request MUST NOT resolve
before the user has answered a system prompt that is on screen.

#### Scenario: User allows the system prompt

- **WHEN** the user taps a notification toggle on and allows the system prompt
- **THEN** the request resolves `authorized` with alerts enabled

#### Scenario: User declines the system prompt

- **WHEN** the user taps a notification toggle on and chooses "Don't Allow"
- **THEN** the request resolves `denied`

#### Scenario: Native support missing

- **WHEN** the app build has no native notifications support
- **THEN** the request resolves `unavailable` immediately

#### Scenario: Prompt left open

- **WHEN** the system prompt stays on screen for several minutes
- **THEN** the toggle stays pending and is not reverted until the user answers or 10 minutes pass

#### Scenario: Native call never answers

- **WHEN** no answer arrives within 10 minutes
- **THEN** the toggle stays off with no message

### Requirement: Toggles reflect granted permission

The Notifications toggle SHALL turn on only when the outcome is `authorized`
or `provisional`. The Wake contact and Notification banner toggles SHALL turn
on only when the outcome is `authorized` and alerts are enabled. A toggle MUST
be disabled while its request is pending.

#### Scenario: Badge toggle under provisional permission

- **WHEN** the user turns Notifications on and the outcome is `provisional`
- **THEN** the Notifications toggle turns on

#### Scenario: Wake toggle under provisional, then authorized

- **WHEN** the user turns Wake contact on and the outcome is `provisional`
- **THEN** Wake contact stays off with the settings guidance message
- **WHEN** the user later taps Wake contact again and the outcome is `authorized` with alerts enabled
- **THEN** Wake contact turns on

#### Scenario: Authorized but alerts turned off

- **WHEN** the user turns Notification banner on and the outcome is `authorized` with alerts disabled
- **THEN** the toggle stays off with the settings guidance message

#### Scenario: Double tap while pending

- **WHEN** a toggle's request is pending
- **THEN** the toggle cannot be tapped again until the request resolves

### Requirement: Failure message under the toggle

When a toggle tap does not result in the toggle turning on, the app SHALL show
one message directly under that toggle, without a dialog. The message MUST
disappear when the user leaves the Settings page or the toggle later turns on.

- denied, or alerts required but not enabled: "Notifications need to be turned on in Settings → Apps → Get NowHere → Notifications."
- unavailable: "Notifications are not available in this build."
- Wake contact gateway registration failed: "Wake registration failed. Check your connection and try again."

#### Scenario: Denied shows guidance

- **WHEN** a toggle request resolves `denied`
- **THEN** the guidance message appears under that toggle and the toggle is off

#### Scenario: Unavailable shows build message

- **WHEN** a toggle request resolves `unavailable`
- **THEN** "Notifications are not available in this build." appears under that toggle

#### Scenario: Message clears on navigation

- **WHEN** a failure message is visible and the user navigates away from Settings and back
- **THEN** no failure message is shown

### Requirement: Wake registration before Wake contact turns on

On iOS, the Wake contact toggle SHALL turn on only after the APNs device token
was obtained following a granted permission and the poke gateway accepted the
registration. The APNs token MUST NOT be requested before the permission
outcome is known.

#### Scenario: Gateway accepts registration

- **WHEN** permission is `authorized` with alerts enabled and the gateway returns a poke handle
- **THEN** Wake contact turns on and the poke handle is stored for future invites

#### Scenario: Gateway unreachable

- **WHEN** permission is granted but gateway registration fails
- **THEN** Wake contact stays off with "Wake registration failed. Check your connection and try again."

#### Scenario: Android Wake contact

- **WHEN** an Android user turns Wake contact on and notifications are granted
- **THEN** Wake contact turns on and wake subscriptions start without gateway registration

### Requirement: Settings shows the real permission state

When the Settings page opens on the mobile app, any notification toggle stored
on whose required permission is no longer granted SHALL be switched off
without a message. A toggle stored off MUST stay off even if the OS grants
permission. The app MUST NOT show a system prompt without a user tap.

#### Scenario: Toggle stored on, never prompted

- **WHEN** Settings opens with Notifications stored on and OS status `notDetermined`
- **THEN** the toggle shows off with no message, and the next tap shows the system prompt

#### Scenario: Alerts turned off in iOS Settings later

- **WHEN** Settings opens with Wake contact stored on, status `authorized`, alerts disabled
- **THEN** Wake contact shows off with no message and Notifications stays on

#### Scenario: OS granted, toggle stored off

- **WHEN** Settings opens with a toggle stored off and OS status `authorized`
- **THEN** the toggle stays off

### Requirement: Notification handler active from launch

The mobile app SHALL install its notification presentation and tap handler at
launch, so foreground notifications follow the badge-only rule from the first
notification on.

#### Scenario: Foreground notification after cold start

- **WHEN** a notification arrives while the app is in the foreground after a cold start
- **THEN** it is presented as badge only
