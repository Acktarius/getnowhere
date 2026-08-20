# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: Multiple concurrent rooms per contact
The system SHALL allow a contact to have more than one live chat room at the
same time (different `roomId`s, including different `roomTopic` and/or TTL).
Creating a new invite SHALL NOT automatically abandon or destroy an existing
live room for that contact.

#### Scenario: Second room with a different topic
- GIVEN contact C already has an open room with topic `general`
- WHEN the user creates an invite for C with topic `work`
- THEN a new room is created
- AND the existing `general` room remains open and usable

#### Scenario: Second room with the same topic after confirm
- GIVEN contact C already has an open room with topic `general`
- WHEN the user confirms create for another `general` invite
- THEN a new room is created alongside the existing one
- AND the existing room is not abandoned or marked invalid

### Requirement: Same-topic create requires confirmation
Before creating an invite when the contact already has an open room with the
same `roomTopic`, the UI SHALL ask the user to confirm. Cancel SHALL abort
create. Confirm SHALL proceed with a new room.

#### Scenario: User cancels same-topic create
- GIVEN an open room for contact C topic `general`
- WHEN the user starts create for `general` and cancels the confirm
- THEN no new room or invite is created

### Requirement: Room view is not invalidated by contact latest-room pointer
A chat room screen SHALL NOT show a “superseded / no longer current /
replacing this room” banner solely because `contact.roomId` differs from the
viewed `roomId`. `contact.roomId` MAY point at the latest room as a hint only.

#### Scenario: Open older room while contact.roomId is newer
- GIVEN contact C has rooms R1 and R2 and `contact.roomId` is R2
- WHEN the user opens R1
- THEN R1 does not display the superseded replacement banner

## REMOVED Requirements

### Requirement: One room per contact+topic always supersedes
(Automatic supersede of prior sent/received/accepted rooms on create for the
same contact+topic, and UI treating non-current `contact.roomId` as
superseded.)
