## Purpose

Defines how the mobile native host saves wallet backup text requested by the
WebView so operators can export an encrypted wallet file on Android and iOS.

## ADDED Requirements

### Requirement: Mobile host saves wallet backup text via platform path
When the bundled WebView requests a text file save over the mobile file
channel (`gnh-file`), the native host SHALL persist or present the provided
content using a platform-supported path: Android via Storage Access Framework
folder write; iOS via the system share sheet so the operator can save to Files
or share elsewhere. The host SHALL NOT call Android-only Storage Access
Framework APIs on iOS.

#### Scenario: iOS presents share sheet for wallet JSON
- **GIVEN** an iOS mobile host with the WebView bridge available
- **WHEN** Backup settings requests save of a wallet JSON filename and content
  over `gnh-file`
- **THEN** the host presents the system share sheet for that JSON content
- **AND** the host does not invoke Storage Access Framework APIs

#### Scenario: Android keeps folder picker write
- **GIVEN** an Android mobile host with the WebView bridge available
- **WHEN** Backup settings requests save of a wallet JSON filename and content
  over `gnh-file`
- **THEN** the host writes the file through Storage Access Framework to an
  operator-chosen (or previously granted) directory

### Requirement: Save outcome reported to the WebView
The native host SHALL resolve each `gnh-file` save request with success when
the platform save path completes without error, and with failure plus a clear
message when the operator cancels, sharing is unavailable, or the write fails.
The bridge request/response shape SHALL remain compatible with the existing
WebView save helpers.

#### Scenario: Cancel or share failure reports error
- **GIVEN** an iOS mobile host that has opened the share sheet for a save
- **WHEN** the operator cancels or the share operation fails
- **THEN** the host reports failure for that request id to the WebView
- **AND** the WebView save promise rejects with an error message

#### Scenario: Successful share reports ok
- **GIVEN** an iOS mobile host that has opened the share sheet for a save
- **WHEN** the share operation completes without error
- **THEN** the host reports success for that request id to the WebView
