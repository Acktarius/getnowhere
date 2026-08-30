## Purpose

Keep room transcripts available after Exit or process death while the room is
still live, with L2 persist gated by P2P message retention and L1′ paid sends
always restored into the thread.

## ADDED Requirements

### Requirement: P2P message retention gates L2 only

Settings SHALL expose **P2P message retention**, default ON. When ON, the
system SHALL persist live (Holepunch) room messages into the encrypted wallet
blob and SHALL restore them on unlock. When OFF, the system SHALL NOT write
live messages into that blob and SHALL NOT restore live messages from it.
Turning the setting OFF SHALL NOT immediately wipe stored live bytes; expire,
revoke, or leave-forever SHALL tombstone the room. L1′ sent and inbound
behavior SHALL NOT depend on this setting.

#### Scenario: Toggle on restores live history after Exit
- **GIVEN** P2P message retention is ON
- **AND** an unlocked wallet has live messages in an open room
- **WHEN** the user confirms nav Exit and later unlocks the wallet
- **THEN** those live messages appear in the room thread

#### Scenario: Toggle off does not restore live history after Exit
- **GIVEN** P2P message retention is OFF
- **AND** an unlocked wallet has live messages in an open room
- **WHEN** the user confirms nav Exit and later unlocks the wallet
- **THEN** live messages from that session are not shown
- **AND** L1′ messages for that room still appear while the room is available

### Requirement: L2 persist is not Exit-only

While P2P message retention is ON and the wallet is unlocked, the system SHALL
write live room messages to the encrypted wallet blob after live send or
receive (coalesced), when the app hides (background, screen off, or hidden
tab), and on nav Exit before keys leave memory. Hide without Exit SHALL leave
the wallet mounted.

#### Scenario: Hide then kill still restores live history
- **GIVEN** P2P message retention is ON
- **AND** the user sent or received a live message
- **WHEN** the app hides and the process is then treated as killed
- **AND** the user unlocks the wallet
- **THEN** that live message appears in the room thread

#### Scenario: Toggle off skips hide and Exit live writes
- **GIVEN** P2P message retention is OFF
- **WHEN** the app hides or the user confirms Exit
- **THEN** live message bodies are not written into the wallet blob on that event

### Requirement: L1′ sent always hydrates while the room is available

The system SHALL persist L1′ outbound bodies in the encrypted wallet at send
time. After unlock, the room thread SHALL include those sent L1′ messages for
any room that is not expired or revoked, regardless of P2P message retention.
Inbound L1′ SHALL continue to appear from chain scan while the room is
available.

#### Scenario: Paid send visible after Exit with retention off
- **GIVEN** P2P message retention is OFF
- **AND** the user sent an L1′ message in a live room
- **WHEN** the user confirms Exit and later unlocks the wallet
- **THEN** that sent L1′ message appears in the room thread

### Requirement: Unlock merges live and L1′ without duplicates

On wallet unlock the system SHALL build each available room thread by merging
persisted live messages (only if P2P message retention is ON) with L1′
sent and received copies for that room id. Duplicate ids SHALL appear once.

#### Scenario: Mixed thread after unlock
- **GIVEN** a room has persisted live messages and L1′ sent and received copies
- **AND** P2P message retention is ON
- **WHEN** the wallet is unlocked
- **THEN** the room shows both channels
- **AND** no message id is listed twice

### Requirement: Destroy path erases L2 transcript and L1′ relay copies

When a room expires, is revoked, or is left forever, the system SHALL replace
the wallet room entry with a revoked tombstone that contains no message
bodies, and SHALL drop wallet sent/received rows whose smart-message body is
an L1′ relay for that room id. Create, register, and revoke smart messages and
chain transactions SHALL remain. The same room id SHALL NOT be restored as an
active chat.

#### Scenario: Expire drops local relay copies
- **GIVEN** a room with live history and L1′ relay sent/received copies
- **WHEN** the room expires or is revoked
- **THEN** the wallet room entry is only a revoked tombstone
- **AND** L1′ relay sent/received copies for that room id are gone
- **AND** the room does not reappear as an active chat
