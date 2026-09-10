## Purpose

Defines when the sender issues a peer-wake poke after an L1′ relay send so a backgrounded peer can be notified again after a cooldown.

## ADDED Requirements

### Requirement: Poke on first L1′ after live channel

When push wake is enabled and the room has a partner poke handle, the system SHALL attempt a peer-wake poke on an L1′ send if the room has no `lastPokedAt` for the current relay stretch.

#### Scenario: First relay after L2

- **WHEN** push wake is enabled, a partner poke handle is present, and `lastPokedAt` is absent
- **THEN** the system attempts a poke and, on success, records `lastPokedAt`

### Requirement: Re-poke after cooldown while still on relay

When push wake is enabled and the room has a partner poke handle, the system SHALL attempt a peer-wake poke on an L1′ send if `lastPokedAt` is set and at least 300 seconds have elapsed since that timestamp.

#### Scenario: Resend after five minutes

- **WHEN** push wake is enabled, a partner poke handle is present, and `now - lastPokedAt >= 300` seconds
- **THEN** the system attempts a poke and, on success, updates `lastPokedAt`

#### Scenario: Resend within cooldown

- **WHEN** push wake is enabled, a partner poke handle is present, and `now - lastPokedAt < 300` seconds
- **THEN** the system MUST NOT attempt a poke

### Requirement: Clear poke marker when live again

When the room returns to a live (L2 connected) channel, the system SHALL clear `lastPokedAt` so the next transition to relay can poke without waiting for the cooldown.

#### Scenario: Connected clears lastPokedAt

- **WHEN** the room reaches connected / live
- **THEN** `lastPokedAt` is cleared for that room
