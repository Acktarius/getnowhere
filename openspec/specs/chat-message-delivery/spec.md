# chat-message-delivery Specification

## Purpose
Defines what an outbound chat message status claims to the sender, and how
live messages are re-offered to a peer after an L2 reconnect without a peer ACK.

## Requirements

### Requirement: Outbound status never claims delivery without a peer ACK

An outbound message SHALL move through `queued`, `sending`, `sent`, or `failed`.
`sent` SHALL mean the transport accepted the message: the L2 frame was written
to the bridge, or the L1′ broadcast was accepted. The system SHALL NOT set
`delivered` on an outbound message. Inbound messages SHALL keep `delivered`.

#### Scenario: Live send marks sent

- **WHEN** a live text is sealed and written to the bridge while the room is connected
- **THEN** the outbound message status is `sent`

#### Scenario: Relay broadcast marks sent

- **WHEN** an L1′ relay broadcast is accepted
- **THEN** the outbound relay message status is `sent`

#### Scenario: Restored relay rows

- **WHEN** relay rows are restored from the wallet
- **THEN** outbound rows have status `sent` and inbound rows have status `delivered`

#### Scenario: Edit and delete envelopes

- **WHEN** the sender edits or deletes a live message
- **THEN** the local edit or delete row has status `sent`

#### Scenario: Missing topic fails the send

- **WHEN** a live send is attempted and the room has no topic reference
- **THEN** the send fails and no outbound row is marked `sent`

### Requirement: Bubble shows at most one check

An outbound bubble SHALL show the `queued` label for queued, a clock for
sending, a single check for `sent` and for legacy outbound `delivered` rows,
and a failure icon for failed. No bubble SHALL show a double check.

#### Scenario: Sent bubble

- **WHEN** an outbound message has status `sent`
- **THEN** the bubble shows one check and no double check

#### Scenario: Legacy delivered row

- **WHEN** a persisted outbound message has status `delivered`
- **THEN** the bubble shows one check

#### Scenario: Sending bubble

- **WHEN** an outbound message has status `sending`
- **THEN** the bubble shows a clock and no check

### Requirement: Live sends are serialized per room

Live frames for one room SHALL be sealed and written one at a time, so no two
frames use the same session send counter.

#### Scenario: Overlapping sends

- **WHEN** two live sends for the same room start before either finishes
- **THEN** the two frames carry different nonces and the stored send counter advances by two

### Requirement: Recent live envelopes are replayed after reconnect

The sender SHALL keep, in memory, the last 3 live envelopes per room sent within
the past 5 minutes, measured from their first send. Every envelope kind (text,
reaction, edit, delete) counts toward the 3. Only envelopes whose live send
succeeded SHALL be kept; a replay SHALL NOT change any message status. After a reconnect whose
post-connect proof succeeds, the sender SHALL re-seal and send those envelopes
oldest first, 300 ms apart, stopping if the room leaves `connected`. A replay
SHALL NOT change the sender's local transcript. The list SHALL be cleared when
the room is tombstoned or revoked and when the wallet locks. Replay SHALL NOT
run before the proof succeeds.

#### Scenario: Replay after reconnect

- **WHEN** four live texts were sent within 5 minutes and the room reconnects with a successful proof
- **THEN** the last three are sent again in original order and the first is not

#### Scenario: Failed send is not kept

- **WHEN** a live send throws before the frame is written
- **THEN** that envelope is not replayed after a later reconnect

#### Scenario: Window expiry

- **WHEN** a live text was first sent more than 5 minutes before the reconnect
- **THEN** it is not sent again

#### Scenario: No replay without proof

- **WHEN** peers return on the topic but the proof times out
- **THEN** no envelope is replayed

#### Scenario: Later local edit is kept

- **WHEN** the sender edits a message after sending it and the room then reconnects
- **THEN** the sender's transcript still shows the edited text

#### Scenario: One replay batch at a time

- **WHEN** a second reconnect succeeds while a replay batch for the room is still running
- **THEN** no second batch starts for that room

### Requirement: Receiver ignores a repeated live message id

The receiver SHALL drop a live content envelope whose message id matches an
inbound message it already holds for that room, without notifying subscribers.

#### Scenario: Duplicate text

- **WHEN** a live text arrives whose message id already exists as an inbound row in the room
- **THEN** the transcript is unchanged and no subscriber is notified
