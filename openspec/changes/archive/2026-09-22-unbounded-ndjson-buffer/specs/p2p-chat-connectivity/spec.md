# Delta for P2p Chat Connectivity

## ADDED Requirements

### Requirement: NDJSON reassembly is length-bounded
The holepunch sidecar SHALL bound the pending Hyperswarm NDJSON reassembly
buffer (and thus max line length) using a configured `maxNdjsonLineBytes`
(default 262144). When appending a chunk would leave a pending buffer longer
than that limit, the line reader SHALL clear its buffer and signal overflow.
The swarm connection handler SHALL destroy that Hyperswarm connection. The
sidecar process and other connections SHALL remain available. A reserved
`maxFileBytes` config value MAY exist for a future media path and SHALL NOT be
required for NDJSON chat frames in this change.

#### Scenario: Oversized partial line trips the cap
- GIVEN a Hyperswarm connection with an empty line-reader buffer
- WHEN the peer sends a chunk without `\n` longer than `maxNdjsonLineBytes`
- THEN the line reader signals overflow and clears its buffer
- AND the connection is destroyed
- AND other connections on the same mesh are unaffected

#### Scenario: Valid framed lines under the cap still parse
- GIVEN a sealed chat NDJSON line whose byte length is ≤ `maxNdjsonLineBytes`
- WHEN the line arrives whole or fragmented across chunks
- THEN the sidecar parses it as today (malformed JSON lines ignored)
