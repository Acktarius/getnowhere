# Tasks: hkdf-epoch-topics-v2

## 1. Documentation (land strategy docs)

- [x] 1.1 Commit-ready review of `docs/security/capabilities-and-derivation.md`
  (4-byte ids fixed; v2 HKDF only; no wider-id plan)
- [x] 1.2 Commit-ready review of `docs/architecture/local-bridge-transport.md`
  (ws → wss → IPC roadmap; out of scope for code here)
- [x] 1.3 Verify cross-links in `encryption.md`, `pairing-and-topics.md`,
  `holepunch-sidecar.md`, `p2pchatprotocol.md`, `electron-desktop.md`, `README.md`

## 2. Protocol types and suite dispatch

- [x] 2.1 Add `TopicSuite` type (`SHA256_V1` | `HKDF_EPOCH_V1`) to protocol models
- [x] 2.2 Extend bootstrap / session persistence with `{ topicSuite, epoch }`
- [x] 2.3 Implement `deriveKRelationship` + `deriveTopicRefV2` in `ids.ts` with tests (HKDF vectors)

## 3. Handshake and create path

- [x] 3.1 Gate new creates on v2 suite (protocol version 2 → HKDF_EPOCH_V1)
- [x] 3.2 Ensure 4-byte create pack unchanged; add tests
- [x] 3.3 Wire v2 `topicRef` into `HolepunchBootstrapContract.transport`

## 4. Epoch lifecycle

- [x] 4.1 Initialize `epoch: 0` on accept for v2 rooms
- [x] 4.2 Implement epoch bump on leave-forever / revoke teardown
- [x] 4.3 Add L1 `topic.epoch` (or equivalent) compose/parse for peer sync when needed
- [x] 4.4 Transport: leave old topic → join new topic on epoch change (leave on teardown; next connect joins new topicRef)

## 5. Post-connect proof

- [x] 5.1 Extend proof/ack AAD for v2 (`epoch` + suite)
- [x] 5.2 Tests: matching epoch succeeds; mismatch → AEAD open fails (`proof-seal-v2.test.ts`)

## 6. v1 coexistence

- [x] 6.1 Load persisted v1 rooms with SHA256 derivation unchanged
- [x] 6.2 Integration test: v1 room reconnect after upgrade still connects

## 7. Verify and review

- [x] 7.1 Run targeted protocol + ids unit tests
- [x] 7.2 Run holepunch-sidecar tests (no sidecar formula change expected)
- [x] 7.3 Independent crypto/security review (Forge review phase) — see `security-review.md`; findings remediated
- [x] 7.4 Update `capabilities-and-derivation.md` implementation status table when shipped
