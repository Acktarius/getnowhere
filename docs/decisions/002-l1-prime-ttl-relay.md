# 002 — L1′ mempool TTL relay presets

Status: **Accepted**  
Date: 2026-09-03  
Source: `openspec/changes/l1-prime-ttl-relay` (archived)

## Context

Chain-fallback `chat.relay` was always mined (Conceal TTL 0): paid, durable, and
visible in wallet history until confirm. Users wanted a cheaper auto-destroy
path when L2 is down, without a new wire action or a second spend builder.

## Decision

1. Tap send on chain fallback stays mined TTL 0. Long-press offers 60 min and
   6 min mempool TTL on the same `chat.relay` body.
2. Reuse `sendSmartMessage`. TTL skips network and node fee; mixin/decoys and
   dust selection stay the same as mined. No silent retry as TTL 0.
3. Create / register / revoke stay TTL 0.
4. Never persist TTL rows in `chatRooms`. Wall-clock prune + hydrate skip erase
   both rooms. Wallet history drops matching pending 0-conf at the same expiry.

## Consequences

- TTL relays are unpaid and leave the mempool at expiry; reserved inputs return.
- On-chain observers can still see a mempool MESSAGE until expiry (ChaCha12
  body). Auto-destroy is the product answer, not a new cipher.
- Wallet pending must not use the 24h mempool lifetime for these rows.
