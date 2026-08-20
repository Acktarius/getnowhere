# Security review — hkdf-epoch-topics-v2

**Reviewer:** Cursor security-review subagent + coordinator remediation  
**Date:** 2026-08-12  
**Scope:** Uncommitted HKDF epoch topic derivation (protocol v2)

## Verdict

**Approved after remediation.** HKDF domain separation, v1 coexistence, and proof AAD binding are sound. Three lifecycle issues were found and fixed before merge.

## Findings (resolved)

| Severity | Issue | Fix |
|----------|-------|-----|
| High | Double epoch bump when processing peer `room_revoked` (sync + `leaveRoom` bump) | `leaveRoom(..., { skipEpochBump })` when epoch synced from peer revoke |
| High | Responder derived epoch 0 when slim create pack omits `topicEpoch` | `deriveSession` uses `max(handshake, relationship store)` for `HKDF_EPOCH_V1` |
| Medium | Epoch sync on any revoke reason | Gate sync on `reasonCode === "room_revoked"` only |

## Confirmed sound

- `deriveKRelationship` / `deriveTopicRefV2` match spec (`ids.ts`)
- `resolveTopicSuite` + persisted `SHA256_V1` default for legacy rooms
- `buildProofAad` binds epoch + suite; AEAD mismatch fails closed
- Initiator revoke order: destroy → bump → read epoch for L1 hint
- `syncRelationshipTopicEpoch` monotonic max only

## Residual manual checks

- Two-peer leave → recreate → connect on same `topicRef` (beta)
- Create-before-peer-processes-revoke race (timing window; acceptable for beta)

## Tests added for review fixes

- `tests/p2p/session-bootstrap-epoch.test.ts` — store-backed epoch + matching topicRef
