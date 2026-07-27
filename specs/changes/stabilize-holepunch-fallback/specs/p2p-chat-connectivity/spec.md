# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: Post-accept lifecycle is monotonic
The system SHALL NOT downgrade an accepted chat room to `pending` when loading
bootstrap, catalog, or restored session data. Explicit terminal lifecycle
events SHALL remain authoritative.

#### Scenario: Stale pending bootstrap arrives after acceptance
- GIVEN a room whose lifecycle is `accepted`, `connecting`, `connected`, or
  `connect_failed`
- WHEN room hydration receives bootstrap data with lifecycle `pending`
- THEN the room retains its post-accept lifecycle
- AND L1 relay eligibility is not interrupted

#### Scenario: Invite has not been accepted
- GIVEN a genuinely unaccepted room in lifecycle `pending`
- WHEN the user opens the room
- THEN the composer remains disabled
- AND no L1 relay message can be sent

### Requirement: Connection attempts are single-flight
The system SHALL permit at most one active Holepunch connection attempt per
room. Concurrent connect or restore requests SHALL share that attempt, and a
settled attempt SHALL release the guard for a later retry.

#### Scenario: Polling overlaps an active attempt
- GIVEN a room has an active Holepunch connection attempt
- WHEN periodic room refreshes request restoration again
- THEN no additional swarm join or connection attempt starts
- AND the room's attempt count increments only once

#### Scenario: Retry after settlement
- GIVEN the prior connection attempt settled as `connect_failed`
- WHEN retry backoff has elapsed and retry is requested
- THEN one new connection attempt may start

### Requirement: Connection failure is durable
The system SHALL persist `connect_failed` lifecycle and its failure code when an
attempt times out or the sidecar is unreachable.

#### Scenario: Failed room reloads
- GIVEN a post-accept connection attempt timed out
- WHEN the application reloads the room from durable catalog state
- THEN the room loads as `connect_failed`
- AND the chain fallback composer remains enabled
- AND the failure code is available for diagnostics

### Requirement: Discovery deadline accommodates DHT convergence
Each Holepunch peer-discovery attempt SHALL allow 120 seconds before reporting
`timeout`.

#### Scenario: Peer appears after the former deadline
- GIVEN both peers joined the same topic and one peer is not discovered within
  30 seconds
- WHEN the peer is discovered before 120 seconds
- THEN the attempt proceeds to post-connect proof instead of failing early

### Requirement: Transport and fallback status are distinct
The chat UI SHALL identify Holepunch as the transport being connected and SHALL
describe chain delivery only as the temporary message fallback.

#### Scenario: Holepunch is connecting
- GIVEN the room lifecycle is `connecting`
- WHEN the chat room is rendered
- THEN the connection status identifies Holepunch as connecting
- AND the composer remains enabled
- AND the chain label communicates that messages use chain fallback until
  Holepunch connects

#### Scenario: Holepunch failed
- GIVEN the room lifecycle is `connect_failed`
- WHEN the chat room is rendered
- THEN the failure code and retry action are visible
- AND L1 chain messaging remains available

### Requirement: Electron provides a safe UFW advisory
On Linux desktop, Electron SHALL perform a privilege-free, best-effort check for
whether UFW appears active and expose only an `active`, `inactive`, or `unknown`
advisory to the renderer. The application SHALL NOT request elevation, mutate
firewall rules, expose the full ruleset, or claim a particular dynamic UDP port
is blocked.

#### Scenario: Active UFW and repeated retryable failure
- GIVEN the Electron host reports UFW as active
- AND the room reaches `connect_failed` with `timeout` or `unreachable`
- WHEN chat diagnostics are rendered
- THEN the user sees that UFW may be blocking Holepunch UDP traffic
- AND the warning distinguishes that traffic from localhost bridge port `7901`

#### Scenario: Firewall state cannot be determined
- GIVEN the platform is not Linux, UFW is missing, or the status check lacks
  permission
- WHEN Electron starts
- THEN startup continues normally
- AND the advisory state is `unknown`
- AND no definitive firewall warning is shown

#### Scenario: Browser build
- GIVEN the Vite app is running without Electron
- WHEN a Holepunch attempt fails
- THEN no host firewall state is inferred by renderer code

### Requirement: LAN prerequisites are documented
Operational documentation SHALL state that two machines on the same LAN still
require usable UDP, normally public DHT bootstrap connectivity, and identical
derived topics, and that a host firewall denying incoming traffic can prevent
HyperDHT connectivity.

#### Scenario: Operator diagnoses same-LAN timeout
- GIVEN two accepted peers repeatedly time out on one LAN
- WHEN the operator follows the Holepunch troubleshooting documentation
- THEN they can check internet/DHT bootstrap access, UDP/firewall policy, and
  topic agreement without changing the bridge or topic formula
