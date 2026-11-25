# invite-accept-flow Specification

## Purpose
Defines what the invitee sees and what is persisted, in which order, from tapping Accept on a
chat invite until the room hands off to Holepunch connect, including failure and crash recovery.

## Requirements

### Requirement: Room opens before the register broadcast

After Accept passes the chain-tip check and the reply key is saved, the app SHALL open the room
without waiting for the register transaction to be built or broadcast. The room SHALL use the
existing `pending` status until the broadcast succeeds, and the existing composer gate SHALL
block live and relay sends while it is `pending`.

#### Scenario: Room visible while the register is broadcasting
- **WHEN** the invitee taps Accept and the register broadcast has not finished
- **THEN** the room screen is shown with the room `pending` and the composer disabled

#### Scenario: Broadcast succeeds
- **WHEN** the register broadcast succeeds
- **THEN** the room moves `accepted` → `connecting` through existing transitions and Holepunch connect starts

### Requirement: Accept in progress is visible and single-flight

While an invite's register broadcast is in flight, the contact screen SHALL show "Accepting…"
with the Accept button disabled, including after navigating away and back. At most one register
broadcast SHALL be in flight per invite.

#### Scenario: Return to the contact during the broadcast
- **WHEN** the invitee goes back to the contact screen before the broadcast finishes
- **THEN** the Accept button shows "Accepting…" and is disabled

#### Scenario: Second accept request for the same invite
- **WHEN** an accept is requested for an invite whose broadcast is already in flight
- **THEN** no second broadcast starts

### Requirement: Two wallet saves per accept

From Accept until Holepunch connect starts, a successful accept SHALL write the encrypted wallet
twice: once to store the reply key before the broadcast, and once after the broadcast to record
the sent transaction, the contact's accepted state, the room session (when the session is kept in
the wallet), and the removal of the stashed reply key. Hosts that keep the room session outside
the wallet SHALL write it to their own session store.

#### Scenario: Successful accept
- **WHEN** an accept succeeds, up to the moment Holepunch connect starts
- **THEN** exactly two encrypted wallet saves have been made by the accept

#### Scenario: Reply key saved before broadcast
- **WHEN** the register broadcast starts
- **THEN** the reply key is already durable in the wallet

### Requirement: Invite saved as accepted only after a successful broadcast

The invite and contact SHALL be persisted as `accepted` only after the register broadcast
succeeds, and before the combined wallet save that removes the stashed reply key.

#### Scenario: Broadcast fails
- **WHEN** the register broadcast fails
- **THEN** an error is shown, the invite stays `received`, the stashed reply key is kept, and the room stays `pending`

#### Scenario: Crash after the broadcast
- **WHEN** the app stops after the broadcast but before the combined wallet save
- **THEN** on restart the invite is `accepted` and the stashed reply key still exists, so the room can resume

### Requirement: Retry reuses the stashed reply key

When an accept is requested for an invite that already has a stashed reply key, the app SHALL
reuse that key and register instead of generating new ones.

#### Scenario: Accept again after a failure
- **WHEN** the invitee taps Accept again after a failed broadcast
- **THEN** the broadcast carries the same register and reply key as the first attempt

#### Scenario: Accept again after a restart mid-broadcast
- **WHEN** the app restarted during a broadcast and the invitee taps Accept again
- **THEN** the stashed reply key and register are reused

### Requirement: Stashed-key reconnect waits for a saved accept

Resuming a room from a stashed reply key SHALL happen only when the invite for that room is
saved as `accepted`. Stashed keys whose invite is not `accepted` SHALL NOT derive a session or
start Holepunch connect.

#### Scenario: Room screen polls during the broadcast
- **WHEN** the room screen's reconnect check runs while the register broadcast is in flight
- **THEN** no session is derived from the stash and no connect starts

#### Scenario: Stash from before this change
- **WHEN** a stashed reply key exists and its invite is already saved as `accepted`
- **THEN** the room resumes from the stash as before
