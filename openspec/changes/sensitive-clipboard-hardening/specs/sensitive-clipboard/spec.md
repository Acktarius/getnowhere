## Purpose

Controls how Get NowHere copies and displays sensitive identifiers so they are
not selected by accident, not left on the clipboard by an app timer, and not
echoed in toasts or logs.

## ADDED Requirements

### Requirement: Explicit copy writes the raw identifier only

When the operator activates Copy on a sensitive identifier, the system SHALL
write only that identifier’s raw string to the system clipboard. The write
MUST NOT include field labels or surrounding UI text.

#### Scenario: Copy payment identifier

- **WHEN** the operator activates Copy on a displayed payment identifier
- **THEN** the clipboard receives exactly that identifier string

#### Scenario: Copy does not include the label

- **WHEN** the operator activates Copy on a value shown next to a label such as
  Payment ID
- **THEN** the clipboard does not contain that label

### Requirement: Sensitive display is non-selectable

Displayed sensitive identifiers SHALL not be selectable for casual copy.
Editable fields and non-secret content (including chat fenced code) MUST keep
normal select and copy behavior.

#### Scenario: Displayed address is not selectable

- **WHEN** the operator views a wallet or payment address in a read-only
  display
- **THEN** the displayed text cannot be selected for copy

#### Scenario: Chat code stays copyable

- **WHEN** the operator views a fenced code block in a chat message
- **THEN** the existing non-secret copy control still copies that code

### Requirement: Seed phrase has no copy action

When a seed phrase is shown (reveal dialog or onboarding backup panel), the
system MUST NOT offer a Copy action for the phrase or its words. The words
SHALL be non-selectable. Need more time behavior is unchanged.

#### Scenario: Reveal dialog has no seed copy

- **WHEN** the seed reveal dialog is open with a mnemonic
- **THEN** there is no Copy control for the seed phrase or any seed word

#### Scenario: Onboarding backup has no seed copy

- **WHEN** the onboarding seed backup panel reveals the phrase
- **THEN** there is no Copy control for the seed phrase or any seed word

### Requirement: Spend and view keys have dedicated copy

When spend key and view key are shown in the seed reveal dialog, each key
SHALL be non-selectable and SHALL have its own Copy action that writes only
that key.

#### Scenario: Copy spend key

- **WHEN** the operator activates Copy on the spend key
- **THEN** the clipboard receives exactly the spend key string

#### Scenario: Copy view key

- **WHEN** the operator activates Copy on the view key
- **THEN** the clipboard receives exactly the view key string

### Requirement: Clipboard reminder toast

When Clipboard reminder is on and a sensitive copy succeeds, the system SHALL
show an info toast that MUST NOT contain the copied value. When the reminder
is off, the system MUST NOT show that toast.

#### Scenario: Reminder on after copy

- **WHEN** Clipboard reminder is on and a sensitive copy succeeds
- **THEN** an info toast appears whose text does not include the copied value
- **AND** the toast includes `You copied a sensitive value.`

#### Scenario: Reminder off after copy

- **WHEN** Clipboard reminder is off and a sensitive copy succeeds
- **THEN** the reminder toast is not shown

#### Scenario: Android or desktop extra hint

- **WHEN** Clipboard reminder is on, a sensitive copy succeeds, and the host
  is Android or Electron desktop
- **THEN** the toast also tells the operator to use Clear clipboard in Privacy
  settings after pasting

#### Scenario: iOS or web has no clear-button hint

- **WHEN** Clipboard reminder is on, a sensitive copy succeeds, and the host
  is iOS or browser web
- **THEN** the toast does not mention Clear clipboard

### Requirement: Privacy settings clipboard controls

Privacy settings SHALL show a **Clipboard reminder** toggle and a **Clear
clipboard** action. The reminder hint SHALL be at most two lines and SHALL
use the shorter text when tips are off.

#### Scenario: Toggle label

- **WHEN** the operator opens Privacy settings
- **THEN** a switch titled Clipboard reminder is present

#### Scenario: Clear clipboard wipes without reading

- **WHEN** the operator activates Clear clipboard
- **THEN** the system overwrites or clears the system clipboard
- **AND** the system does not read clipboard contents to decide whether to
  clear

### Requirement: No later clipboard inspection

After a sensitive copy, the system MUST NOT read the clipboard on a timer, on
mount, or when the app gains focus. The system MUST NOT store the copied
value (or a hash of it) in order to compare later. iOS SHALL attach a
60-second pasteboard expiry and local-only at write time. Other hosts SHALL
leave the clipboard untouched after the write except when the operator
activates Clear clipboard.

#### Scenario: No timer read

- **WHEN** 60 seconds elapse after a sensitive copy on web, Electron, or
  Android
- **THEN** the app does not read the clipboard and does not overwrite it
  unless the operator activated Clear clipboard

#### Scenario: iOS write expires

- **WHEN** a sensitive copy succeeds on iOS
- **THEN** the pasteboard item is written as local-only with a 60-second
  expiration

#### Scenario: No focus read

- **WHEN** the app returns to the foreground
- **THEN** the app does not read the clipboard

### Requirement: No identifier leakage on the copy path

Toasts, logs, and error reports produced by the sensitive-copy path MUST NOT
include the copied identifier.

#### Scenario: Failed copy does not log the value

- **WHEN** a sensitive copy fails
- **THEN** any error shown or logged does not include the identifier
