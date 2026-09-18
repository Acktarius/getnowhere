## Purpose

Lets a peer in an online 1:1 live chat reply to a specific peer message with a frozen truncated quote above a normal text bubble.

## ADDED Requirements

### Requirement: Reply action availability
The system SHALL show a Reply action in the message action menu only when all of the following are true: the room lifecycle is online (L2 connected), the message channel is live, the message direction is inbound (peer), and the message is not deleted.

#### Scenario: Online peer live message
- **WHEN** the room is L2 connected and the user opens actions on a non-deleted inbound live message
- **THEN** the Reply action is available in the action strip beside the Edit control position (Reply appears even when Edit is absent on peer messages)

#### Scenario: Offline room
- **WHEN** the room is not L2 connected
- **THEN** the Reply action is not available on any message

#### Scenario: Own or relay or deleted
- **WHEN** the user opens actions on an outbound message, a relay (L1′) message, or a deleted message
- **THEN** the Reply action is not available

### Requirement: Pending reply composer preview
When the user selects Reply, the system SHALL enter a pending-reply state that shows a grey truncated snapshot of the target message text above the composer, keep the normal text input and send path, and SHALL clear pending reply when the user clicks or taps away from the composer input (forfeit).

#### Scenario: Start reply
- **WHEN** the user selects Reply on an eligible message
- **THEN** a grey truncated preview of that message appears above the composer and focus moves to the input

#### Scenario: Cancel by leaving input
- **WHEN** pending reply is active and the user clicks or taps outside the composer input
- **THEN** pending reply is cleared and the next send is a normal text message without reply fields

### Requirement: Reply send is live text with snapshot
A reply send SHALL remain `kind: "text"` on the live path and MUST include `replyToMessageId` (parent message id) and `replyPreview` (frozen truncated text snapshot taken when Reply was selected). The system MUST NOT send reply fields on the L1′ relay path.

#### Scenario: Live reply envelope
- **WHEN** the user sends while pending reply is active and the room is live
- **THEN** the outgoing live content envelope is `kind: "text"` with `replyToMessageId` and `replyPreview` set, and the local bubble shows the grey truncated quote above the new text

#### Scenario: Snapshot frozen after parent edit or delete
- **WHEN** a reply message already stores `replyPreview` and the parent message is later edited or deleted
- **THEN** the reply bubble continues to display the original `replyPreview` snapshot

#### Scenario: No reply on relay
- **WHEN** a message is delivered or sent via L1′ relay
- **THEN** it MUST NOT carry `replyToMessageId` or `replyPreview`

### Requirement: Reply bubble rendering
For any persisted message with `replyPreview`, the UI SHALL render a grey truncated quote block above the message body (third color distinct from live accent and peer elev backgrounds), without a counterparty name label.

#### Scenario: Display inbound and outbound replies
- **WHEN** an inbound or outbound message includes `replyPreview`
- **THEN** the bubble shows the truncated grey quote above the message text
