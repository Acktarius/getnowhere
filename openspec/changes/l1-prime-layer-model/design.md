# Design — L1 / L1′ / L2

## Decision

```text
L1   SmartMessage signaling + session derive
     + seal/open live content with those keys (before bridge)
L1′  chat.relay when L2 unavailable (Conceal MESSAGE on chain)
L2   Hyperswarm Noise (opaque L1-sealed payloads)
```

There is **no L3**. Live AEAD is an L1 session-key use, not a separate layer.

## Room merge

One room per `roomId`; messages from L2 live and L1′ relay share one thread
(`channel`), ordered by timestamp. Intentional UX — not the crypto weakness.

## Out of scope

Key-at-rest hardening, proof-before-connected race, wire changes.
