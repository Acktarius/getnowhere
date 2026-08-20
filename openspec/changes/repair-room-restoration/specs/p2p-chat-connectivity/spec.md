# Delta for p2p-chat-connectivity

## ADDED Requirements

### Requirement: Chain scan does not restore chat rooms
Smart-message discovery during wallet sync on seed/key/QR import SHALL NOT
create or enable chat rooms. Transaction history MAY show smart-message txs
(fee, indicator dot) without readable message bodies.

#### Scenario: Smart-message tx visible without room
- GIVEN seed-imported wallet after sync finds outbound smart-message txs
- WHEN the operator views transaction history
- THEN txs may show smart-message indicator
- AND Chats does not list a restored room from those txs alone

### Requirement: File-replayed rooms gate enablement near chain tip
Rooms restored from file-import message replay with accepted lifecycle SHALL
remain disabled (`awaitingChainSync`) until wallet sync is within one block of
network tip.

#### Scenario: awaitingChainSync blocks connect
- GIVEN file-replayed accepted room with `awaitingChainSync`
- WHEN operator attempts connect or send
- THEN the action is blocked with sync-wait semantics

### Requirement: fetchIncomingMessages does not invent sent invites from chain
On fresh import with empty `sentMessages`, chain scan MUST NOT populate outbound
invite rows used for room restoration.

#### Scenario: Empty sentMessages stays empty on seed import
- GIVEN seed-imported wallet with empty `sentMessages`
- WHEN invite fetch runs during sync
- THEN no sent create rows are invented from chain for restore purposes
